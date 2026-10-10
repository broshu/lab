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

  // 链接是英文文件名，下载下来的文件仍用中文名。
  function downloadName(item) {
    const ext = (item.href.match(/\.[^/.]+$/) || [""])[0];
    return item.name ? `${item.name}${ext}` : "";
  }

  // 课件后面的小下载按钮：教室电脑慢，学生可以提前把课件存到本地。
  function downloadButton(item) {
    const link = el("a", "download-btn");
    link.href = item.href;
    link.download = downloadName(item);
    link.title = `下载：${item.name}`;
    link.setAttribute("aria-label", `下载 ${item.name}`);
    link.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M3 13h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>下载</span>';
    return link;
  }

  // 课件、资料默认下载；互动实验和网页课件在新标签页打开。
  function fileLink(item, section) {
    const link = el("a", "item-link", item.name);
    link.href = item.href;
    link.title = item.name;
    const download = item.action ? item.action === "download" : section.type !== "open";
    if (download) {
      link.download = downloadName(item);
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
    if (section.id === "ppt" && item.type !== "folder") {
      row.classList.add("has-download");
      row.append(downloadButton(item));
    }
    return row;
  }

  return { loadSections, el, countText, sectionUrl, itemRow };
})();
