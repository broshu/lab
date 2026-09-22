(function () {
  "use strict";

  const P = window.Physics;
  const POT = P.POT;
  const $ = (sel) => document.querySelector(sel);

  const latticeCanvas = $("#latticeCanvas");
  const forceCanvas = $("#forceCanvas");
  const energyCanvas = $("#energyCanvas");
  const lctx = latticeCanvas.getContext("2d");
  const fctx = forceCanvas.getContext("2d");
  const ectx = energyCanvas.getContext("2d");

  const els = {
    modeButtons: document.querySelectorAll(".mode-button"),
    presetButtons: document.querySelectorAll(".preset-button"),
    speedInput: $("#speedInput"),
    speedValue: $("#speedValue"),
    launchButton: $("#launchButton"),
    resetButton: $("#resetButton"),
    pauseButton: $("#pauseButton"),
    timeScale: $("#timeScale"),
    timeValue: $("#timeValue"),
    timeScaleText: $("#timeScaleText"),
    showBonds: $("#showBonds"),
    showBroken: $("#showBroken"),
    statusPill: $("#statusPill"),
    keMetric: $("#keMetric"),
    brokenMetric: $("#brokenMetric"),
    formedMetric: $("#formedMetric"),
    verdictMetric: $("#verdictMetric"),
    stageTitle: $("#stageTitle"),
    stageSubtitle: $("#stageSubtitle"),
    timeReadout: $("#timeReadout"),
    narrative: $("#narrative")
  };

  const COLORS = {
    ink: "#17212f",
    muted: "#647084",
    grid: "#e3e9f1",
    axis: "#9aa7b8",
    neutral: [184, 194, 208],
    compress: [47, 111, 214],
    stretch: [214, 69, 69],
    danger: "#ef8a17",
    newbond: "#16a34a",
    broken: "rgba(155, 44, 44, 0.75)",
    metal: "#7f90a6",
    metalEdge: "#56677d",
    glass: "#4fb0c6",
    glassEdge: "#2f8599",
    clampAtom: "#3c4656",
    ball: "#d9a02b",
    pe: "#7b61c4",
    heat: "#e0664f"
  };

  // ---------- strings (page language decides) ----------
  const STRINGS = {
    zh: {
      timeText: ["慢放 ×¼", "慢放 ×½", "正常速度", "快进 ×2"],
      pause: "暂停", resume: "继续",
      stageMetal: "微观视图 · 金属薄板", stageGlass: "微观视图 · 玻璃薄板",
      subMetal: "每个圆点代表一个粒子（教材中统称“分子”）。金属：靠近的粒子都会相互吸引，粒子可以离开旧邻居、和新邻居结合。",
      subGlass: "每个圆点代表一个粒子（教材中统称“分子”）。玻璃：只有原来相邻的粒子之间有引力，键被拉断后不会再接上。",
      lblRunning: "飞行中", lblReady: "准备", lblFracture: "断裂", lblPlastic: "塑性形变", lblCrack: "出现裂纹",
      lblElastic: "弹性形变", lblRecovered: "弹性 · 已复原",
      nReady: "按「发射」或空格键开始。",
      nRunning: "小球飞向薄板……",
      nElasticTouch: "接触中：板的上表面受压（蓝），下表面受拉（红）。粒子只偏离平衡位置一点点，邻居没有变。",
      nElasticAfter: "小球弹回，粒子回到原来的位置：弹性形变。",
      nPlastic: "有的键被拉过 r_m 后断开，粒子随即和新邻居结合（绿）：板永久弯曲，但没有断开。",
      nCrackMetal: "键被拉过 r_m 后断开，出现裂纹。",
      nCrackGlass: "下表面受拉最厉害：那里的键先被拉过 r_m 而断开，裂纹从受拉的一侧向上扩展。",
      nFractureMetal: "形变太大：金属先弯曲，随后在受拉最厉害的地方被拉断。",
      nFractureGlass: "键断了不会再接上：裂纹贯穿，玻璃板断开。",
      nStopped: "小球把动能几乎全部交给了板，自己几乎停住了（模型中没有重力），演示到此结束。",
      vReady: "选择材料和撞击速度，然后发射。",
      vRunning: "碰撞进行中……",
      vElastic: (k) => `近似弹性碰撞：小球带回 ${k} 的动能，板恢复原状。`,
      vPlastic: (l) => `非弹性碰撞：损失的 ${l} 动能变成了板的内能（粒子振动加剧、分子势能增加），板永久弯曲。`,
      vCrack: (l) => `非弹性碰撞：损失的 ${l} 动能用来拉断键（分子势能增加）和使粒子振动（内能）。`,
      vFracture: (l) => `非弹性碰撞：损失的 ${l} 动能用来拉断键（分子势能增加）、使粒子振动，以及让断开的部分运动。`,
      vOther: (k) => `小球带回 ${k} 的动能。`,
      glassNoNew: "0（玻璃不会形成新键）",
      tPaused: "（已暂停）", tFast: "（小球飞离中 · 自动快进）", tDone: "（结束）",
      clamp: "固定端",
      longest: (r) => `拉得最长的键：r = ${r} r₀`,
      repulsion: "斥力", attraction: "引力",
      rangeEnds: "作用消失", bondBreaks: "键断开",
      hooke: "r₀ 附近近似直线：F ∝ Δr（胡克定律）",
      pastRm: ["过了 r_m：越拉，引力越小", "拉不回来"],
      fmax: "最大引力",
      time: "时间 →", contact: "接触",
      eBall: "小球动能", ePE: "分子势能", eKE: "粒子动能（振动）",
      eEmpty: "发射后显示能量怎样转移"
    },
    en: {
      timeText: ["Slow ×¼", "Slow ×½", "Normal speed", "Fast ×2"],
      pause: "Pause", resume: "Resume",
      stageMetal: "Microscopic view · metal plate", stageGlass: "Microscopic view · glass plate",
      subMetal: "Each dot is one particle (an atom or molecule). Metal: any two particles that come close attract each other, so a particle can leave its old neighbours and bond to new ones.",
      subGlass: "Each dot is one particle (an atom or molecule). Glass: only particles that started as neighbours attract; once a bond is pulled apart it never re-forms.",
      lblRunning: "In flight", lblReady: "Ready", lblFracture: "Fracture", lblPlastic: "Plastic", lblCrack: "Cracked",
      lblElastic: "Elastic", lblRecovered: "Elastic · recovered",
      nReady: "Press Launch or the space bar to start.",
      nRunning: "The ball flies towards the plate…",
      nElasticTouch: "Contact: the top of the plate is compressed (blue) and the bottom is stretched (red). Particles move only slightly from equilibrium and keep their neighbours.",
      nElasticAfter: "The ball bounces back and every particle returns to its old place: elastic deformation.",
      nPlastic: "Some bonds were pulled past r_m and broke, and the particles at once bonded to new neighbours (green): the plate stays bent but is still in one piece.",
      nCrackMetal: "Bonds pulled past r_m have broken: a crack appears.",
      nCrackGlass: "The bottom surface is stretched the most: bonds there pass r_m first and break, and the crack grows upwards from the stretched side.",
      nFractureMetal: "Too much deformation: the metal bends first, then tears where it is stretched the most.",
      nFractureGlass: "Broken bonds never re-form: the crack runs right through and the glass plate breaks.",
      nStopped: "The ball has handed almost all its kinetic energy to the plate and has nearly stopped (the model has no gravity). The run ends here.",
      vReady: "Choose a material and an impact speed, then launch.",
      vRunning: "Collision in progress…",
      vElastic: (k) => `Nearly elastic collision: the ball keeps ${k} of its kinetic energy and the plate recovers.`,
      vPlastic: (l) => `Inelastic collision: ${l} of the kinetic energy was lost. It became internal energy of the plate (stronger particle vibration, higher molecular potential energy), and the plate stays bent.`,
      vCrack: (l) => `Inelastic collision: ${l} of the kinetic energy was lost, spent on breaking bonds (molecular potential energy) and making particles vibrate (internal energy).`,
      vFracture: (l) => `Inelastic collision: ${l} of the kinetic energy was lost, spent on breaking bonds (molecular potential energy), making particles vibrate and moving the broken pieces.`,
      vOther: (k) => `The ball keeps ${k} of its kinetic energy.`,
      glassNoNew: "0 (glass forms no new bonds)",
      tPaused: " (paused)", tFast: " (ball leaving · auto fast-forward)", tDone: " (finished)",
      clamp: "Clamped",
      longest: (r) => `Longest bond: r = ${r} r₀`,
      repulsion: "Repulsion", attraction: "Attraction",
      rangeEnds: "range ends", bondBreaks: "bond breaks",
      hooke: "Near r₀ almost straight: F ∝ Δr (Hooke's law)",
      pastRm: ["Past r_m: the further apart,", "the weaker the attraction —", "no way back"],
      fmax: "Max attraction",
      time: "Time →", contact: "Contact",
      eBall: "Ball KE", ePE: "Molecular PE", eKE: "Particle KE (vibration)",
      eEmpty: "The energy transfer appears after launch"
    }
  };
  const LANG = (document.documentElement.lang || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  const S = STRINGS[LANG];

  // ---------- canvas colours (CSS variables, so a stylesheet can theme them) ----------
  const THEME_VARS = {
    canvas: ["--canvas-bg", "#f9fbfd"],
    ink: ["--canvas-ink", "#17212f"],
    muted: ["--canvas-muted", "#647084"],
    grid: ["--canvas-grid", "#e3e9f1"],
    axis: ["--canvas-axis", "#9aa7b8"],
    marker: ["--canvas-marker", "#56677d"],
    clampFill: ["--canvas-clamp", "#dfe5ed"],
    clampHatch: ["--canvas-clamp-hatch", "rgba(60, 70, 86, 0.22)"],
    clampEdge: ["--canvas-clamp-edge", "#9aa7b8"],
    clampAtom: ["--canvas-clamp-atom", "#3c4656"],
    tagBg: ["--canvas-tag-bg", "rgba(255, 255, 255, 0.92)"],
    bond: ["--canvas-bond", "184, 194, 208"],
    broken: ["--canvas-broken", "rgba(155, 44, 44, 0.75)"],
    breakText: ["--canvas-break-text", "#9b2c2c"],
    blueText: ["--canvas-blue-text", "rgba(47, 111, 214, 0.95)"],
    orangeText: ["--canvas-orange-text", "#c26a0a"],
    arrow: ["--canvas-arrow", "#b36b00"]
  };
  const THEME = {};

  const DT = 0.01;
  const BASE_STEPS = 100;               // integration steps per frame at ×1
  const TIME_SCALES = [0.25, 0.5, 1, 2];
  const TIME_LABELS = ["×¼", "×½", "×1", "×2"];
  const SPEED_DISPLAY = 50;             // shown value = v × 50 (arbitrary units)
  const VIEW = { xmin: -3, xmax: 48.5, ymin: -11.5, ymax: 17.4 };
  const MAX_T = 6000;
  const FREE_AFTER = 40;                // no contact for this long -> ball has left the plate
  const FAST_FORWARD = 3;               // playback factor while the ball flies away

  const state = {
    material: "metal",
    speed: 0.08,
    timeIndex: 2,
    phase: "ready",        // ready | running | done
    paused: false,
    world: null,
    history: [],
    msPerStep: 0.1,
    endAt: null,
    fastForward: false,
    lastContact: -1e9,
    showBonds: true,
    showBroken: true
  };

  // ---------- helpers ----------

  function setCanvasSize(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(200, Math.floor(rect.width * ratio));
    canvas.height = Math.max(150, Math.floor(rect.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { w: rect.width, h: rect.height };
  }

  let sizes = {};
  function resizeAll() {
    sizes.lattice = setCanvasSize(latticeCanvas, lctx);
    sizes.force = setCanvasSize(forceCanvas, fctx);
    sizes.energy = setCanvasSize(energyCanvas, ectx);
  }

  function rgb(c, a) {
    return a === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }

  function mix(c1, c2, t) {
    return [
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t)
    ];
  }

  const pct = (v) => `${Math.round(v * 100)}%`;

  // Draw text where "_x" means a subscript x, e.g. "过了 r_m：……"
  function drawRich(ctx, text, x, y, align) {
    const parts = [];
    const re = /_([a-z0-9])/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parts.push({ t: text.slice(last, m.index), sub: false });
      parts.push({ t: m[1], sub: true });
      last = m.index + 2;
    }
    if (last < text.length) parts.push({ t: text.slice(last), sub: false });
    const baseFont = ctx.font;
    const size = parseFloat((baseFont.match(/(\d+(?:\.\d+)?)px/) || [0, 12])[1]);
    const subFont = baseFont.replace(/\d+(?:\.\d+)?px/, `${Math.round(size * 0.75)}px`);
    let total = 0;
    for (const p of parts) { ctx.font = p.sub ? subFont : baseFont; total += ctx.measureText(p.t).width; }
    let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    const savedAlign = ctx.textAlign;
    ctx.textAlign = "left";
    for (const p of parts) {
      ctx.font = p.sub ? subFont : baseFont;
      ctx.fillText(p.t, cx, p.sub ? y + size * 0.3 : y);
      cx += ctx.measureText(p.t).width;
    }
    ctx.font = baseFont;
    ctx.textAlign = savedAlign;
  }

  // Bond colour buckets: 0..5 compress, 6 neutral, 7..12 stretch, 13 beyond r_m, 14 new bond
  const LEVELS = 6;
  const BUCKET_NEUTRAL = LEVELS;
  const BUCKET_DANGER = 2 * LEVELS + 1;
  const BUCKET_NEW = 2 * LEVELS + 2;
  const BUCKET_COUNT = 2 * LEVELS + 3;
  const BUCKET_COLORS = [];
  function buildBuckets() {
    BUCKET_COLORS.length = 0;
    for (let k = 0; k < BUCKET_COUNT; k++) {
      if (k < LEVELS) BUCKET_COLORS.push(rgb(mix(COLORS.neutral, COLORS.compress, 0.3 + 0.7 * (LEVELS - k) / LEVELS)));
      else if (k === BUCKET_NEUTRAL) BUCKET_COLORS.push(rgb(COLORS.neutral));
      else if (k < BUCKET_DANGER) BUCKET_COLORS.push(rgb(mix(COLORS.neutral, COLORS.stretch, 0.3 + 0.7 * (k - LEVELS) / LEVELS)));
      else if (k === BUCKET_DANGER) BUCKET_COLORS.push(COLORS.danger);
      else BUCKET_COLORS.push(COLORS.newbond);
    }
  }

  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    for (const key in THEME_VARS) {
      const [name, fallback] = THEME_VARS[key];
      THEME[key] = cs.getPropertyValue(name).trim() || fallback;
    }
    const parts = THEME.bond.split(",").map((v) => parseFloat(v));
    if (parts.length === 3 && parts.every((v) => !Number.isNaN(v))) COLORS.neutral = parts;
    buildBuckets();
  }

  function bucketOf(r, isNew) {
    if (r > POT.rm) return BUCKET_DANGER;
    if (isNew) return BUCKET_NEW;
    const s = r - 1;
    if (s < -0.006) {
      const t = Math.min(1, -s / 0.045);
      return LEVELS - Math.max(1, Math.ceil(t * LEVELS));
    }
    if (s > 0.006) {
      const t = Math.min(1, s / (POT.rm - 1));
      return LEVELS + Math.max(1, Math.ceil(t * LEVELS));
    }
    return BUCKET_NEUTRAL;
  }

  // ---------- simulation control ----------

  function newWorld() {
    state.world = P.createWorld({ material: state.material, speed: state.speed });
    state.history = [];
    state.phase = "ready";
    state.paused = false;
    state.endAt = null;
    state.fastForward = false;
    state.ballStopped = false;
    state.lastContact = -1e9;
    updatePauseButton();
  }

  function launch() {
    if (state.phase !== "ready") newWorld();
    state.phase = "running";
    state.paused = false;
    state.msPerStep = Math.max(0.02, state.msPerStep);
    updatePauseButton();
  }

  function togglePause() {
    if (state.phase !== "running") return;
    state.paused = !state.paused;
    updatePauseButton();
  }

  function updatePauseButton() {
    els.pauseButton.textContent = state.paused ? S.resume : S.pause;
    els.pauseButton.disabled = state.phase !== "running";
  }

  function setMaterial(m) {
    state.material = m;
    els.modeButtons.forEach((b) => b.classList.toggle("active", b.dataset.material === m));
    els.stageTitle.textContent = m === "metal" ? S.stageMetal : S.stageGlass;
    els.stageSubtitle.textContent = m === "metal" ? S.subMetal : S.subGlass;
    newWorld();
  }

  function setSpeed(v) {
    state.speed = Math.round(v * 100) / 100;
    els.speedInput.value = String(state.speed);
    els.speedValue.textContent = (state.speed * SPEED_DISPLAY).toFixed(1);
    els.presetButtons.forEach((b) => b.classList.toggle("active", Math.abs(+b.dataset.speed - state.speed) < 1e-6));
  }

  function setTimeIndex(i) {
    state.timeIndex = i;
    els.timeScale.value = String(i);
    els.timeValue.textContent = TIME_LABELS[i];
    els.timeScaleText.textContent = S.timeText[i];
  }

  function advance() {
    const w = state.world;
    // Once the ball has left the plate, the rest is just the ball flying away:
    // play that part faster so the lesson doesn't wait for it.
    state.fastForward = w.firstContact !== null && w.t - state.lastContact > FREE_AFTER;
    const scale = TIME_SCALES[state.timeIndex] * (state.fastForward ? FAST_FORWARD : 1);
    const target = Math.max(1, Math.round(BASE_STEPS * scale));
    const budget = Math.max(8, Math.floor((state.fastForward ? 14 : 11) / state.msPerStep));
    const steps = Math.min(target, budget);
    const t0 = performance.now();
    for (let k = 0; k < steps; k++) {
      P.step(w, DT);
      if (w.contact) state.lastContact = w.t;
    }
    const el = (performance.now() - t0) / steps;
    state.msPerStep = 0.85 * state.msPerStep + 0.15 * el;
    P.updateBonds(w);

    const e = P.energies(w);
    state.history.push({
      t: w.t,
      b: e.ball / e.ke0,
      p: Math.max(0, e.latticePE / e.ke0),
      k: e.latticeKE / e.ke0
    });

    // Stop only after the ball has flown out of the picture (up or down).
    const b = w.ball;
    const top = state.viewTop === undefined ? VIEW.ymax : state.viewTop;
    const bottom = state.viewBottom === undefined ? VIEW.ymin : state.viewBottom;
    const gone = b.y - b.r > top || b.y + b.r < bottom;
    if (state.endAt === null && w.firstContact !== null) {
      if (gone) state.endAt = w.t + 15;
      // safety net: ball left the plate but is (almost) at rest
      else if (w.t - state.lastContact > 300 && Math.hypot(b.vx, b.vy) < 0.004) {
        state.endAt = w.t;
        state.ballStopped = true;
      }
    }
    if (state.endAt === null && w.t > MAX_T) state.endAt = w.t;
    if (state.endAt !== null && w.t >= state.endAt) {
      state.phase = "done";
      state.fastForward = false;
      updatePauseButton();
    }
  }

  // ---------- classification & text ----------

  function classify() {
    const w = state.world;
    const s = w.stats;
    if (w.firstContact === null) {
      return state.phase === "running" ? { key: "running", label: S.lblRunning } : { key: "ready", label: S.lblReady };
    }
    if (s.pieces > 1) return { key: "fracture", label: S.lblFracture };
    if (s.broken > 0) {
      if (w.rebond && s.formed >= 0.5 * s.broken) return { key: "plastic", label: S.lblPlastic };
      return { key: "crack", label: S.lblCrack };
    }
    const touching = w.t - state.lastContact < 8;
    return { key: "elastic", label: touching ? S.lblElastic : S.lblRecovered, touching };
  }

  function narrative(c) {
    const w = state.world;
    switch (c.key) {
      case "ready": return S.nReady;
      case "running": return S.nRunning;
      case "elastic": return c.touching ? S.nElasticTouch : S.nElasticAfter;
      case "plastic": return S.nPlastic;
      case "crack": return w.rebond ? S.nCrackMetal : S.nCrackGlass;
      case "fracture": return w.rebond ? S.nFractureMetal : S.nFractureGlass;
      default: return "";
    }
  }

  function verdict(c) {
    const w = state.world;
    if (state.phase === "ready") return S.vReady;
    const over = state.phase === "done" || state.fastForward;
    if (w.firstContact === null || !over) return S.vRunning;
    const e = P.energies(w);
    const keep = e.ball / e.ke0;
    const lost = Math.max(0, 1 - keep);
    if (c.key === "elastic" && keep > 0.88) {
      return S.vElastic(pct(keep));
    }
    if (c.key === "plastic") {
      return S.vPlastic(pct(lost));
    }
    if (c.key === "crack") {
      return S.vCrack(pct(lost));
    }
    if (c.key === "fracture") {
      return S.vFracture(pct(lost));
    }
    return S.vOther(pct(keep));
  }

  function updatePanel() {
    const w = state.world;
    const c = classify();
    els.statusPill.textContent = c.label;
    els.statusPill.className = `status-pill ${c.key === "ready" ? "neutral" : c.key}`;
    const e = P.energies(w);
    els.keMetric.textContent = state.phase === "ready" ? "100%" : pct(e.ball / e.ke0);
    els.brokenMetric.textContent = String(w.stats.broken);
    els.formedMetric.textContent = w.rebond ? String(w.stats.formed) : S.glassNoNew;
    els.verdictMetric.textContent = verdict(c);
    const tag = state.paused ? S.tPaused
      : state.phase === "running" && state.fastForward ? S.tFast
      : state.phase === "done" ? S.tDone : "";
    els.timeReadout.textContent = `t = ${w.t.toFixed(0)}${tag}`;
    const text = state.ballStopped
      ? S.nStopped
      : narrative(c);
    const html = text.replace(/r_m/g, "r<sub>m</sub>");
    if (html !== state.lastNarrative) {
      els.narrative.innerHTML = html;
      state.lastNarrative = html;
    }
  }

  // ---------- drawing: lattice ----------

  // Fit the plate's width; any spare height is added below the plate
  // (room for a sagging or broken plate).
  function latticeTransform() {
    const { w: W, h: Hh } = sizes.lattice;
    const vw = VIEW.xmax - VIEW.xmin, vh = VIEW.ymax - VIEW.ymin;
    const s = Math.min(W / vw, Hh / vh);
    const ox = (W - vw * s) / 2;
    const extra = Hh - vh * s;
    const oy = Math.min(extra / 2, 0.12 * vh * s);
    const bottom = VIEW.ymax - (Hh - oy) / s;
    state.viewBottom = bottom;
    state.viewTop = VIEW.ymax + oy / s;
    return {
      s,
      bottom,
      X: (x) => ox + (x - VIEW.xmin) * s,
      Y: (y) => oy + (VIEW.ymax - y) * s
    };
  }

  function drawClamps(T, w) {
    const clampW = w.opts.clamp;
    const y0 = T.Y(w.height + 1.6), y1 = T.Y(-1.6);
    const blocks = [
      [T.X(VIEW.xmin - 1), T.X(clampW - 0.55)],
      [T.X(w.width - clampW + 0.55), T.X(VIEW.xmax + 1)]
    ];
    lctx.save();
    for (const [xa, xb] of blocks) {
      lctx.fillStyle = THEME.clampFill;
      lctx.fillRect(xa, y0, xb - xa, y1 - y0);
      lctx.save();
      lctx.beginPath();
      lctx.rect(xa, y0, xb - xa, y1 - y0);
      lctx.clip();
      lctx.strokeStyle = THEME.clampHatch;
      lctx.lineWidth = 1;
      for (let d = -200; d < 400; d += 9) {
        lctx.beginPath();
        lctx.moveTo(xa + d, y0);
        lctx.lineTo(xa + d + (y1 - y0), y1);
        lctx.stroke();
      }
      lctx.restore();
      lctx.strokeStyle = THEME.clampEdge;
      lctx.strokeRect(xa, y0, xb - xa, y1 - y0);
    }
    lctx.fillStyle = THEME.muted;
    lctx.font = "600 12px Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif";
    lctx.textAlign = "center";
    lctx.textBaseline = "bottom";
    lctx.fillText(S.clamp, Math.max(28, (blocks[0][0] + blocks[0][1]) / 2), y0 - 6);
    lctx.fillText(S.clamp, Math.min(sizes.lattice.w - 28, (blocks[1][0] + blocks[1][1]) / 2), y0 - 6);
    lctx.restore();
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, width) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 4) return;
    const ux = dx / len, uy = dy / len;
    const head = Math.min(12, len * 0.45);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - ux * head * 0.8, y2 - uy * head * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ux * head - uy * head * 0.5, y2 - uy * head + ux * head * 0.5);
    ctx.lineTo(x2 - ux * head + uy * head * 0.5, y2 - uy * head - ux * head * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  function labelTag(ctx, text, x, y, color) {
    ctx.save();
    ctx.font = "700 12px Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif";
    const tw = ctx.measureText(text).width;
    const pad = 6, h = 20;
    let bx = x - tw / 2 - pad;
    bx = Math.max(4, Math.min(bx, sizes.lattice.w - tw - 2 * pad - 4));
    ctx.fillStyle = THEME.tagBg;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, y - h / 2, tw + 2 * pad, h, 5);
    else ctx.rect(bx, y - h / 2, tw + 2 * pad, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + pad, y + 0.5);
    ctx.restore();
  }

  function drawLattice() {
    const w = state.world;
    const { w: W, h: Hh } = sizes.lattice;
    lctx.clearRect(0, 0, W, Hh);
    lctx.fillStyle = THEME.canvas;
    lctx.fillRect(0, 0, W, Hh);
    const T = latticeTransform();
    const s = T.s;

    drawClamps(T, w);

    const x = w.x, y = w.y, n = w.n;

    // broken original bonds (dashed)
    if (state.showBroken && w.stats.broken > 0) {
      lctx.save();
      lctx.strokeStyle = THEME.broken;
      lctx.lineWidth = Math.max(1, s * 0.07);
      lctx.setLineDash([Math.max(2, s * 0.14), Math.max(2, s * 0.12)]);
      lctx.beginPath();
      const A = w.bondA, B = w.bondB, set = w.bondSet;
      for (let k = 0; k < A.length; k++) {
        const a = A[k], b = B[k];
        if (set.has(a * n + b)) continue;
        const dx = x[b] - x[a], dy = y[b] - y[a];
        if (dx * dx + dy * dy > 2.6 * 2.6) continue;
        lctx.moveTo(T.X(x[a]), T.Y(y[a]));
        lctx.lineTo(T.X(x[b]), T.Y(y[b]));
      }
      lctx.stroke();
      lctx.restore();
    }

    // bonds
    if (state.showBonds) {
      const paths = [];
      for (let k = 0; k < BUCKET_COUNT; k++) paths.push(new Path2D());
      const L = w.bondList;
      for (let k = 0; k < L.length; k += 4) {
        const a = L[k], b = L[k + 1];
        const p = paths[bucketOf(L[k + 2], L[k + 3])];
        p.moveTo(T.X(x[a]), T.Y(y[a]));
        p.lineTo(T.X(x[b]), T.Y(y[b]));
      }
      lctx.lineCap = "round";
      const base = Math.max(1, s * 0.085);
      for (let k = 0; k < BUCKET_COUNT; k++) {
        lctx.strokeStyle = BUCKET_COLORS[k];
        lctx.lineWidth = k === BUCKET_DANGER ? base * 2.1 : k === BUCKET_NEW ? base * 1.6 : k === BUCKET_NEUTRAL ? base : base * 1.35;
        lctx.stroke(paths[k]);
      }
    }

    // particles
    const rad = Math.max(1.6, s * (state.showBonds ? 0.26 : 0.4));
    const body = new Path2D(), fixedP = new Path2D();
    for (let i = 0; i < n; i++) {
      const px = T.X(x[i]), py = T.Y(y[i]);
      if (px < -20 || px > W + 20 || py < -20 || py > Hh + 20) continue;
      const p = w.fixed[i] ? fixedP : body;
      p.moveTo(px + rad, py);
      p.arc(px, py, rad, 0, Math.PI * 2);
    }
    const metal = w.rebond;
    lctx.fillStyle = metal ? COLORS.metal : COLORS.glass;
    lctx.strokeStyle = metal ? COLORS.metalEdge : COLORS.glassEdge;
    lctx.lineWidth = 1;
    lctx.fill(body);
    lctx.stroke(body);
    lctx.fillStyle = THEME.clampAtom;
    lctx.fill(fixedP);

    // most stretched bond
    const ms = w.maxStretch;
    if (state.phase !== "ready" && ms.a >= 0 && ms.r > 1.025) {
      const mx = T.X((x[ms.a] + x[ms.b]) / 2), my = T.Y((y[ms.a] + y[ms.b]) / 2);
      const col = ms.r > POT.rm ? COLORS.danger : rgb(COLORS.stretch);
      lctx.strokeStyle = col;
      lctx.lineWidth = 2;
      lctx.beginPath();
      lctx.arc(mx, my, Math.max(8, s * 0.75), 0, Math.PI * 2);
      lctx.stroke();
      const below = my + 30 < Hh - 12;
      labelTag(lctx, S.longest(ms.r.toFixed(2)), mx, below ? my + 28 : my - 28, col);
    }

    // ball
    const b = w.ball;
    const bx = T.X(b.x), by = T.Y(b.y), br = (b.r - 0.45) * s;
    const g = lctx.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br);
    g.addColorStop(0, "#fde7b0");
    g.addColorStop(0.55, COLORS.ball);
    g.addColorStop(1, "#9c6d12");
    lctx.fillStyle = g;
    lctx.beginPath();
    lctx.arc(bx, by, br, 0, Math.PI * 2);
    lctx.fill();
    lctx.strokeStyle = "rgba(90, 60, 10, 0.5)";
    lctx.lineWidth = 1;
    lctx.stroke();

    // velocity arrow
    const v = Math.hypot(b.vx, b.vy);
    if (v > 0.004) {
      const len = (v / 0.3) * 7 * s;
      const ux = b.vx / v, uy = -b.vy / v;
      const sx = bx + ux * (br + 4), sy = by + uy * (br + 4);
      drawArrow(lctx, sx, sy, sx + ux * len, sy + uy * len, THEME.arrow, 3);
      lctx.fillStyle = THEME.arrow;
      lctx.font = "700 13px Inter, 'PingFang SC', sans-serif";
      lctx.textAlign = "left";
      lctx.textBaseline = "middle";
      lctx.fillText("v", bx + br * 0.75 + 10, by + uy * (br * 0.4) - 2);
    }
  }

  // ---------- drawing: F–r curve ----------

  const FR = { rMin: 0.86, rMax: 1.76 };

  function drawForce() {
    const w = state.world;
    const { w: W, h: Hh } = sizes.force;
    const ctx = fctx;
    ctx.clearRect(0, 0, W, Hh);
    ctx.fillStyle = THEME.canvas;
    ctx.fillRect(0, 0, W, Hh);

    const L = 54, R = 14, Tp = 16, B = 34;
    const fTop = 2.3 * POT.fmax, fBot = -1.45 * POT.fmax;
    const X = (r) => L + (r - FR.rMin) / (FR.rMax - FR.rMin) * (W - L - R);
    const Y = (f) => Tp + (fTop - f) / (fTop - fBot) * (Hh - Tp - B);
    const font = (wgt, px) => `${wgt} ${px}px Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif`;

    // region beyond r_m
    ctx.fillStyle = "rgba(239, 138, 23, 0.09)";
    ctx.fillRect(X(POT.rm), Tp, X(POT.rc) - X(POT.rm), Hh - Tp - B);
    ctx.fillStyle = "rgba(155, 44, 44, 0.06)";
    ctx.fillRect(X(POT.rc), Tp, X(FR.rMax) - X(POT.rc), Hh - Tp - B);

    // axes
    ctx.strokeStyle = THEME.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L, Tp);
    ctx.lineTo(L, Hh - B);
    ctx.moveTo(L, Y(0));
    ctx.lineTo(W - R, Y(0));
    ctx.stroke();

    ctx.fillStyle = THEME.muted;
    ctx.textBaseline = "middle";
    if (LANG === "zh") {
      ctx.font = font(700, 12);
      ctx.textAlign = "right";
      ctx.fillText(S.repulsion, L - 8, Y(fTop * 0.55));
      ctx.fillText(S.attraction, L - 8, Y(fBot * 0.55));
    } else {
      // longer English words: write them vertically along the axis
      ctx.font = font(700, 11);
      ctx.textAlign = "center";
      for (const [text, fy] of [[S.repulsion, fTop * 0.5], [S.attraction, fBot * 0.55]]) {
        ctx.save();
        ctx.translate(L - 30, Y(fy));
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }
    ctx.font = font(700, 12);
    ctx.textAlign = "right";
    ctx.fillText("0", L - 8, Y(0));
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("r", W - R - 2, Y(0) - 6);

    // markers r0, rm, rc
    const vline = (r, label, color, dash) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(X(r), Tp);
      ctx.lineTo(X(r), Hh - B);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = color;
      ctx.font = font(700, 12);
      ctx.textBaseline = "top";
      const half = ctx.measureText(label.replace("_", "")).width / 2;
      const cx = Math.max(L + half, Math.min(W - 2 - half, X(r)));
      drawRich(ctx, label, cx, Hh - B + 6, "center");
    };
    vline(1, "r₀", THEME.marker, [3, 3]);
    vline(POT.rm, "r_m", COLORS.danger, [4, 3]);
    vline(POT.rc, w.rebond ? S.rangeEnds : S.bondBreaks, THEME.breakText, [2, 3]);

    // F_max level
    ctx.save();
    ctx.strokeStyle = "rgba(239,138,23,0.55)";
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(L, Y(-POT.fmax));
    ctx.lineTo(X(POT.rc), Y(-POT.fmax));
    ctx.stroke();
    ctx.restore();

    // Hooke tangent near r0
    const k = (POT.force(0.999) - POT.force(1.001)) / 0.002;
    ctx.save();
    ctx.strokeStyle = "rgba(47,111,214,0.55)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(X(0.925), Y(k * 0.075));
    ctx.lineTo(X(1.075), Y(-k * 0.075));
    ctx.stroke();
    ctx.restore();

    // curve (clipped to the plot area)
    ctx.save();
    ctx.beginPath();
    ctx.rect(L, Tp, W - L - R, Hh - Tp - B);
    ctx.clip();
    ctx.strokeStyle = THEME.ink;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let px = L; px <= W - R; px += 1) {
      const r = FR.rMin + (px - L) / (W - L - R) * (FR.rMax - FR.rMin);
      const py = Y(POT.force(r));
      if (px === L) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    // text annotations
    ctx.font = font(700, 12);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = THEME.blueText;
    ctx.fillText(S.hooke, X(1.03), Y(fTop * 0.62));
    ctx.fillStyle = THEME.orangeText;
    S.pastRm.forEach((line, i) => drawRich(ctx, line, X(POT.rm) + 6, Y(fTop * 0.3) + i * 15, "left"));
    ctx.textBaseline = "bottom";
    ctx.fillText(S.fmax, L + 6, Y(-POT.fmax) - 3);

    // dots for every bond
    const Lb = w.bondList;
    const paths = [];
    for (let q = 0; q < BUCKET_COUNT; q++) paths.push(new Path2D());
    const dr = 2.6;
    for (let q = 0; q < Lb.length; q += 4) {
      const r = Lb[q + 2];
      if (w.fixed[Lb[q]] && w.fixed[Lb[q + 1]]) continue;
      const rr = Math.max(FR.rMin, Math.min(FR.rMax, r));
      const px = X(rr), py = Math.max(Tp, Math.min(Hh - B, Y(POT.force(r))));
      const p = paths[bucketOf(r, Lb[q + 3])];
      p.moveTo(px + dr, py);
      p.arc(px, py, dr, 0, Math.PI * 2);
    }
    ctx.globalAlpha = 0.55;
    for (let q = 0; q < BUCKET_COUNT; q++) {
      ctx.fillStyle = BUCKET_COLORS[q];
      ctx.fill(paths[q]);
    }
    ctx.globalAlpha = 1;

    // highlight: longest bond now, and the longest reached in this run
    if (state.phase !== "ready") {
      const run = Math.min(FR.rMax, w.maxStretchRun);
      if (run > 1.02) {
        ctx.save();
        ctx.strokeStyle = "rgba(214,69,69,0.7)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(X(run), Y(0) - 6);
        ctx.lineTo(X(run), Y(0) + 6);
        ctx.stroke();
        ctx.restore();
      }
      const ms = w.maxStretch;
      if (ms.a >= 0 && ms.r > 1.025) {
        const r = Math.min(FR.rMax, ms.r);
        const col = ms.r > POT.rm ? COLORS.danger : rgb(COLORS.stretch);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(X(r), Y(POT.force(ms.r)), 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // ---------- drawing: energy ----------

  function drawEnergy() {
    const { w: W, h: Hh } = sizes.energy;
    const ctx = ectx;
    ctx.clearRect(0, 0, W, Hh);
    ctx.fillStyle = THEME.canvas;
    ctx.fillRect(0, 0, W, Hh);
    const font = (wgt, px) => `${wgt} ${px}px Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif`;

    const L = 44, R = 14, Tp = 48, B = 30;
    const hist = state.history;
    const tEnd = hist.length ? hist[hist.length - 1].t : 0;
    const tSpan = Math.max(300, tEnd * 1.04);
    const X = (t) => L + t / tSpan * (W - L - R);
    const Y = (v) => Tp + (1.1 - v) / 1.1 * (Hh - Tp - B);

    // grid
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = THEME.muted;
    ctx.font = font(600, 11);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      ctx.moveTo(L, Y(v));
      ctx.lineTo(W - R, Y(v));
      ctx.stroke();
      ctx.fillText(`${v * 100}%`, L - 6, Y(v));
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(S.time, W - R, Hh - B + 8);

    const series = [
      { key: "b", label: S.eBall, color: COLORS.ball },
      { key: "p", label: S.ePE, color: COLORS.pe },
      { key: "k", label: S.eKE, color: COLORS.heat }
    ];

    if (hist.length > 1) {
      // stacked areas
      let lower = hist.map(() => 0);
      for (const sr of series) {
        const upper = hist.map((h, i) => lower[i] + h[sr.key]);
        ctx.beginPath();
        ctx.moveTo(X(hist[0].t), Y(upper[0]));
        for (let i = 1; i < hist.length; i++) ctx.lineTo(X(hist[i].t), Y(upper[i]));
        for (let i = hist.length - 1; i >= 0; i--) ctx.lineTo(X(hist[i].t), Y(lower[i]));
        ctx.closePath();
        ctx.fillStyle = sr.color;
        ctx.globalAlpha = 0.78;
        ctx.fill();
        ctx.globalAlpha = 1;
        lower = upper;
      }
      // contact marker
      const w = state.world;
      if (w.firstContact !== null) {
        ctx.save();
        ctx.strokeStyle = THEME.marker;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(X(w.firstContact), Tp - 4);
        ctx.lineTo(X(w.firstContact), Hh - B);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = THEME.marker;
        ctx.font = font(700, 11);
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(S.contact, X(w.firstContact) + 4, Hh - B + 8);
      }
    } else {
      ctx.fillStyle = THEME.muted;
      ctx.font = font(600, 13);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(S.eEmpty, (L + W - R) / 2, Y(0.5));
    }

    ctx.strokeStyle = THEME.axis;
    ctx.beginPath();
    ctx.moveTo(L, Tp - 6);
    ctx.lineTo(L, Hh - B);
    ctx.lineTo(W - R, Hh - B);
    ctx.stroke();

    // legend with current values
    const last = hist.length ? hist[hist.length - 1] : { b: 1, p: 0, k: 0 };
    ctx.font = font(700, 12);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    let lx = L;
    let ly = 14;
    for (const sr of series) {
      const text = `${sr.label} ${pct(last[sr.key])}`;
      const tw = ctx.measureText(text).width;
      if (lx + 16 + tw > W - R && lx > L) { lx = L; ly += 17; }   // wrap to a second line
      ctx.fillStyle = sr.color;
      ctx.fillRect(lx, ly - 6, 12, 12);
      ctx.fillStyle = THEME.ink;
      ctx.fillText(text, lx + 16, ly);
      lx += 16 + tw + 16;
    }
  }

  // ---------- main loop ----------

  function frame() {
    if (state.phase === "running" && !state.paused) advance();
    drawLattice();
    drawForce();
    drawEnergy();
    updatePanel();
    requestAnimationFrame(frame);
  }

  // ---------- events ----------

  function blurActive() {
    if (document.activeElement && document.activeElement.blur && document.activeElement.tagName === "BUTTON") {
      document.activeElement.blur();
    }
  }

  els.modeButtons.forEach((b) => b.addEventListener("click", () => { setMaterial(b.dataset.material); blurActive(); }));
  els.presetButtons.forEach((b) => b.addEventListener("click", () => {
    setSpeed(+b.dataset.speed);
    newWorld();
    launch();
    blurActive();
  }));
  els.speedInput.addEventListener("input", () => {
    setSpeed(+els.speedInput.value);
    newWorld();
  });
  els.launchButton.addEventListener("click", () => { launch(); blurActive(); });
  els.resetButton.addEventListener("click", () => { newWorld(); blurActive(); });
  els.pauseButton.addEventListener("click", () => { togglePause(); blurActive(); });
  els.timeScale.addEventListener("input", () => setTimeIndex(+els.timeScale.value));
  els.showBonds.addEventListener("change", () => { state.showBonds = els.showBonds.checked; });
  els.showBroken.addEventListener("change", () => { state.showBroken = els.showBroken.checked; });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (e.code === "Space") {
      e.preventDefault();
      if (state.phase === "running") togglePause();
      else launch();
      return;
    }
    if (tag === "INPUT" && (e.key.startsWith("Arrow"))) return;
    const key = e.key.toLowerCase();
    if (key === "r") newWorld();
    else if (key === "m") setMaterial(state.material === "metal" ? "glass" : "metal");
    else if (key === "1" || key === "2" || key === "3") els.presetButtons[+key - 1].click();
  });

  window.addEventListener("resize", resizeAll);

  // ---------- start ----------
  readTheme();
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", readTheme);
    else if (mq.addListener) mq.addListener(readTheme);
  }
  resizeAll();
  setTimeIndex(2);
  setSpeed(state.speed);
  setMaterial("metal");
  requestAnimationFrame(frame);

  // exposed for testing
  window.__deform = { state, launch, newWorld, setMaterial, setSpeed, setTimeIndex, advance };
})();
