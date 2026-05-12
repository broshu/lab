const fallbackLabData = [
  {
    id: "ppt",
    title: "PPT",
    type: "download",
    items: [
      {
        name: "带电粒子在电场中运动的综合问题",
        href: "ppt/带电粒子在电场中运动的综合问题.pptx"
      },
      {
        name: "电容器的电容",
        href: "ppt/电容器的电容.pptx"
      },
      {
        name: "第1课时　电容器及电容",
        href: "ppt/第1课时　电容器及电容.pptx"
      }
    ]
  },
  {
    id: "games",
    title: "Games",
    type: "open",
    items: [
      {
        name: "Electric Field Lines",
        href: "games/electric-field-lines/index.html"
      },
      {
        name: "Potential 3D Visualization",
        href: "games/potential_3d_visualization/index.html"
      }
    ]
  },
  {
    id: "resources",
    title: "Resources",
    type: "resources",
    items: [
      {
        name: "周末小练",
        type: "folder",
        children: [
          {
            name: "五一节物理附加作业（附答案）",
            href: "resources/周末小练/五一节物理附加作业（附答案）.docx"
          },
          {
            name: "高一物理周末小练20260510（含答案）",
            href: "resources/周末小练/高一物理周末小练20260510（含答案）.docx"
          }
        ]
      }
    ]
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

function directoryHref(path) {
  return path.endsWith("/") ? path : `${path}/`;
}

async function listDirectory(path) {
  const response = await fetch(directoryHref(path), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to list ${path}`);
  }

  const html = await response.text();
  const documentHtml = new DOMParser().parseFromString(html, "text/html");
  const base = new URL(directoryHref(path), window.location.href);

  return Array.from(documentHtml.querySelectorAll("a"))
    .map((link) => {
      const rawHref = link.getAttribute("href");
      if (!rawHref || rawHref.startsWith("?") || rawHref.startsWith("#")) {
        return null;
      }

      const url = new URL(rawHref, base);
      const isDirectory = rawHref.endsWith("/");
      const decodedName = decodeURIComponent(rawHref).replace(/\/$/, "");
      const href = url.pathname.replace(/^\/+/, "");

      return {
        name: decodedName,
        href: isDirectory ? directoryHref(href) : href,
        isDirectory
      };
    })
    .filter((item) => item && !isHiddenName(item.name));
}

async function scanPpt() {
  const entries = await listDirectory("ppt/");
  return entries
    .filter((entry) => !entry.isDirectory && entry.name.endsWith(".pptx") && !entry.name.startsWith("~$"))
    .map((entry) => ({
      name: cleanFileName(entry.name),
      href: entry.href
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

async function loadSection(fallbackSection, scanner) {
  try {
    return {
      ...fallbackSection,
      items: await scanner()
    };
  } catch (error) {
    console.warn(error);
    return fallbackSection;
  }
}

window.loadLabData = async function loadLabData() {
  const [ppt, games, resources] = await Promise.all([
    loadSection(fallbackLabData[0], scanPpt),
    loadSection(fallbackLabData[1], scanGames),
    loadSection(fallbackLabData[2], scanResources)
  ]);

  return [ppt, games, resources];
};
