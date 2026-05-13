const emptyLabData = [
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

async function loadManifest() {
  const response = await fetch(`manifest.json?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load manifest");
  }

  return response.json();
}

window.loadLabData = async function loadLabData() {
  try {
    const manifest = await loadManifest();
    return manifest.sections || emptyLabData;
  } catch (error) {
    console.warn(error);
    return emptyLabData;
  }
};
