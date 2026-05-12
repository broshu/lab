const fallbackLabData = [
  {
    id: "ppt",
    title: "PPT",
    type: "download",
    items: [
      {
        name: "test",
        href: "ppt/test.pptx",
        kind: "ppt",
        action: "download"
      },
      {
        name: "带电粒子在电场中运动的综合问题",
        href: "ppt/带电粒子在电场中运动的综合问题/index.html",
        kind: "html",
        action: "open"
      },
      {
        name: "带电粒子在电场中运动的综合问题",
        href: "ppt/带电粒子在电场中运动的综合问题.pptx",
        kind: "ppt",
        action: "download"
      },
      {
        name: "电容器的电容",
        href: "ppt/电容器的电容.pptx",
        kind: "ppt",
        action: "download"
      },
      {
        name: "第1课时　电容器及电容",
        href: "ppt/第1课时　电容器及电容.pptx",
        kind: "ppt",
        action: "download"
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
      },
      {
        name: "必修三 三维设计",
        type: "folder",
        children: [
          {
            name: "参考答案与详解",
            type: "folder",
            children: [
              {
                name: "学习讲义部分",
                href: "resources/必修三 三维设计/参考答案与详解/学习讲义部分.docx"
              },
              {
                name: "答案目录",
                href: "resources/必修三 三维设计/参考答案与详解/答案目录.docx"
              },
              {
                name: "综合质量检测部分",
                href: "resources/必修三 三维设计/参考答案与详解/综合质量检测部分.docx"
              },
              {
                name: "课时跟踪检测部分",
                href: "resources/必修三 三维设计/参考答案与详解/课时跟踪检测部分.docx"
              }
            ]
          },
          {
            name: "综合质量检测",
            type: "folder",
            children: [
              {
                name: "模块达标检测",
                href: "resources/必修三 三维设计/综合质量检测/模块达标检测.docx"
              },
              {
                name: "章末综合检测（一）　静电场及其应用",
                href: "resources/必修三 三维设计/综合质量检测/章末综合检测（一）　静电场及其应用.docx"
              },
              {
                name: "章末综合检测（三）　电路及其应用",
                href: "resources/必修三 三维设计/综合质量检测/章末综合检测（三）　电路及其应用.docx"
              },
              {
                name: "章末综合检测（二）　静电场中的能量",
                href: "resources/必修三 三维设计/综合质量检测/章末综合检测（二）　静电场中的能量.docx"
              },
              {
                name: "章末综合检测（五）　电磁感应与电磁波初步",
                href: "resources/必修三 三维设计/综合质量检测/章末综合检测（五）　电磁感应与电磁波初步.docx"
              },
              {
                name: "章末综合检测（四）　电能　能量守恒定律",
                href: "resources/必修三 三维设计/综合质量检测/章末综合检测（四）　电能　能量守恒定律.docx"
              }
            ]
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
      const isDirectory = rawHref.endsWith("/") || url.pathname.endsWith("/");
      const decodedName = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || rawHref).replace(/\/$/, "");
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
  const items = await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory && entry.name.endsWith(".pptx") && !entry.name.startsWith("~$")) {
      return {
        name: cleanFileName(entry.name),
        href: entry.href,
        kind: "ppt",
        action: "download"
      };
    }

    if (entry.isDirectory) {
      let htmlEntry = {
        href: `${entry.href}index.html`
      };

      try {
        const indexResponse = await fetch(htmlEntry.href, { method: "HEAD", cache: "no-store" });
        if (!indexResponse.ok) {
          const children = await listDirectory(entry.href);
          htmlEntry = children.find((child) => !child.isDirectory && child.name.toLowerCase().endsWith(".html"));
        }
      } catch (error) {
        const children = await listDirectory(entry.href);
        htmlEntry = children.find((child) => !child.isDirectory && child.name.toLowerCase().endsWith(".html"));
      }

      if (!htmlEntry) {
        return null;
      }

      return {
        name: entry.name,
        href: htmlEntry.href,
        kind: "html",
        action: "open"
      };
    }

    return null;
  }));

  return items.filter(Boolean);
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
    const scannedItems = await scanner();
    if (scannedItems.length === 0) {
      return fallbackSection;
    }

    return {
      ...fallbackSection,
      items: scannedItems
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
