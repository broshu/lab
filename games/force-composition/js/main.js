// 力的合成与分解：绘图与交互。计算见 physics.js，公式 SVG 见 formulas.js。
(function () {
  'use strict';
  const P = window.FC;
  const FML = window.FORMULAS || {};
  const RAD = Math.PI / 180;

  const COLORS = { f1: '#e07b1f', f2: '#2f6fd6', f3: '#8a4fb8', res: '#17212f', muted: '#9aa6b1', grid: '#eef2f6', axis: '#c6ced9', green: '#14936f', red: '#c94040', ghost: 'rgba(23,33,47,0.18)' };
  const SERIF = '"Times New Roman", "STIX Two Text", Times, serif';
  const SANS = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const panel = document.getElementById('panel');
  const snapBox = document.getElementById('snap');
  let W = 0, H = 0, DPR = 1, K = 1;

  // ---------- 小工具 ----------
  const fmt = (x, d = 1) => (Math.abs(x) < 0.05 && d === 1 ? 0 : x).toFixed(d);
  const N = (x) => `${fmt(x)} N`;
  const deg = (x) => `${fmt(x, 0)}°`;
  // HTML 里的变量：斜体字母 + 真正的下标
  const v = (b, s, prime) => `<i class="v">${b}</i>${prime ? '′' : ''}${s ? `<sub>${s}</sub>` : ''}`;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);

  function snapPolar(p, mmax = 14) {
    let m = Math.min(P.mag(p), mmax), a = P.angle(p);
    if (snapBox.checked) { m = Math.round(m * 2) / 2; a = Math.round(a / 5) * 5; }
    return P.polar(Math.max(m, 0.5), a);
  }
  function snapAngle(a) { return snapBox.checked ? Math.round(a / 5) * 5 : a; }

  // ---------- 视图：世界坐标（N）↔ 屏幕 ----------
  const view = { ox: 0, oy: 0, s: 30 };
  function setView(fx, fy, rangeX, rangeY) {
    view.s = Math.min(W / (2 * rangeX), H / (2 * rangeY));
    view.ox = W * fx; view.oy = H * fy;
  }
  const S = (p) => ({ x: view.ox + p.x * view.s, y: view.oy - p.y * view.s });
  const Wd = (x, y) => ({ x: (x - view.ox) / view.s, y: (view.oy - y) / view.s });

  // ---------- 绘图 ----------
  function grid() {
    ctx.save();
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
    const step = view.s;
    if (step >= 10) {
      for (let x = view.ox % step; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = view.oy % step; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    }
    ctx.restore();
  }

  function line(a, b, color, w = 2, dash) {
    const A = S(a), B = S(b);
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.restore();
  }

  function arrow(a, b, color, w = 5, opts = {}) {
    const A = S(a), B = S(b);
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
    if (L < 2) return;
    const ux = dx / L, uy = dy / L;
    w *= K;
    const hs = Math.min((opts.head ? opts.head * K : (12 + w * 2)), L * 0.6);
    ctx.save();
    ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.setLineDash(opts.dash || []);
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x - ux * hs * 0.85, B.y - uy * hs * 0.85); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(B.x, B.y);
    ctx.lineTo(B.x - ux * hs - uy * hs * 0.42, B.y - uy * hs + ux * hs * 0.42);
    ctx.lineTo(B.x - ux * hs + uy * hs * 0.42, B.y - uy * hs - ux * hs * 0.42);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // 画一个物理量符号：斜体主字母 + 真正的下标（缩小、下移）+ 可选撇号。
  function sym(base, sub, x, y, color, size = 26, opts = {}) {
    size *= K;
    ctx.save();
    ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
    if (opts.halo !== false) { ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; }
    const parts = [];
    parts.push({ t: base, font: `italic ${size}px ${SERIF}`, dy: 0 });
    if (sub) parts.push({ t: sub, font: `${/^[a-z]+$/.test(sub) ? 'italic ' : ''}${Math.round(size * 0.68)}px ${SERIF}`, dy: size * 0.28 });
    if (opts.prime) parts.push({ t: '′', font: `${size}px ${SERIF}`, dy: -size * 0.05 });
    let width = 0;
    for (const p of parts) { ctx.font = p.font; width += ctx.measureText(p.t).width; }
    let cx = x - (opts.align === 'left' ? 0 : opts.align === 'right' ? width : width / 2);
    const cy = y + size * 0.35;
    for (const p of parts) {
      ctx.font = p.font;
      if (opts.halo !== false) ctx.strokeText(p.t, cx, cy + p.dy);
      ctx.fillText(p.t, cx, cy + p.dy);
      cx += ctx.measureText(p.t).width;
    }
    ctx.restore();
  }

  function text(t, x, y, color = COLORS.res, size = 18, align = 'center', weight = 500) {
    size *= K;
    ctx.save();
    ctx.font = `${weight} ${size}px ${SANS}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y);
    ctx.restore();
  }

  // 在箭头中部旁边放标签（向箭头左侧偏移）。
  function labelAt(a, b, base, sub, color, opts = {}) {
    const A = S(a), B = S(b);
    const t = opts.t == null ? 0.55 : opts.t;
    const mx = lerp(A.x, B.x, t), my = lerp(A.y, B.y, t);
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
    let side = opts.side || 1;
    if (opts.away) { const Q = S(opts.away), off0 = 24 * K; const d1 = Math.hypot(mx - (dy / L) * off0 - Q.x, my + (dx / L) * off0 - Q.y), d2 = Math.hypot(mx + (dy / L) * off0 - Q.x, my - (dx / L) * off0 - Q.y); side = d1 >= d2 ? 1 : -1; }
    const off = (opts.off || 24) * K;
    sym(base, sub, mx - (dy / L) * off * side, my + (dx / L) * off * side, color, opts.size || 26, opts);
  }

  function dot(p, color, r = 5) {
    const A = S(p); ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(A.x, A.y, r, 0, 7); ctx.fill(); ctx.restore();
  }

  function handle(p, color, active) {
    const A = S(p);
    ctx.save();
    ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(A.x, A.y, (active ? 15 : 12) * K, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // 两个方向之间的角度弧（屏幕坐标里画），返回弧中点位置。
  function arcBetween(center, a1, a2, rpx, color, lw = 2) {
    rpx *= K;
    const C = S(center);
    let d = P.wrap(a2 - a1);
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(C.x, C.y, rpx, -a1 * RAD, -(a1 + d) * RAD, d > 0);
    ctx.stroke(); ctx.restore();
    const mid = (a1 + d / 2) * RAD;
    return { x: C.x + Math.cos(mid) * (rpx + 20 * K), y: C.y - Math.sin(mid) * (rpx + 20 * K) };
  }

  function rightAngle(at, dirA, dirB, size = 14) {
    const A = S(at);
    const ua = { x: Math.cos(dirA * RAD), y: -Math.sin(dirA * RAD) }, ub = { x: Math.cos(dirB * RAD), y: -Math.sin(dirB * RAD) };
    ctx.save(); ctx.strokeStyle = COLORS.muted; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(A.x + ua.x * size, A.y + ua.y * size);
    ctx.lineTo(A.x + ua.x * size + ub.x * size, A.y + ua.y * size + ub.y * size);
    ctx.lineTo(A.x + ub.x * size, A.y + ub.y * size);
    ctx.stroke(); ctx.restore();
  }

  function polyWorld(points, fill, stroke, lw = 2) {
    ctx.save(); ctx.beginPath();
    points.forEach((p, i) => { const A = S(p); if (i) ctx.lineTo(A.x, A.y); else ctx.moveTo(A.x, A.y); });
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    ctx.restore();
  }

  // ---------- 状态 ----------
  const O = { x: 0, y: 0 };
  const state = {
    mode: 'compose',
    compose: { f1: P.polar(5, 0), f2: P.polar(4, 60), rule: 'para', tri: 0, sweep: null },
    multi: { f: [P.polar(5, 10), P.polar(4, 80), P.polar(3, 200)], step: 2, polygon: false },
    effect: { kind: 'pull', angle: { pull: 30, incline: 30, ball: 30, hang: 37 }, free: { F: P.polar(8, 60), d1: 10, d2: 120 } },
    unique: { alpha: 30, F2: 6, F: 10 },
    ortho: { f: [P.polar(6, 20), P.polar(5, 130), P.polar(4, 250)], axis: 0, comps: true }
  };
  const defaults = JSON.parse(JSON.stringify(state));

  let handles = [];
  let drag = null;
  let hover = null;

  // ---------- 各模式 ----------
  const modes = {};

  // 1. 两个力的合成
  modes.compose = {
    title: '两个力的合成',
    hint: '拖动 F₁、F₂ 的箭头端点。切换“三角形定则”看 F₂ 平移到 F₁ 的末端；“扫描夹角”看合力怎样随夹角变化。',
    panel() {
      return `
      <div class="block"><h3>合成方法</h3>
        <div class="seg" id="ruleSeg"><button data-rule="para">平行四边形定则</button><button data-rule="tri">三角形定则</button></div></div>
      <div class="block"><h3>大小不变，改变夹角</h3>
        <button class="primary-button" id="sweepBtn" type="button">扫描夹角 0° → 180°</button></div>
      <div class="block"><h3>典型情况</h3>
        <div class="button-row">
          <button class="secondary-button" data-preset="perp">垂直：3 N 与 4 N</button>
          <button class="secondary-button" data-preset="eq120">等大，夹角 120°</button>
          <button class="secondary-button" data-preset="same">同向</button>
          <button class="secondary-button" data-preset="opp">反向</button>
        </div></div>
      <div class="readouts">
        <div class="readout f1"><span>分力 ${v('F', 1)}</span><strong id="r1">—</strong></div>
        <div class="readout f2"><span>分力 ${v('F', 2)}</span><strong id="r2">—</strong></div>
        <div class="readout"><span>夹角 ${v('θ')}</span><strong id="rth">—</strong></div>
        <div class="readout"><span>合力 ${v('F')}</span><strong id="rF">—</strong></div>
        <div class="readout wide"><span>合力 ${v('F')} 与 ${v('F', 1)} 的夹角 ${v('φ')}</span><strong id="rphi">—</strong></div>
      </div>
      <div class="block"><h3>合力的范围（${v('F', 1)}、${v('F', 2)} 大小不变）</h3>
        <div class="rangebar" id="rangebar"><div class="track"></div><div class="span" id="rbSpan"></div><div class="dot" id="rbDot"></div><span class="lab" id="rbMin"></span><span class="lab" id="rbMax"></span></div></div>
      <div class="formula">${FML.cosine || ''}</div>
      <div class="formula">${FML.range2 || ''}</div>`;
    },
    bind() {
      const st = state.compose;
      panel.querySelectorAll('#ruleSeg button').forEach((b) => b.addEventListener('click', () => { st.rule = b.dataset.rule; syncSeg('ruleSeg', 'rule', st.rule); }));
      syncSeg('ruleSeg', 'rule', st.rule);
      document.getElementById('sweepBtn').addEventListener('click', () => {
        st.sweep = st.sweep ? null : { t: 0, base: P.angle(st.f1), m2: P.mag(st.f2) };
        if (st.sweep) { st.rule = 'para'; syncSeg('ruleSeg', 'rule', 'para'); }
      });
      panel.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
        st.sweep = null;
        const p = b.dataset.preset;
        if (p === 'perp') { st.f1 = P.polar(4, 0); st.f2 = P.polar(3, 90); }
        if (p === 'eq120') { st.f1 = P.polar(5, 0); st.f2 = P.polar(5, 120); }
        if (p === 'same') { st.f1 = P.polar(5, 0); st.f2 = P.polar(3, 0); }
        if (p === 'opp') { st.f1 = P.polar(5, 0); st.f2 = P.polar(3, 180); }
      }));
    },
    update(dt) {
      const st = state.compose;
      st.tri = clamp(st.tri + (st.rule === 'tri' ? 1 : -1) * dt / 0.7, 0, 1);
      if (st.sweep) {
        st.sweep.t += dt / 7;
        if (st.sweep.t >= 1) { st.sweep = null; return; }
        const u = st.sweep.t < 0.5 ? st.sweep.t * 2 : 2 - st.sweep.t * 2;
        st.f2 = P.polar(st.sweep.m2, st.sweep.base + 180 * ease(u));
      }
    },
    draw() {
      const st = state.compose;
      setView(0.3, 0.66, 9.5, 8);
      grid();
      const F = P.add(st.f1, st.f2);
      const k = ease(st.tri);
      // 平行四边形虚线（三角形定则时淡出）
      if (k < 1) {
        line(st.f1, F, COLORS.muted, 2, [8, 7]);
        line(st.f2, F, COLORS.muted, 2, [8, 7]);
      }
      // 夹角弧
      const a1 = P.angle(st.f1), a2 = P.angle(st.f2);
      if (P.mag(st.f1) > 0.4 && P.mag(st.f2) > 0.4 && k < 0.5) {
        const m = arcBetween(O, a1, a2, 40, COLORS.res, 2);
        sym('θ', '', m.x, m.y, COLORS.res, 22);
      }
      arrow(O, F, COLORS.res, 6);
      arrow(O, st.f1, COLORS.f1, 6);
      // F₂：三角形定则时平移到 F₁ 末端
      const start = { x: st.f1.x * k, y: st.f1.y * k };
      if (k > 0) arrow(O, st.f2, COLORS.f2, 4, { alpha: 0.25 });
      arrow(start, P.add(start, st.f2), COLORS.f2, 6);
      labelAt(O, st.f1, 'F', '1', COLORS.f1, { side: P.wrap(a2 - a1) > 0 ? 1 : -1 });
      labelAt(start, P.add(start, st.f2), 'F', '2', COLORS.f2, { side: P.wrap(a2 - a1) > 0 ? -1 : 1 });
      labelAt(O, F, 'F', '', COLORS.res, { t: 0.62, side: (P.wrap(P.angle(F) - a1) > 0) ? 1 : -1 });
      dot(O, COLORS.res, 6);
      sym('O', '', S(O).x - 18, S(O).y + 18, COLORS.res, 22);
      handles = [
        { id: 'f1', pos: st.f1, color: COLORS.f1, set: (p) => { st.f1 = snapPolar(p); st.sweep = null; } },
        { id: 'f2', pos: P.add(start, st.f2), color: COLORS.f2, set: (p) => { st.f2 = snapPolar(P.sub(p, start)); st.sweep = null; } }
      ];
      this.chart();
      // 读数
      const m1 = P.mag(st.f1), m2 = P.mag(st.f2), th = P.between(st.f1, st.f2), Fm = P.mag(F);
      setText('r1', N(m1)); setText('r2', N(m2)); setText('rth', deg(th)); setText('rF', N(Fm));
      setText('rphi', Fm < 0.05 ? '—' : deg(P.between(F, st.f1)));
      const r = P.range2(m1, m2), top = m1 + m2 || 1;
      const sp = document.getElementById('rbSpan');
      if (sp) {
        sp.style.left = `${(r.min / top) * 100}%`; sp.style.width = `${((r.max - r.min) / top) * 100}%`;
        document.getElementById('rbDot').style.left = `${(Fm / top) * 100}%`;
        const mn = document.getElementById('rbMin'), mx = document.getElementById('rbMax');
        mn.style.left = `${(r.min / top) * 100}%`; mn.textContent = `最小 ${fmt(r.min)} N`;
        mx.style.left = '100%'; mx.textContent = `最大 ${fmt(r.max)} N`;
      }
    },
    // 右上角：F–θ 图像
    chart() {
      const st = state.compose;
      const m1 = P.mag(st.f1), m2 = P.mag(st.f2);
      const w = Math.min(280 * K, W * 0.3), h = w * 0.62, x0 = W - w - 24, y0 = H - h - 64 * K;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.strokeStyle = '#d8dee8'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x0 - 10, y0 - 8, w + 20, h + 50, 8); ctx.fill(); ctx.stroke();
      const px = (th) => x0 + 30 * K + (w - 40 * K) * th / 180, py = (F) => y0 + h - 4 - (h - 20) * F / (m1 + m2 || 1);
      ctx.strokeStyle = '#9aa6b1'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px(0), py(0)); ctx.lineTo(px(180) + 8, py(0)); ctx.moveTo(px(0), py(0)); ctx.lineTo(px(0), y0 + 4); ctx.stroke();
      ctx.strokeStyle = COLORS.res; ctx.lineWidth = 2.5; ctx.beginPath();
      for (let t = 0; t <= 180; t += 2) { const X = px(t), Y = py(P.resultantMagnitude(m1, m2, t)); if (t) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
      ctx.stroke();
      const th = P.between(st.f1, st.f2), Fm = P.mag(P.add(st.f1, st.f2));
      ctx.fillStyle = COLORS.red; ctx.beginPath(); ctx.arc(px(th), py(Fm), 6, 0, 7); ctx.fill();
      ctx.restore();
      sym('F', '', px(0) - 14, y0 + 10, COLORS.res, 20, { halo: false });
      sym('θ', '', px(180) + 6, py(0) + 16, COLORS.res, 20, { halo: false });
      text('0°', px(0), py(0) + 16, COLORS.muted, 13); text('90°', px(90), py(0) + 16, COLORS.muted, 13); text('180°', px(180), py(0) + 16, COLORS.muted, 13);
      text('夹角越大，合力越小', x0 + w / 2, y0 + h + 32, COLORS.muted, 14);
    }
  };

  // 2. 多个力的合成
  modes.multi = {
    title: '多个力的合成：逐次合成',
    hint: '拖动三个力的端点。分三步：先看分力，再求 F₁、F₂ 的合力 F₁₂，最后与 F₃ 合成。也可以切换为“首尾相接”。',
    panel() {
      return `
      <div class="block"><h3>步骤</h3>
        <div class="seg three" id="stepSeg"><button data-step="0">① 三个分力</button><button data-step="1">② 合成 ${v('F', 1)}、${v('F', 2)}</button><button data-step="2">③ 再合成 ${v('F', 3)}</button></div></div>
      <label class="check-row"><input type="checkbox" id="polyBox"><span>首尾相接（多边形定则）</span></label>
      <div class="readouts">
        <div class="readout f1"><span>${v('F', 1)}</span><strong id="m1">—</strong></div>
        <div class="readout f2"><span>${v('F', 2)}</span><strong id="m2">—</strong></div>
        <div class="readout f3"><span>${v('F', 3)}</span><strong id="m3">—</strong></div>
        <div class="readout"><span>${v('F', 12)}</span><strong id="m12">—</strong></div>
        <div class="readout wide"><span>合力 ${v('F')}</span><strong id="mF">—</strong></div>
        <div class="readout wide"><span>三力大小不变、方向任意时，合力的范围</span><strong id="mR">—</strong></div>
      </div>
      <div class="formula">${FML.range3 || ''}</div>
      <p class="hint">最小值：若某个力的大小在另两个力的“差与和”之间，最小值为 0；否则等于最大的力减去另两力之和。</p>
      <div class="button-row"><button class="secondary-button" data-p="a">3 N、4 N、5 N</button><button class="secondary-button" data-p="b">2 N、3 N、8 N</button></div>`;
    },
    bind() {
      const st = state.multi;
      panel.querySelectorAll('#stepSeg button').forEach((b) => b.addEventListener('click', () => { st.step = +b.dataset.step; syncSeg('stepSeg', 'step', String(st.step)); }));
      syncSeg('stepSeg', 'step', String(st.step));
      const pb = document.getElementById('polyBox'); pb.checked = st.polygon;
      pb.addEventListener('change', () => { st.polygon = pb.checked; if (st.polygon) { st.step = 2; syncSeg('stepSeg', 'step', '2'); } });
      panel.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
        st.f = b.dataset.p === 'a' ? [P.polar(3, 0), P.polar(4, 90), P.polar(5, 215)] : [P.polar(2, 0), P.polar(3, 100), P.polar(8, 230)];
      }));
    },
    draw() {
      const st = state.multi;
      setView(0.45, 0.55, 10, 8.5);
      grid();
      const [a, b, c] = st.f;
      const f12 = P.add(a, b), F = P.add(f12, c);
      if (st.polygon) {
        const p1 = a, p2 = f12;
        arrow(O, F, COLORS.res, 6);
        arrow(O, a, COLORS.f1, 6); arrow(p1, p2, COLORS.f2, 6); arrow(p2, F, COLORS.f3, 6);
        const cen = P.scale(P.add(P.add(a, p2), F), 1 / 4);
        labelAt(O, a, 'F', '1', COLORS.f1, { away: cen, t: 0.5 }); labelAt(p1, p2, 'F', '2', COLORS.f2, { away: cen, t: 0.5 }); labelAt(p2, F, 'F', '3', COLORS.f3, { away: cen, t: 0.5 });
        labelAt(O, F, 'F', '', COLORS.res, { away: cen, t: 0.5 });
        handles = [
          { id: 'a', pos: a, color: COLORS.f1, set: (p) => { st.f[0] = snapPolar(p); } },
          { id: 'b', pos: p2, color: COLORS.f2, set: (p) => { st.f[1] = snapPolar(P.sub(p, a)); } },
          { id: 'c', pos: F, color: COLORS.f3, set: (p) => { st.f[2] = snapPolar(P.sub(p, f12)); } }
        ];
      } else {
        if (st.step >= 1) {
          line(a, f12, COLORS.muted, 2, [8, 7]); line(b, f12, COLORS.muted, 2, [8, 7]);
          arrow(O, f12, '#5d6879', 5, { alpha: st.step === 2 ? 0.55 : 1 });
          labelAt(O, f12, 'F', '12', '#5d6879', { t: 0.7 });
        }
        if (st.step >= 2) {
          line(f12, F, COLORS.muted, 2, [8, 7]); line(c, F, COLORS.muted, 2, [8, 7]);
          arrow(O, F, COLORS.res, 6); labelAt(O, F, 'F', '', COLORS.res, { t: 0.7, side: -1 });
        }
        arrow(O, a, COLORS.f1, 6, { alpha: 1 }); arrow(O, b, COLORS.f2, 6); arrow(O, c, COLORS.f3, 6, { alpha: st.step === 1 ? 0.35 : 1 });
        labelAt(O, a, 'F', '1', COLORS.f1, { side: -1 }); labelAt(O, b, 'F', '2', COLORS.f2); labelAt(O, c, 'F', '3', COLORS.f3);
        handles = st.f.map((f, i) => ({ id: 'f' + i, pos: f, color: [COLORS.f1, COLORS.f2, COLORS.f3][i], set: (p) => { st.f[i] = snapPolar(p); } }));
      }
      dot(O, COLORS.res, 6);
      setText('m1', N(P.mag(a))); setText('m2', N(P.mag(b))); setText('m3', N(P.mag(c)));
      setText('m12', N(P.mag(f12))); setText('mF', N(P.mag(F)));
      const r = P.range3(P.mag(a), P.mag(b), P.mag(c));
      setText('mR', `${fmt(r.min)} N ～ ${fmt(r.max)} N`);
    }
  };

  // 3. 按效果分解
  const EFFECT = {
    pull: { name: '斜向上拉物体', angle: 'θ', min: 0, max: 80, formula: 'pull' },
    incline: { name: '斜面上的物体', angle: 'α', min: 5, max: 60, formula: 'incline' },
    ball: { name: '挡板挡住的球', angle: 'α', min: 5, max: 60, formula: 'ball' },
    hang: { name: '两绳悬挂物体', angle: 'θ', min: 5, max: 70, formula: 'hang' },
    free: { name: '任意两个方向', formula: null }
  };
  modes.effect = {
    title: '按实际作用效果分解',
    hint: '先想清楚这个力产生了哪两个效果，就确定了两个分力的方向，再作平行四边形。拖动滑杆改变角度。',
    panel() {
      const st = state.effect;
      return `
      <div class="block"><h3>情境</h3>
        <div class="seg" id="kindSeg">
          <button data-kind="pull">斜向上拉物体</button><button data-kind="incline">斜面上的物体</button>
          <button data-kind="ball">挡板挡住的球</button><button data-kind="hang">两绳悬挂物体</button>
          <button data-kind="free" style="grid-column: span 2">任意两个方向（自由分解）</button>
        </div></div>
      <div id="effectBody"></div>`;
    },
    body() {
      const st = state.effect, k = st.kind, e = EFFECT[k];
      if (k === 'free') {
        return `<p class="hint">拖动 ${v('F')} 的端点，以及两条虚线上的圆点改变两个分力的方向。已知两个分力的方向时，分解是唯一的。</p>
        <div class="readouts">
          <div class="readout"><span>${v('F')}</span><strong id="e0">—</strong></div>
          <div class="readout"><span>两方向夹角</span><strong id="eAng">—</strong></div>
          <div class="readout f1"><span>${v('F', 1)}</span><strong id="e1">—</strong></div>
          <div class="readout f2"><span>${v('F', 2)}</span><strong id="e2">—</strong></div>
        </div><p class="note" id="eNote">分量为负值时，表示分力与所画方向相反。</p>`;
      }
      const lab = { pull: ['拉力', 'F', '水平向前拉', '竖直向上提', ['F', '1'], ['F', '2']], incline: ['重力', 'G', '使物体沿斜面下滑', '使物体压紧斜面', ['G', '1'], ['G', '2']], ball: ['重力', 'G', '使球压紧挡板', '使球压紧斜面', ['F', '1'], ['F', '2']], hang: ['O 点受到的向下拉力', 'G', '拉紧 OA', '拉紧 OB', ['F', 'OA'], ['F', 'OB']] }[k];
      const subv = (x) => x[1] === 'OA' || x[1] === 'OB' ? `<i class="v">${x[0]}</i><sub>${x[1]}</sub>` : v(x[0], x[1]);
      return `
      <label class="slider-row"><span>角度 ${v(e.angle)}</span><input id="angRange" type="range" min="${e.min}" max="${e.max}" step="1" value="${st.angle[k]}"><strong id="angVal">—</strong></label>
      <div class="readouts">
        <div class="readout wide"><span>${lab[0]} ${v(lab[1])}</span><strong id="e0">—</strong></div>
        <div class="readout f1"><span>${subv(lab[4])}：${lab[2]}</span><strong id="e1">—</strong></div>
        <div class="readout f2"><span>${subv(lab[5])}：${lab[3]}</span><strong id="e2">—</strong></div>
      </div>
      <div class="formula">${FML[e.formula] || ''}</div>
      <p class="note" id="eNote"></p>`;
    },
    bind() {
      const st = state.effect;
      const rebuild = () => {
        syncSeg('kindSeg', 'kind', st.kind);
        document.getElementById('effectBody').innerHTML = this.body();
        const r = document.getElementById('angRange');
        if (r) r.addEventListener('input', () => { st.angle[st.kind] = +r.value; });
      };
      panel.querySelectorAll('#kindSeg button').forEach((b) => b.addEventListener('click', () => { st.kind = b.dataset.kind; rebuild(); }));
      rebuild();
    },
    draw() {
      const st = state.effect, k = st.kind;
      if (k === 'free') return this.drawFree();
      const a = st.angle[k];
      setText('angVal', deg(a));
      if (k === 'pull') {
        setView(0.42, 0.62, 11, 7.5);
        grid();
        const F = P.polar(10, a);
        polyWorld([{ x: -14, y: -2 }, { x: 18, y: -2 }, { x: 18, y: -2.6 }, { x: -14, y: -2.6 }], '#d9dee6');
        polyWorld([{ x: -3, y: -2 }, { x: 3, y: -2 }, { x: 3, y: 2 }, { x: -3, y: 2 }], '#e9e4d8', '#5d6879', 2);
        this.decomp(F, 0, 90, 'F', '', ['F', '1'], ['F', '2']);
        if (a > 1) { const m = arcBetween(O, 0, a, 54, COLORS.res); sym('θ', '', m.x, m.y, COLORS.res, 22); }
        const r = P.scenarios.pull(10, a);
        setText('e0', '10.0 N'); setText('e1', N(r.a)); setText('e2', N(r.b));
        setNote(a >= 75 ? '拉力接近竖直时，主要效果变成“向上提”。' : `${v('θ')} 越大，向前拉的分力越小，向上提的分力越大。`);
      } else if (k === 'incline') {
        setView(0.5, 0.45, 13, 10.5);
        grid();
        const n = P.polar(1, 90 + a), u = P.polar(1, a);
        const base = P.scale(n, -1.8); // 斜面上与物块接触的点
        const far = 40;
        const A = P.add(base, P.scale(u, -far)), B = P.add(base, P.scale(u, far));
        const bottom = Math.min(A.y, B.y) - 50;
        polyWorld([A, B, { x: B.x, y: bottom }, { x: A.x, y: bottom }], '#efeae0', '#5d6879', 2);
        const hw = 2.4, hh = 1.8;
        polyWorld([P.add(P.scale(u, -hw), P.scale(n, -hh)), P.add(P.scale(u, hw), P.scale(n, -hh)), P.add(P.scale(u, hw), P.scale(n, hh)), P.add(P.scale(u, -hw), P.scale(n, hh))], '#c9d6e2', '#5d6879', 2);
        const G = { x: 0, y: -10 }; // 图中按 0.5 倍比例画 20 N 的力
        this.decomp(G, 180 + a, -90 + a, 'G', '', ['G', '1'], ['G', '2']);
        const r = P.scenarios.incline(20, a);
        setText('e0', '20.0 N'); setText('e1', N(r.a)); setText('e2', N(r.b));
        const m = arcBetween(O, -90, -90 + a, 70, COLORS.muted, 1.5); sym('α', '', m.x, m.y, '#5d6879', 22);
        setNote(`图中 ${v('G')} 与 ${v('G', 2)} 的夹角等于斜面倾角 ${v('α')}。倾角越大，下滑分力越大、压紧斜面的分力越小。`);
      } else if (k === 'ball') {
        setView(0.45, 0.45, 13, 10.5);
        grid();
        const R = 2.2;
        const n = { x: Math.sin(a * RAD), y: Math.cos(a * RAD) }; // 斜面的法线（指向球）
        const contact = P.scale(n, -R);
        const u = { x: Math.cos(a * RAD), y: -Math.sin(a * RAD) }; // 沿斜面向右下
        const A = P.add(contact, P.scale(u, -40)), B = P.add(contact, P.scale(u, 40));
        polyWorld([A, B, { x: B.x, y: B.y - 40 }, { x: A.x, y: A.y - 60 }], '#efeae0', '#5d6879', 2);
        // 竖直挡板
        const boardBottomY = contact.y - (R - contact.x) * Math.tan(a * RAD) - 0.4;
        polyWorld([{ x: R, y: boardBottomY }, { x: R + 0.5, y: boardBottomY }, { x: R + 0.5, y: R + 2 }, { x: R, y: R + 2 }], '#4a5662');
        const C = S(O); ctx.save(); ctx.fillStyle = '#c9d6e2'; ctx.strokeStyle = '#5d6879'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(C.x, C.y, R * view.s, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
        const G = { x: 0, y: -10 }; // 图中按 0.5 倍比例画 20 N 的力
        this.decomp(G, 0, -(90 + a), 'G', '', ['F', '1'], ['F', '2']);
        const m = arcBetween(O, -90, -90 - a, 70, COLORS.muted, 1.5); sym('α', '', m.x, m.y, '#5d6879', 22);
        const r = P.scenarios.ball(20, a);
        setText('e0', '20.0 N'); setText('e1', N(r.a)); setText('e2', N(r.b));
        setNote(`${v('F', 2)} 与 ${v('G')} 的夹角等于 ${v('α')}，所以 ${v('F', 1)} = ${v('G')} tan${v('α')}，${v('F', 2)} = ${v('G')}/cos${v('α')}。${v('α')} 越大，两个分力都越大。`);
      } else if (k === 'hang') {
        setView(0.45, 0.45, 13, 10.5);
        grid();
        const A = P.polar(9, 90 + a), Bp = { x: 11, y: 0 };
        polyWorld([{ x: A.x - 4, y: A.y }, { x: A.x + 4, y: A.y }, { x: A.x + 4, y: A.y + 0.6 }, { x: A.x - 4, y: A.y + 0.6 }], '#4a5662');
        polyWorld([{ x: Bp.x, y: -4 }, { x: Bp.x + 0.6, y: -4 }, { x: Bp.x + 0.6, y: 4 }, { x: Bp.x, y: 4 }], '#4a5662');
        line(O, A, '#9aa6b1', 3); line(O, Bp, '#9aa6b1', 3);
        line(O, { x: 0, y: 6 }, '#c6ced9', 1.5, [6, 6]);
        line(O, { x: 0, y: -11.5 }, '#c6ced9', 2);
        const L = S({ x: 0, y: -13 }); ctx.save(); ctx.fillStyle = '#e07b1f'; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(L.x, L.y, 1.1 * view.s, 1.5 * view.s, 0, 0, 7); ctx.fill(); ctx.restore();
        sym('A', '', S(A).x - 16, S(A).y + 18, COLORS.res, 22, { prime: false });
        sym('B', '', S(Bp).x - 16, S(Bp).y - 16, COLORS.res, 22);
        const G = { x: 0, y: -10 }; // 图中按 0.5 倍比例画 20 N 的力
        this.decomp(G, a - 90, 180, 'G', '', ['F', 'OA'], ['F', 'OB']);
        const m = arcBetween(O, 90, 90 + a, 60, COLORS.res, 1.5); sym('θ', '', m.x, m.y, COLORS.res, 22);
        const r = P.scenarios.hang(20, a);
        setText('e0', '20.0 N'); setText('e1', N(r.a)); setText('e2', N(r.b));
        setNote(`${v('θ')} 越大，两根绳上的拉力都越大；${v('θ')} 接近 90° 时，绳子几乎水平，拉力趋于无穷大——这就是晾衣绳拉不成水平的原因。`);
      }
      dot(O, COLORS.res, 6);
    },
    // 沿两个方向分解 F，画分力、平行四边形和标签
    decomp(F, d1, d2, fb, fs, s1, s2) {
      const d = P.decompose(F, d1, d2);
      line(d.f1, F, COLORS.muted, 2, [8, 7]); line(d.f2, F, COLORS.muted, 2, [8, 7]);
      arrow(O, F, COLORS.res, 6);
      arrow(O, d.f1, COLORS.f1, 6); arrow(O, d.f2, COLORS.f2, 6);
      const lab = (base, sub, p, color) => {
        const T = S(p), C = S(O), dx = T.x - C.x, dy = T.y - C.y, L = Math.hypot(dx, dy) || 1;
        const isUpper = /^[A-Z]+$/.test(sub);
        const o = 28 * K;
        if (isUpper) symUpperSub(base, sub, T.x + dx / L * o, T.y + dy / L * o, color);
        else sym(base, sub, T.x + dx / L * o, T.y + dy / L * o, color, 26);
      };
      lab(fb, fs, F, COLORS.res); lab(s1[0], s1[1], d.f1, COLORS.f1); lab(s2[0], s2[1], d.f2, COLORS.f2);
      return d;
    },
    drawFree() {
      const st = state.effect.free;
      setView(0.45, 0.55, 11, 8.5);
      grid();
      const L = 30;
      line(P.polar(-L, st.d1), P.polar(L, st.d1), '#f2c9a1', 2, [10, 8]);
      line(P.polar(-L, st.d2), P.polar(L, st.d2), '#b9cff2', 2, [10, 8]);
      const d = P.decompose(st.F, st.d1, st.d2);
      const h1 = P.polar(10.5, st.d1), h2 = P.polar(10.5, st.d2);
      if (d) this.decomp(st.F, st.d1, st.d2, 'F', '', ['F', '1'], ['F', '2']);
      else arrow(O, st.F, COLORS.res, 6);
      dot(O, COLORS.res, 6);
      handles = [
        { id: 'F', pos: st.F, color: COLORS.res, set: (p) => { st.F = snapPolar(p); } },
        { id: 'd1', pos: h1, color: COLORS.f1, set: (p) => { st.d1 = snapAngle(P.angle(p)); } },
        { id: 'd2', pos: h2, color: COLORS.f2, set: (p) => { st.d2 = snapAngle(P.angle(p)); } }
      ];
      setText('e0', N(P.mag(st.F)));
      setText('eAng', deg(Math.abs(P.wrap(st.d2 - st.d1))));
      if (d) {
        setText('e1', `${fmt(d.k1)} N`); setText('e2', `${fmt(d.k2)} N`);
        setNote(d.k1 < -0.05 || d.k2 < -0.05 ? '有一个分量为负：这个分力与所画的方向相反（沿虚线的另一侧）。' : '两个分力的方向一旦确定，平行四边形就唯一确定。');
      } else {
        setText('e1', '—'); setText('e2', '—');
        setNote('两个方向在同一直线上，无法作出平行四边形。');
      }
    }
  };

  // 下标是大写字母（如 OA）时，下标用正体。
  function symUpperSub(base, sub, x, y, color, size = 26) {
    size *= K;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.font = `italic ${size}px ${SERIF}`; const w1 = ctx.measureText(base).width;
    ctx.font = `${Math.round(size * 0.68)}px ${SERIF}`; const w2 = ctx.measureText(sub).width;
    let cx = x - (w1 + w2) / 2; const cy = y + size * 0.35;
    ctx.fillStyle = color;
    ctx.font = `italic ${size}px ${SERIF}`; ctx.strokeText(base, cx, cy); ctx.fillText(base, cx, cy);
    ctx.font = `${Math.round(size * 0.68)}px ${SERIF}`; ctx.strokeText(sub, cx + w1, cy + size * 0.28); ctx.fillText(sub, cx + w1, cy + size * 0.28);
    ctx.restore();
  }

  // 4. 分解的唯一性
  modes.unique = {
    title: '分解的唯一性：已知一个分力的方向和另一个分力的大小',
    hint: '以 F 的末端为圆心、F₂ 的大小为半径画圆，看圆与 F₁ 方向线（x 轴正方向）有几个交点。也可以直接拖动圆上的点改变 F₂。',
    panel() {
      const st = state.unique;
      return `
      <label class="slider-row"><span>夹角 ${v('α')}</span><input id="alphaRange" type="range" min="10" max="80" step="1" value="${st.alpha}"><strong id="alphaVal">—</strong></label>
      <label class="slider-row"><span>${v('F', 2)} 大小</span><input id="f2Range" type="range" min="0" max="16" step="0.1" value="${st.F2}"><strong id="f2Val">—</strong></label>
      <div class="button-row">
        <button class="secondary-button" data-u="tan">${v('F', 2)} = ${v('F')} sin${v('α')}</button>
        <button class="secondary-button" data-u="eq">${v('F', 2)} = ${v('F')}</button>
      </div>
      <div class="readouts">
        <div class="readout"><span>${v('F')}</span><strong>10.0 N</strong></div>
        <div class="readout"><span>${v('F')} sin${v('α')}</span><strong id="uS">—</strong></div>
        <div class="readout f1 wide"><span>${v('F', 1)} 的大小（解）</span><strong id="uR">—</strong></div>
      </div>
      <p class="note" id="uNote"></p>
      <div class="formula">${FML.uniq || ''}</div>
      <p class="hint">${v('F', 2)} &lt; ${v('F')} sin${v('α')}：无解；${v('F', 2)} = ${v('F')} sin${v('α')}：一解（${v('F', 2)} 最小）；${v('F')} sin${v('α')} &lt; ${v('F', 2)} &lt; ${v('F')}：两解；${v('F', 2)} ≥ ${v('F')}：一解。</p>`;
    },
    bind() {
      const st = state.unique;
      const ar = document.getElementById('alphaRange'), fr = document.getElementById('f2Range');
      ar.addEventListener('input', () => { st.alpha = +ar.value; });
      fr.addEventListener('input', () => { st.F2 = +fr.value; });
      panel.querySelectorAll('[data-u]').forEach((b) => b.addEventListener('click', () => {
        st.F2 = b.dataset.u === 'tan' ? st.F * Math.sin(st.alpha * RAD) : st.F;
        fr.value = st.F2;
      }));
    },
    draw() {
      const st = state.unique;
      setView(0.2, 0.68, 13, 9);
      grid();
      const Ft = P.polar(st.F, st.alpha);
      // F₁ 方向线
      line({ x: -1, y: 0 }, { x: 30, y: 0 }, '#c6ced9', 2, [4, 6]);
      // 圆
      const C = S(Ft);
      ctx.save(); ctx.strokeStyle = '#9fbbe0'; ctx.lineWidth = 2; ctx.setLineDash([9, 8]);
      ctx.beginPath(); ctx.arc(C.x, C.y, st.F2 * view.s, 0, 7); ctx.stroke(); ctx.restore();
      // F sinα
      line(Ft, { x: Ft.x, y: 0 }, COLORS.muted, 1.5, [6, 6]);
      rightAngle({ x: Ft.x, y: 0 }, 180, 90, 12);
      const mid = S({ x: Ft.x, y: Ft.y * 0.22 });
      sym('F', '', mid.x + 10 * K, mid.y, '#5d6879', 20, { align: 'left' });
      text('sin', mid.x + 26 * K, mid.y + 1, '#5d6879', 17, 'left');
      sym('α', '', mid.x + 52 * K, mid.y, '#5d6879', 20, { align: 'left' });
      const res = P.uniqueness(st.F, st.alpha, st.F2);
      const cols = [[COLORS.f1, COLORS.f2], ['#f0b27a', '#8fb1ea']];
      res.roots.slice().sort((p, q) => p - q).forEach((r, i) => {
        const p = { x: r, y: 0 };
        arrow(O, p, cols[i][0], i ? 5 : 6, { alpha: i ? 0.9 : 1 });
        arrow(p, Ft, cols[i][1], i ? 5 : 6, { alpha: i ? 0.9 : 1 });
        sym('F', '1', S(p).x - (i ? -14 : 36) * K, S(p).y + 28 * K, cols[i][0], 24, { prime: i === 1 });
        labelAt(p, Ft, 'F', '2', cols[i][1], { side: i ? -1 : 1, prime: i === 1, size: 24 });
      });
      arrow(O, Ft, COLORS.res, 6);
      labelAt(O, Ft, 'F', '', COLORS.res, { side: 1, t: 0.45 });
      const m = arcBetween(O, 0, st.alpha, 60, COLORS.res); sym('α', '', m.x, m.y, COLORS.res, 22);
      dot(O, COLORS.res, 6);
      const hp = P.add(Ft, P.polar(st.F2, 90));
      handles = [{ id: 'r', pos: hp, color: '#6f97d0', set: (p) => { st.F2 = clamp(Math.round(P.mag(P.sub(p, Ft)) * 10) / 10, 0, 16); const fr = document.getElementById('f2Range'); if (fr) fr.value = st.F2; } }];
      setText('alphaVal', deg(st.alpha)); setText('f2Val', N(st.F2)); setText('uS', N(res.Fsin));
      setText('uR', res.roots.length ? res.roots.slice().sort((p, q) => p - q).map((r) => `${fmt(r)} N`).join('，') : '无');
      const notes = { none: ['bad', '圆与 F₁ 方向线不相交：无解。'], tangent: ['ok', '圆与方向线相切：只有一组解，此时 F₂ 垂直于 F₁ 方向，F₂ 最小。'], two: ['ok', '圆与方向线有两个交点：两组解。'], one: ['ok', 'F₂ ≥ F：另一个交点落在 O 点另一侧（F₁ 反向），只剩一组解。'] };
      const n = notes[res.kase];
      const el = document.getElementById('uNote');
      if (el) { el.className = 'note ' + n[0]; el.innerHTML = n[1].replace(/F₁/g, v('F', 1)).replace(/F₂/g, v('F', 2)).replace(/(^|[^>])F([^<]|$)/g, `$1${v('F')}$2`); }
    }
  };

  // 5. 正交分解
  modes.ortho = {
    title: '正交分解法',
    hint: '拖动三个力的端点；拖动 x 轴左端的圆点（或滑杆）转动坐标轴。轴怎么转，合力都不变——但让更多的力落在轴上，计算最简单。',
    panel() {
      const st = state.ortho;
      return `
      <label class="slider-row"><span>坐标轴转角</span><input id="axisRange" type="range" min="-90" max="90" step="1" value="${st.axis}"><strong id="axisVal">—</strong></label>
      <div class="button-row"><button class="secondary-button" id="alignBtn" type="button">让 ${v('x')} 轴沿 ${v('F', 1)}</button><button class="secondary-button" id="zeroBtn" type="button">轴回到水平</button></div>
      <label class="check-row"><input type="checkbox" id="compBox"><span>显示每个力的分量</span></label>
      <table class="comp"><thead><tr><th></th><th>${v('x')} 分量</th><th>${v('y')} 分量</th></tr></thead>
        <tbody>
          <tr><td style="color:var(--f1)">${v('F', 1)}</td><td id="c1x"></td><td id="c1y"></td></tr>
          <tr><td style="color:var(--f2)">${v('F', 2)}</td><td id="c2x"></td><td id="c2y"></td></tr>
          <tr><td style="color:var(--f3)">${v('F', 3)}</td><td id="c3x"></td><td id="c3y"></td></tr>
          <tr class="sum"><td>合计</td><td id="cX"></td><td id="cY"></td></tr>
        </tbody></table>
      <div class="readouts"><div class="readout"><span>合力 ${v('F')}</span><strong id="oF">—</strong></div><div class="readout"><span>与 ${v('x')} 轴夹角 ${v('φ')}</span><strong id="oP">—</strong></div></div>
      <div class="formula">${FML.orthoSum || ''}</div>
      <div class="formula">${FML.orthoRes || ''}</div>
      <button class="secondary-button" id="ex3Btn" type="button">载入：10 N、5 N（与 −${v('x')} 轴成 37°）、5 N</button>`;
    },
    bind() {
      const st = state.ortho;
      const ar = document.getElementById('axisRange');
      ar.addEventListener('input', () => { st.axis = +ar.value; });
      document.getElementById('alignBtn').addEventListener('click', () => { st.axis = Math.round(P.wrap(P.angle(st.f[0]))); if (st.axis > 90) st.axis -= 180; if (st.axis < -90) st.axis += 180; ar.value = st.axis; });
      document.getElementById('zeroBtn').addEventListener('click', () => { st.axis = 0; ar.value = 0; });
      const cb = document.getElementById('compBox'); cb.checked = st.comps; cb.addEventListener('change', () => { st.comps = cb.checked; });
      document.getElementById('ex3Btn').addEventListener('click', () => { st.f = [P.polar(10, 0), P.polar(5, 180 - 36.8699), P.polar(5, 90)]; st.axis = 0; ar.value = 0; });
    },
    draw() {
      const st = state.ortho;
      setView(0.5, 0.52, 10, 8.5);
      grid();
      const ax = st.axis, ux = P.polar(1, ax), uy = P.polar(1, ax + 90);
      const L = 9.5;
      arrow(P.scale(ux, -L), P.scale(ux, L), '#7d8796', 2, { head: 14 });
      arrow(P.scale(uy, -L * 0.85), P.scale(uy, L * 0.85), '#7d8796', 2, { head: 14 });
      const xe = S(P.scale(ux, L)), ye = S(P.scale(uy, L * 0.85));
      sym('x', '', xe.x + 16 * Math.cos(ax * RAD), xe.y - 16 * Math.sin(ax * RAD) + 14, '#5d6879', 24);
      sym('y', '', ye.x - 18, ye.y + 4, '#5d6879', 24);
      const c = P.components(st.f, ax);
      const cols = [COLORS.f1, COLORS.f2, COLORS.f3];
      if (st.comps) {
        st.f.forEach((f, i) => {
          const px = P.scale(ux, c.list[i].x), py = P.scale(uy, c.list[i].y);
          line(f, px, cols[i], 1.2, [5, 5]); line(f, py, cols[i], 1.2, [5, 5]);
          arrow(O, px, cols[i], 3, { alpha: 0.6, head: 12 }); arrow(O, py, cols[i], 3, { alpha: 0.6, head: 12 });
        });
      }
      const Fx = P.scale(ux, c.Fx), Fy = P.scale(uy, c.Fy), F = P.add(Fx, Fy);
      line(Fx, F, COLORS.muted, 1.5, [8, 7]); line(Fy, F, COLORS.muted, 1.5, [8, 7]);
      st.f.forEach((f, i) => { arrow(O, f, cols[i], 5); labelAt(O, f, 'F', String(i + 1), cols[i], { t: 0.8 }); });
      arrow(O, Fx, COLORS.res, 4, { alpha: 0.75 }); arrow(O, Fy, COLORS.res, 4, { alpha: 0.75 });
      const Xs = S(Fx), Ys = S(Fy);
      if (Math.abs(c.Fx) > 0.4) sym('F', 'x', Xs.x + 10 * Math.sign(c.Fx || 1) * Math.cos(ax * RAD) + 6, Xs.y + 26, COLORS.res, 22);
      if (Math.abs(c.Fy) > 0.4) sym('F', 'y', Ys.x - 26, Ys.y - 6, COLORS.res, 22);
      arrow(O, F, COLORS.res, 6);
      labelAt(O, F, 'F', '', COLORS.res, { t: 0.9, side: -1 });
      dot(O, COLORS.res, 6);
      handles = st.f.map((f, i) => ({ id: 'o' + i, pos: f, color: cols[i], set: (p) => { st.f[i] = snapPolar(p); } }));
      handles.push({ id: 'axis', pos: P.scale(ux, -L), color: '#7d8796', set: (p) => { let a = Math.round(P.wrap(P.angle(p) + 180)); a = clamp(a, -90, 90); st.axis = snapBox.checked ? Math.round(a / 5) * 5 : a; const r = document.getElementById('axisRange'); if (r) r.value = st.axis; } });
      setText('axisVal', deg(ax));
      c.list.forEach((q, i) => { setText(`c${i + 1}x`, fmt(q.x)); setText(`c${i + 1}y`, fmt(q.y)); });
      setText('cX', `${fmt(c.Fx)} N`); setText('cY', `${fmt(c.Fy)} N`);
      setText('oF', N(c.F)); setText('oP', c.F < 0.05 ? '—' : deg(c.phi));
    }
  };

  // ---------- 面板与读数 ----------
  function setText(id, t) { const el = document.getElementById(id); if (el && el.textContent !== t) el.textContent = t; }
  function setNote(html) { const el = document.getElementById('eNote'); if (el && el.innerHTML !== html) el.innerHTML = html; }
  function syncSeg(id, key, val) { document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('active', b.dataset[key] === val)); }

  function renderMode() {
    const m = modes[state.mode];
    document.querySelectorAll('.mode-button').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.mode));
    document.getElementById('stageTitle').textContent = m.title;
    document.getElementById('stageHint').innerHTML = m.hint.replace(/F₁₂/g, v('F', 12)).replace(/F₁/g, v('F', 1)).replace(/F₂/g, v('F', 2)).replace(/F₃/g, v('F', 3)).replace(/ F /g, ` ${v('F')} `).replace(/^以 F /, `以 ${v('F')} `).replace(/([ （])x 轴/g, `$1${v('x')} 轴`);
    panel.innerHTML = m.panel();
    m.bind && m.bind();
  }

  document.querySelectorAll('.mode-button').forEach((b) => b.addEventListener('click', () => { state.mode = b.dataset.mode; renderMode(); }));
  document.getElementById('resetButton').addEventListener('click', () => {
    state[state.mode] = JSON.parse(JSON.stringify(defaults[state.mode]));
    renderMode();
  });

  // ---------- 拖动 ----------
  function pointerPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function pick(pt) {
    let best = null, bd = 34 * K;
    for (const h of handles) { const A = S(h.pos), d = Math.hypot(A.x - pt.x, A.y - pt.y); if (d < bd) { bd = d; best = h; } }
    return best;
  }
  canvas.addEventListener('pointerdown', (e) => {
    const h = pick(pointerPos(e));
    if (!h) return;
    drag = h.id; canvas.setPointerCapture(e.pointerId); e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    const pt = pointerPos(e);
    if (drag) {
      const h = handles.find((q) => q.id === drag);
      if (h) h.set(Wd(pt.x, pt.y));
    } else {
      const h = pick(pt); hover = h ? h.id : null;
      canvas.style.cursor = h ? 'grab' : 'default';
    }
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  // ---------- 主循环 ----------
  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    K = clamp(Math.min(W, H * 1.6) / 900, 0.9, 1.6);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const m = modes[state.mode];
    m.update && m.update(dt);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    handles = [];
    m.draw();
    for (const h of handles) handle(h.pos, h.color, h.id === drag || h.id === hover);
    requestAnimationFrame(frame);
  }

  // 键盘：1–5 切换，R 重置
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const keys = ['compose', 'multi', 'effect', 'unique', 'ortho'];
    if (/^[1-5]$/.test(e.key)) { state.mode = keys[+e.key - 1]; renderMode(); }
    if (e.key === 'r' || e.key === 'R') document.getElementById('resetButton').click();
  });

  renderMode();
  requestAnimationFrame(frame);
})();
