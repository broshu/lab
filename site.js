// 首页和列表页共用的函数。栏目内容来自部署时生成的 manifest.json（见 scripts/build-manifest.mjs）。

window.Lab = (() => {
  async function loadSections() {
    try {
      const response = await fetch("manifest.json", { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`manifest.json ${response.status}`);
      }
      const manifest = await response.json();
      return manifest.sections || [];
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (text) {
      element.textContent = text;
    }
    return element;
  }

  function countText(n) {
    return `${n} 项`;
  }

  // 课件、资料默认下载；互动实验和网页课件在新标签页打开。
  function fileLink(item, section) {
    const link = el("a", "item-link", item.name);
    link.href = item.href;
    link.title = item.name;
    const download = item.action ? item.action === "download" : section.type !== "open";
    if (download) {
      // 链接是拼音文件名，下载下来的文件仍用中文名。
      const ext = (item.href.match(/\.[^/.]+$/) || [""])[0];
      link.download = item.name ? `${item.name}${ext}` : "";
    } else {
      link.target = "_blank";
      link.rel = "noopener";
    }
    return link;
  }

  function folderLink(folder, href) {
    const link = el("a", "item-link folder-link");
    const name = el("span", "folder-name", folder.name);
    name.prepend(el("span", "folder-icon"));
    link.href = href;
    link.title = folder.name;
    link.append(name, el("span", "item-note", countText(folder.children.length)));
    return link;
  }

  function sectionUrl(sectionId, pathParts = []) {
    const query = new URLSearchParams({ section: sectionId });
    if (pathParts.length > 0) {
      query.set("path", pathParts.join("/"));
    }
    return `library.html?${query.toString()}`;
  }

  function itemRow(item, section, pathParts) {
    const row = el("li", "item-row");
    row.append(item.type === "folder"
      ? folderLink(item, sectionUrl(section.id, [...pathParts, item.name]))
      : fileLink(item, section));
    return row;
  }

  return { loadSections, el, countText, sectionUrl, itemRow };
})();
