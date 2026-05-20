const canvas = document.querySelector("#currentCanvas");
const ctx = canvas.getContext("2d");

const diagramModeButton = document.querySelector("#diagramMode");
const realModeButton = document.querySelector("#realMode");
const fieldToggle = document.querySelector("#fieldToggle");
const fieldToggleText = document.querySelector("#fieldToggleText");
const fieldStatus = document.querySelector("#fieldStatus");
const fieldStrength = document.querySelector("#fieldStrength");
const electronCount = document.querySelector("#electronCount");
const timeScale = document.querySelector("#timeScale");
const resetButton = document.querySelector("#resetButton");
const fieldValue = document.querySelector("#fieldValue");
const countValue = document.querySelector("#countValue");
const timeValue = document.querySelector("#timeValue");
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
  thermalSpeed: 1.6e6,
  maxDriftSpeed: 4e-3
};

const state = {
  mode: "diagram",
  fieldOn: false,
  field: 0.55,
  count: 72,
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

function visualSpeeds() {
  if (state.mode === "diagram") {
    return {
      random: 58,
      drift: state.fieldOn ? 42 * state.field : 0,
      electronRadius: 4.2,
      ionRadius: 13,
      nucleusRadius: 6,
      atomRadius: 24
    };
  }

  const driftRatio = actualDriftSpeed() / PHYSICS.thermalSpeed;
  return {
    random: 105,
    drift: 105 * driftRatio,
    electronRadius: 2.4,
    ionRadius: 18,
    nucleusRadius: 18 * (PHYSICS.nucleusRadiusM / PHYSICS.atomRadiusM),
    atomRadius: 18
  };
}

function updateControls() {
  fieldValue.textContent = `${Math.round(state.field * 100)}%`;
  countValue.textContent = String(state.count);
  const multiplier = timeMultipliers[state.timeLevel];
  timeValue.textContent = `x${multiplier}`;
  timeScaleText.textContent = `时间 x${multiplier}`;

  fieldToggle.classList.toggle("active", state.fieldOn);
  fieldToggle.setAttribute("aria-pressed", String(state.fieldOn));
  fieldToggleText.textContent = state.fieldOn ? "断开电场" : "接通电场";
  fieldStatus.textContent = state.fieldOn ? "已加电场" : "未加电场";
  fieldStatus.classList.toggle("on", state.fieldOn);

  diagramModeButton.classList.toggle("active", state.mode === "diagram");
  realModeButton.classList.toggle("active", state.mode === "real");

  const drift = actualDriftSpeed();
  driftMetric.textContent = `${(drift * 1000).toFixed(3)} mm/s`;
  thermalMetric.textContent = state.mode === "real" ? "约 1.6 x 10^6 m/s" : "教学慢放显示";
  currentMetric.textContent = state.fieldOn ? "向右（电子向左漂移）" : "无净电流";

  if (state.mode === "diagram") {
    stageTitle.textContent = "示意图模式";
    stageSubtitle.textContent = "电子、原子和漂移速度都被教学放大，便于直接看出电子在随机运动中叠加了定向移动。";
    scaleReadout.textContent = "示意图：尺寸和速度经过教学放大";
  } else {
    const ratio = Math.round(PHYSICS.atomRadiusM / PHYSICS.nucleusRadiusM);
    stageTitle.textContent = "实际情况模式";
    stageSubtitle.textContent = "按铜的数量级保留半径比例和速度比例：核极小、电子热运动极快、漂移速度极慢。";
    scaleReadout.textContent = `真实比例：原子半径 128 pm，核半径 4.8 fm，半径比约 ${ratio}:1`;
  }
  motionReadout.textContent = state.fieldOn
    ? "当前：无规则热运动上叠加极小的电子定向漂移"
    : "当前：只有无规则热运动，平均速度约为 0";
}

function scatterElectrons(dt) {
  state.scatterClock += dt;
  const interval = state.mode === "diagram" ? 0.8 : 0.18;
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

    if (electron.x < b.left) electron.x = b.right;
    if (electron.x > b.right) electron.x = b.left;
    if (electron.y < b.top) electron.y = b.bottom;
    if (electron.y > b.bottom) electron.y = b.top;

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
    arrow(b.right - 190, b.bottom + 18, b.right - 64, b.bottom + 18, "#14936f", "电流方向");
    arrow(b.right - 64, b.bottom + 34, b.right - 190, b.bottom + 34, "#2576d6", "电子漂移");
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
  const cx = b.left + 136;
  const cy = b.top + 112;
  const outer = 76;
  const nucleusVisible = outer * (PHYSICS.nucleusRadiusM / PHYSICS.atomRadiusM);

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.strokeStyle = "#bfc9d6";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(184, 135, 31, 0.5)";
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, outer * 0.74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#c24a5a";
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0.35, nucleusVisible), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#203247";
  ctx.font = "800 13px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("原子半径", cx, cy + outer + 22);
  ctx.fillStyle = "#647084";
  ctx.font = "700 12px Inter, sans-serif";
  ctx.fillText("中心核小于 1 像素", cx, cy + outer + 39);
  ctx.restore();
}

function drawDriftMeter() {
  const b = stageBounds();
  const x = b.left + 22;
  const y = b.bottom - 82;
  const width = 210;
  const height = 44;
  const drift = actualDriftSpeed();
  const ratio = drift / PHYSICS.thermalSpeed;

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
  ctx.fillText("漂移/热运动速度比", x + 12, y + 17);
  ctx.fillStyle = "#17212f";
  ctx.font = "800 13px Inter, sans-serif";
  const ratioText = state.fieldOn ? `约 1 : ${Math.round(1 / Math.max(ratio, 1e-12)).toLocaleString("en-US")}` : "0";
  ctx.fillText(ratioText, x + 12, y + 34);
  ctx.restore();
}

function drawCaption() {
  const b = stageBounds();
  ctx.save();
  ctx.fillStyle = "#223247";
  ctx.font = "800 15px Inter, sans-serif";
  ctx.fillText(state.fieldOn ? "接通电场：电子整体缓慢向左漂移" : "未加电场：电子只有无规则热运动", b.left, 30);
  ctx.fillStyle = "#65758a";
  ctx.font = "700 12px Inter, sans-serif";
  const text = state.mode === "real"
    ? "蓝点是电子位置标记；电子半径不按比例绘制，因为电子在本模型中视为点粒子。"
    : "示意图中电子和离子被画大，便于观察方向关系。";
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

electronCount.addEventListener("input", (event) => {
  state.count = Number(event.target.value);
  updateControls();
  makeElectrons();
});

timeScale.addEventListener("input", (event) => {
  state.timeLevel = Number(event.target.value);
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
