(function () {
  'use strict';

  const P = window.ForcePhysics;
  const $ = (sel) => document.querySelector(sel);

  const stage = $('#stageCanvas');
  const graph = $('#graphCanvas');
  const sctx = stage.getContext('2d');
  const gctx = graph.getContext('2d');

  const els = {
    modeButtons: document.querySelectorAll('.mode-button'),
    subButtons: document.querySelectorAll('.sub-button'),
    microTabs: $('#microTabs'),
    statusPill: $('#statusPill'),
    dragHint: $('#dragHint'),
    actionA: $('#actionA'),
    actionB: $('#actionB'),
    resetButton: $('#resetButton'),
    speedInput: $('#speedInput'),
    speedValue: $('#speedValue'),
    speedPill: $('#speedPill'),
    pauseButton: $('#pauseButton'),
    autoSlow: $('#autoSlow'),
    autoSlowRow: $('#autoSlowRow'),
    autoSlowText: $('#autoSlowText'),
    metricLabels: [$('#m1Label'), $('#m2Label'), $('#m3Label'), $('#m4Label')],
    metricValues: [$('#m1Value'), $('#m2Value'), $('#m3Value'), $('#m4Value')],
    verdict: $('#verdictMetric'),
    stageTitle: $('#stageTitle'),
    stageSubtitle: $('#stageSubtitle'),
    legend: $('#legend'),
    timeReadout: $('#timeReadout'),
    narrative: $('#narrative'),
    graphTitle: $('#graphTitle'),
    graphNote: $('#graphNote'),
    graphLegend: $('#graphLegend')
  };

  const C = {
    ink: '#17212f',
    muted: '#647084',
    grid: '#e3e9f1',
    axis: '#9aa7b8',
    tension: '#2f6fd6',
    hand: '#e07b1f',
    friction: '#d64545',
    weight: '#7f8793',
    green: '#14936f',
    navy: '#264761',
    purple: '#7b61c4',
    steel: '#56677d',
    ball: '#d9a02b',
    block: '#8aa0b8'
  };

  const SPEEDS = [1, 0.1, 0.01, 0.001];
  const g = P.g;

  // ---------------------------------------------------------------- helpers
  const fmt = (v, d = 1) => (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function mix(c1, c2, t) {
    t = clamp(t, 0, 1);
    const a = c1.match(/\w\w/g).map((h) => parseInt(h, 16));
    const b = c2.match(/\w\w/g).map((h) => parseInt(h, 16));
    return 'rgb(' + a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',') + ')';
  }
  // 形变颜色：伸长偏红，压缩偏蓝，零形变为灰
  function strainColor(r) {
    return r >= 0 ? mix('#b8c2d0', '#d64545', r) : mix('#b8c2d0', '#2f6fd6', -r);
  }
  function contactColor(r) {
    return r < 0.6 ? mix('#16a34a', '#ef8a17', r / 0.6) : mix('#ef8a17', '#d64545', (r - 0.6) / 0.4);
  }

  function arrow(ctx, x1, y1, x2, y2, color, w = 4, head = 12) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 3) return;
    const ux = dx / len, uy = dy / len;
    head = Math.min(head, len * 0.9);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
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
    ctx.restore();
  }

  function text(ctx, str, x, y, opt = {}) {
    ctx.save();
    ctx.font = (opt.weight || 700) + ' ' + (opt.size || 14) + 'px Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = opt.color || C.ink;
    ctx.textAlign = opt.align || 'left';
    ctx.textBaseline = opt.base || 'middle';
    if (opt.bg) {
      const w = ctx.measureText(str).width, h = (opt.size || 14) + 8;
      const x0 = opt.align === 'center' ? x - w / 2 : opt.align === 'right' ? x - w : x;
      ctx.fillStyle = opt.bg;
      roundRect(ctx, x0 - 6, y - h / 2, w + 12, h, 6);
      ctx.fill();
      ctx.fillStyle = opt.color || C.ink;
    }
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hatch(ctx, x1, y1, x2, y2, dir) {
    // dir: 'up' 天花板（阴影在上方），'left' 墙（阴影在左侧），'down' 地面
    ctx.save();
    ctx.strokeStyle = '#3c4656';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#8391a3';
    ctx.beginPath();
    if (dir === 'left') {
      for (let y = y1; y < y2; y += 12) { ctx.moveTo(x1, y + 12); ctx.lineTo(x1 - 12, y); }
    } else if (dir === 'up') {
      for (let x = x1; x < x2; x += 12) { ctx.moveTo(x, y1); ctx.lineTo(x + 12, y1 - 12); }
    }
    ctx.stroke();
    ctx.restore();
  }

  // 竖直弹簧：从 (x, y1) 到 (x, y2)
  function vCoil(ctx, x, y1, y2, turns, half, color, lw) {
    const lead = Math.min(12, (y2 - y1) * 0.12);
    const a = y1 + lead, b = y2 - lead;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, a);
    const n = turns * 2;
    for (let i = 0; i < n; i++) {
      const y = a + (b - a) * (i + 0.5) / n;
      ctx.lineTo(x + (i % 2 ? -half : half), y);
    }
    ctx.lineTo(x, b);
    ctx.lineTo(x, y2);
    ctx.stroke();
    ctx.restore();
  }

  // 水平弹簧
  function hCoil(ctx, x1, x2, y, turns, half, color, lw) {
    const lead = Math.min(12, Math.abs(x2 - x1) * 0.12) * Math.sign(x2 - x1 || 1);
    const a = x1 + lead, b = x2 - lead;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(a, y);
    const n = turns * 2;
    for (let i = 0; i < n; i++) {
      const x = a + (b - a) * (i + 0.5) / n;
      ctx.lineTo(x, y + (i % 2 ? -half : half));
    }
    ctx.lineTo(b, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.restore();
  }

  function drawBall(ctx, x, y, r, held) {
    ctx.save();
    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.2, x, y, r);
    grad.addColorStop(0, '#f6d489');
    grad.addColorStop(1, C.ball);
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#a0721a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (held) {
      ctx.strokeStyle = C.hand;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(x, y, r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHand(ctx, x, y, active) {
    ctx.save();
    ctx.globalAlpha = active ? 1 : 0.45;
    ctx.fillStyle = active ? C.hand : '#c9a27c';
    ctx.strokeStyle = '#9a5210';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    text(ctx, '手', x, y + 1, { color: '#fff', align: 'center', size: 14, weight: 800 });
    ctx.restore();
  }

  // 右侧读数：竖直条
  function drawBars(ctx, x0, y0, w, h, bars) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e1e7ef';
    ctx.lineWidth = 1;
    roundRect(ctx, x0, y0, w, h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, '实时读数', x0 + 14, y0 + 20, { size: 13, color: C.muted });
    const n = bars.length;
    const colW = (w - 16) / n;
    const top = y0 + 78, bottom = y0 + h - 58;
    bars.forEach((b, i) => {
      const cx = x0 + 8 + colW * (i + 0.5);
      const bw = Math.min(30, colW * 0.42);
      ctx.fillStyle = '#eef3f8';
      roundRect(ctx, cx - bw / 2, top, bw, bottom - top, 5);
      ctx.fill();
      const r = clamp(Math.abs(b.value) / b.max, 0, 1);
      const bh = (bottom - top) * r;
      if (bh > 0.5) {
        ctx.fillStyle = b.color;
        roundRect(ctx, cx - bw / 2, bottom - bh, bw, bh, Math.min(5, bh / 2));
        ctx.fill();
      }
      for (const m of b.marks || []) {
        const my = bottom - (bottom - top) * clamp(m.v / b.max, 0, 1);
        ctx.strokeStyle = m.color || '#3c4656';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(cx - bw / 2 - 6, my);
        ctx.lineTo(cx + bw / 2 + 6, my);
        ctx.stroke();
        ctx.setLineDash([]);
        if (m.label) text(ctx, m.label, cx + bw / 2 + 5, my - 8, { size: 10, color: m.color || C.muted, weight: 700 });
      }
      text(ctx, b.text, cx, y0 + 50, { align: 'center', size: colW > 70 ? 17 : 14, weight: 800, color: b.color });
      const lines = b.label.split('\n');
      lines.forEach((ln, k) => text(ctx, ln, cx, bottom + 18 + k * 16, { align: 'center', size: 12, color: C.muted }));
    });
    ctx.restore();
  }

  // ---------------------------------------------------------------- recorder
  function makeRecorder(n, windowLen) {
    return { n, window: windowLen, bd: windowLen / 480, buckets: [], cur: null, t: 0 };
  }
  function record(rec, t, vals) {
    rec.t = t;
    const idx = Math.floor(t / rec.bd);
    let b = rec.cur;
    if (!b || b.idx !== idx) {
      b = { idx, min: vals.slice(), max: vals.slice(), last: vals.slice() };
      rec.buckets.push(b);
      rec.cur = b;
      if (rec.buckets.length > 500) rec.buckets.shift();
      return;
    }
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (v < b.min[i]) b.min[i] = v;
      if (v > b.max[i]) b.max[i] = v;
      b.last[i] = v;
    }
  }

  // ---------------------------------------------------------------- state
  const app = {
    mode: 'rigid',
    view: 'chain',
    speed: 0,
    paused: false,
    sims: {},
    rec: null,
    drag: null,
    acc: 0,
    narrative: '',
    verdict: '',
    slowActive: false,
    demoTimer: null,
    W: 0, H: 0, GW: 0, GH: 0
  };
  const key = () => (app.mode === 'micro' ? app.view : app.mode);
  const scene = () => SCENES[key()];
  const sim = () => app.sims[key()];

  function say(narr, verdict) {
    if (narr !== undefined && narr !== null) { app.narrative = narr; els.narrative.textContent = narr; }
    if (verdict !== undefined && verdict !== null) { app.verdict = verdict; els.verdict.textContent = verdict; }
  }

  // ---------------------------------------------------------------- 悬挂场景（钢丝 / 弹簧 / 螺旋钢丝）
  function makeHangScene(kind, opt) {
    return {
      kind,
      title: opt.title,
      subtitle: opt.subtitle,
      hint: '按住小球上下拖动，然后松手。',
      dt: P.HANG[kind].dt,
      rate: 1,
      window: 4,
      timeLabel: (t) => fmtTime(t),
      legend: [['钢丝或弹簧的弹力', C.tension], ['手的拉力', C.hand], ['重力', C.weight]].map((x, i) => i === 0 ? [opt.forceName, C.tension] : x),
      graph: {
        title: opt.forceName + '和手的拉力随时间的变化',
        note: opt.graphNote,
        series: [
          { label: opt.forceName, color: C.tension, get: (s) => P.hangForce(s) },
          { label: '手的拉力', color: C.hand, get: (s) => s.hand }
        ],
        yMin: -10, yMax: 50, unit: 'N',
        refs: [{ v: 10, label: 'mg = 10 N', color: C.weight }]
      },
      create() {
        const s = P.createHanging(kind);
        s.watch = null;
        return s;
      },
      step(s, dt) {
        P.stepHanging(s, dt);
        const w = s.watch;
        if (w && !w.done) {
          const T = P.hangForce(s);
          if (Math.abs(T - g) <= 0.1 * Math.abs(w.T0 - g)) {
            w.done = true;
            w.dur = s.t - w.t0;
            opt.onSettle && opt.onSettle(s, w);
          }
          if (s.t - w.t0 > 0.5 && !w.done) w.done = true;
        }
      },
      release(s) {
        if (!s.held) return;
        const T0 = P.hangForce(s);
        const hand0 = s.hand;
        s.held = false;
        s.watch = { t0: s.t, T0, hand0, done: Math.abs(T0 - g) < 1 };
        opt.onRelease(s, s.watch);
      },
      actionA: {
        label: () => '拉到 ' + opt.demoF + ' N 后松手',
        run(s) {
          s.held = true;
          s.y = s.target = opt.demoF / s.k;
          s.v = 0;
          s.a = 0;
          s.hand = opt.demoF - g;
          s.watch = null;
          say('小球被手拉住：弹力 ' + opt.demoF + ' N，手的拉力 ' + (opt.demoF - g) + ' N。马上松手……', null);
          clearTimeout(app.demoTimer);
          app.demoTimer = setTimeout(() => { if (sim() === s) this_release(s); }, 700);
        }
      },
      actionB: null,
      layout(W, H) {
        const RW = readoutWidth(W);
        const sw = W - RW;
        const cx = sw * 0.47;
        const ceil = 44;
        const R = 24;
        const room = H - ceil - 2 * R - 80;
        const ppm = Math.min(opt.maxPpm, room / (opt.L0 + P.HANG[kind].yMax * opt.mag));
        return { RW, sw, cx, ceil, R, ppm, L0px: opt.L0 * ppm, ext: ppm * opt.mag };
      },
      ballY(s, L) {
        return L.ceil + L.L0px + s.y * L.ext + L.R;
      },
      draw(ctx, W, H, s) {
        const L = this.layout(W, H);
        const by = this.ballY(s, L);
        const T = P.hangForce(s);
        hatch(ctx, L.cx - 90, L.ceil, L.cx + 90, L.ceil, 'up');
        const topOfBall = by - L.R;
        if (opt.connector === 'wire') {
          ctx.save();
          ctx.lineWidth = 3;
          ctx.strokeStyle = T > 0 ? strainColor(T / 50) : '#9aa7b8';
          ctx.beginPath();
          ctx.moveTo(L.cx, L.ceil);
          if (s.y < 0) {
            const bulge = Math.min(40, -s.y * L.ext * 1.5);
            ctx.quadraticCurveTo(L.cx + bulge, (L.ceil + topOfBall) / 2, L.cx, topOfBall);
          } else ctx.lineTo(L.cx, topOfBall);
          ctx.stroke();
          ctx.restore();
        } else {
          vCoil(ctx, L.cx, L.ceil, topOfBall, opt.turns, 16, strainColor(T / 45), 2.6);
        }
        drawBall(ctx, L.cx, by, L.R, s.held);

        // 原长与形变量标尺
        const rx = L.cx - 62;
        const natY = L.ceil + L.L0px;
        ctx.save();
        ctx.strokeStyle = '#9aa7b8';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(rx - 14, natY);
        ctx.lineTo(L.cx + 30, natY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(rx, L.ceil + 4);
        ctx.lineTo(rx, natY);
        ctx.stroke();
        ctx.restore();
        text(ctx, '原长', rx - 8, (L.ceil + natY) / 2, { align: 'right', size: 13, color: C.muted });
        const xEnd = topOfBall;
        if (Math.abs(xEnd - natY) > 1) {
          ctx.save();
          ctx.strokeStyle = C.navy;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(rx, natY);
          ctx.lineTo(rx, xEnd);
          ctx.moveTo(rx - 7, xEnd);
          ctx.lineTo(rx + 7, xEnd);
          ctx.stroke();
          ctx.restore();
        }
        text(ctx, 'x = ' + opt.xText(s.y), rx - 8, (natY + xEnd) / 2 + (Math.abs(xEnd - natY) < 20 ? 16 : 0), { align: 'right', size: 14, color: C.navy, weight: 800 });
        if (opt.magNote) text(ctx, opt.magNote, rx - 8, natY + (xEnd > natY ? -14 : 16) - (Math.abs(xEnd - natY) < 20 ? 0 : 0), { align: 'right', size: 11, color: C.muted, weight: 600 });

        // 受力箭头（2 px/N）
        const k = 2;
        const ax = L.cx + L.R + 22;
        if (Math.abs(T) > 0.2) arrow(ctx, ax, by, ax, by - T * k, C.tension, 4);
        text(ctx, opt.forceSym + ' = ' + fmt(T) + ' N', ax + 10, by - Math.max(18, T * k * 0.6), { size: 14, color: C.tension });
        arrow(ctx, ax + 44, by, ax + 44, by + g * k, C.weight, 4);
        text(ctx, 'mg', ax + 54, by + g * k, { size: 13, color: C.weight });
        if (s.held && Math.abs(s.hand) > 0.3) {
          arrow(ctx, L.cx, by + L.R + 4, L.cx, by + L.R + 4 + s.hand * k, C.hand, 5);
          text(ctx, '手 ' + fmt(s.hand) + ' N', L.cx - 14, by + L.R + 14 + Math.max(0, s.hand * k) * 0.5, { align: 'right', size: 14, color: C.hand });
        }
        if (!s.held && !s.watch && Math.abs(s.v) < 1e-6) {
          text(ctx, '↓ 按住小球向下拉', L.cx + L.R + 12, by + L.R + 26, { size: 13, color: C.muted, weight: 700 });
        }
        if (opt.extraDraw) opt.extraDraw(ctx, W, H, s, L, by);

        drawBars(ctx, W - L.RW + 8, 16, L.RW - 24, H - 32, [
          { label: '形变量\nx', value: s.y, max: P.HANG[kind].yMax, text: opt.xText(s.y), color: C.navy },
          { label: '弹力\n' + opt.forceSym, value: T, max: 50, text: fmt(T) + ' N', color: C.tension, marks: [{ v: 10, label: 'mg', color: C.weight }] },
          { label: '手的\n拉力', value: s.hand, max: 50, text: fmt(s.hand) + ' N', color: C.hand }
        ]);
      },
      metrics(s) {
        const a = s.a;
        return [
          [opt.xName, opt.xText(s.y)],
          [opt.forceName, fmt(P.hangForce(s)) + ' N'],
          ['手的拉力', (s.held ? fmt(s.hand) : '0.0') + ' N'],
          ['小球的加速度', Math.abs(a) < 0.05 ? '0' : fmt(Math.abs(a)) + ' m/s² ' + (a > 0 ? '向下' : '向上')]
        ];
      },
      status(s) {
        if (s.held) return ['手握住', 'hold'];
        if (Math.abs(s.v) > (kind === 'rigid' ? 1e-5 : 5e-3)) return ['运动中', 'move'];
        return ['静止', 'still'];
      },
      pointerDown(s, x, y) {
        const L = this.layout(app.W, app.H);
        const by = this.ballY(s, L);
        if (Math.hypot(x - L.cx, y - by) > L.R + 26) return false;
        s.held = true;
        s.target = s.y;
        s.watch = null;
        app.drag = { off: y - by };
        say('手握住小球：向下拉，钢丝/弹簧伸长，弹力增大。', null);
        return true;
      },
      pointerMove(s, x, y) {
        const L = this.layout(app.W, app.H);
        const by = y - app.drag.off;
        s.target = clamp((by - L.R - L.ceil - L.L0px) / L.ext, s.yMin, s.yMax);
      },
      pointerUp(s) { this.release(s); }
    };
  }
  function this_release(s) { scene().release(s); }

  function fmtTime(t) {
    if (t <= 0) return '0';
    if (t < 1e-3) return (t * 1e6).toFixed(0) + ' μs';
    if (t < 1) return (t * 1e3).toFixed(1) + ' ms';
    return t.toFixed(2) + ' s';
  }

  function readoutWidth(W) {
    return clamp(W * 0.27, 190, 270);
  }

  const rigidScene = makeHangScene('rigid', {
    title: '硬物体的弹力 · 钢丝悬挂小球',
    subtitle: '钢丝长 1 m、直径 1 mm，k ≈ 1.6×10⁵ N/m。它的形变只有几十微米，图中放大 2000 倍显示。',
    forceName: '钢丝的拉力', forceSym: 'T', xName: '钢丝伸长量',
    connector: 'wire', L0: 1, mag: 2000, maxPpm: 250, demoF: 40,
    magNote: '形变放大 2000 倍',
    graphNote: '松手时钢丝拉力几毫秒内就回到 mg：在 ×1 速度下是一条竖直线（突变）。调到 ×1/1000 能看到变化过程。',
    xText: (y) => (y < 0 ? '松弛 ' : '') + fmt(Math.abs(y) * 1e6) + ' μm',
    onRelease(s, w) {
      say('松手瞬间：手的拉力 ' + fmt(w.hand0) + ' N → 0，钢丝拉力开始从 ' + fmt(w.T0) + ' N 回到 mg……', null);
    },
    onSettle(s, w) {
      const dx = Math.abs(w.T0 - g) / s.k * 1e6;
      say('钢丝拉力 ' + fmt(w.T0) + ' N → 约 10 N，只用了 ' + fmtTime(w.dur) + '（小球只需移动 ' + fmt(dx, 0) + ' μm）。',
        '松手瞬间手的拉力突变为 0；钢丝的拉力在 ' + fmtTime(w.dur) + ' 内就回到 mg，比我们观察的时间短得多，所以看作“突变”。');
    }
  });

  const springScene = makeHangScene('spring', {
    title: '弹簧的弹力 · 弹簧悬挂小球',
    subtitle: '弹簧 k = 50 N/m，小球 1 kg。同样是 F = kx，但要改变弹力，小球必须移动几十厘米。',
    forceName: '弹簧的弹力', forceSym: 'F弹', xName: '弹簧伸长量',
    connector: 'coil', turns: 14, L0: 0.5, mag: 1, maxPpm: 260, demoF: 25,
    graphNote: '松手瞬间手的拉力突变为 0，弹簧弹力的曲线却是连续的：它只随小球的位置慢慢变化。',
    xText: (y) => (y < 0 ? '压缩 ' : '') + fmt(Math.abs(y) * 100) + ' cm',
    onRelease(s, w) {
      const a = (w.T0 - g) / s.m;
      const dx = Math.abs(w.T0 - g) / s.k * 100;
      say('松手瞬间：手的拉力 ' + fmt(w.hand0) + ' N → 0；弹簧弹力仍是 ' + fmt(w.T0) + ' N。',
        '松手瞬间弹簧弹力没有变（' + fmt(w.T0) + ' N），小球的加速度却突变为 ' + fmt(Math.abs(a)) + ' m/s² ' + (a > 0 ? '向上' : '向下') +
        '。弹力要回到 10 N，小球得先移动 ' + fmt(dx) + ' cm，这需要时间。');
    }
  });

  // ---------------------------------------------------------------- 摩擦力（宏观）
  const BW = 0.3, BH = 0.2;
  const frictionScene = {
    title: '摩擦力 · 用测力计拉水平面上的物块',
    subtitle: '物块 1 kg，最大静摩擦力 5 N，滑动摩擦力 3.5 N。拖动“手”拉测力计，或点“匀速拉动”。',
    hint: '左右拖动“手”（橙色圆点），拉或推测力计。',
    dt: P.FRICTION.dt,
    rate: 1,
    window: 8,
    slowFactor: 1,
    legend: [['拉力 F', C.hand], ['摩擦力 f', C.friction]],
    graph: {
      title: '拉力和摩擦力的大小随时间的变化',
      note: '静摩擦力随拉力一起变；到 5 N 物块开始滑动，摩擦力立即变为 3.5 N（静→动 突变）；物块停下时又变回静摩擦力（动→静 突变）。',
      series: [
        { label: '拉力 F', color: C.hand, get: (s) => Math.abs(s.F) },
        { label: '摩擦力 f', color: C.friction, get: (s) => Math.abs(s.f) }
      ],
      yMin: 0, yMax: 8, unit: 'N',
      refs: [{ v: 5, label: '最大静摩擦 5 N', color: '#9b2c2c' }, { v: 3.5, label: '滑动摩擦 3.5 N', color: C.muted }]
    },
    create() {
      const s = P.createFriction();
      s.cam = 0;
      s.evIdx = 0;
      return s;
    },
    step(s, dt) {
      P.stepFriction(s, dt);
    },
    events(s) {
      while (s.evIdx < s.events.length) {
        const e = s.events[s.evIdx++];
        if (e.type === 'static-kinetic') {
          say('拉力超过 5 N：物块开始滑动，摩擦力 ' + fmt(Math.abs(e.from)) + ' N → ' + fmt(Math.abs(e.to)) + ' N。',
            '静→动 突变：静摩擦力达到最大值 ' + fmt(Math.abs(e.from)) + ' N 后，物块一滑动，摩擦力立即变成滑动摩擦力 ' + fmt(Math.abs(e.to)) + ' N。');
        } else if (e.type === 'kinetic-static') {
          say('物块停下：摩擦力 ' + fmt(Math.abs(e.from)) + ' N → ' + fmt(Math.abs(e.to)) + ' N（静摩擦力）。',
            '动→静 突变：物块停下的瞬间，滑动摩擦力 ' + fmt(Math.abs(e.from)) + ' N 变为与拉力平衡的静摩擦力 ' + fmt(Math.abs(e.to)) + ' N。');
        } else if (e.type === 'release') {
          say('松手：拉力消失，静摩擦力 ' + fmt(Math.abs(e.from)) + ' N → 0。',
            '静摩擦力随拉力突变：拉力一撤去，物块不再有相对运动趋势，静摩擦力立即变为 0。');
        }
      }
    },
    actionA: {
      label: (s) => (s.auto ? '停止拉动' : '匀速拉动'),
      run(s) {
        if (!s.attached) { s.attached = true; s.H = s.X + s.L0; }
        s.auto = s.auto ? 0 : 0.1;
        if (s.auto) say('手以 10 cm/s 匀速向右运动，测力计伸长，拉力逐渐增大。', null);
      }
    },
    actionB: {
      label: (s) => (s.attached ? '松手' : '重新拉住'),
      run(s) {
        if (s.attached) P.releaseFriction(s);
        else { s.attached = true; s.H = s.X + s.L0; say('手重新拉住测力计。', null); }
      }
    },
    layout(W, H, s) {
      const RW = readoutWidth(W);
      const sw = W - RW;
      const ppm = Math.min(320, (sw - 80) / 1.3);
      const floorY = H * 0.62;
      const ox = 50;
      return { RW, sw, ppm, floorY, ox };
    },
    sx(s, L, xw) { return L.ox + (xw - s.cam) * L.ppm; },
    draw(ctx, W, H, s) {
      const L = this.layout(W, H, s);
      // 相机跟随物块
      const bx = this.sx(s, L, s.X);
      if (bx > L.sw * 0.42) s.cam = s.X - (L.sw * 0.42 - L.ox) / L.ppm;
      if (bx < L.ox) s.cam = s.X;
      const sx = (xw) => this.sx(s, L, xw);
      // 地面
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, L.sw, H);
      ctx.clip();
      ctx.fillStyle = '#e9edf2';
      ctx.fillRect(0, L.floorY, L.sw, H - L.floorY);
      ctx.strokeStyle = '#3c4656';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, L.floorY);
      ctx.lineTo(L.sw, L.floorY);
      ctx.stroke();
      ctx.strokeStyle = '#a3afbf';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const off = (s.cam * L.ppm) % 16;
      for (let x = -off; x < L.sw + 16; x += 16) { ctx.moveTo(x, L.floorY + 2); ctx.lineTo(x - 10, L.floorY + 14); }
      ctx.stroke();
      text(ctx, '粗糙水平面', 12, L.floorY + 30, { size: 12, color: C.muted });
      // 位置刻度（每 10 cm）
      for (let m = Math.floor(s.cam * 10) / 10; m < s.cam + L.sw / L.ppm; m += 0.1) {
        const x = sx(m);
        ctx.fillStyle = '#b3bdca';
        ctx.fillRect(x, L.floorY + 40, 1, 8);
      }
      // 物块
      const bw = BW * L.ppm, bh = BH * L.ppm;
      const x0 = sx(s.X), yTop = L.floorY - bh;
      ctx.fillStyle = s.stuck ? '#9fb3c8' : '#c7a6a6';
      ctx.strokeStyle = '#4b5b6e';
      ctx.lineWidth = 2;
      roundRect(ctx, x0, yTop, bw, bh, 4);
      ctx.fill();
      ctx.stroke();
      text(ctx, 'm = 1 kg', x0 + bw / 2, yTop + bh / 2, { align: 'center', size: 14, color: '#2b3a4c' });
      // 测力计
      const gy = yTop + bh * 0.45;
      const gx1 = x0 + bw;
      const handX = s.attached ? sx(s.H + BW) : sx(s.X + BW + s.L0);
      const ext = s.attached ? s.H - s.X - s.L0 : 0;
      hCoil(ctx, gx1, handX, gy, 10, 9, strainColor(ext / 0.3), 2.4);
      drawHand(ctx, s.attached ? handX : handX + 18, s.attached ? gy : gy - 34, s.attached);
      // 力的箭头（24 px/N）
      const k = 24;
      if (Math.abs(s.F) > 0.02) {
        arrow(ctx, handX + (s.F > 0 ? 18 : -18), gy, handX + (s.F > 0 ? 18 : -18) + s.F * k, gy, C.hand, 4);
        text(ctx, '拉力 F = ' + fmt(Math.abs(s.F), 2) + ' N', handX + 18, gy - 30, { size: 14, color: C.hand });
      }
      if (Math.abs(s.f) > 0.02) {
        const fx = x0 + bw / 2;
        arrow(ctx, fx, L.floorY - 6, fx + s.f * k, L.floorY - 6, C.friction, 4);
        text(ctx, (s.stuck ? '静摩擦力 ' : '滑动摩擦力 ') + fmt(Math.abs(s.f), 2) + ' N', fx, L.floorY + 64, { align: 'center', size: 14, color: C.friction, bg: 'rgba(255,255,255,0.85)' });
      }
      text(ctx, s.stuck ? '静止' : '滑动 v = ' + fmt(Math.abs(s.V) * 100) + ' cm/s', x0 + bw / 2, yTop - 18, { align: 'center', size: 13, color: s.stuck ? C.green : C.friction });
      if (!s.auto && Math.abs(s.F) < 0.02 && s.attached) text(ctx, '← 拖动“手” →', handX, gy + 36, { align: 'center', size: 13, color: C.muted });
      ctx.restore();
      drawBars(ctx, W - L.RW + 8, 16, L.RW - 24, H - 32, [
        { label: '测力计\n伸长量', value: ext, max: 0.4, text: fmt(ext * 100) + ' cm', color: C.navy },
        { label: '拉力\nF', value: s.F, max: 8, text: fmt(Math.abs(s.F), 2), color: C.hand },
        { label: (s.stuck ? '静' : '滑动') + '摩擦\n力 f', value: s.f, max: 8, text: fmt(Math.abs(s.f), 2), color: C.friction, marks: [{ v: 5, label: '5', color: '#9b2c2c' }, { v: 3.5, label: '3.5', color: C.muted }] }
      ]);
    },
    metrics(s) {
      const ext = s.attached ? s.H - s.X - s.L0 : 0;
      return [
        ['测力计伸长量', (ext < 0 ? '压缩 ' : '') + fmt(Math.abs(ext) * 100) + ' cm'],
        ['拉力 F', fmt(Math.abs(s.F), 2) + ' N'],
        [s.stuck ? '静摩擦力 f' : '滑动摩擦力 f', fmt(Math.abs(s.f), 2) + ' N'],
        ['物块速度', fmt(Math.abs(s.V) * 100) + ' cm/s']
      ];
    },
    status(s) { return s.stuck ? ['静止', 'still'] : ['滑动', 'slide']; },
    pointerDown(s, x, y) {
      const L = this.layout(app.W, app.H, s);
      const bh = BH * L.ppm;
      const gy = L.floorY - bh + bh * 0.45;
      const hx = s.attached ? this.sx(s, L, s.H + BW) : this.sx(s, L, s.X + BW + s.L0);
      if (Math.hypot(x - hx, y - gy) > 46 && !(Math.abs(y - gy) < 60 && x > hx - 10)) return false;
      if (!s.attached) { s.attached = true; s.H = s.X + s.L0; }
      s.auto = 0;
      app.drag = { x0: x, H0: s.H, ppm: L.ppm };
      return true;
    },
    pointerMove(s, x) {
      const H = app.drag.H0 + (x - app.drag.x0) / app.drag.ppm;
      s.H = clamp(H, s.X + s.L0 - 0.2, s.X + s.L0 + 0.48);
    },
    pointerUp() {}
  };

  // ---------------------------------------------------------------- 微观 1：原子链
  const MAG_CHAIN = 12;
  const chainScene = {
    title: '微观 · 原子链：硬物体的弹力',
    subtitle: '固体中原子之间的作用像很硬的弹簧。拉动右端的原子：形变从右往左一个原子一个原子地传过去。原子位移放大 12 倍显示。',
    hint: '按住最右边的原子（手）左右拖动，然后松手。',
    dt: P.CHAIN.dt,
    rate: 14, // 每秒 14 个时间单位 ≈ 1 ps：放慢约 10¹² 倍
    window: 70,
    legend: [['伸长（受拉）', C.friction], ['压缩', C.tension]],
    graph: {
      title: '手端和墙端受到的力',
      note: '手端的力一变，墙端要过约 0.8 ps 才跟着变：这就是力在原子间的传递时间。宏观上 1 m 长的钢丝也只需约 0.2 ms。',
      series: [
        { label: '手端的力', color: C.hand, get: (s) => P.bondStrain(s, s.n) * P.CHAIN.forceUnit_pN },
        { label: '墙端的力', color: C.tension, get: (s) => P.bondStrain(s, 1) * P.CHAIN.forceUnit_pN }
      ],
      yMin: -60, yMax: 110, unit: 'pN',
      refs: []
    },
    timeLabel: (t) => (t * P.CHAIN.timeUnit_ps).toFixed(2) + ' ps',
    create() {
      const s = P.createChain();
      s.jerk = null;
      return s;
    },
    step(s, dt) {
      P.stepChain(s, dt);
      const j = s.jerk;
      if (j && !j.done) {
        const e = j.e;
        if (j.tHand === null && P.bondStrain(s, s.n) >= 0.5 * e) j.tHand = s.t;
        if (j.tWall === null && P.bondStrain(s, 1) >= 0.5 * e) j.tWall = s.t;
        if (j.tHand !== null && j.tWall !== null) {
          j.done = true;
          const d = (j.tWall - j.tHand) * P.CHAIN.timeUnit_ps;
          say('手端受力后，墙端过了约 ' + d.toFixed(2) + ' ps 才受到同样大小的力。',
            '力靠原子间距的改变一个接一个传过去，速度就是声速。' + s.n + ' 个原子用了约 ' + d.toFixed(2) + ' ps；1 m 长的钢丝约 0.2 ms——所以宏观上看硬物体的弹力几乎是“同时”变化的。');
        }
      }
    },
    actionA: {
      label: () => '猛拉一下',
      run(s) {
        s.held = true;
        s.target = s.n + 0.12;
        s.jerk = { e: 0.12 / s.n, tHand: null, tWall: null, done: false };
        say('手突然向右拉……看形变从右往左传。', null);
      }
    },
    actionB: {
      label: () => '松手',
      run(s) { if (s.held) { s.held = false; say('松手：右端原子自由了，拉伸的形变向左传回并来回振荡，逐渐消失。', null); } }
    },
    layout(W, H, s) {
      const RW = readoutWidth(W);
      const sw = W - RW;
      const x0 = 64;
      const sp = Math.min(62, (sw - x0 - 60) / (s.n + MAG_CHAIN * 0.2));
      return { RW, sw, x0, sp, ay: H * 0.34, py: H * 0.76 };
    },
    ax(s, L, i) { return L.x0 + i * L.sp + (s.x[i] - i) * L.sp * MAG_CHAIN; },
    draw(ctx, W, H, s) {
      const L = this.layout(W, H, s);
      hatch(ctx, L.x0 - 20, L.ay - 70, L.x0 - 20, L.ay + 70, 'left');
      text(ctx, '墙', L.x0 - 40, L.ay - 84, { size: 13, color: C.muted });
      ctx.save();
      ctx.strokeStyle = '#3c4656';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(L.x0 - 20, L.ay);
      ctx.lineTo(this.ax(s, L, 0), L.ay);
      ctx.stroke();
      ctx.restore();
      for (let i = 1; i <= s.n; i++) {
        const e = P.bondStrain(s, i);
        const a = this.ax(s, L, i - 1), b = this.ax(s, L, i);
        const gap = Math.min(11, L.sp * 0.28);
        hCoil(ctx, a + gap, b - gap, L.ay, 3, 6, strainColor(e / 0.012), 2.4 + Math.min(2, Math.abs(e) * 150));
      }
      for (let i = 0; i <= s.n; i++) {
        const x = this.ax(s, L, i);
        ctx.save();
        ctx.fillStyle = i === 0 ? '#3c4656' : '#7f90a6';
        ctx.strokeStyle = '#46566a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, L.ay, Math.min(11, L.sp * 0.28), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      const xn = this.ax(s, L, s.n);
      if (s.held) drawHand(ctx, xn + 32, L.ay, true);
      else text(ctx, '← 拖动 →', xn, L.ay + 32, { align: 'center', size: 12, color: C.muted });
      const F = P.chainForces(s);
      const u = P.CHAIN.forceUnit_pN;
      const k = 1.1;
      if (Math.abs(F.wall * u) > 1) {
        arrow(ctx, L.x0 - 20, L.ay - 40, L.x0 - 20 + F.wall * u * k, L.ay - 40, C.tension, 4);
      }
      text(ctx, '墙端受力 ' + fmt(F.wall * u, 0) + ' pN', L.x0 - 12, L.ay - 58, { size: 13, color: C.tension });
      if (Math.abs(F.hand * u) > 1) arrow(ctx, xn + 14, L.ay + 44, xn + 14 + F.hand * u * k, L.ay + 44, C.hand, 4);
      text(ctx, '手端 ' + fmt(F.hand * u, 0) + ' pN', xn, L.ay + 62, { align: 'center', size: 13, color: C.hand });
      text(ctx, '原子间距 r₀ ≈ 0.25 nm · 位移放大 12 倍', L.x0 - 20, 22, { size: 12, color: C.muted, weight: 600 });

      // 各键的形变分布
      const top = L.py - 58, bot = L.py + 58;
      text(ctx, '每个键的伸长（形变沿原子链的分布）', L.x0 - 20, top - 22, { size: 13, color: C.ink });
      ctx.save();
      ctx.strokeStyle = '#c3ccd8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(L.x0 - 20, L.py);
      ctx.lineTo(this.ax(s, L, 0) + s.n * L.sp + 10, L.py);
      ctx.stroke();
      ctx.restore();
      for (let i = 1; i <= s.n; i++) {
        const e = P.bondStrain(s, i);
        const cx = L.x0 + (i - 0.5) * L.sp;
        const h = clamp(e / 0.015, -1, 1) * (bot - L.py);
        ctx.fillStyle = strainColor(e / 0.012);
        ctx.fillRect(cx - L.sp * 0.3, Math.min(L.py, L.py - h), L.sp * 0.6, Math.abs(h));
      }
      text(ctx, '墙', L.x0 - 20, bot + 16, { size: 12, color: C.muted });
      text(ctx, '手', L.x0 + s.n * L.sp, bot + 16, { size: 12, color: C.muted, align: 'right' });

      const dL = (s.x[s.n] - s.n) * 250;
      drawBars(ctx, W - L.RW + 8, 16, L.RW - 24, H - 32, [
        { label: '总伸长\nΔL', value: dL, max: 50, text: fmt(dL, 0) + ' pm', color: C.navy },
        { label: '手端\n的力', value: F.hand * u, max: 100, text: fmt(F.hand * u, 0), color: C.hand },
        { label: '墙端\n的力', value: F.wall * u, max: 100, text: fmt(F.wall * u, 0), color: C.tension }
      ]);
    },
    metrics(s) {
      const F = P.chainForces(s);
      const u = P.CHAIN.forceUnit_pN;
      const dL = (s.x[s.n] - s.n) * 250;
      return [
        ['总伸长 ΔL', fmt(dL, 1) + ' pm'],
        ['平均每个键伸长', fmt(dL / s.n, 2) + ' pm（' + fmt(dL / s.n / 250 * 100, 2) + '%）'],
        ['手端的力', fmt(F.hand * u, 0) + ' pN'],
        ['墙端的力', fmt(F.wall * u, 0) + ' pN']
      ];
    },
    status(s) { return s.held ? ['手拉住', 'hold'] : ['自由端', 'move']; },
    pointerDown(s, x, y) {
      const L = this.layout(app.W, app.H, s);
      const xn = this.ax(s, L, s.n);
      if (Math.hypot(x - xn, y - L.ay) > 40 && Math.hypot(x - xn - 32, y - L.ay) > 30) return false;
      s.held = true;
      s.target = s.x[s.n];
      s.jerk = null;
      app.drag = { x0: x, T0: s.x[s.n], k: L.sp * MAG_CHAIN };
      return true;
    },
    pointerMove(s, x) {
      s.target = clamp(app.drag.T0 + (x - app.drag.x0) / app.drag.k, s.n - 0.12, s.n + 0.2);
    },
    pointerUp(s) {
      s.held = false;
      say('松手：右端原子自由了，形变向左传回并来回振荡，逐渐消失。', null);
    }
  };

  // ---------------------------------------------------------------- 微观 2：螺旋钢丝
  const MAG_LATTICE = 18;
  const coilScene = makeHangScene('microSpring', {
    title: '微观 · 弹簧：螺旋形的钢丝',
    subtitle: '弹簧也是钢丝，原子间的形变同样很小；螺旋的形状把钢丝的微小扭转放大成了几十厘米的伸长。放大镜里原子层的错开放大 18 倍显示。',
    forceName: '弹簧的弹力', forceSym: 'F弹', xName: '弹簧伸长量',
    connector: 'coil', turns: 12, L0: 0.5, mag: 1, maxPpm: 300, demoF: 15,
    graphNote: '弹簧弹力只随伸长量连续变化。',
    xText: (y) => (y < 0 ? '压缩 ' : '') + fmt(Math.abs(y) * 100) + ' cm',
    onRelease(s, w) {
      say('松手瞬间弹簧弹力仍是 ' + fmt(w.T0) + ' N；钢丝里原子的形变也没来得及变。',
        '弹簧伸长 ' + fmt(Math.abs(w.T0) / s.k * 100) + ' cm 时，钢丝内部原子层只错开了 ' + fmt(P.wireShear(Math.abs(w.T0)) * 100, 2) + '%。形变要变，小球得先移动几十厘米，所以弹力不能突变。');
    },
    extraDraw(ctx, W, H, s, L, by) {
      // 放大镜：钢丝内部原子层的剪切
      const F = P.hangForce(s);
      const gamma = P.wireShear(F);
      const r = Math.min(110, (L.sw - L.cx - 150) * 0.5, H * 0.26);
      if (r < 50) return;
      const cx = L.sw - r - 8, cy = H * 0.34;
      const px = L.cx + 16, py = (L.ceil + by - L.R) / 2;
      ctx.save();
      ctx.strokeStyle = '#9aa7b8';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 10, 0, Math.PI * 2);
      ctx.moveTo(px + 10, py);
      ctx.lineTo(cx - r, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.clip();
      const sp = r / 3.2;
      const shift = gamma * MAG_LATTICE * sp;
      const pos = (i, j) => [cx + (i - 3) * sp + (j - 3) * shift, cy + (j - 3) * sp];
      for (let j = 0; j <= 6; j++) {
        for (let i = 0; i <= 6; i++) {
          const [x, y] = pos(i, j);
          if (i < 6) {
            const [x2, y2] = pos(i + 1, j);
            ctx.strokeStyle = '#c3ccd8';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
          }
          if (j < 6) {
            const [x2, y2] = pos(i, j + 1);
            ctx.strokeStyle = strainColor(Math.abs(gamma) / 0.012);
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
          }
        }
      }
      for (let j = 0; j <= 6; j++) for (let i = 0; i <= 6; i++) {
        const [x, y] = pos(i, j);
        ctx.fillStyle = '#7f90a6';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = '#46566a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      text(ctx, '钢丝内部（放大镜）', cx, cy - r - 14, { align: 'center', size: 13, color: C.ink });
      text(ctx, '原子层错开 γ = ' + fmt(gamma * 100, 2) + '%', cx, cy + r + 18, { align: 'center', size: 14, color: C.friction, weight: 800 });
      text(ctx, '（图中放大 18 倍）', cx, cy + r + 38, { align: 'center', size: 12, color: C.muted, weight: 600 });
    }
  });
  coilScene.layout = function (W, H) {
    const RW = readoutWidth(W);
    const sw = W - RW;
    const cx = sw * 0.3;
    const ceil = 44, R = 24;
    const room = H - ceil - 2 * R - 80;
    const ppm = Math.min(300, room / (0.5 + P.HANG.microSpring.yMax));
    return { RW, sw, cx, ceil, R, ppm, L0px: 0.5 * ppm, ext: ppm };
  };
  coilScene.metrics = function (s) {
    const F = P.hangForce(s);
    const gamma = P.wireShear(F);
    return [
      ['弹簧伸长量', (s.y < 0 ? '压缩 ' : '') + fmt(Math.abs(s.y) * 100) + ' cm'],
      ['弹簧的弹力', fmt(F) + ' N'],
      ['钢丝内原子层错开', fmt(Math.abs(gamma) * 100, 2) + '%'],
      ['相邻原子层错开距离', fmt(Math.abs(gamma) * 250, 2) + ' pm']
    ];
  };
  coilScene.hint = '按住小球上下拖动，看放大镜里原子层的错开有多小。';
  coilScene.actionA = {
    label: () => '拉到 15 N 后松手',
    run(s) {
      s.held = true;
      s.y = s.target = 15 / s.k;
      s.v = 0; s.a = 0; s.hand = 5;
      s.watch = null;
      clearTimeout(app.demoTimer);
      app.demoTimer = setTimeout(() => { if (sim() === s) coilScene.release(s); }, 700);
    }
  };

  // ---------------------------------------------------------------- 微观 3：接触点
  const contactsScene = {
    title: '微观 · 接触点：摩擦力从哪里来',
    subtitle: '两个表面只在少数凸起处真正接触，接触处的原子结合在一起。物块稍一移动（不到 1 μm），接触点就被剪切，产生静摩擦力。',
    hint: '在画面上按住左右拖动（相当于手拉测力计），或点“匀速拉动”。',
    dt: P.MF.dt,
    rate: 1,
    window: 5,
    slowFactor: 1 / 200,
    legend: [['接触点形变小', '#16a34a'], ['接近断开', '#d64545']],
    graph: {
      title: '拉力和摩擦力的大小随时间的变化',
      note: '拉力增大时接触点被拉得越来越斜；最弱的先断，负担转给其他接触点，接着成片断开，物块滑动，摩擦力突然减小。滑动中接触点边断边结合，形变参差不齐，平均摩擦力较小。',
      series: [
        { label: '拉力 F', color: C.hand, get: (s) => Math.abs(s.F) },
        { label: '摩擦力 f', color: C.friction, get: (s) => Math.abs(s.f) }
      ],
      yMin: 0, yMax: 7, unit: 'N',
      refs: []
    },
    create() {
      const s = P.createContacts();
      s.flash = new Array(s.junctions.length).fill(0);
      s.prevOn = s.junctions.map((j) => j.on);
      s.slip = null;
      s.stickMax = 0;
      s.calm = 0;
      return s;
    },
    step(s, dt) {
      P.stepContacts(s, dt);
      const f = Math.abs(s.f);
      const moving = Math.abs(s.V) > 300;
      if (!s.slip) {
        s.stickMax = Math.max(s.stickMax, f);
        if (moving) s.slip = { peak: s.stickMax, sum: 0, n: 0, bondedMin: s.bonded };
      } else {
        if (moving) { s.slip.sum += f; s.slip.n++; s.slip.bondedMin = Math.min(s.slip.bondedMin, s.bonded); s.calm = 0; }
        else if ((s.calm += dt) > 0.003) {
          const sl = s.slip;
          const avg = sl.n ? sl.sum / sl.n : f;
          say('刚才：最大静摩擦力约 ' + fmt(sl.peak, 2) + ' N → 滑动时平均约 ' + fmt(avg, 2) + ' N → 停下后又变为静摩擦力 ' + fmt(f, 2) + ' N。',
            '接触点成片断开时物块开始滑动（静→动）；滑动中接触点边断边结合，被拉伸的程度参差不齐，平均摩擦力只有约 ' + fmt(avg, 2) + ' N，比最大静摩擦力 ' + fmt(sl.peak, 2) + ' N 小。');
          s.slip = null;
          s.stickMax = f;
        }
      }
    },
    slowing(s) { return Math.abs(s.V) > 150 || (s.slip && s.calm < 0.003); },
    actionA: {
      label: (s) => (s.auto ? '停止拉动' : '匀速拉动'),
      run(s) {
        if (!s.attached) { s.attached = true; s.H = s.X; }
        s.auto = s.auto ? 0 : P.MF.handSpeed;
        if (s.auto) say('手匀速拉测力计，拉力慢慢增大，接触点被越拉越斜。', null);
      }
    },
    actionB: {
      label: (s) => (s.attached ? '松手' : '重新拉住'),
      run(s) {
        if (s.attached) {
          const before = Math.abs(s.f);
          s.attached = false; s.auto = 0;
          say('松手：拉力消失，接触点弹回，静摩擦力 ' + fmt(before, 2) + ' N 很快变为 0。',
            '静摩擦力由接触点的弹性形变提供。形变只有零点几微米，恢复得极快，所以静摩擦力能随拉力突变。');
        } else { s.attached = true; s.H = s.X; }
      }
    },
    layout(W, H) {
      const RW = readoutWidth(W);
      const sw = W - RW;
      const spx = sw / 44;
      return { RW, sw, spx, yI: H * 0.5 };
    },
    draw(ctx, W, H, s) {
      const L = this.layout(W, H);
      const left = s.X - 2; // 屏幕左边缘对应的世界坐标（μm）
      const sx = (w) => (w - left) * L.spx;
      const yI = L.yI;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, L.sw, H);
      ctx.clip();
      // 下表面（固定）
      const low = (w) => yI + 18 + 5 * Math.sin(w * 1.3) + 4 * Math.sin(w * 3.7 + 1) + 2 * Math.sin(w * 7.1);
      ctx.fillStyle = '#d7dde5';
      ctx.beginPath();
      ctx.moveTo(0, H - 40);
      for (let x = 0; x <= L.sw; x += 3) ctx.lineTo(x, low(left + x / L.spx));
      ctx.lineTo(L.sw, H - 40);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#6b7a8d';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      text(ctx, '桌面（固定）', 12, H - 58, { size: 12, color: C.muted });
      // 上表面（物块）
      const us = s.junctions.map((j) => j.u);
      const up = (b) => {
        const bb = ((b % 40) + 40) % 40;
        let d = 9;
        for (const u of us) d = Math.min(d, Math.abs(bb - u), Math.abs(bb - u + 40), Math.abs(bb - u - 40));
        const tip = Math.max(0, 1 - d / 0.55);
        return yI - 20 - 4 * Math.sin(b * 2.1) - 3 * Math.sin(b * 5.3 + 2) + 16 * tip;
      };
      ctx.fillStyle = s.attached ? '#9fb3c8' : '#aebfd0';
      ctx.beginPath();
      ctx.moveTo(0, 24);
      for (let x = 0; x <= L.sw; x += 3) ctx.lineTo(x, up(x / L.spx - 2));
      ctx.lineTo(L.sw, 24);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#4b5b6e';
      ctx.stroke();
      text(ctx, '物块的下表面', 12, 44, { size: 12, color: '#2b3a4c' });
      // 接触点
      s.junctions.forEach((j, i) => {
        const xu = sx(s.X + j.u);
        if (j.on) {
          const z = P.strainOf(s, j);
          const r = Math.abs(z) / j.zc;
          const xa = sx(j.a);
          ctx.save();
          ctx.strokeStyle = contactColor(r);
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(xu, yI - 5);
          ctx.lineTo(xa, yI + 7);
          ctx.stroke();
          ctx.fillStyle = '#3c4656';
          ctx.beginPath(); ctx.arc(xu, yI - 5, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(xa, yI + 7, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } else {
          ctx.save();
          ctx.strokeStyle = '#b8c2d0';
          ctx.setLineDash([2, 3]);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(xu, yI - 5); ctx.lineTo(xu, yI + 7); ctx.stroke();
          ctx.restore();
        }
        if (s.flash[i] > 0) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, s.flash[i] / 0.3);
          ctx.strokeStyle = C.friction;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(xu - 7, yI - 7); ctx.lineTo(xu + 7, yI + 7);
          ctx.moveTo(xu + 7, yI - 7); ctx.lineTo(xu - 7, yI + 7);
          ctx.stroke();
          ctx.restore();
        }
      });
      // 比例尺
      ctx.fillStyle = C.ink;
      ctx.fillRect(16, H - 22, 5 * L.spx, 3);
      text(ctx, '5 μm', 16 + 5 * L.spx + 8, H - 20, { size: 12, color: C.ink });
      // 力
      const k = 22;
      const ay = 90;
      if (Math.abs(s.F) > 0.02) {
        arrow(ctx, L.sw - 30 - Math.max(0, s.F) * k, ay, L.sw - 30 - Math.max(0, s.F) * k + s.F * k, ay, C.hand, 4);
        text(ctx, '测力计拉力 F = ' + fmt(Math.abs(s.F), 2) + ' N', L.sw - 30, ay - 22, { align: 'right', size: 14, color: C.hand });
      } else text(ctx, s.attached ? '← 按住画面左右拖动 →' : '已松手', L.sw - 30, ay - 22, { align: 'right', size: 13, color: C.muted });
      if (Math.abs(s.f) > 0.02) {
        const fx = L.sw * 0.5;
        arrow(ctx, fx, yI - 44, fx + (s.f > 0 ? 1 : -1) * Math.abs(s.f) * k, yI - 44, C.friction, 4);
        text(ctx, '接触点对物块的摩擦力 ' + fmt(Math.abs(s.f), 2) + ' N', fx, yI - 64, { align: 'center', size: 14, color: C.friction, bg: 'rgba(255,255,255,0.85)' });
      }
      text(ctx, Math.abs(s.V) > 150 ? '滑动中' : '静止（接触点只是被拉斜）', L.sw * 0.5, H - 20, { align: 'center', size: 13, color: Math.abs(s.V) > 150 ? C.friction : C.green });
      ctx.restore();
      const n = s.junctions.length;
      drawBars(ctx, W - L.RW + 8, 16, L.RW - 24, H - 32, [
        { label: '结合的\n接触点', value: s.bonded, max: n, text: s.bonded + '/' + n, color: C.green },
        { label: '拉力\nF', value: s.F, max: 7, text: fmt(Math.abs(s.F), 2), color: C.hand },
        { label: '摩擦力\nf', value: s.f, max: 7, text: fmt(Math.abs(s.f), 2), color: C.friction }
      ]);
    },
    metrics(s) {
      return [
        ['结合的接触点', s.bonded + ' / ' + s.junctions.length],
        ['拉力 F', fmt(Math.abs(s.F), 2) + ' N'],
        ['摩擦力 f', fmt(Math.abs(s.f), 2) + ' N'],
        ['物块位移', fmt(s.X, 2) + ' μm']
      ];
    },
    status(s) { return Math.abs(s.V) > 150 ? ['滑动', 'slide'] : ['静止', 'still']; },
    pointerDown(s, x) {
      const L = this.layout(app.W, app.H);
      if (!s.attached) { s.attached = true; s.H = s.X; }
      s.auto = 0;
      app.drag = { x0: x, H0: s.H, spx: L.spx };
      return true;
    },
    pointerMove(s, x) {
      s.H = clamp(app.drag.H0 + (x - app.drag.x0) / app.drag.spx, s.X - 8, s.X + 14);
    },
    pointerUp() {}
  };

  const SCENES = { rigid: rigidScene, spring: springScene, friction: frictionScene, chain: chainScene, coil: coilScene, contacts: contactsScene };

  // ---------------------------------------------------------------- UI
  function speedFactor() { return SPEEDS[app.speed]; }

  function resetRecorder() {
    const sc = scene();
    app.rec = makeRecorder(sc.graph.series.length, sc.window * speedFactor());
    app.acc = 0;
  }

  function resetSim() {
    clearTimeout(app.demoTimer);
    app.sims[key()] = scene().create();
    resetRecorder();
    const sc = scene();
    say(sc.hint, '拖动或点按钮开始。');
  }

  function applyScene() {
    const sc = scene();
    if (!app.sims[key()]) app.sims[key()] = sc.create();
    els.modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === app.mode));
    els.subButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === app.view));
    els.microTabs.hidden = app.mode !== 'micro';
    els.stageTitle.textContent = sc.title;
    els.stageSubtitle.textContent = sc.subtitle;
    els.dragHint.textContent = sc.hint;
    els.graphTitle.textContent = sc.graph.title;
    els.graphNote.textContent = sc.graph.note;
    els.legend.innerHTML = sc.legend.map(([t, c]) => '<span><i style="background:' + c + '"></i>' + t + '</span>').join('');
    els.graphLegend.innerHTML = sc.graph.series.map((s) => '<span><i style="background:' + s.color + '"></i>' + s.label + '</span>').join('');
    els.autoSlowRow.hidden = !sc.slowing;
    els.actionB.hidden = !sc.actionB;
    els.actionB.parentElement.classList.toggle('single', !sc.actionB);
    const s = sim();
    s.metricsInit = true;
    resetRecorder();
    say(sc.hint, '拖动或点按钮开始。');
    updateSpeedUI();
    resize();
  }

  function updateSpeedUI() {
    const f = speedFactor();
    els.speedValue.textContent = f === 1 ? '×1' : '×1/' + Math.round(1 / f);
    const k = key();
    let t;
    if (k === 'chain') t = '已放慢约 ' + ['10¹²', '10¹³', '10¹⁴', '10¹⁵'][app.speed] + ' 倍';
    else t = f === 1 ? '正常速度' : '慢放 ' + Math.round(1 / f) + ' 倍';
    if (app.slowActive) t = '自动慢放 200 倍';
    els.speedPill.textContent = app.paused ? '已暂停' : t;
    els.speedPill.className = 'status-pill ' + (app.slowActive ? 'slow' : 'neutral');
  }

  els.modeButtons.forEach((b) => b.addEventListener('click', () => { app.mode = b.dataset.mode; applyScene(); }));
  els.subButtons.forEach((b) => b.addEventListener('click', () => { app.view = b.dataset.view; applyScene(); }));
  els.actionA.addEventListener('click', () => { const sc = scene(); sc.actionA.run.call(sc.actionA, sim()); });
  els.actionB.addEventListener('click', () => { const sc = scene(); if (sc.actionB) sc.actionB.run.call(sc.actionB, sim()); });
  els.resetButton.addEventListener('click', resetSim);
  els.pauseButton.addEventListener('click', togglePause);
  els.speedInput.addEventListener('input', () => { app.speed = +els.speedInput.value; resetRecorder(); updateSpeedUI(); });

  function togglePause() {
    app.paused = !app.paused;
    els.pauseButton.textContent = app.paused ? '继续' : '暂停';
    updateSpeedUI();
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    const modes = ['rigid', 'spring', 'friction', 'micro'];
    if (e.key >= '1' && e.key <= '4') { app.mode = modes[+e.key - 1]; applyScene(); }
    else if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 'r' || e.key === 'R') resetSim();
    else if (e.key === 's' || e.key === 'S') { app.speed = (app.speed + 1) % 4; els.speedInput.value = app.speed; resetRecorder(); updateSpeedUI(); }
  });

  function canvasPoint(e) {
    const r = stage.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  stage.addEventListener('pointerdown', (e) => {
    const [x, y] = canvasPoint(e);
    const sc = scene();
    if (sc.pointerDown(sim(), x, y)) {
      clearTimeout(app.demoTimer);
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('dragging');
      app.dragging = true;
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!app.dragging) return;
    const [x, y] = canvasPoint(e);
    scene().pointerMove(sim(), x, y);
  });
  function endDrag() {
    if (!app.dragging) return;
    app.dragging = false;
    stage.classList.remove('dragging');
    scene().pointerUp(sim());
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // ---------------------------------------------------------------- canvas sizing
  function fit(canvas, ctx) {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [r.width, r.height];
  }
  function resize() {
    [app.W, app.H] = fit(stage, sctx);
    [app.GW, app.GH] = fit(graph, gctx);
  }
  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------- graph
  function niceStep(range) {
    const raw = range / 5;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }

  function drawGraph() {
    const ctx = gctx, W = app.GW, H = app.GH;
    ctx.clearRect(0, 0, W, H);
    const sc = scene();
    const gr = sc.graph;
    const rec = app.rec;
    const pad = { l: 52, r: 16, t: 14, b: 34 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const y = (v) => pad.t + ph * (1 - (v - gr.yMin) / (gr.yMax - gr.yMin));
    const tEnd = Math.max(rec.window, rec.t);
    const tStart = tEnd - rec.window;
    const x = (t) => pad.l + pw * (t - tStart) / rec.window;
    ctx.save();
    ctx.font = '600 11px Inter, "PingFang SC", sans-serif';
    const step = niceStep(gr.yMax - gr.yMin);
    for (let v = Math.ceil(gr.yMin / step) * step; v <= gr.yMax + 1e-9; v += step) {
      ctx.strokeStyle = Math.abs(v) < 1e-9 ? C.axis : C.grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, y(v)); ctx.lineTo(W - pad.r, y(v)); ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(+v.toFixed(3) + '', pad.l - 6, y(v));
    }
    ctx.textAlign = 'left';
    ctx.fillText(gr.unit, 6, pad.t + 4);
    for (const ref of gr.refs) {
      ctx.strokeStyle = ref.color;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(pad.l, y(ref.v)); ctx.lineTo(W - pad.r, y(ref.v)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ref.color;
      ctx.textAlign = 'right';
      ctx.fillText(ref.label, W - pad.r - 4, y(ref.v) - 8);
    }
    // 时间轴
    const tl = sc.timeLabel || fmtTime;
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) {
      const t = tStart + rec.window * i / 4;
      const px = pad.l + pw * i / 4;
      ctx.strokeStyle = C.grid;
      ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, pad.t + ph); ctx.stroke();
      ctx.fillText(t < 0 ? '' : tl(Math.max(0, t)), px, pad.t + ph + 8);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t - 2, pw, ph + 4);
    ctx.clip();
    for (let si = 0; si < gr.series.length; si++) {
      ctx.strokeStyle = gr.series[si].color;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (const b of rec.buckets) {
        const t0 = b.idx * rec.bd;
        if (t0 < tStart - rec.bd) continue;
        const px = x(t0 + rec.bd / 2);
        const lo = y(b.min[si]), hi = y(b.max[si]), last = y(b.last[si]);
        if (!started) { ctx.moveTo(px, lo); started = true; }
        ctx.lineTo(px, lo);
        ctx.lineTo(px, hi);
        ctx.lineTo(px, last);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  // ---------------------------------------------------------------- loop
  let lastT = performance.now();
  let lastUI = 0;
  function frame(now) {
    const dtReal = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const sc = scene();
    const s = sim();
    if (!app.paused) {
      let f = speedFactor();
      const slow = !!(sc.slowing && els.autoSlow.checked && sc.slowing(s));
      if (slow !== app.slowActive) { app.slowActive = slow; updateSpeedUI(); }
      if (slow) f = Math.min(f, sc.slowFactor);
      app.acc += dtReal * sc.rate * f;
      let count = 0;
      const maxSteps = 6000;
      while (app.acc >= sc.dt && count < maxSteps) {
        sc.step(s, sc.dt);
        record(app.rec, s.t, sc.graph.series.map((q) => q.get(s)));
        app.acc -= sc.dt;
        count++;
      }
      if (count >= maxSteps) app.acc = 0;
      if (sc.events) sc.events(s);
      if (s.flash) {
        s.junctions.forEach((j, i) => {
          if (s.prevOn[i] && !j.on) s.flash[i] = 0.5;
          s.prevOn[i] = j.on;
          s.flash[i] = Math.max(0, s.flash[i] - dtReal);
        });
      }
    }
    sctx.clearRect(0, 0, app.W, app.H);
    sc.draw(sctx, app.W, app.H, s);
    drawGraph();
    if (now - lastUI > 100) {
      lastUI = now;
      sc.metrics(s).forEach(([label, value], i) => {
        els.metricLabels[i].textContent = label;
        els.metricValues[i].textContent = value;
      });
      const [st, cls] = sc.status(s);
      els.statusPill.textContent = st;
      els.statusPill.className = 'status-pill ' + cls;
      els.timeReadout.textContent = 't = ' + (sc.timeLabel || fmtTime)(s.t);
      els.actionA.textContent = sc.actionA.label(s);
      if (sc.actionB) els.actionB.textContent = sc.actionB.label(s);
    }
    requestAnimationFrame(frame);
  }

  applyScene();
  requestAnimationFrame(frame);
})();
