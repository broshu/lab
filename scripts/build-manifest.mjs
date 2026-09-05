import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function cleanFileName(fileName) {
  return fileName.replace(/\.[^/.]+$/, "").trim();
}

function titleFromSlug(slug) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => (/\d/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

function isHiddenName(name) {
  return !name || name.startsWith(".");
}

function trackedFiles() {
  return git(["ls-files", "-z"])
    .split("\0")
    .filter(Boolean);
}

function latestCommitDate(path) {
  try {
    return git(["log", "-1", "--format=%cI", "--", path]) || null;
  } catch {
    return null;
  }
}

function maxDate(items) {
  return items
    .map((item) => item.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function sortByTime(items) {
  return items.sort((a, b) => {
    const timeA = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const timeB = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

function directFiles(files, directory) {
  const prefix = directory.endsWith("/") ? directory : `${directory}/`;
  return files
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length))
    .filter((rest) => rest && !rest.includes("/") && !isHiddenName(rest))
    .map((name) => `${prefix}${name}`);
}

function directDirectories(files, directory) {
  const prefix = directory.endsWith("/") ? directory : `${directory}/`;
  return Array.from(new Set(files
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length))
    .filter((rest) => rest.includes("/"))
    .map((rest) => rest.split("/")[0])
    .filter((name) => name && !isHiddenName(name))
    .map((name) => `${prefix}${name}/`)));
}

function buildPpt(files) {
  const items = directFiles(files, "ppt/")
    .filter((path) => /\.(pptx|html)$/i.test(path) && !path.split("/").pop().startsWith("~$"))
    .map((path) => ({
      name: cleanFileName(path.split("/").pop()),
      href: path,
      action: path.toLowerCase().endsWith(".html") ? "open" : "download",
      updatedAt: latestCommitDate(path)
    }));

  return sortByTime(items);
}

function buildGames(files) {
  const items = directDirectories(files, "games/")
    .filter((directory) => files.includes(`${directory}index.html`))
    .map((directory) => {
      const folderName = directory.split("/").filter(Boolean).pop();
      const indexPath = `${directory}index.html`;
      return {
        name: titleFromSlug(folderName),
        href: indexPath,
        updatedAt: latestCommitDate(indexPath) || latestCommitDate(directory)
      };
    });

  return sortByTime(items);
}

function buildResources(files, directory = "resources/") {
  const folders = directDirectories(files, directory).map((folderPath) => {
    const children = buildResources(files, folderPath);
    return {
      name: folderPath.split("/").filter(Boolean).pop(),
      type: "folder",
      href: folderPath,
      children,
      updatedAt: maxDate(children) || latestCommitDate(folderPath)
    };
  });

  const fileItems = directFiles(files, directory).map((path) => ({
    name: cleanFileName(path.split("/").pop()),
    href: path,
    updatedAt: latestCommitDate(path)
  }));

  return sortByTime([...folders, ...fileItems]);
}

const files = trackedFiles();
const manifest = {
  generatedAt: new Date().toISOString(),
  sections: [
    {
      id: "ppt",
      title: "PPT",
      type: "download",
      items: buildPpt(files)
    },
    {
      id: "games",
      title: "Games",
      type: "open",
      items: buildGames(files)
    },
    {
      id: "resources",
      title: "Resources",
      type: "resources",
      items: buildResources(files)
    }
  ]
};

writeFileSync("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
