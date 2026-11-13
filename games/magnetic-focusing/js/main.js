'use strict';
// 磁聚焦与磁发散。画布为 700×500 的逻辑坐标，按显示尺寸缩放；物理计算见 physics.js（数学坐标，y 向上）。
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const W = 700, H = 500;
const RPX = 150; // 磁场区域半径（像素）
let OX = 400, OY = 310; // 磁场区域圆心（画布坐标），按模式摆放，让轨迹留在画面里
function placeOrigin() {
  OX = state.mode === 'focus' ? 400 : 250;
  OY = state.sign > 0 ? 310 : 190;
}
const fig = cv.parentElement;
const $ = id => document.getElementById(id);

function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cs = getComputedStyle(fig);
  const aw = fig.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = fig.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const k = Math.max(0.2, Math.min(aw / W, ah / H));
  cv.style.width = (W * k) + 'px'; cv.style.height = (H * k) + 'px';
  cv.width = Math.round(W * k * dpr); cv.height = Math.round(H * k * dpr);
}

const COL = {
  field: 'rgba(0,158,115,0.07)',
  fieldBorder: 'rgba(0,158,115,0.9)',
  cross: 'rgba(0,158,115,0.45)',
  track: '#D55E00',
  trackDim: 'rgba(213,94,0,0.55)',
  hi: '#0072B2',
  aux: '#666666',
  auxSoft: 'rgba(102,102,102,0.35)',
  text: '#333333',
  focus: '#CC79A7',
};

const state = {
  mode: 'focus', sign: 1, ratio: 1, width: 1.6, spread: 150, n: 9, k: 3,
  rhombus: true, centers: false,
  dist: Infinity, playing: false, last: 0,
};

const SPEED = 220; // 像素/秒

// ---------- 坐标 ----------
const cx = p => OX + p.x;
const cy = p => OY - p.y;

// 直线从点 p 沿方向 u 走到画布边缘的长度
function toEdge(p, u) {
  const xs = [-OX, W - OX], ys = [OY - H, OY];
  let t = Infinity;
  if (u.x > 1e-9) t = Math.min(t, (xs[1] - p.x) / u.x);
  if (u.x < -1e-9) t = Math.min(t, (xs[0] - p.x) / u.x);
  if (u.y > 1e-9) t = Math.min(t, (ys[1] - p.y) / u.y);
  if (u.y < -1e-9) t = Math.min(t, (ys[0] - p.y) / u.y);
  return Math.max(0, t);
}

// ---------- 轨迹 ----------
function buildTracks() {
  const R = RPX, r = state.ratio * R, s = state.sign, n = state.n;
  const list = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    let arc, start, label;
    if (state.mode === 'focus') {
      // 编号从离聚焦点最远的一侧开始
      const h = s * (-state.width / 2 + f * state.width) * R;
      arc = MF.focusTrack(h, r, R, s);
      start = { x: 15 - OX, y: h };
      label = { h: s * h / R };
    } else {
      const S = MF.focusPoint(R, s);
      const a0 = -s * Math.PI / 2; // 指向圆心 O
      const beta = (-state.spread / 2 + f * state.spread) * MF.DEG;
      arc = MF.divergeTrack(S, a0 + beta, r, R, s);
      start = S;
      label = { beta: beta / MF.DEG };
    }
    const L1 = MF.len(MF.sub(arc.P, start));
    const L2 = arc.r * arc.sweep;
    const L3 = toEdge(arc.Q, arc.vOut);
    list.push(Object.assign(arc, { start, L1, L2, L3, total: L1 + L2 + L3 }, label));
  }
  return list;
}

function pointAt(t, d) {
  if (d <= t.L1) {
    const u = MF.unit(MF.sub(t.P, t.start));
    return t.L1 > 0 ? MF.add(t.start, MF.mul(u, d)) : t.P;
  }
  if (d <= t.L1 + t.L2) {
    const phi = t.phiP + t.sign * (d - t.L1) / t.r;
    return { x: t.C.x + t.r * Math.cos(phi), y: t.C.y + t.r * Math.sin(phi) };
  }
  return MF.add(t.Q, MF.mul(t.vOut, Math.min(d, t.total) - t.L1 - t.L2));
}

function strokeTrack(t, d, color, width) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx(t.start), cy(t.start));
  const dd = Math.min(d, t.total);
  if (t.L1 > 0) { const p = pointAt(t, Math.min(dd, t.L1)); ctx.lineTo(cx(p), cy(p)); }
  if (dd > t.L1) {
    const a = Math.min(dd - t.L1, t.L2) / t.r;
    // 画布 y 向下，角度取反；正电荷（数学逆时针）在画布上也是逆时针
    ctx.arc(cx(t.C), cy(t.C), t.r, -t.phiP, -(t.phiP + t.sign * a), t.sign > 0);
  }
  if (dd > t.L1 + t.L2) { const p = pointAt(t, dd); ctx.lineTo(cx(p), cy(p)); }
  ctx.stroke();
}

// ---------- 绘制 ----------
function dot(p, rad, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx(p), cy(p), rad, 0, MF.TAU); ctx.fill();
}
// 点的标注：先垫一块半透明白底，轨迹穿过时也看得清
function label(text, p, dx, dy, color, size) {
  const o = { size: size || 16, color: 'rgba(0,0,0,0)', align: 'center', base: 'middle' };
  const x = cx(p) + dx, y = cy(p) + dy, h = o.size + 4;
  const w = drawRich(ctx, text, x, y, o) + 6;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 4); ctx.fill();
  o.color = color || COL.text;
  drawRich(ctx, text, x, y, o);
}
function arrow(p, u, len, color) {
  const a = { x: cx(p), y: cy(p) }, b = { x: a.x + u.x * len, y: a.y - u.y * len };
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  const ang = Math.atan2(b.y - a.y, b.x - a.x), hs = 8;
  ctx.beginPath(); ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - hs * Math.cos(ang - 0.4), b.y - hs * Math.sin(ang - 0.4));
  ctx.lineTo(b.x - hs * Math.cos(ang + 0.4), b.y - hs * Math.sin(ang + 0.4));
  ctx.closePath(); ctx.fill();
}

function drawField() {
  ctx.save();
  ctx.beginPath(); ctx.arc(OX, OY, RPX, 0, MF.TAU);
  ctx.fillStyle = COL.field; ctx.fill();
  ctx.clip();
  ctx.strokeStyle = COL.cross; ctx.lineWidth = 1.3;
  const step = 28, sz = 4;
  for (let x = OX - RPX + step / 2; x < OX + RPX; x += step) {
    for (let y = OY - RPX + step / 2; y < OY + RPX; y += step) {
      if (Math.hypot(x - OX, y - OY) > RPX - 6) continue;
      ctx.beginPath(); ctx.moveTo(x - sz, y - sz); ctx.lineTo(x + sz, y + sz);
      ctx.moveTo(x + sz, y - sz); ctx.lineTo(x - sz, y + sz); ctx.stroke();
    }
  }
  ctx.restore();
  ctx.strokeStyle = COL.fieldBorder; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(OX, OY, RPX, 0, MF.TAU); ctx.stroke();
  dot({ x: 0, y: 0 }, 3.5, COL.aux);
  label('*O*', { x: 0, y: 0 }, -12, 12, COL.aux);
}

function drawRhombus(t, done) {
  const O = { x: 0, y: 0 };
  const A = t.P, Q = t.Q, C = t.C; // A：进入磁场的点
  ctx.save();
  // 完整轨迹圆（淡）
  ctx.setLineDash([3, 5]); ctx.strokeStyle = COL.auxSoft; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx(C), cy(C), t.r, 0, MF.TAU); ctx.stroke();
  // 四边形 O-A-O′-Q
  ctx.setLineDash([6, 5]); ctx.strokeStyle = COL.aux; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx(O), cy(O)); ctx.lineTo(cx(A), cy(A)); ctx.lineTo(cx(C), cy(C));
  if (done) { ctx.lineTo(cx(Q), cy(Q)); ctx.closePath(); }
  ctx.stroke();
  ctx.restore();
  dot(C, 3.5, COL.aux);
  const off = (p, ref, k) => { const u = MF.unit(MF.sub(p, ref)); return [u.x * k, -u.y * k]; };
  const mid = done ? MF.mul(MF.add(MF.add(O, A), MF.add(C, Q)), 0.25) : MF.mul(MF.add(MF.add(O, A), C), 1 / 3);
  const focus = state.mode === 'focus';
  const names = focus ? ['*P*', '*Q*'] : ['*S*', '*P*'];
  let o = off(C, mid, 16); label('*O*′', C, o[0], o[1], COL.aux);
  // 边界上的点沿半径向外标注；聚焦点 Q、发射点 S 偏到一旁，避开扇形轨迹
  o = focus ? off(A, mid, 16) : [16, -t.sign * 18]; label(names[0], A, o[0], o[1], COL.hi);
  if (done) { o = focus ? [-16, -t.sign * 16] : off(Q, O, 18); label(names[1], Q, o[0], o[1], COL.hi); }
}

function draw() {
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  placeOrigin();
  drawField();
  const tracks = buildTracks();
  const hiIdx = Math.min(state.k, tracks.length) - 1;
  const d = state.dist;

  // 理论聚焦点 / 发射点
  const F = MF.focusPoint(RPX, state.sign);
  ctx.strokeStyle = COL.focus; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx(F), cy(F), 7, 0, MF.TAU); ctx.stroke();

  if (state.centers) {
    tracks.forEach(t => dot(t.C, 3, COL.auxSoft));
    if (Math.abs(state.ratio - 1) < 1e-6 && state.mode === 'focus') {
      // r = R 时圆心落在以聚焦点为圆心、半径 R 的圆上
      ctx.save(); ctx.setLineDash([2, 4]); ctx.strokeStyle = COL.auxSoft; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx(F), cy(F), RPX, 0, MF.TAU); ctx.stroke(); ctx.restore();
    }
  }

  tracks.forEach((t, i) => { if (i !== hiIdx) strokeTrack(t, d, COL.trackDim, 1.8); });
  const hi = tracks[hiIdx];
  const hiDone = d >= hi.L1 + hi.L2;
  if (state.rhombus && d >= hi.L1) drawRhombus(hi, hiDone);
  strokeTrack(hi, d, COL.hi, 3);

  // 运动中的粒子
  tracks.forEach((t, i) => {
    if (d < t.total) { const p = pointAt(t, d); dot(p, i === hiIdx ? 5.5 : 4.5, i === hiIdx ? COL.hi : COL.track); }
  });
  // 出射速度
  if (hiDone) arrow(hi.Q, hi.vOut, 46, COL.hi);
  else arrow(pointAt(hi, d), velocityAt(hi, d), 40, COL.hi);

  if (state.mode === 'focus') label('聚焦点', F, 50, state.sign * 4, COL.focus, 14);
  else label('发射点', F, -50, -state.sign * 14, COL.focus, 14);

  drawRich(ctx, '*r* = ' + state.ratio.toFixed(2) + ' *R*', 16, 26, { size: 16, color: COL.text });
  updatePanel(tracks, hi);
}

// 沿轨迹走过路程 d 时的速度方向
function velocityAt(t, d) {
  if (d < t.L1) return MF.unit(MF.sub(t.P, t.start));
  if (d >= t.L1 + t.L2) return t.vOut;
  const p = pointAt(t, d);
  return MF.mul(MF.left(MF.mul(MF.sub(p, t.C), 1 / t.r)), t.sign);
}

// ---------- 面板 ----------
function fmt(x, n) { return (Math.abs(x) < 5e-4 ? 0 : x).toFixed(n === undefined ? 2 : n); }

function updatePanel(tracks, hi) {
  const st = $('status');
  if (state.mode === 'focus') {
    let spread = 0;
    tracks.forEach(a => tracks.forEach(b => { spread = Math.max(spread, MF.len(MF.sub(a.Q, b.Q))); }));
    const ok = spread < 0.5;
    st.className = 'status ' + (ok ? 'ok' : 'bad');
    st.innerHTML = ok ? '全部粒子从同一点 <i class="v">Q</i> 射出：会聚'
      : '出射点不重合（最远相距 ' + fmt(spread / RPX) + ' <i class="v">R</i>）：不能会聚';
  } else {
    let dev = 0;
    tracks.forEach(a => tracks.forEach(b => {
      const c = Math.max(-1, Math.min(1, a.vOut.x * b.vOut.x + a.vOut.y * b.vOut.y));
      dev = Math.max(dev, Math.acos(c) / MF.DEG);
    }));
    const ok = dev < 0.2;
    st.className = 'status ' + (ok ? 'ok' : 'bad');
    st.innerHTML = ok ? '全部粒子平行射出：出射方向垂直于 <i class="v">OS</i>'
      : '出射方向不平行（最大夹角 ' + fmt(dev, 1) + '°）';
  }

  const rows = [];
  const theta = hi.sweep / MF.DEG;
  if (state.mode === 'focus') {
    rows.push(['入射高度 <i class="v">h</i>（向受力一侧为正）', fmt(hi.h) + ' <i class="v">R</i>']);
  } else {
    rows.push(['入射方向与 <i class="v">SO</i> 的夹角', fmt(Math.abs(hi.beta), 0) + '°']);
  }
  rows.push(['偏转角 <i class="v">θ</i>（圆心角）', fmt(theta, 1) + '°']);
  if (state.mode === 'focus' && Math.abs(state.ratio - 1) < 1e-6) {
    rows.push(['<i class="v">h</i>/<i class="v">R</i>　｜　cos <i class="v">θ</i>', fmt(hi.h) + '　｜　' + fmt(Math.cos(hi.sweep))]);
  }
  rows.push(['磁场中运动时间 <i class="v">t</i>', fmt(hi.sweep / MF.TAU, 3) + ' <i class="v">T</i>']);
  $('stats').innerHTML = rows.map(r => '<div class="stat-row"><span class="lb">' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
}

function updateConclusion() {
  const c = $('concl');
  if (state.mode === 'focus') {
    c.innerHTML = '<p><span class="key">磁聚焦</span>：平行入射的同种粒子，当 <span class="tex" data-f="cond"></span> 时全部会聚于一点——与入射速度垂直的半径的端点（洛伦兹力指向的一侧）。</p>';
  } else {
    c.innerHTML = '<p><span class="key">磁发散</span>：从边界上一点 <i class="v">S</i> 沿不同方向射入的同种粒子，当 <span class="tex" data-f="cond"></span> 时全部平行射出，出射方向与半径 <i class="v">OS</i> 垂直。</p>';
  }
  fillFormulas(c);
}

function syncControls() {
  $('valR').innerHTML = state.ratio.toFixed(2) + ' <i class="v">R</i>';
  $('valWidth').innerHTML = state.width.toFixed(2) + ' <i class="v">R</i>';
  $('valSpread').textContent = state.spread + '°';
  $('valN').textContent = state.n;
  const sk = $('sliderK'); sk.max = state.n;
  if (state.k > state.n) { state.k = state.n; sk.value = state.n; }
  $('valK').textContent = state.k;
  $('rowWidth').classList.toggle('hidden', state.mode !== 'focus');
  $('rowSpread').classList.toggle('hidden', state.mode !== 'diverge');
  $('btnPlay').textContent = state.dist === Infinity ? '发射粒子' : '重新发射';
}

// ---------- 交互 ----------
function bindChips(id, key, parse) {
  $(id).querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
    $(id).querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b));
    state[key] = parse(b.dataset[key]);
    state.dist = Infinity; state.playing = false;
    if (key === 'mode') updateConclusion();
    syncControls(); draw();
  }));
}
bindChips('modeTabs', 'mode', v => v);
bindChips('signTabs', 'sign', v => +v);

[['sliderR', 'ratio'], ['sliderWidth', 'width'], ['sliderSpread', 'spread'], ['sliderN', 'n'], ['sliderK', 'k']].forEach(([id, key]) => {
  $(id).addEventListener('input', e => {
    state[key] = +e.target.value;
    if (key !== 'k' && !state.playing) state.dist = Infinity;
    syncControls(); if (!state.playing) draw();
  });
});
$('chkRhombus').addEventListener('change', e => { state.rhombus = e.target.checked; if (!state.playing) draw(); });
$('chkCenters').addEventListener('change', e => { state.centers = e.target.checked; if (!state.playing) draw(); });
$('btnR').addEventListener('click', () => {
  state.ratio = 1; $('sliderR').value = 1; if (!state.playing) state.dist = Infinity;
  syncControls(); if (!state.playing) draw();
});

function frame(ts) {
  if (!state.playing) return;
  const dt = Math.min(0.05, (ts - state.last) / 1000); state.last = ts;
  state.dist += SPEED * dt;
  const max = Math.max(...buildTracks().map(t => t.total));
  if (state.dist >= max) { state.dist = Infinity; state.playing = false; }
  draw(); syncControls();
  if (state.playing) requestAnimationFrame(frame);
}
$('btnPlay').addEventListener('click', () => {
  state.dist = 0; state.playing = true; state.last = performance.now();
  syncControls(); requestAnimationFrame(frame);
});

const dlg = $('explain');
$('explainBtn').onclick = () => dlg.showModal();
$('explainClose').onclick = () => dlg.close();
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

fillFormulas(document);
updateConclusion();
syncControls();
fitCanvas(); draw();
window.addEventListener('resize', () => { fitCanvas(); draw(); });
