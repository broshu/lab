(function () {
  'use strict';
  const { solve } = window.VerticalThrow;
  const $ = id => document.getElementById(id);
  const EXAMPLE = { v0: 10, h: 175, g: 10 };

  // t < 0：绳断前随气球上升；t = 0：绳断；t > 0：竖直上抛
  const state = { ...EXAMPLE, sol: null, t: 0, started: false, playing: false, ff: false, last: 0, method: 'segment', shown: { segment: 0, whole: 0 } };
  const FF_END = 1.5;          // 绳断前最后 1.5 s 以正常速度播放，之前快进
  const FF_REAL = 3;           // 快进段约用 3 s 真实时间

  /* ---------- 数字格式 ---------- */
  const N = (x, d = 2) => {
    if (Math.abs(x) < 1e-9) x = 0;
    return (+x.toFixed(d)).toString().replace('-', '−');
  };
  const signed = (x, d = 2) => (x > 1e-9 ? '+' : '') + N(x, d);
  const approx = x => Math.abs(x - +x.toFixed(2)) > 1e-9 ? '≈' : '=';

  /* ---------- 参数 ---------- */
  const inputs = [['v0', 'v0Range'], ['h', 'hRange']];
  function readParams() {
    state.v0 = clampNum(+$('v0').value, 0, 30, state.v0);
    state.h = clampNum(+$('h').value, 10, 300, state.h);
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
    state.t = -state.sol.t0; state.started = false; state.playing = false;
    $('durationLabel').textContent = N(state.sol.T) + ' s';
    $('skip').hidden = state.sol.t0 <= 2;
    clearQuiz();
    buildSteps();
    render();
  }

  inputs.forEach(([num, range]) => {
    $(range).addEventListener('input', () => { $(num).value = $(range).value; readParams(); syncFields(); recompute(); });
    $(num).addEventListener('change', () => { readParams(); syncFields(); recompute(); });
  });
  $('g').addEventListener('change', () => { readParams(); syncFields(); recompute(); });
  $('resetExample').addEventListener('click', () => { Object.assign(state, EXAMPLE); syncFields(); recompute(); });

  /* ---------- 播放 ---------- */
  const tMin = () => -state.sol.t0;
  const ropeIntact = () => state.t < 0 || (state.t === 0 && !state.started);
  function setTime(t) {
    state.t = Math.min(Math.max(t, tMin()), state.sol.T);
    state.started = true; state.playing = false;
    render();
  }
  function togglePlay() {
    const s = state.sol;
    if (state.playing) { state.playing = false; render(); return; }
    if (state.t >= s.T - 1e-9) state.t = tMin();
    state.started = true; state.playing = true; state.last = performance.now();
    render();
    requestAnimationFrame(tick);
  }
  function tick(now) {
    if (!state.playing) return;
    const s = state.sol, rate = +$('rate').value;
    const dt = Math.min((now - state.last) / 1000, 0.05);
    state.last = now;
    // 绳断前较远的一段快进，临近绳断恢复正常速度
    const ffSpeed = (s.t0 - FF_END) / FF_REAL;
    state.ff = state.t < -FF_END && ffSpeed > rate;
    let next = state.t + dt * (state.ff ? ffSpeed : rate);
    if (state.ff && next > -FF_END) next = -FF_END;
    if (next >= s.T) { next = s.T; state.playing = false; state.ff = false; }
    state.t = next;
    render();
    if (state.playing) requestAnimationFrame(tick);
  }
  $('play').addEventListener('click', togglePlay);
  $('skip').addEventListener('click', () => { setTime(-Math.min(2, state.sol.t0)); });

  // 时间轴：前 25% 为绳断前的上升，后 75% 为绳断后
  const PRE = 0.25;
  function toSlider(t) {
    const s = state.sol;
    if (s.t0 <= 0) return 1000 * t / s.T;
    return t < 0 ? 1000 * PRE * (t + s.t0) / s.t0 : 1000 * (PRE + (1 - PRE) * t / s.T);
  }
  function fromSlider(u) {
    const s = state.sol, f = u / 1000;
    if (s.t0 <= 0) return f * s.T;
    return f < PRE ? -s.t0 + s.t0 * f / PRE : (f - PRE) / (1 - PRE) * s.T;
  }
  $('timeline').addEventListener('input', e => setTime(fromSlider(+e.target.value)));
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
    if (Math.abs(y2 - y1) < 1) return;
    const dir = Math.sign(y2 - y1) || 1, head = Math.min(10, Math.abs(y2 - y1));
    ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2 - dir * head * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y2); ctx.lineTo(x - 6, y2 - dir * head); ctx.lineTo(x + 6, y2 - dir * head); ctx.closePath(); ctx.fill();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const FONT = '"Inter","PingFang SC","Microsoft YaHei",sans-serif';
  const COLORS = { ink: '#17212f', muted: '#647084', grid: '#e3e9f0', orange: '#c68116', blue: '#2576d6', green: '#14936f', red: '#c8453b', navy: '#264761', balloon: '#d9463a' };

  /* ---------- 气球与重物 ---------- */
  // (x, yWeight) 为重物中心；yBalloonAttach 为气球绳结的像素位置；size 为缩放
  function drawBalloon(ctx, x, attachY, size, intact, weightTopY) {
    const rx = 21 * size, ry = 26 * size, rope = 30 * size;
    const cy = attachY - rope - ry;
    ctx.strokeStyle = '#6d5a44'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, cy + ry);
    if (intact) ctx.lineTo(x, weightTopY); else ctx.lineTo(x + 3 * size, cy + ry + rope * 0.45);
    ctx.stroke();
    const grad = ctx.createRadialGradient(x - 7 * size, cy - 9 * size, 2, x, cy, 28 * size);
    grad.addColorStop(0, '#ff9d8f'); grad.addColorStop(1, COLORS.balloon);
    ctx.fillStyle = grad; ctx.beginPath(); ctx.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b8372d'; ctx.beginPath(); ctx.moveTo(x - 4 * size, cy + ry + 4 * size); ctx.lineTo(x + 4 * size, cy + ry + 4 * size); ctx.lineTo(x, cy + ry - 2 * size); ctx.fill();
    return cy;
  }
  function drawWeight(ctx, x, cyW, size, intact) {
    const bw = 22 * size, bh = 16 * size;
    if (!intact) {
      ctx.strokeStyle = '#6d5a44'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, cyW - bh / 2); ctx.lineTo(x - 2, cyW - bh / 2 - 9 * size); ctx.stroke();
    }
    ctx.fillStyle = '#34414f'; roundRect(ctx, x - bw / 2, cyW - bh / 2, bw, bh, 3 * size); ctx.fill();
    ctx.fillStyle = '#ffffff30'; roundRect(ctx, x - bw / 2 + 3, cyW - bh / 2 + 3 * size, bw - 6, 4 * size, 2); ctx.fill();
  }

  /* ---------- 主动画：左侧全景 + 右侧局部放大 ---------- */
  function zoomWindow(s) {
    // 下方留出绳断前的一段上升；上方容纳“重物到最高点时气球的位置”，便于对比两者分离
    const below = Math.max(2.2 * s.rise, 16);
    const above = 2 * s.rise + Math.max(0.6 * s.rise, 12);
    return { lo: Math.max(s.h - below, 0), hi: s.h + above };
  }

  function drawMotion() {
    const { ctx, w, h } = fit($('motion'));
    const s = state.sol, p = s.at(state.t), intact = ropeIntact(), cut = !intact;
    const pw = Math.max(118, Math.round(w * 0.36));           // 全景宽度
    const gap = 26, zx = pw + gap, zw = w - zx - 8;            // 放大区
    const narrow = zw < 330;
    const top = 22, ground = h - 36;
    const zw0 = zoomWindow(s);

    /* ===== 全景 ===== */
    const yTopWorld = Math.max(s.peak * 1.12, s.h + 25);
    const k = (ground - top) / yTopWorld, Y = y => ground - y * k;
    const left = 34, cx = left + (pw - left) * 0.52;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, pw, h); ctx.clip();
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, '#dcebf8'); sky.addColorStop(1, '#f6fafd');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, pw, ground);
    ctx.fillStyle = '#9cc58a'; ctx.fillRect(0, ground, pw, 6);
    ctx.fillStyle = '#e7dccb'; ctx.fillRect(0, ground + 6, pw, h - ground - 6);
    const step = niceStep(yTopWorld, 7);
    ctx.font = `10px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let y = 0; y <= yTopWorld; y += step) {
      ctx.strokeStyle = '#ffffffb0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, Y(y)); ctx.lineTo(pw, Y(y)); ctx.stroke();
      ctx.fillStyle = COLORS.muted; ctx.fillText(N(y, 0), left - 5, Y(y));
    }
    ctx.strokeStyle = COLORS.muted; ctx.beginPath(); ctx.moveTo(left, Y(0)); ctx.lineTo(left, top - 6); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillText('y / m', 4, top - 12);
    ctx.fillStyle = COLORS.navy; ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText('全景', left + 6, top + 2);
    // 放大区域框
    ctx.fillStyle = '#f5b94218'; ctx.strokeStyle = '#d99a2a'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2;
    ctx.fillRect(left, Y(zw0.hi), pw - left - 2, Y(zw0.lo) - Y(zw0.hi));
    ctx.strokeRect(left, Y(zw0.hi), pw - left - 2, Y(zw0.lo) - Y(zw0.hi)); ctx.setLineDash([]);
    // 断绳高度
    ctx.setLineDash([5, 4]); ctx.strokeStyle = COLORS.navy; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, Y(s.h)); ctx.lineTo(pw, Y(s.h)); ctx.stroke(); ctx.setLineDash([]);
    // 轨迹
    if (state.started || state.t > tMin()) {
      ctx.strokeStyle = '#8f9bab88'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 3, Y(0)); ctx.lineTo(cx - 3, Y(state.t < 0 ? p.y : s.h)); ctx.stroke();
      if (cut) {
        ctx.strokeStyle = '#c68116aa'; ctx.beginPath(); ctx.moveTo(cx - 3, Y(s.h)); ctx.lineTo(cx - 3, Y(state.t >= s.tUp ? s.peak : p.y)); ctx.stroke();
        if (state.t > s.tUp) { ctx.strokeStyle = '#2576d6aa'; ctx.beginPath(); ctx.moveTo(cx + 3, Y(s.peak)); ctx.lineTo(cx + 3, Y(p.y)); ctx.stroke(); }
      }
    }
    const sp = 0.55, wbh = 16 * sp;
    const wy = Y(p.y) - wbh / 2;
    const attach = cut ? Y(s.h + s.v0 * state.t) - wbh / 2 - 8 * sp : wy - wbh / 2;
    ctx.globalAlpha = cut ? 0.55 : 1;
    drawBalloon(ctx, cx, attach, sp, intact, wy - wbh / 2);
    ctx.globalAlpha = 1;
    drawWeight(ctx, cx, wy, sp, intact);
    if ($('arrow').checked && Math.abs(p.v) > 1e-6) {
      const len = p.v * 55 / Math.max(s.v0, s.vLand);
      let y0 = wy; if (y0 - len > h - 4) y0 = h - 4 + len;
      arrow(ctx, cx + 16, y0, y0 - len, COLORS.orange, 2.5);
    }
    ctx.restore();

    /* ===== 局部放大 ===== */
    const zTop = 8, zBot = h - 8;
    const zk = (zBot - zTop) / (zw0.hi - zw0.lo), Z = y => zBot - (y - zw0.lo) * zk;
    // 连接线
    ctx.strokeStyle = '#d99a2a88'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(pw - 2, Y(zw0.hi)); ctx.lineTo(zx, zTop); ctx.moveTo(pw - 2, Y(zw0.lo)); ctx.lineTo(zx, zBot); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.beginPath(); ctx.rect(zx, zTop, zw, zBot - zTop); ctx.clip();
    const zsky = ctx.createLinearGradient(0, zTop, 0, zBot);
    zsky.addColorStop(0, '#d6e8f7'); zsky.addColorStop(1, '#eef5fb');
    ctx.fillStyle = zsky; ctx.fillRect(zx, zTop, zw, zBot - zTop);
    const zl = zx + (narrow ? 32 : 40), zcx = zl + (zw - (zl - zx)) * (narrow ? 0.38 : 0.42);
    // 刻度
    const zs = niceStep(zw0.hi - zw0.lo, 8);
    ctx.font = `11px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let y = Math.ceil(zw0.lo / zs) * zs; y <= zw0.hi; y += zs) {
      ctx.strokeStyle = '#ffffffc0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(zl, Z(y)); ctx.lineTo(zx + zw, Z(y)); ctx.stroke();
      ctx.fillStyle = COLORS.muted; ctx.fillText(N(y, 1), zl - 6, Z(y));
    }
    ctx.strokeStyle = COLORS.muted; ctx.beginPath(); ctx.moveTo(zl, zTop); ctx.lineTo(zl, zBot); ctx.stroke();
    const ref = (y, color, text, below) => {
      ctx.setLineDash([6, 5]); ctx.strokeStyle = color; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(zl, Z(y)); ctx.lineTo(zx + zw, Z(y)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(text, zx + zw - 8, Z(y) + (below ? 11 : -10));
    };
    ref(s.h, COLORS.navy, `断绳处 ${N(s.h)} m`, true);
    if (cut && state.t >= s.tUp - 1e-6 && s.rise > 0) ref(s.peak, COLORS.green, `最高点 ${N(s.peak)} m`, false);
    ctx.fillStyle = '#9a6511'; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`局部放大 ×${N(zk / k, 0)}`, zl + 8, zTop + 6);

    // 频闪：每 1 s 重物的位置（绳断前灰色，上升橙色，下降蓝色）
    if ($('strobe').checked && (state.started || state.t > tMin())) {
      ctx.font = `11px ${FONT}`; ctx.textBaseline = 'middle';
      for (let n = Math.ceil(tMin() - 1e-9); n <= Math.floor(state.t + 1e-9); n++) {
        const q = s.at(n); if (q.y < zw0.lo - 1 || q.y > zw0.hi) continue;
        const pre = n < 0, up = n < s.tUp - 1e-9 || n === 0;
        const x = zcx + (up ? -30 : 30);
        const col = pre ? '#8f9bab' : up ? '#c68116' : '#2576d6';
        ctx.fillStyle = col + '40'; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, Z(q.y), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = pre ? COLORS.muted : col; ctx.textAlign = up ? 'right' : 'left';
        ctx.fillText(`${N(n, 0)} s`, x + (up ? -9 : 9), Z(q.y));
      }
    }

    // 气球与重物（放大）
    const bh = 16, zwy = Z(p.y) - bh / 2;
    const zAttach = cut ? Z(s.h + s.v0 * state.t) - bh / 2 - 8 : zwy - bh / 2;
    const balloonCy = drawBalloon(ctx, zcx, zAttach, 1, intact, zwy - bh / 2);
    drawWeight(ctx, zcx, zwy, 1, intact);

    // 速度箭头：气球（左）与重物（右），同一比例
    if ($('arrow').checked) {
      const kv = Math.min(7, 95 / Math.max(s.v0, 1));
      const clampLen = L => Math.max(-170, Math.min(170, L));
      if (s.v0 > 0 && balloonCy > zTop - 20) {
        const bx = zcx - 36, L = clampLen(s.v0 * kv);
        arrow(ctx, bx, balloonCy, balloonCy - L, COLORS.balloon, 3);
        ctx.fillStyle = COLORS.balloon; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(`${narrow ? '' : '气球 '}${N(s.v0, 1)} m/s ↑`, bx - 8, balloonCy - L / 2);
      }
      if (Math.abs(p.v) > 1e-6 && zwy < zBot + 10) {
        const wx = zcx + 36, L = clampLen(p.v * kv);
        arrow(ctx, wx, zwy, zwy - L, COLORS.orange, 3);
        ctx.fillStyle = COLORS.orange; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(`${narrow ? '' : '重物 '}${N(Math.abs(p.v), 1)} m/s ${p.v > 0 ? '↑' : '↓'}`, wx + 8, zwy - L / 2);
      }
    }
    if (cut && p.phase !== 'landed' && zwy > zTop && zwy < zBot) {
      ctx.fillStyle = COLORS.navy; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText('a = g ↓', zcx - 20, zwy + 22);
    }
    // 提示：物体不在放大区内
    const note = (text, y) => {
      ctx.font = `bold 13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(text).width + 24;
      ctx.fillStyle = '#ffffffdd'; roundRect(ctx, zcx - tw / 2 + 20, y - 15, tw, 30, 15); ctx.fill();
      ctx.fillStyle = COLORS.navy; ctx.fillText(text, zcx + 20, y);
    };
    if (state.t < 0 && Z(p.y) > zBot + 4) note(`↑ 气球带着重物上升中，离地 ${N(p.y, 0)} m`, zBot - 30);
    else if (cut && Z(p.y) > zBot + 4) note(p.phase === 'landed' ? '重物已落地（见左侧全景）' : '↓ 重物落出放大区，继续下落（见左侧全景）', zBot - 30);
    ctx.restore();
    ctx.strokeStyle = '#d99a2a'; ctx.lineWidth = 1.2; ctx.strokeRect(zx + 0.5, zTop + 0.5, zw - 1, zBot - zTop - 1);
  }

  /* ---------- 图像 ---------- */
  const preWindow = () => Math.min(2, state.sol.t0);   // 图像中显示绳断前 2 s
  function plotFrame(canvas, yMin, yMax) {
    const { ctx, w, h } = fit(canvas);
    const s = state.sol;
    const box = { l: 50, r: w - 18, t: 16, b: h - 30 };
    const t0 = -preWindow(), tMax = s.T * 1.06;
    const X = t => box.l + ((t - t0) / (tMax - t0)) * (box.r - box.l);
    const Y = v => box.b - (v - yMin) / (yMax - yMin) * (box.b - box.t);
    ctx.font = `11px ${FONT}`; ctx.lineWidth = 1;
    const ys = niceStep(yMax - yMin, 6);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = Math.ceil(yMin / ys) * ys; v <= yMax + 1e-9; v += ys) {
      ctx.strokeStyle = COLORS.grid; ctx.beginPath(); ctx.moveTo(box.l, Y(v)); ctx.lineTo(box.r, Y(v)); ctx.stroke();
      ctx.fillStyle = COLORS.muted; ctx.fillText(N(v, 1), box.l - 6, Y(v));
    }
    const ts = niceStep(tMax - t0, 9);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = Math.ceil(t0 / ts) * ts; t <= tMax + 1e-9; t += ts) {
      ctx.strokeStyle = COLORS.grid; ctx.beginPath(); ctx.moveTo(X(t), box.t); ctx.lineTo(X(t), box.b); ctx.stroke();
      ctx.fillStyle = COLORS.muted; ctx.fillText(N(t, 1), X(t), box.b + 6);
    }
    // 绳断前区域
    if (t0 < 0) {
      ctx.fillStyle = '#8f9bab1c'; ctx.fillRect(box.l, box.t, X(0) - box.l, box.b - box.t);
      ctx.strokeStyle = COLORS.navy; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(X(0), box.t); ctx.lineTo(X(0), box.b); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COLORS.muted; ctx.font = `11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('绳断前', (box.l + X(0)) / 2, box.b - 4);
      ctx.fillStyle = COLORS.navy; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('绳断 t = 0', X(0) + 4, box.b - 4);
    }
    ctx.strokeStyle = '#8f9bab'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(box.l, box.t); ctx.lineTo(box.l, box.b); ctx.lineTo(box.r, box.b); ctx.stroke();
    ctx.fillStyle = COLORS.muted; ctx.font = `11px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('t / s', box.r, box.b - 3);
    return { ctx, box, X, Y, s, t0 };
  }
  // 当前时刻在图像时间窗内的位置（早于窗口时停在左端）
  const tPlot = t0 => Math.max(state.t, t0);
  const hasMoved = () => state.started || state.t > tMin();

  function drawVT() {
    const s0 = state.sol;
    const vMax = Math.max(s0.v0 * 1.15, s0.vLand * 0.18), vMin = -s0.vLand * 1.12;
    const { ctx, box, X, Y, s, t0 } = plotFrame($('vt'), vMin, vMax);
    const vAt = t => t < 0 ? s.v0 : s.v0 - s.g * t;
    ctx.strokeStyle = '#5b6878'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(box.l, Y(0)); ctx.lineTo(box.r, Y(0)); ctx.stroke();
    const tNow = tPlot(t0), after = Math.max(tNow, 0);
    const cut = !ropeIntact();
    // 面积（绳断后）
    const fillArea = (a, b, color) => {
      if (b <= a) return;
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(X(a), Y(0));
      ctx.lineTo(X(a), Y(vAt(a))); ctx.lineTo(X(b), Y(vAt(b))); ctx.lineTo(X(b), Y(0)); ctx.closePath(); ctx.fill();
    };
    if (cut) { fillArea(0, Math.min(after, s.tUp), '#f0c67c99'); fillArea(s.tUp, after, '#9cc3f099'); }
    // 全程（虚线）+ 已走过部分
    ctx.setLineDash([5, 4]); ctx.strokeStyle = '#aab6c4'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(t0), Y(s.v0)); ctx.lineTo(X(0), Y(s.v0)); ctx.lineTo(X(s.T), Y(-s.vLand)); ctx.stroke(); ctx.setLineDash([]);
    if (hasMoved() && tNow > t0) {
      ctx.strokeStyle = '#8f9bab'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(X(t0), Y(s.v0)); ctx.lineTo(X(Math.min(tNow, 0)), Y(s.v0)); ctx.stroke();
      if (tNow > 0) { ctx.strokeStyle = COLORS.orange; ctx.beginPath(); ctx.moveTo(X(0), Y(s.v0)); ctx.lineTo(X(tNow), Y(vAt(tNow))); ctx.stroke(); }
    }
    ctx.font = `bold 12px ${FONT}`; ctx.textBaseline = 'middle';
    if (t0 < 0 && s.v0 > 0) {
      ctx.fillStyle = COLORS.navy; ctx.font = `11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`v = ${N(s.v0)} m/s 不突变`, X(0), Y(s.v0) - 6);
    }
    if (tNow >= s.tUp && s.rise > 0 && cut) {
      ctx.fillStyle = '#9a6511'; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`+${N(s.rise)} m`, X(s.tUp) + 8, Y(s.v0 * 0.45));
    }
    if (tNow > s.tUp + 0.3) {
      const x = s.at(tNow).s - s.rise;
      ctx.fillStyle = '#1e5ea9'; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tc = s.tUp + (tNow - s.tUp) * 0.62;
      ctx.fillText(`${N(x, 1)} m`, X(tc), Y(-(s.g * (tc - s.tUp)) * 0.4));
    }
    if (tNow >= s.tUp && s.v0 > 0 && cut) {
      ctx.fillStyle = COLORS.green; ctx.beginPath(); ctx.arc(X(s.tUp), Y(0), 4, 0, 7); ctx.fill();
      ctx.font = `11px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(`t₁ = ${N(s.tUp)} s`, X(s.tUp) - 5, Y(0) + 5);
    }
    ctx.fillStyle = COLORS.muted; ctx.font = `12px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(`绳断后斜率 k = −g = −${N(s.g)} m/s²`, box.r, box.t + 4);
    if (state.t >= s.T - 1e-9) {
      ctx.fillStyle = COLORS.red; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`−${N(s.vLand)} m/s`, X(s.T) - 8, Y(-s.vLand));
    }
    ctx.fillStyle = tNow < 0 ? '#8f9bab' : COLORS.orange; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(tNow), Y(vAt(tNow)), 5.5, 0, 7); ctx.fill(); ctx.stroke();
  }

  function drawYT() {
    const s0 = state.sol;
    const yTop = s0.peak * 1.12;
    const { ctx, box, X, Y, s, t0 } = plotFrame($('yt'), 0, yTop);
    const ref = (y, color, label) => {
      ctx.setLineDash([5, 4]); ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(box.l, Y(y)); ctx.lineTo(box.r, Y(y)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = `11px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(label, box.r - 2, Y(y) - 2);
    };
    ref(s.h, COLORS.navy, `h = ${N(s.h)} m`);
    const tNow = tPlot(t0);
    const curve = (a, b, color, width, dash) => {
      if (b <= a) return;
      ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      for (let i = 0; i <= 160; i++) { const t = a + (b - a) * i / 160, q = s.at(t); i ? ctx.lineTo(X(t), Y(q.y)) : ctx.moveTo(X(t), Y(q.y)); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    curve(t0, s.T, '#aab6c4', 1.5, [5, 4]);
    if (hasMoved()) { curve(t0, Math.min(tNow, 0), '#8f9bab', 2.5, []); curve(0, tNow, COLORS.blue, 2.5, []); }
    if (tNow >= s.tUp && s.rise > 0 && !ropeIntact()) {
      ctx.fillStyle = COLORS.green; ctx.beginPath(); ctx.arc(X(s.tUp), Y(s.peak), 4, 0, 7); ctx.fill();
      ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(`H = ${N(s.peak)} m`, X(s.tUp) + 6, Y(s.peak) - 2);
    }
    if (state.t >= s.T - 1e-9) {
      ctx.fillStyle = COLORS.red; ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(`t = ${N(s.T)} s`, X(s.T) - 12, Y(0) - 8);
    }
    const q = s.at(tNow);
    ctx.fillStyle = tNow < 0 ? '#8f9bab' : COLORS.blue; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(tNow), Y(q.y), 5.5, 0, 7); ctx.fill(); ctx.stroke();
  }

  /* ---------- 文字读数 ---------- */
  function describe() {
    const s = state.sol, p = s.at(state.t);
    const nearPeak = s.v0 > 0 && Math.abs(state.t - s.tUp) < 0.06;
    let phase, cls = '', text;
    if (state.t < 0) {
      phase = state.ff && state.playing ? '上升中 · 快进' : '随气球上升';
      text = state.t > -FF_END
        ? `即将到达 ${N(s.h)} m，绳子马上断裂。注意：此刻重物和气球一起以 ${N(s.v0)} m/s 向上运动。`
        : `气球带着重物以 ${N(s.v0)} m/s 匀速上升，重物的速度与气球相同。离地 ${N(p.y, 1)} m，${N(-state.t, 1)} s 后绳断。`;
    } else if (!state.started && state.t === 0) {
      phase = '悬停'; text = '气球静止在空中（v₀ = 0）。点击「播放」剪断绳子。';
    } else if (p.phase === 'landed') {
      phase = '落地'; cls = 'landed';
      text = `落地！绳断后用时 t = ${N(s.T)} s，落地速度 ${N(s.vLand)} m/s，方向竖直向下。`;
    } else if (state.t === 0) {
      phase = '绳断瞬间'; cls = 'rising';
      text = s.v0 > 0 ? `绳断瞬间，重物由于惯性保持 ${N(s.v0)} m/s 的向上速度——速度没有突变，并不会立即下落；此后只受重力，a = g，方向向下。`
                      : '绳断瞬间重物速度为零，接下来做自由落体运动。';
    } else if (nearPeak) {
      phase = '最高点'; cls = 'peak';
      text = `到达最高点：v = 0，绳断后用时 t₁ = ${N(s.tUp)} s，比断绳处又高了 ${N(s.rise)} m，离地 H = ${N(s.peak)} m。`;
    } else if (p.phase === 'rising') {
      phase = '惯性上升'; cls = 'rising';
      text = `绳已断，但重物由于惯性仍在向上运动，速度每秒减少 ${N(s.g)} m/s；气球则继续匀速上升，两者逐渐分开。`;
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
    $('timeLabel').textContent = N(p.t, 1) + ' s';
    $('timeline').value = Math.round(toSlider(state.t));
    $('play').textContent = state.playing ? '❚❚ 暂停' : state.t >= s.T - 1e-9 ? '↻ 重新播放' : (state.t <= tMin() + 1e-9 && !state.started) ? '▶ 播放' : '▶ 继续';
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
    setTime(+b.dataset.t); render();
    if (window.innerWidth < 720) $('motion').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('nextStep').addEventListener('click', () => {
    const steps = stepsFor(state.method);
    const i = state.shown[state.method];
    if (i >= steps.length) return;
    state.shown[state.method] = i + 1;
    buildSteps();
    $('steps').children[i].classList.add('fresh');
    if (steps[i].time != null) { setTime(steps[i].time); render(); }
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
