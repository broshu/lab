(function () {
  'use strict';
  const { solve } = window.ThrowSymmetry;
  const $ = id => document.getElementById(id);
  const DEFAULT = { v0: 20, g: 10, yA: 8.75, yB: 18.75 };
  const state = { ...DEFAULT, sol: null, seg: null, t: 0, started: false, playing: false, last: 0, drag: null };

  const N = (x, d = 2) => { if (Math.abs(x) < 1e-9) x = 0; return (+x.toFixed(d)).toString().replace('-', '−'); };
  const snap = y => Math.round(y * 20) / 20;
  const FONT = '"Inter","PingFang SC","Microsoft YaHei",sans-serif';
  const C = { ink: '#17212f', muted: '#647084', grid: '#e3e9f0', orange: '#c68116', blue: '#2576d6', green: '#14936f', a: '#7a4fc4', b: '#d0508a', navy: '#264761' };

  /* ---------- 参数 ---------- */
  function recompute(resetTime) {
    state.sol = solve(state.v0, state.g);
    const H = state.sol.H, gap = Math.min(0.05, H / 100);
    state.yA = Math.min(Math.max(state.yA, 0), H - gap);
    state.yB = Math.min(Math.max(state.yB, state.yA + gap), H);
    state.seg = state.sol.segment(state.yA, state.yB);
    if (resetTime) { state.t = 0; state.started = false; state.playing = false; }
    syncFields();
    render();
  }
  function syncFields() {
    const s = state.sol;
    $('v0').value = state.v0; $('v0Range').value = state.v0; $('g').value = String(state.g);
    for (const k of ['yA', 'yB']) {
      $(k).value = N(state[k]).replace('−', '-'); $(k + 'Range').value = state[k];
      $(k).max = $(k + 'Range').max = N(s.H); $(k).min = $(k + 'Range').min = 0;
    }
    $('factH').textContent = N(s.H) + ' m'; $('factTop').textContent = N(s.tTop) + ' s'; $('factT').textContent = N(s.T) + ' s';
    $('durationLabel').textContent = N(s.T) + ' s';
  }
  function setV0(v0) {
    v0 = Math.min(40, Math.max(5, v0));
    const ratio = (v0 * v0) / (state.v0 * state.v0);      // H ∝ v0²，A、B 按比例缩放
    state.yA = snap(state.yA * ratio); state.yB = snap(state.yB * ratio); state.v0 = v0;
    recompute(true);
  }
  $('v0Range').addEventListener('input', e => setV0(+e.target.value));
  $('v0').addEventListener('change', e => setV0(Number.isFinite(+e.target.value) ? +e.target.value : state.v0));
  $('g').addEventListener('change', e => {
    const g = +e.target.value, ratio = state.g / g;
    state.yA = snap(state.yA * ratio); state.yB = snap(state.yB * ratio); state.g = g; recompute(true);
  });
  for (const k of ['yA', 'yB']) {
    $(k + 'Range').addEventListener('input', e => { state[k] = +e.target.value; fixOrder(k); recompute(false); });
    $(k).addEventListener('change', e => { if (Number.isFinite(+e.target.value)) state[k] = +e.target.value; fixOrder(k); recompute(false); });
  }
  function fixOrder(moved) {
    const gap = Math.min(0.05, state.sol.H / 100);
    if (moved === 'yA' && state.yA > state.yB - gap) state.yA = state.yB - gap;
    if (moved === 'yB' && state.yB < state.yA + gap) state.yB = state.yA + gap;
  }
  $('reset').addEventListener('click', () => { Object.assign(state, DEFAULT); recompute(true); });
  $('revealAll').addEventListener('change', render);

  /* ---------- 播放 ---------- */
  function togglePlay() {
    if (state.playing) { state.playing = false; render(); return; }
    if (state.t >= state.sol.T - 1e-9) state.t = 0;
    state.started = true; state.playing = true; state.last = performance.now();
    render(); requestAnimationFrame(tick);
  }
  function tick(now) {
    if (!state.playing) return;
    const dt = Math.min((now - state.last) / 1000, 0.05); state.last = now;
    const old = state.t;
    let next = old + dt * +$('rate').value;
    if (next >= state.sol.T) { next = state.sol.T; state.playing = false; }
    state.t = next;
    render();
    if (state.playing) requestAnimationFrame(tick);
  }
  $('play').addEventListener('click', togglePlay);
  $('timeline').addEventListener('input', e => { state.t = state.sol.T * e.target.value / 1000; state.started = true; state.playing = false; render(); });
  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) return;
    e.preventDefault(); togglePlay();
  });

  // 某时刻是否已“揭示”
  const reached = t => $('revealAll').checked || (state.started && state.t >= t - 1e-9);

  /* ---------- 画布工具 ---------- */
  function fit(canvas) {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  function niceStep(range, target) {
    const raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
    return 10 * p;
  }
  function vArrow(ctx, x, y1, y2, color, width = 3) {
    if (Math.abs(y2 - y1) < 1) return;
    const dir = Math.sign(y2 - y1), head = Math.min(9, Math.abs(y2 - y1));
    ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2 - dir * head * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y2); ctx.lineTo(x - 5.5, y2 - dir * head); ctx.lineTo(x + 5.5, y2 - dir * head); ctx.closePath(); ctx.fill();
  }
  function bracketH(ctx, x1, x2, y, color, text) {
    ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x1, y - 5); ctx.lineTo(x1, y + 5); ctx.moveTo(x2, y - 5); ctx.lineTo(x2, y + 5);
    ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(text, (x1 + x2) / 2, y + 5);
  }

  /* ---------- 主动画 ---------- */
  let motionMap = null;
  function drawMotion() {
    const { ctx, w, h } = fit($('motion'));
    const s = state.sol, q = state.seg, p = s.at(state.t);
    const top = 24, ground = h - 54, left = 52;
    const yTopWorld = s.H * 1.14, k = (ground - top) / yTopWorld;
    const Y = y => ground - y * k;
    motionMap = { Y, inv: py => (ground - py) / k, h };
    const cx = left + (w - left) * 0.5;
    const xUp = cx - Math.min(90, (w - left) * 0.2), xDown = cx + Math.min(90, (w - left) * 0.2);
    // 速度箭头比例：同一比例，保证等长 ⇔ 等大；向下箭头不超出画布
    const kv = Math.min(80 / s.v0, (h - 4 - Y(q.yA)) / Math.max(q.vA, 1e-9), (Y(q.yB) - 6) / Math.max(q.vB, 1e-9) || Infinity);

    // 背景
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, '#dcebf8'); sky.addColorStop(1, '#f6fafd');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, ground);
    ctx.fillStyle = '#9cc58a'; ctx.fillRect(0, ground, w, 6);
    ctx.fillStyle = '#e7dccb'; ctx.fillRect(0, ground + 6, w, h - ground - 6);

    // 标尺
    const step = niceStep(yTopWorld, 7);
    ctx.font = `11px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let y = 0; y <= yTopWorld; y += step) {
      ctx.strokeStyle = '#ffffffb0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, Y(y)); ctx.lineTo(w, Y(y)); ctx.stroke();
      ctx.strokeStyle = C.muted; ctx.beginPath(); ctx.moveTo(left - 5, Y(y)); ctx.lineTo(left, Y(y)); ctx.stroke();
      ctx.fillStyle = C.muted; ctx.fillText(N(y, 1), left - 8, Y(y));
    }
    ctx.strokeStyle = C.muted; ctx.beginPath(); ctx.moveTo(left, Y(0)); ctx.lineTo(left, top - 8); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillText('y / m', 8, top - 12);

    // AB 色带
    ctx.fillStyle = '#f7e8a855'; ctx.fillRect(left, Y(q.yB), w - left, Y(q.yA) - Y(q.yB));
    for (const [y, color, name] of [[q.yA, C.a, 'A'], [q.yB, C.b, 'B']]) {
      ctx.strokeStyle = color; ctx.lineWidth = state.drag === name ? 2.5 : 1.6;
      ctx.beginPath(); ctx.moveTo(left, Y(y)); ctx.lineTo(w, Y(y)); ctx.stroke();
      // 拖动手柄
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(w - 18, Y(y), 9, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(name, w - 18, Y(y) + 0.5);
      ctx.fillStyle = color; ctx.textAlign = 'right'; ctx.font = `bold 11px ${FONT}`;
      ctx.fillText(`${N(y)} m`, w - 32, Y(y) + (name === 'A' ? 10 : -10));
    }
    // 最高点
    ctx.setLineDash([5, 4]); ctx.strokeStyle = C.green; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, Y(s.H)); ctx.lineTo(w - 36, Y(s.H)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.green; ctx.font = `11px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(`最高点 H = ${N(s.H)} m`, left + 6, Y(s.H) - 3);

    // 列标题
    ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#9a6511'; ctx.fillText('上升 ↑', xUp, h - 44);
    ctx.fillStyle = '#1e5ea9'; ctx.fillText('下降 ↓', xDown, h - 44);

    // 轨迹
    if (state.started) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#c6811688'; ctx.beginPath(); ctx.moveTo(xUp, Y(0)); ctx.lineTo(xUp, Y(state.t < s.tTop ? p.y : s.H)); ctx.stroke();
      if (state.t > s.tTop) { ctx.strokeStyle = '#2576d688'; ctx.beginPath(); ctx.moveTo(xDown, Y(s.H)); ctx.lineTo(xDown, Y(p.y)); ctx.stroke(); }
      ctx.setLineDash([2, 4]); ctx.strokeStyle = '#9aa7b6'; ctx.lineWidth = 1;
      if (state.t >= s.tTop) { ctx.beginPath(); ctx.moveTo(xUp, Y(s.H)); ctx.quadraticCurveTo(cx, Y(s.H) - 22, xDown, Y(s.H)); ctx.stroke(); }
      ctx.setLineDash([]);
    }

    // 记录的速度箭头（经过 A、B 时）
    const rec = [[q.t1, xUp, q.yA, q.vA, C.orange, 'A'], [q.t2, xUp, q.yB, q.vB, C.orange, 'B'],
                 [q.t3, xDown, q.yB, -q.vB, C.blue, 'B'], [q.t4, xDown, q.yA, -q.vA, C.blue, 'A']];
    for (const [t, x, y, v, color] of rec) {
      if (!reached(t)) continue;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, Y(y), 4, 0, 7); ctx.fill();
      vArrow(ctx, x, Y(y), Y(y) - v * kv, color, 2.5);
      ctx.font = `bold 11px ${FONT}`; ctx.textBaseline = 'middle';
      ctx.textAlign = x < cx ? 'right' : 'left';
      ctx.fillText(`${N(Math.abs(v), 1)} m/s`, x + (x < cx ? -9 : 9), Y(y) - v * kv / 2);
    }

    // 通过 AB 的计时括号
    const timer = (x, t0, t1, color, side) => {
      if (!(reached(t0))) return;
      const done = reached(t1), dt = done ? t1 - t0 : state.t - t0;
      const narrow = w < 560, xb = x + side * (narrow ? 30 : 46);
      ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(xb - side * 5, Y(q.yA)); ctx.lineTo(xb, Y(q.yA)); ctx.lineTo(xb, Y(q.yB)); ctx.lineTo(xb - side * 5, Y(q.yB)); ctx.stroke();
      ctx.font = `bold 12px ${FONT}`; ctx.textAlign = side < 0 ? 'right' : 'left'; ctx.textBaseline = 'middle';
      const mid = (Y(q.yA) + Y(q.yB)) / 2;
      ctx.fillText(`${narrow ? '' : 'Δt = '}${N(dt)} s${done ? '' : '…'}`, xb + side * 6, mid);
    };
    timer(xUp, q.t1, q.t2, '#9a6511', -1);
    timer(xDown, q.t3, q.t4, '#1e5ea9', 1);

    // 小球
    const r = 9, by = Y(p.y) - r;
    const grad = ctx.createRadialGradient(cx - 3, by - 3, 1, cx, by, r);
    grad.addColorStop(0, '#6f8499'); grad.addColorStop(1, '#253447');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, by, r, 0, 7); ctx.fill();
    if (state.started && Math.abs(p.v) > 1e-6) {
      vArrow(ctx, cx, by, by - p.v * kv, p.v > 0 ? C.orange : C.blue, 3);
    }
  }

  // 在画面中拖动 A、B
  const cv = $('motion');
  function pick(e) {
    if (!motionMap) return null;
    const rect = cv.getBoundingClientRect(), py = e.clientY - rect.top;
    const dA = Math.abs(py - motionMap.Y(state.yA)), dB = Math.abs(py - motionMap.Y(state.yB));
    const best = dA <= dB ? ['A', dA] : ['B', dB];
    return best[1] < 14 ? best[0] : null;
  }
  cv.addEventListener('pointerdown', e => { const k = pick(e); if (!k) return; state.drag = k; cv.setPointerCapture(e.pointerId); e.preventDefault(); render(); });
  cv.addEventListener('pointermove', e => {
    if (!state.drag) { cv.style.cursor = pick(e) ? 'ns-resize' : 'default'; return; }
    const rect = cv.getBoundingClientRect(), y = snap(motionMap.inv(e.clientY - rect.top));
    const key = state.drag === 'A' ? 'yA' : 'yB';
    state[key] = Math.min(Math.max(y, 0), state.sol.H); fixOrder(key); recompute(false);
  });
  const endDrag = () => { if (state.drag) { state.drag = null; render(); } };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

  /* ---------- 图像框架 ---------- */
  function frame(canvas, yMin, yMax, bottomPad) {
    const { ctx, w, h } = fit(canvas);
    const s = state.sol;
    const box = { l: 46, r: w - 16, t: 14, b: h - bottomPad };
    const tMax = s.T * 1.04;
    const X = t => box.l + (t / tMax) * (box.r - box.l);
    const Y = v => box.b - (v - yMin) / (yMax - yMin) * (box.b - box.t);
    ctx.font = `11px ${FONT}`; ctx.lineWidth = 1;
    const ys = niceStep(yMax - yMin, 6);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = Math.ceil(yMin / ys) * ys; v <= yMax + 1e-9; v += ys) {
      ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(box.l, Y(v)); ctx.lineTo(box.r, Y(v)); ctx.stroke();
      ctx.fillStyle = C.muted; ctx.fillText(N(v, 1), box.l - 6, Y(v));
    }
    const ts = niceStep(tMax, 8);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = 0; t <= tMax + 1e-9; t += ts) {
      ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(X(t), box.t); ctx.lineTo(X(t), box.b); ctx.stroke();
      ctx.fillStyle = C.muted; ctx.fillText(N(t, 1), X(t), box.b + 5);
    }
    ctx.strokeStyle = '#8f9bab'; ctx.beginPath(); ctx.moveTo(box.l, box.t); ctx.lineTo(box.l, box.b); ctx.lineTo(box.r, box.b); ctx.stroke();
    ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('t / s', box.r, box.b - 3);
    // 对称轴
    ctx.setLineDash([6, 4]); ctx.strokeStyle = C.green; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(X(s.tTop), box.t); ctx.lineTo(X(s.tTop), box.b); ctx.stroke(); ctx.setLineDash([]);
    return { ctx, w, h, box, X, Y, s };
  }

  function drawVT() {
    const s0 = state.sol, V = s0.v0 * 1.15;
    const { ctx, box, X, Y, s } = frame($('vt'), -V, V, 58);
    const q = state.seg, tNow = state.started ? state.t : 0;
    const v = t => s.v0 - s.g * t;
    ctx.strokeStyle = '#5b6878'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(box.l, Y(0)); ctx.lineTo(box.r, Y(0)); ctx.stroke();
    ctx.fillStyle = C.green; ctx.font = `11px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`t = v₀/g = ${N(s.tTop)} s`, X(s.tTop) + 5, box.t + 2);

    // 阴影（逐步揭示）
    const shade = (t0, t1, color) => {
      const end = $('revealAll').checked ? t1 : Math.min(tNow, t1);
      if (!reached(t0) || end <= t0) return;
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(X(t0), Y(0)); ctx.lineTo(X(t0), Y(v(t0))); ctx.lineTo(X(end), Y(v(end))); ctx.lineTo(X(end), Y(0)); ctx.closePath(); ctx.fill();
    };
    shade(q.t1, q.t2, '#f0c67cb0'); shade(q.t3, q.t4, '#9cc3f0b0');
    const AB = q.yB - q.yA;
    ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (reached(q.t2)) { ctx.fillStyle = '#7a4f0c'; ctx.fillText(`+${N(AB)} m`, X((q.t1 + q.t2) / 2), Y(v((q.t1 + q.t2) / 2) / 2)); }
    if (reached(q.t4)) { ctx.fillStyle = '#16498a'; ctx.fillText(`−${N(AB)} m`, X((q.t3 + q.t4) / 2), Y(v((q.t3 + q.t4) / 2) / 2)); }

    // 速度大小对应的水平虚线（贯穿全图，标签放在右端）
    const level = (val, color, name, tA, tB) => {
      for (const [sv, t, lab] of [[val, tA, `${name} = ${N(val, 1)}`], [-val, tB, `−${name}`]]) {
        if (!reached(t)) continue;
        ctx.setLineDash([4, 4]); ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(box.l, Y(sv)); ctx.lineTo(box.r, Y(sv)); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = color; ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(lab, box.r - 2, Y(sv) - 2);
      }
    };
    level(q.vA, C.a, 'vA', q.t1, q.t4);
    level(q.vB, C.b, 'vB', q.t2, q.t3);

    // 直线
    ctx.setLineDash([5, 4]); ctx.strokeStyle = '#aab6c4'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(0), Y(s.v0)); ctx.lineTo(X(s.T), Y(-s.v0)); ctx.stroke(); ctx.setLineDash([]);
    if (tNow > 0) { ctx.strokeStyle = C.navy; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(X(0), Y(s.v0)); ctx.lineTo(X(tNow), Y(v(tNow))); ctx.stroke(); }

    // 事件点
    const pts = [[q.t1, C.a, 't₁'], [q.t2, C.b, 't₂'], [q.t3, C.b, 't₃'], [q.t4, C.a, 't₄']];
    for (const [t, color, name] of pts) {
      if (!reached(t)) continue;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(t), Y(v(t)), 4.5, 0, 7); ctx.fill();
      ctx.setLineDash([2, 3]); ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(t), Y(v(t))); ctx.lineTo(X(t), box.b); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = `11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = v(t) >= 0 ? 'bottom' : 'top';
      ctx.fillText(name, X(t) + 9, Y(v(t)) + (v(t) >= 0 ? -3 : 3));
    }
    // 时间括号
    const yb = box.b + 24;
    if (reached(q.t2)) bracketH(ctx, X(q.t1), X(q.t2), yb, '#9a6511', `Δt上 = ${N(q.dtUp)} s`);
    if (reached(q.t4)) bracketH(ctx, X(q.t3), X(q.t4), yb, '#1e5ea9', `Δt下 = ${N(q.dtDown)} s`);

    // 当前点
    if (state.started) {
      ctx.fillStyle = v(tNow) >= 0 ? C.orange : C.blue; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(tNow), Y(v(tNow)), 5.5, 0, 7); ctx.fill(); ctx.stroke();
    }
  }

  function drawYT() {
    const s0 = state.sol;
    const { ctx, box, X, Y, s } = frame($('yt'), 0, s0.H * 1.15, 26);
    const q = state.seg, tNow = state.started ? state.t : 0;
    // 时间带
    const band = (t0, t1, color) => { if (reached(t1)) { ctx.fillStyle = color; ctx.fillRect(X(t0), box.t, X(t1) - X(t0), box.b - box.t); } };
    band(q.t1, q.t2, '#f0c67c55'); band(q.t3, q.t4, '#9cc3f055');
    for (const [y, color, name] of [[q.yA, C.a, 'A'], [q.yB, C.b, 'B']]) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(box.l, Y(y)); ctx.lineTo(box.r, Y(y)); ctx.stroke();
      ctx.fillStyle = color; ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = name === 'A' ? 'top' : 'bottom';
      ctx.fillText(name, box.r - 2, Y(y) + (name === 'A' ? 2 : -2));
    }
    const curve = (t1, color, width, dash) => {
      ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      for (let i = 0; i <= 160; i++) { const t = t1 * i / 160, yy = s.at(t).y; i ? ctx.lineTo(X(t), Y(yy)) : ctx.moveTo(X(t), Y(yy)); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    curve(s.T, '#aab6c4', 1.5, [5, 4]);
    if (tNow > 0) curve(tNow, C.navy, 2.2, []);
    for (const [t, y, color] of [[q.t1, q.yA, C.a], [q.t2, q.yB, C.b], [q.t3, q.yB, C.b], [q.t4, q.yA, C.a]]) {
      if (!reached(t)) continue;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(t), Y(y), 4.5, 0, 7); ctx.fill();
    }
    if (state.started) {
      ctx.fillStyle = C.navy; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(tNow), Y(s.at(tNow).y), 5, 0, 7); ctx.fill(); ctx.stroke();
    }
  }

  /* ---------- 文字 ---------- */
  const last = {};
  function setCell(id, text) {
    const el = $(id);
    if (el.textContent !== text) {
      el.textContent = text;
      if (text !== '—' && !text.endsWith('…') && last[id] !== text) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
      last[id] = text;
    }
  }
  function describe() {
    const s = state.sol, q = state.seg, t = state.t, p = s.at(t);
    const at = e => state.started && !state.playing && Math.abs(t - e) < 1e-6;
    // 表格
    setCell('cVAup', reached(q.t1) ? `${N(q.vA, 2)} m/s ↑` : '—');
    setCell('cVBup', reached(q.t2) ? `${N(q.vB, 2)} m/s ↑` : '—');
    setCell('cVBdown', reached(q.t3) ? `${N(q.vB, 2)} m/s ↓` : '—');
    setCell('cVAdown', reached(q.t4) ? `${N(q.vA, 2)} m/s ↓` : '—');
    setCell('cDtUp', reached(q.t2) ? `${N(q.dtUp)} s` : reached(q.t1) ? `${N(t - q.t1)} s…` : '—');
    setCell('cDtDown', reached(q.t4) ? `${N(q.dtDown)} s` : reached(q.t3) ? `${N(t - q.t3)} s…` : '—');
    $('eqDt').textContent = reached(q.t4) ? '✓ 相等' : '';
    $('eqVA').textContent = reached(q.t4) ? '✓ 等大' : '';
    $('eqVB').textContent = reached(q.t3) ? '✓ 等大' : '';

    let phase = '准备', cls = '', text;
    if (!state.started) text = `小球将以 ${N(s.v0)} m/s 竖直上抛。先预测：上升通过 AB 与下降通过 BA，哪一次用时更长？经过 A 点时，哪一次更快？`;
    else if (t >= s.T - 1e-9) { phase = '落回地面'; cls = 'landed'; text = `回到抛出点，速度 ${N(s.v0)} m/s 向下——与抛出时大小相等、方向相反。上升与下降总时间都是 ${N(s.tTop)} s。`; }
    else if (at(q.t1)) { phase = '经过 A ↑'; cls = 'rising'; text = `上升经过 A：v = ${N(q.vA)} m/s，方向向上。开始计时。`; }
    else if (at(q.t2)) { phase = '经过 B ↑'; cls = 'rising'; text = `上升经过 B：v = ${N(q.vB)} m/s，向上。上升通过 AB 用时 ${N(q.dtUp)} s。`; }
    else if (at(q.t3)) { phase = '经过 B ↓'; cls = 'falling'; text = `下降经过 B：v = ${N(q.vB)} m/s，向下——与上升经过 B 时大小相同。开始计时。`; }
    else if (at(q.t4)) { phase = '经过 A ↓'; cls = 'falling'; text = `下降经过 A：v = ${N(q.vA)} m/s，向下。下降通过 BA 用时 ${N(q.dtDown)} s，与上升用时相等。`; }
    else if (Math.abs(t - s.tTop) < 0.03) { phase = '最高点'; cls = 'peak'; text = `最高点：v = 0，离地 ${N(s.H)} m，用时 ${N(s.tTop)} s。之后的运动是前半段的「倒放」。`; }
    else if (t < q.t1) { phase = '上升'; cls = 'rising'; text = '减速上升，尚未到达 A。'; }
    else if (t < q.t2) { phase = '上升通过 AB'; cls = 'rising'; text = '上升通过 AB，计时中……'; }
    else if (t < s.tTop) { phase = '上升'; cls = 'rising'; text = '已离开 B，继续减速上升。'; }
    else if (t < q.t3) { phase = '下落'; cls = 'falling'; text = '从最高点加速下落，尚未回到 B。'; }
    else if (t < q.t4) { phase = '下降通过 BA'; cls = 'falling'; text = '下降通过 BA，计时中……'; }
    else { phase = '下落'; cls = 'falling'; text = '已离开 A，继续加速下落。'; }
    $('phase').textContent = phase; $('phase').className = 'pill ' + cls;
    $('narrative').textContent = text;
    $('timeLabel').textContent = N(p.t) + ' s';
    $('timeline').value = Math.round(1000 * t / s.T);
    $('play').textContent = state.playing ? '❚❚ 暂停' : !state.started ? '▶ 抛出' : t >= s.T - 1e-9 ? '↻ 重新抛出' : '▶ 继续';

    // 解释卡片中的数字
    $('expV').innerHTML = `当前：v<sub>A</sub> = √(${N(s.v0)}² − 2×${N(s.g)}×${N(q.yA)}) = ${N(q.vA)} m/s；v<sub>B</sub> = √(${N(s.v0)}² − 2×${N(s.g)}×${N(q.yB)}) = ${N(q.vB)} m/s`;
    $('expT').innerHTML = `当前：Δt = (${N(q.vA)} − ${N(q.vB)}) / ${N(s.g)} = ${N(q.dtUp)} s`;
    $('expG').innerHTML = `当前：t<sub>1</sub> + t<sub>4</sub> = t<sub>2</sub> + t<sub>3</sub> = 2v<sub>0</sub>/g = ${N(s.T)} s；两块面积大小都为 AB = ${N(q.yB - q.yA)} m`;
  }

  function render() { drawMotion(); drawVT(); drawYT(); describe(); }

  new ResizeObserver(() => render()).observe(document.querySelector('.app'));
  recompute(true);
})();
