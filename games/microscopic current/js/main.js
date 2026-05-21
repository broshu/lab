const canvas = document.querySelector("#currentCanvas");
const ctx = canvas.getContext("2d");

const diagramModeButton = document.querySelector("#diagramMode");
const realModeButton = document.querySelector("#realMode");
const fieldToggle = document.querySelector("#fieldToggle");
const fieldToggleText = document.querySelector("#fieldToggleText");
const fieldStatus = document.querySelector("#fieldStatus");
const fieldStrength = document.querySelector("#fieldStrength");
const timeScale = document.querySelector("#timeScale");
const temperatureControl = document.querySelector("#temperatureControl");
const resetButton = document.querySelector("#resetButton");
const fieldValue = document.querySelector("#fieldValue");
const timeValue = document.querySelector("#timeValue");
const temperatureValue = document.querySelector("#temperatureValue");
const timeScaleText = document.querySelector("#timeScaleText");
const driftMetric = document.querySelector("#driftMetric");
const thermalMetric = document.querySelector("#thermalMetric");
const currentMetric = document.querySelector("#currentMetric");
const stageTitle = document.querySelector("#stageTitle");
const stageSubtitle = document.querySelector("#stageSubtitle");
const scaleReadout = document.querySelector("#scaleReadout");
const motionReadout = document.querySelector("#motionReadout");

const PHYSICS = {
  atomRadiusM: 128e-12,
  nucleusRadiusM: 4.8e-15,
  referenceTemperatureK: 300,
  thermalSpeed: 1.6e6,
  maxDriftSpeed: 4e-3
};

const REAL_SCALE = {
  atomRadius: "1.28 x 10^-10 m",
  nucleusRadius: "4.8 x 10^-15 m",
  nucleusDiameter: "9.6 x 10^-15 m",
  ratioLabel: "26,667:1"
};

const state = {
  mode: "diagram",
  fieldOn: false,
  field: 0.55,
  count: 72,
  temperatureK: 300,
  timeLevel: 1,
  lastTime: performance.now(),
  electrons: [],
  ions: [],
  driftAccumulator: 0,
  scatterClock: 0
};

const timeMultipliers = [1, 3, 10, 30, 100];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function setCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, Math.floor(rect.width * ratio));
  canvas.height = Math.max(320, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function stageBounds() {
  const rect = canvas.getBoundingClientRect();
  return {
    w: rect.width,
    h: rect.height,
    left: 38,
    right: rect.width - 38,
    top: 54,
    bottom: rect.height - 42
  };
}

function makeIons() {
  const b = stageBounds();
  const cols = state.mode === "diagram" ? 9 : 12;
  const rows = state.mode === "diagram" ? 5 : 7;
  const ions = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      ions.push({
        x: b.left + (x + 0.5) * ((b.right - b.left) / cols),
        y: b.top + (y + 0.5) * ((b.bottom - b.top) / rows),
        phase: rand(0, Math.PI * 2)
      });
    }
  }
  state.ions = ions;
}

function makeElectrons() {
  const b = stageBounds();
  const electrons = [];
  for (let i = 0; i < state.count; i += 1) {
    const angle = rand(0, Math.PI * 2);
    electrons.push({
      x: rand(b.left, b.right),
      y: rand(b.top, b.bottom),
      vx: Math.cos(angle),
      vy: Math.sin(angle),
      spin: rand(0, Math.PI * 2),
      trail: []
    });
  }
  state.electrons = electrons;
  state.driftAccumulator = 0;
}

function resetSimulation() {
  makeIons();
  makeElectrons();
}

function actualDriftSpeed() {
  return state.fieldOn ? PHYSICS.maxDriftSpeed * state.field : 0;
}

function temperatureFactor() {
  return Math.sqrt(state.temperatureK / PHYSICS.referenceTemperatureK);
}

function actualThermalSpeed() {
  return PHYSICS.thermalSpeed * temperatureFactor();
}

function formatThermalSpeed(speed) {
  return `about ${(speed / 1e6).toFixed(2)} x 10^6 m/s`;
}

function visualSpeeds() {
  const thermalFactor = temperatureFactor();
  if (state.mode === "diagram") {
    return {
      random: 58 * thermalFactor,
      drift: state.fieldOn ? 42 * state.field : 0,
      electronRadius: 4.2,
      ionRadius: 13,
      nucleusRadius: 6,
      atomRadius: 24
    };
  }

  const driftRatio = actualDriftSpeed() / actualThermalSpeed();
  return {
    random: 105 * thermalFactor,
    drift: 105 * thermalFactor * driftRatio,
    electronRadius: 2.4,
    ionRadius: 18,
    nucleusRadius: 18 * (PHYSICS.nucleusRadiusM / PHYSICS.atomRadiusM),
    atomRadius: 18
  };
}

function updateControls() {
  fieldValue.textContent = `${Math.round(state.field * 100)}%`;
  const multiplier = timeMultipliers[state.timeLevel];
  timeValue.textContent = `x${multiplier}`;
  timeScaleText.textContent = `Time x${multiplier}`;
  temperatureValue.textContent = `${state.temperatureK} K`;

  fieldToggle.classList.toggle("active", state.fieldOn);
  fieldToggle.setAttribute("aria-pressed", String(state.fieldOn));
  fieldToggleText.textContent = state.fieldOn ? "Turn Field Off" : "Turn Field On";
  fieldStatus.textContent = state.fieldOn ? "Field On" : "Field Off";
  fieldStatus.classList.toggle("on", state.fieldOn);

  diagramModeButton.classList.toggle("active", state.mode === "diagram");
  realModeButton.classList.toggle("active", state.mode === "real");

  const drift = actualDriftSpeed();
  driftMetric.textContent = `${(drift * 1000).toFixed(3)} mm/s`;
  thermalMetric.textContent = formatThermalSpeed(actualThermalSpeed());
  currentMetric.textContent = state.fieldOn ? "Right; electrons drift left" : "No net current";

  if (state.mode === "diagram") {
    stageTitle.textContent = "Diagram Mode";
    stageSubtitle.textContent = "Electrons, atoms, and drift speed are exaggerated so directed drift and temperature-driven thermal motion are visible.";
    scaleReadout.textContent = "Diagram: size and speed are exaggerated for teaching";
  } else {
    const ratio = Math.round(PHYSICS.atomRadiusM / PHYSICS.nucleusRadiusM);
    stageTitle.textContent = "Real-Scale Mode";
    stageSubtitle.textContent = "Copper-like radius and speed ratios are preserved: the nucleus is tiny, thermal motion is very fast, and drift is extremely slow.";
    scaleReadout.textContent = `Real scale: atomic radius ${REAL_SCALE.atomRadius}; nuclear radius ${REAL_SCALE.nucleusRadius}; radius ratio about ${ratio.toLocaleString("en-US")}:1`;
  }
  motionReadout.textContent = state.fieldOn
    ? `Current state: random thermal motion at ${state.temperatureK} K plus a tiny directed electron drift`
    : `Current state: random thermal motion at ${state.temperatureK} K; average velocity is about 0`;
}

function scatterElectrons(dt) {
  state.scatterClock += dt;
  const interval = (state.mode === "diagram" ? 0.8 : 0.18) / Math.max(0.65, temperatureFactor());
  if (state.scatterClock < interval) {
    return;
  }
  state.scatterClock = 0;
  const chance = state.mode === "diagram" ? 0.18 : 0.35;
  state.electrons.forEach((electron) => {
    if (Math.random() < chance) {
      const angle = rand(0, Math.PI * 2);
      electron.vx = Math.cos(angle);
      electron.vy = Math.sin(angle);
    }
  });
}

function updateElectrons(dt) {
  const b = stageBounds();
  const speeds = visualSpeeds();
  const multiplier = timeMultipliers[state.timeLevel];
  const effectiveDt = Math.min(dt, 0.04) * multiplier;
  scatterElectrons(effectiveDt);

  const driftDirection = -1;
  state.driftAccumulator += speeds.drift * effectiveDt * driftDirection;

  state.electrons.forEach((electron) => {
    electron.x += electron.vx * speeds.random * effectiveDt + driftDirection * speeds.drift * effectiveDt;
    electron.y += electron.vy * speeds.random * effectiveDt;
    electron.spin += effectiveDt * 5;

    let wrapped = false;
    if (electron.x < b.left) {
      electron.x = b.right;
      wrapped = true;
    }
    if (electron.x > b.right) {
      electron.x = b.left;
      wrapped = true;
    }
    if (electron.y < b.top) {
      electron.y = b.bottom;
      wrapped = true;
    }
    if (electron.y > b.bottom) {
      electron.y = b.top;
      wrapped = true;
    }

    if (wrapped) {
      electron.trail = [];
    }
    electron.trail.push({ x: electron.x, y: electron.y });
    const trailLength = state.mode === "diagram" ? 14 : 7;
    if (electron.trail.length > trailLength) {
      electron.trail.shift();
    }
  });
}

function clear() {
  const b = stageBounds();
  ctx.clearRect(0, 0, b.w, b.h);
  ctx.fillStyle = "#f9fbfd";
  ctx.fillRect(0, 0, b.w, b.h);
}

function drawGrid() {
  const b = stageBounds();
  ctx.save();
  ctx.strokeStyle = "#dfe6ee";
  ctx.lineWidth = 1;
  for (let x = b.left; x <= b.right; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, b.top);
    ctx.lineTo(x, b.bottom);
    ctx.stroke();
  }
  for (let y = b.top; y <= b.bottom; y += 48) {
    ctx.beginPath();
    ctx.moveTo(b.left, y);
    ctx.lineTo(b.right, y);
    ctx.stroke();
  }
  ctx.restore();
}

function arrow(x1, y1, x2, y2, color, label) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 12 * Math.cos(angle - 0.45), y2 - 12 * Math.sin(angle - 0.45));
  ctx.lineTo(x2 - 12 * Math.cos(angle + 0.45), y2 - 12 * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fill();
  ctx.font = "700 13px Inter, sans-serif";
  ctx.fillText(label, x1, y1 - 10);
  ctx.restore();
}

function drawField() {
  const b = stageBounds();
  ctx.save();
  if (state.fieldOn) {
    const alpha = 0.15 + state.field * 0.18;
    ctx.fillStyle = `rgba(210, 71, 59, ${alpha})`;
    ctx.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
    for (let y = b.top + 30; y < b.bottom; y += 58) {
      arrow(b.left + 16, y, b.left + 92 + state.field * 42, y, "#d2473b", y === b.top + 30 ? "E" : "");
    }
    arrow(b.right - 190, b.bottom + 18, b.right - 64, b.bottom + 18, "#14936f", "Conventional current");
    arrow(b.right - 64, b.bottom + 34, b.right - 190, b.bottom + 34, "#2576d6", "Electron drift");
  } else {
    ctx.fillStyle = "rgba(128, 135, 146, 0.05)";
    ctx.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
  }
  ctx.strokeStyle = "#cfd8e4";
  ctx.lineWidth = 2;
  ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
  ctx.restore();
}

function drawIons() {
  const speeds = visualSpeeds();
  ctx.save();
  state.ions.forEach((ion) => {
    const wobble = state.mode === "diagram" ? Math.sin(performance.now() / 400 + ion.phase) * 1.2 : 0;
    const x = ion.x + wobble;
    const y = ion.y - wobble;

    if (state.mode === "real") {
      ctx.strokeStyle = "rgba(184, 135, 31, 0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, speeds.atomRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = state.mode === "real" ? "rgba(194, 74, 90, 0.85)" : "#c24a5a";
    ctx.beginPath();
    ctx.arc(x, y, state.mode === "real" ? 0.9 : speeds.nucleusRadius, 0, Math.PI * 2);
    ctx.fill();

    if (state.mode === "diagram") {
      ctx.strokeStyle = "rgba(194, 74, 90, 0.24)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, speeds.ionRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 13px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("+", x, y + 0.5);
    }
  });
  ctx.restore();
}

function drawElectrons() {
  const speeds = visualSpeeds();
  ctx.save();
  state.electrons.forEach((electron) => {
    if (electron.trail.length > 1) {
      ctx.beginPath();
      electron.trail.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.strokeStyle = state.mode === "diagram" ? "rgba(37, 118, 214, 0.24)" : "rgba(37, 118, 214, 0.16)";
      ctx.lineWidth = state.mode === "diagram" ? 2 : 1;
      ctx.stroke();
    }

    const radius = speeds.electronRadius;
    ctx.fillStyle = "#2576d6";
    ctx.beginPath();
    ctx.arc(electron.x, electron.y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (state.mode === "diagram") {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(electron.x - radius * 0.55, electron.y);
      ctx.lineTo(electron.x + radius * 0.55, electron.y);
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawActualMagnifier() {
  if (state.mode !== "real") {
    return;
  }

  const b = stageBounds();
  const panelX = b.left + 42;
  const panelY = b.top + 22;
  const panelW = 260;
  const panelH = 252;
  const cx = panelX + panelW / 2;
  const cy = panelY + 96;
  const outer = 76;
  const nucleusVisible = outer * (PHYSICS.nucleusRadiusM / PHYSICS.atomRadiusM);
  const atomRing = outer * 0.74;

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.strokeStyle = "#bfc9d6";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 8);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#bfc9d6";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(184, 135, 31, 0.5)";
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, atomRing, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "#b8871f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + atomRing, cy);
  ctx.stroke();

  ctx.strokeStyle = "#c24a5a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy - 10);
  ctx.lineTo(cx + 30, cy - 48);
  ctx.stroke();

  ctx.fillStyle = "#c24a5a";
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0.35, nucleusVisible), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#203247";
  ctx.font = "800 12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Atomic radius = ${REAL_SCALE.atomRadius}`, cx, panelY + 198);
  ctx.fillStyle = "#647084";
  ctx.font = "700 11px Inter, sans-serif";
  ctx.fillText(`Nuclear radius = ${REAL_SCALE.nucleusRadius}`, cx, panelY + 216);
  ctx.fillText(`Radius ratio ~ ${REAL_SCALE.ratioLabel}`, cx, panelY + 234);

  ctx.textAlign = "left";
  ctx.fillStyle = "#c24a5a";
  ctx.font = "800 11px Inter, sans-serif";
  ctx.fillText("nucleus", cx + 34, cy - 52);
  ctx.restore();
}

function drawDriftMeter() {
  const b = stageBounds();
  const x = b.left + 22;
  const y = b.bottom - 82;
  const width = 210;
  const height = 44;
  const drift = actualDriftSpeed();
  const ratio = drift / actualThermalSpeed();

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.strokeStyle = "#d1dae5";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#647084";
  ctx.font = "700 12px Inter, sans-serif";
  ctx.fillText("Drift / thermal speed", x + 12, y + 17);
  ctx.fillStyle = "#17212f";
  ctx.font = "800 13px Inter, sans-serif";
  const ratioText = state.fieldOn ? `about 1 : ${Math.round(1 / Math.max(ratio, 1e-12)).toLocaleString("en-US")}` : "0";
  ctx.fillText(ratioText, x + 12, y + 34);
  ctx.restore();
}

function drawRealScaleData() {
  if (state.mode !== "real") {
    return;
  }

  const b = stageBounds();
  const x = Math.max(b.left + 292, b.right - 348);
  const y = b.top + 22;
  const width = Math.min(326, b.right - x - 16);
  if (width < 220) {
    return;
  }

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.strokeStyle = "#d1dae5";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width, 102, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#17212f";
  ctx.font = "800 12px Inter, sans-serif";
  ctx.fillText("Actual size data", x + 12, y + 20);
  ctx.fillStyle = "#4f6075";
  ctx.font = "700 11px Inter, sans-serif";
  ctx.fillText(`Atomic radius: ${REAL_SCALE.atomRadius}`, x + 12, y + 42);
  ctx.fillText(`Nuclear radius: ${REAL_SCALE.nucleusRadius}`, x + 12, y + 60);
  ctx.fillText(`Nuclear diameter: ${REAL_SCALE.nucleusDiameter}`, x + 12, y + 78);
  ctx.fillText(`Temperature: ${state.temperatureK} K`, x + 12, y + 96);
  ctx.restore();
}

function drawCaption() {
  const b = stageBounds();
  ctx.save();
  ctx.fillStyle = "#223247";
  ctx.font = "800 15px Inter, sans-serif";
  ctx.fillText(state.fieldOn ? "Field on: electrons drift slowly to the left overall" : "Field off: electrons have random thermal motion only", b.left, 30);
  ctx.fillStyle = "#65758a";
  ctx.font = "700 12px Inter, sans-serif";
  const text = state.mode === "real"
    ? "Blue dots are electron position markers; electron size is not drawn to scale."
    : "Electron and ion symbols are enlarged so direction relationships are visible.";
  ctx.fillText(text, b.left, 48);
  ctx.restore();
}

function render() {
  clear();
  drawGrid();
  drawField();
  drawIons();
  drawElectrons();
  drawActualMagnifier();
  drawRealScaleData();
  drawDriftMeter();
  drawCaption();
}

function frame(now) {
  const dt = (now - state.lastTime) / 1000;
  state.lastTime = now;
  updateElectrons(dt);
  render();
  requestAnimationFrame(frame);
}

diagramModeButton.addEventListener("click", () => {
  state.mode = "diagram";
  updateControls();
  resetSimulation();
});

realModeButton.addEventListener("click", () => {
  state.mode = "real";
  updateControls();
  resetSimulation();
});

fieldToggle.addEventListener("click", () => {
  state.fieldOn = !state.fieldOn;
  updateControls();
});

fieldStrength.addEventListener("input", (event) => {
  state.field = Number(event.target.value) / 100;
  updateControls();
});

timeScale.addEventListener("input", (event) => {
  state.timeLevel = Number(event.target.value);
  updateControls();
});

temperatureControl.addEventListener("input", (event) => {
  state.temperatureK = Number(event.target.value);
  updateControls();
});

resetButton.addEventListener("click", resetSimulation);

window.addEventListener("resize", () => {
  setCanvasSize();
  resetSimulation();
});

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + width, y, x + width, y + height, r);
    this.arcTo(x + width, y + height, x, y + height, r);
    this.arcTo(x, y + height, x, y, r);
    this.arcTo(x, y, x + width, y, r);
    this.closePath();
    return this;
  };
}

setCanvasSize();
updateControls();
resetSimulation();
requestAnimationFrame(frame);
