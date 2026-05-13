const repoConfig = {
  owner: "broshu",
  repo: "lab",
  branch: "main"
};

const labSections = [
  {
    id: "ppt",
    title: "PPT",
    type: "download",
    items: []
  },
  {
    id: "games",
    title: "Games",
    type: "open",
    items: []
  },
  {
    id: "resources",
    title: "Resources",
    type: "resources",
    items: []
  }
];

function cleanFileName(fileName) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function titleFromSlug(slug) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => (/\d/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

function isHiddenName(name) {
  return !name || name === "../" || name.startsWith(".");
}

let repoTreePromise;

function githubTreeUrl() {
  const { owner, repo, branch } = repoConfig;
  return `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
}

async function fetchRepoTree() {
  if (!repoTreePromise) {
    repoTreePromise = fetch(githubTreeUrl(), { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load repository file list");
        }
        return response.json();
      })
      .then((data) => data.tree || []);
  }

  return repoTreePromise;
}

function directChildEntry(entry, directory) {
  const prefix = directory.endsWith("/") ? directory : `${directory}/`;
  if (!entry.path.startsWith(prefix)) {
    return null;
  }

  const rest = entry.path.slice(prefix.length);
  if (!rest || rest.includes("/")) {
    return null;
  }

  const isDirectory = entry.type === "tree";
  return {
    name: rest,
    href: isDirectory ? `${entry.path}/` : entry.path,
    isDirectory
  };
}

async function listDirectory(path) {
  const tree = await fetchRepoTree();
  const items = tree
    .map((entry) => directChildEntry(entry, path))
    .filter((item) => item && !isHiddenName(item.name));

  return items.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

async function loadFreshSection(section, scanner) {
  try {
    return {
      ...section,
      items: await scanner()
    };
  } catch (error) {
    console.warn(error);
    return {
      ...section,
      items: []
    };
  }
}

async function scanPpt() {
  const entries = await listDirectory("ppt/");
  return entries
    .filter((entry) => !entry.isDirectory && entry.name.endsWith(".pptx") && !entry.name.startsWith("~$"))
    .map((entry) => ({
      name: cleanFileName(entry.name),
      href: entry.href,
      kind: "ppt",
      action: "download"
    }));
}

async function scanGames() {
  const entries = await listDirectory("games/");
  return entries
    .filter((entry) => entry.isDirectory)
    .map((entry) => {
      const folderName = entry.name;
      return {
        name: titleFromSlug(folderName),
        href: `${entry.href}index.html`
      };
    });
}

async function scanResources(path = "resources/") {
  const entries = await listDirectory(path);
  const items = await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory) {
      return {
        name: entry.name,
        type: "folder",
        children: await scanResources(entry.href)
      };
    }

    return {
      name: cleanFileName(entry.name),
      href: entry.href
    };
  }));

  return items;
}

window.loadLabData = async function loadLabData() {
  const [ppt, games, resources] = await Promise.all([
    loadFreshSection(labSections[0], scanPpt),
    loadFreshSection(labSections[1], scanGames),
    loadFreshSection(labSections[2], scanResources)
  ]);

  return [ppt, games, resources];
};
