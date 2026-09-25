(function () {
  'use strict';
  const { solve } = window.VerticalThrow;
  const $ = id => document.getElementById(id);
  const EXAMPLE = { v0: 10, h: 175, g: 10 };

  const state = { ...EXAMPLE, sol: null, t: 0, broken: false, playing: false, last: 0, method: 'segment', shown: { segment: 0, whole: 0 } };

  /* ---------- 数字格式 ---------- */
  const N = (x, d = 2) => {
    if (Math.abs(x) < 1e-9) x = 0;
    return (+x.toFixed(d)).toString().replace('-', '−');
  };
  const signed = (x, d = 2) => (x > 1e-9 ? '+' : '') + N(x, d);
  const approx = x => Math.abs(x - +x.toFixed(2)) > 1e-9 ? '≈' : '=';

  /* ---------- 参数 ---------- */
  const inputs = [['v0', 'v0Range'], ['h', 'hRange']];
  function readParams(src) {
    const v0 = clampNum(+$('v0').value, 0, 30, state.v0);
    const h = clampNum(+$('h').value, 10, 300, state.h);
    if (src) { state.v0 = v0; state.h = h; }
    state.g = +$('g').value;
  }
  function clampNum(x, lo, hi, fallback) { return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : fallback; }

  function syncFields() {
    $('v0').value = state.v0; $('v0Range').value = state.v0;
    $('h').value = state.h; $('hRange').value = state.h;
    $('g').value = String(state.g);
    $('ledeV0').textContent = N(state.v0); $('ledeH').textContent = N(state.h); $('ledeG').textContent = N(state.g);
  }

  function recompute() {
    state.sol = solve(state.v0, state.h, state.g);
    state.t = 0; state.broken = false; state.playing = false;
    $('durationLabel').textContent = N(state.sol.T) + ' s';
    clearQuiz();
    buildSteps();
    render();
  }

  inputs.forEach(([num, range]) => {
    $(range).addEventListener('input', () => { $(num).value = $(range).value; readParams(true); syncFields(); recompute(); });
    $(num).addEventListener('change', () => { readParams(true); syncFields(); recompute(); });
  });
  $('g').addEventListener('change', () => { readParams(true); syncFields(); recompute(); });
  $('resetExample').addEventListener('click', () => { Object.assign(state, EXAMPLE); syncFields(); recompute(); });

  /* ---------- 播放 ---------- */
  function setTime(t, keepPlaying) {
    state.t = Math.min(Math.max(t, 0), state.sol.T);
    if (state.t > 0) state.broken = true;
    if (!keepPlaying) state.playing = false;
    render();
  }
  function togglePlay() {
    const s = state.sol;
    if (state.playing) { state.playing = false; render(); return; }
    if (state.t >= s.T - 1e-9) { state.t = 0; }
    state.broken = true; state.playing = true; state.last = performance.now();
    render();
    requestAnimationFrame(tick);
  }
  function tick(now) {
    if (!state.playing) return;
    const dt = Math.min((now - state.last) / 1000, 0.05);
    state.last = now;
    state.t += dt * +$('rate').value;
    if (state.t >= state.sol.T) { state.t = state.sol.T; state.playing = false; }
    render();
    if (state.playing) requestAnimationFrame(tick);
  }
  $('play').addEventListener('click', togglePlay);
  $('timeline').addEventListener('input', e => setTime(state.sol.T * e.target.value / 1000));
  ['strobe', 'arrow'].forEach(id => $(id).addEventListener('change', render));
  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) return;
    e.preventDefault(); togglePlay();
  });

  /* ---------- 画布工具 ---------- */
  function fit(canvas) {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  function niceStep(range, target) {
    const raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
    return 10 * p;
  }
  function arrow(ctx, x, y1, y2, color, width = 3) {
    const dir = Math.sign(y2 - y1) || 1, head = Math.min(10, Math.abs(y2 - y1));
    ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2 - dir * head * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y2); ctx.lineTo(x - 6, y2 - dir * head); ctx.lineTo(x + 6, y2 - dir * head); ctx.closePath(); ctx.fill();
  }
  const FONT = '"Inter","PingFang SC","Microsoft YaHei",sans-serif';
  const COLORS = { ink: '#17212f', muted: '#647084', grid: '#e3e9f0', orange: '#c68116', blue: '#2576d6', green: '#14936f', red: '#c8453b', navy: '#264761' };

  /* ---------- 主动画 ---------- */
  function drawMotion() {
    const { ctx, w, h } = fit($('motion'));
    const s = state.sol, p = s.at(state.t);
    const top = 26, ground = h - 42, left = 58;
    const yTopWorld = Math.max(s.peak * 1.12, s.h + 25);
    const k = (ground - top) / yTopWorld;
    const Y = y => ground - y * k;
    const cx = left + (w - left) * 0.46;

    // 天空与地面
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, '#dcebf8'); sky.addColorStop(1, '#f6fafd');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, ground);
    ctx.fillStyle = '#9cc58a'; ctx.fillRect(0, ground, w, 7);
    ctx.fillStyle = '#e7dccb'; ctx.fillRect(0, ground + 7, w, h - ground - 7);

    // 标尺
    const step = niceStep(yTopWorld, 8);
    ctx.font = `11px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let y = 0; y <= yTopWorld; y += step) {
      ctx.strokeStyle = '#ffffffb0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, Y(y)); ctx.lineTo(w, Y(y)); ctx.stroke();
      ctx.strokeStyle = COLORS.muted; ctx.beginPath(); ctx.moveTo(left - 6, Y(y)); ctx.lineTo(left, Y(y)); ctx.stroke();
      ctx.fillStyle = COLORS.muted; ctx.fillText(N(y, 0), left - 9, Y(y));
    }
    ctx.strokeStyle = COLORS.muted; ctx.beginPath(); ctx.moveTo(left, Y(0)); ctx.lineTo(left, top - 8); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillText('y / m', 8, top - 12);

    // 参考线：断绳处、最高点
    const refLine = (y, color, text, below) => {
      ctx.setLineDash([6, 5]); ctx.strokeStyle = color; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(left, Y(y)); ctx.lineTo(w - 8, Y(y)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'right';
      ctx.fillText(text, w - 10, Y(y) + (below ? 11 : -10));
    };
    refLine(s.h, COLORS.navy, `断绳处 h = ${N(s.h)} m`, true);
    if (state.broken && state.t >= s.tUp - 1e-6 && s.rise > 0) refLine(s.peak, COLORS.green, `最高点 H = ${N(s.peak)} m`, false);

    // 频闪位置（每 1 s）
    if ($('strobe').checked && state.broken) {
      ctx.font = `11px ${FONT}`; ctx.textBaseline = 'middle';
      for (let n = 0; n <= Math.floor(state.t + 1e-9); n++) {
        const q = s.at(n), up = n < s.tUp - 1e-9 || (n === 0);
        const x = cx + (up ? -24 : 24);
        ctx.fillStyle = up ? '#c681163a' : '#2576d63a'; ctx.strokeStyle = up ? '#c68116aa' : '#2576d6aa'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, Y(q.y), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = COLORS.muted; ctx.textAlign = up ? 'right' : 'left';
        ctx.fillText(`${n} s`, x + (up ? -9 : 9), Y(q.y));
      }
      if (s.T % 1 > 1e-6 && state.t >= s.T - 1e-9) { /* 落地点单独标出 */
        ctx.fillStyle = COLORS.red; ctx.textAlign = 'left'; ctx.fillText(`${N(s.T)} s`, cx + 33, Y(0) - 8);
      }
    }

    // 轨迹（竖直线）
    if (state.broken) {
      const yMaxReached = state.t >= s.tUp ? s.peak : p.y;
      ctx.strokeStyle = '#c6811666'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 3, Y(s.h)); ctx.lineTo(cx - 3, Y(yMaxReached)); ctx.stroke();
      if (state.t > s.tUp) { ctx.strokeStyle = '#2576d666'; ctx.beginPath(); ctx.moveTo(cx + 3, Y(s.peak)); ctx.lineTo(cx + 3, Y(p.y)); ctx.stroke(); }
    }

    // 气球
    const rope = 30, boxH = 16, boxW = 22;
    const wy = Y(p.y) - boxH / 2;               // 重物中心
    const balloonY = state.broken ? Y(s.h + s.v0 * state.t) - boxH / 2 : wy;
    const bx = cx + (state.broken ? 0 : 0);
    const bcy = balloonY - rope - 26;
    if (bcy > -40) {
      ctx.globalAlpha = state.broken ? Math.max(0.35, 1 - state.t / (s.T * 1.2)) : 1;
      // 绳
      ctx.strokeStyle = '#6d5a44'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(bx, bcy + 26);
      ctx.lineTo(bx + (state.broken ? 3 : 0), state.broken ? bcy + 26 + rope * 0.45 : wy - boxH / 2);
      ctx.stroke();
      // 球体
      const grad = ctx.createRadialGradient(bx - 7, bcy - 9, 3, bx, bcy, 28);
      grad.addColorStop(0, '#ff9d8f'); grad.addColorStop(1, '#d9463a');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.ellipse(bx, bcy, 21, 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b8372d'; ctx.beginPath(); ctx.moveTo(bx - 4, bcy + 30); ctx.lineTo(bx + 4, bcy + 30); ctx.lineTo(bx, bcy + 24); ctx.fill();
      if (state.broken && bcy > 12) {
        ctx.fillStyle = COLORS.muted; ctx.font = `11px ${FONT}`; ctx.textAlign = 'left';
        ctx.fillText('气球继续上升', bx + 26, bcy);
      }
      ctx.globalAlpha = 1;
    }
    if (state.broken) { // 重物上的残绳
      ctx.strokeStyle = '#6d5a44'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, wy - boxH / 2); ctx.lineTo(cx - 2, wy - boxH / 2 - 9); ctx.stroke();
    }

    // 重物
    ctx.fillStyle = '#34414f'; roundRect(ctx, cx - boxW / 2, wy - boxH / 2, boxW, boxH, 3); ctx.fill();
    ctx.fillStyle = '#ffffff30'; roundRect(ctx, cx - boxW / 2 + 3, wy - boxH / 2 + 3, boxW - 6, 4, 2); ctx.fill();
    if (p.phase === 'landed') {
      ctx.strokeStyle = '#9b8a72'; ctx.lineWidth = 1.5;
      for (const dx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + dx * 14, ground - 2); ctx.lineTo(cx + dx * 26, ground - 10); ctx.stroke(); }
    }

    // 速度箭头
    if ($('arrow').checked && Math.abs(p.v) > 1e-6) {
      const scale = 110 / Math.max(s.v0, s.vLand);
      const len = p.v * scale;
      const x0 = cx + boxW / 2 + 60;
      let y0 = wy;
      if (y0 - len > h - 6) y0 = h - 6 + len;       // 箭头不超出画布底部
      if (y0 - len < 6) y0 = 6 + len;               // 也不超出顶部
      arrow(ctx, x0, y0, y0 - len, COLORS.orange);
      ctx.fillStyle = COLORS.orange; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`v = ${N(Math.abs(p.v), 1)} m/s ${p.v > 0 ? '↑' : '↓'}`, x0 + 10, y0 - len / 2);
      ctx.strokeStyle = '#c6811655'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(cx + boxW / 2 + 2, wy); ctx.lineTo(x0 - 2, y0); ctx.stroke(); ctx.setLineDash([]);
    }
    // 加速度提示
    if (state.broken && p.phase !== 'landed') {
      ctx.fillStyle = COLORS.navy; ctx.font = `12px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`a = g ↓`, cx - boxW / 2 - 48, wy);
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* ---------- 图像 ---------- */
  function plotFrame(canvas, yMin, yMax, yLabel) {
    const { ctx, w, h } = fit(canvas);
    const s = state.sol;
    const box = { l: 50, r: w - 18, t: 16, b: h - 30 };
    const tMax = s.T * 1.06;
    const X = t => box.l + (t / tMax) * (box.r - box.l);
    const Y = v => box.b - (v - yMin) / (yMax - yMin) * (box.b - box.t);
    ctx.font = `11px ${FONT}`; ctx.lineWidth = 1;
    const ys = niceStep(yMax - yMin, 6);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = Math.ceil(yMin / ys) * ys; v <= yMax + 1e-9; v += ys) {
      ctx.strokeStyle = COLORS.grid; ctx.beginPath(); ctx.moveTo(box.l, Y(v)); ctx.lineTo(box.r, Y(v)); ctx.stroke();
      ctx.fillStyle = COLORS.muted; ctx.fillText(N(v, 1), box.l - 6, Y(v));
    }
    const ts = niceStep(tMax, 8);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = 0; t <= tMax + 1e-9; t += ts) {
      ctx.strokeStyle = COLORS.grid; ctx.beginPath(); ctx.moveTo(X(t), box.t); ctx.lineTo(X(t), box.b); ctx.stroke();
      ctx.fillStyle = COLORS.muted; ctx.fillText(N(t, 1), X(t), box.b + 6);
    }
    ctx.strokeStyle = '#8f9bab'; ctx.beginPath(); ctx.moveTo(box.l, box.t); ctx.lineTo(box.l, box.b); ctx.lineTo(box.r, box.b); ctx.stroke();
    ctx.fillStyle = COLORS.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('t / s', box.r, box.b - 3);
    return { ctx, box, X, Y, s };
  }

  function drawVT() {
    const s0 = state.sol;
    const vMax = Math.max(s0.v0 * 1.15, s0.vLand * 0.18), vMin = -s0.vLand * 1.12;
    const { ctx, box, X, Y, s } = plotFrame($('vt'), vMin, vMax);
    // v = 0 轴
    ctx.strokeStyle = '#5b6878'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(box.l, Y(0)); ctx.lineTo(box.r, Y(0)); ctx.stroke();
    const tNow = state.broken ? state.t : 0;
    // 面积（到当前时刻为止）
    const fillArea = (t0, t1, color) => {
      if (t1 <= t0) return;
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(X(t0), Y(0));
      ctx.lineTo(X(t0), Y(s.v0 - s.g * t0)); ctx.lineTo(X(t1), Y(s.v0 - s.g * t1)); ctx.lineTo(X(t1), Y(0)); ctx.closePath(); ctx.fill();
    };
    fillArea(0, Math.min(tNow, s.tUp), '#f0c67c99');
    fillArea(s.tUp, tNow, '#9cc3f099');
    // 全程直线（虚线）+ 已走过部分
    ctx.setLineDash([5, 4]); ctx.strokeStyle = '#aab6c4'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(0), Y(s.v0)); ctx.lineTo(X(s.T), Y(-s.vLand)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.orange; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(X(0), Y(s.v0)); ctx.lineTo(X(tNow), Y(s.v0 - s.g * tNow)); ctx.stroke();
    // 标注
    ctx.font = `bold 12px ${FONT}`; ctx.textBaseline = 'middle';
    if (tNow >= s.tUp && s.rise > 0) {
      ctx.fillStyle = '#9a6511'; ctx.textAlign = 'left';
      ctx.fillText(`+${N(s.rise)} m`, X(s.tUp) + 8, Y(s.v0 * 0.55));
    }
    if (tNow > s.tUp + 0.3) {
      const x = s.at(tNow).s - s.rise;       // 下降部分的位移（负）
      ctx.fillStyle = '#1e5ea9'; ctx.textAlign = 'center';
      const tc = s.tUp + (tNow - s.tUp) * 0.62;
      ctx.fillText(`${N(x, 1)} m`, X(tc), Y(-(s.g * (tc - s.tUp)) * 0.4));
    }
    if (tNow >= s.tUp && s.v0 > 0) {
      ctx.fillStyle = COLORS.green; ctx.beginPath(); ctx.arc(X(s.tUp), Y(0), 4, 0, 7); ctx.fill();
      ctx.font = `11px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(`t₁ = ${N(s.tUp)} s`, X(s.tUp) - 5, Y(0) + 5);
    }
    ctx.fillStyle = COLORS.muted; ctx.font = `12px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(`斜率 k = −g = −${N(s.g)} m/s²`, box.r, box.t + 4);
    if (state.t >= s.T - 1e-9) {
      ctx.fillStyle = COLORS.red; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`−${N(s.vLand)} m/s`, X(s.T) - 8, Y(-s.vLand));
    }
    // 当前点
    const v = s.v0 - s.g * tNow;
    ctx.fillStyle = COLORS.orange; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(tNow), Y(v), 5.5, 0, 7); ctx.fill(); ctx.stroke();
  }

  function drawYT() {
    const s0 = state.sol;
    const yTop = s0.peak * 1.12;
    const { ctx, box, X, Y, s } = plotFrame($('yt'), 0, yTop);
    const ref = (y, color, label) => {
      ctx.setLineDash([5, 4]); ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(box.l, Y(y)); ctx.lineTo(box.r, Y(y)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = `11px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(label, box.r - 2, Y(y) - 2);
    };
    ref(s.h, COLORS.navy, `h = ${N(s.h)} m`);
    const tNow = state.broken ? state.t : 0;
    const curve = (t1, color, width, dash) => {
      ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      for (let i = 0; i <= 160; i++) { const t = t1 * i / 160, q = s.at(t); i ? ctx.lineTo(X(t), Y(q.y)) : ctx.moveTo(X(t), Y(q.y)); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    curve(s.T, '#aab6c4', 1.5, [5, 4]);
    if (tNow > 0) curve(tNow, COLORS.blue, 2.5, []);
    if (tNow >= s.tUp && s.rise > 0) {
      ctx.fillStyle = COLORS.green; ctx.beginPath(); ctx.arc(X(s.tUp), Y(s.peak), 4, 0, 7); ctx.fill();
      ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(`H = ${N(s.peak)} m`, X(s.tUp) + 6, Y(s.peak) - 2);
    }
    if (state.t >= s.T - 1e-9) {
      ctx.fillStyle = COLORS.red; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(`t = ${N(s.T)} s`, X(s.T) - 12, Y(0) - 8);
    }
    const q = s.at(tNow);
    ctx.fillStyle = COLORS.blue; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(tNow), Y(q.y), 5.5, 0, 7); ctx.fill(); ctx.stroke();
  }

  /* ---------- 文字读数 ---------- */
  function describe() {
    const s = state.sol, p = s.at(state.t);
    const nearPeak = s.v0 > 0 && Math.abs(state.t - s.tUp) < 0.06;
    let phase, cls, text;
    if (!state.broken) {
      phase = '匀速上升'; cls = '';
      text = `重物随气球以 ${N(s.v0)} m/s 匀速上升，此刻离地 ${N(s.h)} m。点击「剪断绳子」。`;
    } else if (p.phase === 'landed') {
      phase = '落地'; cls = 'landed';
      text = `落地！全程用时 t = ${N(s.T)} s，落地速度 ${N(s.vLand)} m/s，方向竖直向下。`;
    } else if (state.t === 0) {
      phase = '绳断瞬间'; cls = 'rising';
      text = s.v0 > 0 ? `绳断瞬间，重物由于惯性仍有 ${N(s.v0)} m/s 的向上速度，并不会立即下落；此后只受重力，a = g，方向向下。`
                      : '绳断瞬间重物速度为零，接下来做自由落体运动。';
    } else if (nearPeak) {
      phase = '最高点'; cls = 'peak';
      text = `到达最高点：v = 0，用时 t₁ = ${N(s.tUp)} s，比断绳处又高了 ${N(s.rise)} m，离地 H = ${N(s.peak)} m。加速度仍是 g。`;
    } else if (p.phase === 'rising') {
      phase = '减速上升'; cls = 'rising';
      text = `重物仍在上升，但速度每秒减少 ${N(s.g)} m/s（加速度向下）。`;
    } else {
      phase = '自由下落'; cls = 'falling';
      text = `从最高点开始自由下落，速度每秒增加 ${N(s.g)} m/s。已下落 ${N(s.peak - p.y, 1)} m。`;
    }
    $('phase').textContent = phase; $('phase').className = 'pill ' + cls;
    $('narrative').textContent = text;
    $('rT').textContent = N(p.t) + ' s';
    $('rV').textContent = signed(p.v, 1) + ' m/s';
    $('rY').textContent = N(p.y, 1) + ' m';
    $('rS').textContent = signed(p.s, 1) + ' m';
    $('timeLabel').textContent = N(p.t) + ' s';
    $('timeline').value = Math.round(1000 * state.t / s.T);
    const btn = $('play');
    btn.textContent = state.playing ? '❚❚ 暂停' : !state.broken ? '▶ 剪断绳子' : state.t >= s.T - 1e-9 ? '↻ 重新播放' : '▶ 继续';
  }

  function render() {
    drawMotion(); drawVT(); drawYT(); describe();
  }

  /* ---------- 预测 ---------- */
  function clearQuiz() {
    ['fb1', 'fb2', 'fb3'].forEach(id => { $(id).textContent = ''; $(id).className = 'feedback'; });
    document.querySelectorAll('.choice').forEach(c => c.classList.remove('right', 'wrong'));
    document.querySelectorAll('.answer').forEach(c => c.classList.remove('right', 'wrong'));
    $('quizScore').textContent = '0 / 3';
  }
  const near = (a, b) => Math.abs(a - b) <= Math.max(0.02 * Math.abs(b), 0.05);
  function feedback(id, ok, msg) { $(id).textContent = msg; $(id).className = 'feedback ' + (ok ? 'ok' : 'no'); return ok ? 1 : 0; }

  $('checkAnswers').addEventListener('click', () => {
    clearQuiz();
    const s = state.sol; let score = 0;
    const fallStatic = Math.sqrt(2 * s.h / s.g), vStatic = Math.sqrt(2 * s.g * s.h);

    // ①
    const pick = document.querySelector('input[name=q1]:checked');
    const correct1 = s.v0 > 0 ? 'up' : 'zero';
    if (!pick) feedback('fb1', false, '请先选择一个选项。');
    else {
      const ok = pick.value === correct1;
      pick.closest('.choice').classList.add(ok ? 'right' : 'wrong');
      score += feedback('fb1', ok, ok ? '正确。速度不能突变，绳断瞬间重物仍具有向上的速度（惯性）。'
        : pick.value === 'zero' ? '绳子断了，只是拉力消失；速度不会突变为零，重物由于惯性继续向上运动。'
        : '重力只改变速度的快慢，需要时间才能让速度反向；绳断瞬间速度仍与气球相同。');
    }
    // ②
    const t = parseFloat($('ansT').value);
    if (!Number.isFinite(t)) feedback('fb2', false, '请输入时间。');
    else {
      const ok = near(t, s.T);
      $('ansT').parentElement.classList.add(ok ? 'right' : 'wrong');
      let msg = ok ? `正确，t = ${N(s.T)} s。` : '还不对。';
      if (!ok && s.v0 > 0 && near(t, fallStatic)) msg = '这是把重物当成从 h 处由静止下落得到的时间——忽略了绳断时的向上速度。';
      else if (!ok && s.v0 > 0 && near(t, s.tDown)) msg = '这只是从最高点下落的时间，还要加上先上升的那段时间。';
      else if (!ok && s.v0 > 0 && near(t, s.tUp)) msg = '这是上升到最高点的时间，重物之后还要落回地面。';
      else if (!ok) msg = '还不对。提示：先求上升到最高点的时间，再求从最高点落地的时间。';
      score += feedback('fb2', ok, msg);
    }
    // ③
    const v = parseFloat($('ansV').value);
    if (!Number.isFinite(v)) feedback('fb3', false, '请输入速度大小。');
    else {
      const ok = near(Math.abs(v), s.vLand);
      $('ansV').parentElement.classList.add(ok ? 'right' : 'wrong');
      let msg = ok ? `正确，${N(s.vLand)} m/s，方向竖直向下。` : '';
      if (!ok && s.v0 > 0 && near(Math.abs(v), vStatic)) msg = '这是 √(2gh)，相当于从 h 处静止下落——重物实际是从更高的最高点落下的。';
      else if (!ok && near(Math.abs(v), s.v0)) msg = '这是绳断时的速度，不是落地速度。';
      else if (!ok) msg = '还不对。提示：落地速度 = g × (从最高点下落的时间)，或用 v² − v₀² = 2gh。';
      score += feedback('fb3', ok, msg);
    }
    $('quizScore').textContent = `${score} / 3`;
  });

  /* ---------- 解题步骤 ---------- */
  function quadratic(s) {
    const a = s.g / 2;
    const terms = `${N(a)}t²` + (s.v0 > 0 ? ` − ${N(s.v0)}t` : '') + ` − ${N(s.h)} = 0`;
    let simple = '';
    const b = s.v0 / a, c = s.h / a;
    if (a !== 1 && Math.abs(b - Math.round(b)) < 1e-9 && Math.abs(c - Math.round(c)) < 1e-9) {
      simple = `即 t²` + (b ? ` − ${N(b)}t` : '') + ` − ${N(c)} = 0`;
    }
    return { terms, simple };
  }
  function stepsFor(method) {
    const s = state.sol;
    const eq = x => `<span class="eq">${x}</span>`;
    if (method === 'segment') {
      return [
        { time: 0, title: '分析绳断瞬间', html: s.v0 > 0
          ? `由于惯性，重物保持与气球相同的速度 <i>v</i><sub>0</sub> = ${N(s.v0)} m/s，方向<b>竖直向上</b>；绳断后只受重力，加速度为 <i>g</i>，方向竖直向下。所以重物做<b>竖直上抛运动</b>：先减速上升，再自由下落。`
          : '绳断瞬间重物速度为零，只受重力，做自由落体运动。' },
        { time: s.tUp, title: '上升阶段：匀减速到速度为零', html:
          eq(`t<sub>1</sub> = v<sub>0</sub> / g = ${N(s.v0)} / ${N(s.g)} s ${approx(s.tUp)} ${N(s.tUp)} s`) +
          eq(`h<sub>1</sub> = v<sub>0</sub>² / (2g) = ${N(s.v0)}² / (2 × ${N(s.g)}) m ${approx(s.rise)} ${N(s.rise)} m`) },
        { time: s.tUp, title: '最高点离地高度', html:
          eq(`H = h + h<sub>1</sub> = ${N(s.h)} m + ${N(s.rise)} m = ${N(s.peak)} m`) },
        { time: s.T, title: '下降阶段：从最高点自由下落', html:
          eq(`H = ½ g t<sub>2</sub>²  ⇒  t<sub>2</sub> = √(2H / g) = √(2 × ${N(s.peak)} / ${N(s.g)}) s ${approx(s.tDown)} ${N(s.tDown)} s`) },
        { time: s.T, title: '结论', html:
          eq(`t = t<sub>1</sub> + t<sub>2</sub> = ${N(s.tUp)} s + ${N(s.tDown)} s = <span class="ans">${N(s.T)} s</span>`) +
          eq(`v = g t<sub>2</sub> = ${N(s.g)} × ${N(s.tDown)} m/s ${approx(s.vLand)} <span class="ans">${N(s.vLand)} m/s</span>`) +
          '落地速度方向竖直向下。' },
      ];
    }
    const q = quadratic(s);
    return [
      { time: 0, title: '规定正方向，写出各量的正负', html:
        `把上升、下降看成<b>同一个</b>加速度恒定的匀变速直线运动。取竖直向上为正：<i>v</i><sub>0</sub> = +${N(s.v0)} m/s，<i>a</i> = −<i>g</i> = −${N(s.g)} m/s²。落地点在断绳点下方 ${N(s.h)} m，所以位移 <i>x</i> = <b>−${N(s.h)} m</b>。` },
      { time: null, title: '列位移方程', html:
        eq(`x = v<sub>0</sub>t − ½ g t²`) +
        eq(`−${N(s.h)} = ${s.v0 > 0 ? N(s.v0) + 't ' : ''}− ${N(s.g / 2)}t²`) +
        eq(`${q.terms}${q.simple ? '，' + q.simple : ''}`) },
      { time: s.T, title: '解方程，取合理的根', html:
        eq(`t = [v<sub>0</sub> + √(v<sub>0</sub>² + 2gh)] / g = <span class="ans">${N(s.T)} s</span>`) +
        (s.v0 > 0 ? `另一根 t = ${N(s.roots[1])} s &lt; 0，不合题意，舍去。` : '另一根为负值，舍去。') },
      { time: s.T, title: '求落地速度', html:
        eq(`v = v<sub>0</sub> − g t = ${N(s.v0)} − ${N(s.g)} × ${N(s.T)} m/s = −${N(s.vLand)} m/s`) +
        `负号表示方向与规定的正方向相反，即落地速度大小为 <span class="ans">${N(s.vLand)} m/s</span>，方向竖直向下。` +
        eq(`检验：v² − v<sub>0</sub>² = 2ax  ⇒  v² = ${N(s.v0)}² + 2 × ${N(s.g)} × ${N(s.h)}  ⇒  |v| = ${N(s.vLand)} m/s`) },
      { time: null, title: '两种方法对比', html:
        '分段法物理过程清楚；全程法一步到位，但必须统一正方向，<i>x</i>、<i>v</i>、<i>a</i> 都要带符号。在右侧 <i>v</i>–<i>t</i> 图中，橙色面积（正）与蓝色面积（负）的代数和就是全程位移 −' + N(s.h) + ' m。' },
    ];
  }
  function buildSteps() {
    const list = $('steps'); list.innerHTML = '';
    const steps = stepsFor(state.method), shown = state.shown[state.method];
    steps.forEach((st, i) => {
      const li = document.createElement('li');
      li.className = i < shown ? '' : 'hidden';
      const jump = st.time == null ? '' : `<button class="jump" type="button" data-t="${st.time}">看动画 t = ${N(st.time)} s</button>`;
      li.innerHTML = `<span class="title">${st.title}${jump}</span>${st.html}`;
      list.appendChild(li);
    });
    $('nextStep').disabled = shown >= steps.length;
    $('nextStep').textContent = shown === 0 ? '显示第一步' : shown >= steps.length ? '已全部显示' : '下一步';
  }
  $('steps').addEventListener('click', e => {
    const b = e.target.closest('.jump'); if (!b) return;
    setTime(+b.dataset.t); state.broken = true; render();
    if (window.innerWidth < 720) $('motion').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('nextStep').addEventListener('click', () => {
    const steps = stepsFor(state.method);
    const i = state.shown[state.method];
    if (i >= steps.length) return;
    state.shown[state.method] = i + 1;
    buildSteps();
    $('steps').children[i].classList.add('fresh');
    if (steps[i].time != null) { setTime(steps[i].time); state.broken = true; render(); }
  });
  $('allSteps').addEventListener('click', () => { state.shown[state.method] = stepsFor(state.method).length; buildSteps(); });
  $('hideSteps').addEventListener('click', () => { state.shown[state.method] = 0; buildSteps(); });
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    state.method = tab.dataset.method;
    document.querySelectorAll('.tab').forEach(t => { const on = t === tab; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
    buildSteps();
  }));

  /* ---------- 启动 ---------- */
  new ResizeObserver(() => render()).observe(document.querySelector('.app'));
  syncFields();
  recompute();
})();
