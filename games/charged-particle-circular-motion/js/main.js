'use strict';
// 带电粒子在匀强磁场中的圆周运动：无边界、单边界、双边界、圆形边界。
// 粒子起点在磁场外，靠“场内外受力不同”自然得到直线 → 圆弧 → 直线。
(function () {
    const $ = id => document.getElementById(id);
    const params = { mode: 'none', v0: 4, B: 2, qabs: 1, qsign: 1, m: 1, theta: 30, d: 2, Rm: 1.5, speed: 0.5 };
    const state = { playing: false, t: 0, idx: 0, traj: null, last: 0, done: false };
    const COL = { blue: '#0072B2', orange: '#D55E00', amber: '#B07A00', teal: '#009E73', tealInk: '#007a58', grey: '#777', ink: '#222' };
    const FML = window.FORMULAS || {};
    let VIEW = { scale: 40, cx: 0, oy: 0 };
    let MAXSCALE = 40;

    const TP = p => ({ x: VIEW.cx + p.x * VIEW.scale, y: VIEW.oy - p.y * VIEW.scale });
    const PW = (sx, sy) => ({ x: (sx - VIEW.cx) / VIEW.scale, y: (VIEW.oy - sy) / VIEW.scale });
    function dir(a, b) { const dx = a.x - b.x, dy = a.y - b.y, m = Math.hypot(dx, dy) || 1; return { x: dx / m, y: dy / m }; }
    function rot90(v, sign) { return sign > 0 ? { x: -v.y, y: v.x } : { x: v.y, y: -v.x }; }

    function fieldTest(mode, p, P) {
        if (mode === 'none') return true;
        if (mode === 'single') return p.x >= 0;
        if (mode === 'double') return p.x >= 0 && p.x <= P.d;
        if (mode === 'circle') return (p.x * p.x + p.y * p.y) <= P.Rm * P.Rm;
        return false;
    }

    function simTraj(mode, P) {
        const r = P.m * P.v0 / (P.qabs * P.B), omega = P.qabs * P.B / P.m, T = 2 * Math.PI / omega;
        const dt = 0.008, th = P.theta * Math.PI / 180;
        let pos, vel, vhat0;
        if (mode === 'none') { pos = { x: -r, y: 0 }; vel = { x: 0, y: P.v0 }; vhat0 = { x: 0, y: 1 }; }
        else if (mode === 'circle') { vel = { x: P.v0, y: 0 }; pos = { x: -P.Rm - 2, y: 0 }; vhat0 = { x: 1, y: 0 }; }
        else { vhat0 = { x: Math.sin(th), y: Math.cos(th) }; vel = { x: P.v0 * vhat0.x, y: P.v0 * vhat0.y }; pos = { x: -2 * vhat0.x, y: -2 * vhat0.y }; }
        const start = { x: pos.x, y: pos.y };
        const path = [{ x: pos.x, y: pos.y }];
        let entered = false, exited = false, postSteps = 0, entryIdx = -1, exitIdx = -1, entryPos = null;
        const needPost = Math.ceil(2 / (P.v0 * dt));
        const maxSteps = mode === 'none' ? Math.ceil(T / dt) + 5 : 20000;
        for (let i = 0; i < maxSteps; i++) {
            const inside = fieldTest(mode, pos, P);
            if (inside) { if (!entered) { entered = true; entryIdx = i; entryPos = { x: pos.x, y: pos.y }; } exitIdx = i; }
            if (entered && !inside && i > 0) exited = true;
            if (inside) {
                const dth = omega * dt * P.qsign, c = Math.cos(dth), s = Math.sin(dth);
                const nvx = vel.x * c - vel.y * s, nvy = vel.x * s + vel.y * c; vel.x = nvx; vel.y = nvy;
            }
            pos.x += vel.x * dt; pos.y += vel.y * dt;
            path.push({ x: pos.x, y: pos.y });
            if (mode === 'none') { if (i >= Math.ceil(T / dt)) break; }
            else { if (entered && exited) { postSteps++; if (postSteps >= needPost) break; } }
        }
        const v1 = dir(path[1], path[0]), v2 = dir(path[path.length - 1], path[path.length - 2]);
        const defl = Math.acos(Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y))) * 180 / Math.PI;
        return { path, r, T, omega, dt, defl, Rm: P.Rm, d: P.d, theta: P.theta, entryIdx, exitIdx, start, vhat0, entry: entryPos || { x: 0, y: 0 } };
    }

    function curvatureCenter() {
        const tr = state.traj, cdir = rot90(tr.vhat0, params.qsign > 0 ? 1 : -1);
        return { x: tr.entry.x + tr.r * cdir.x, y: tr.entry.y + tr.r * cdir.y };
    }

    function computeView(w, h) {
        const tr = state.traj, P = params;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of tr.path) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
        const C = curvatureCenter();
        minX = Math.min(minX, C.x); maxX = Math.max(maxX, C.x); minY = Math.min(minY, C.y); maxY = Math.max(maxY, C.y);
        if (P.mode === 'double') { minX = Math.min(minX, 0); maxX = Math.max(maxX, P.d); }
        else if (P.mode === 'single') minX = Math.min(minX, 0);
        else if (P.mode === 'circle') { minX = Math.min(minX, -P.Rm); maxX = Math.max(maxX, P.Rm); minY = Math.min(minY, -P.Rm); maxY = Math.max(maxY, P.Rm); }
        const cw = Math.max(1e-6, maxX - minX), ch = Math.max(1e-6, maxY - minY), pad = 0.1;
        MAXSCALE = h / 7.5;
        const scale = Math.min(MAXSCALE, Math.min(w * (1 - 2 * pad) / cw, h * (1 - 2 * pad) / ch));
        VIEW.scale = scale; VIEW.cx = w / 2 - scale * (minX + maxX) / 2; VIEW.oy = h / 2 + scale * (minY + maxY) / 2;
    }

    const HINTS = {
        none: '无边界匀强磁场：粒子做完整的匀速圆周运动。',
        single: '单边界：粒子斜射入后偏转，从同侧边界射出。',
        double: '双边界：粒子可能穿出远边界，也可能返回近边界。调 d 和 θ 观察。',
        circle: '圆形边界：粒子沿半径射入圆形磁场区，偏转后射出。'
    };

    function rebuild() {
        const tr = simTraj(params.mode, params);
        state.traj = tr; state.t = 0; state.idx = 0; state.done = false;
        $('rv').textContent = tr.r.toFixed(2); $('tv').textContent = tr.T.toFixed(2); $('wv').textContent = tr.omega.toFixed(2);
        const rad = params.theta * Math.PI / 180;
        let title = '本模型结论', val = '', conc = '';
        if (params.mode === 'none') {
            title = '无边界：完整圆周';
            val = '每个周期 <i>T</i> 回到起点';
            conc = '周期与速率无关，只由 <i>m</i>、<i>q</i>、<i>B</i> 决定。';
        } else if (params.mode === 'single') {
            const depth = tr.r * (1 - Math.cos(rad));
            title = '单边界：返回同侧';
            val = '偏转角 2<i>θ</i> = ' + (2 * params.theta).toFixed(0) + '°，最大穿入深度 ' + depth.toFixed(2) + ' m';
            conc = '洛伦兹力使粒子在场内转过一段圆弧，再从同一边界射出。';
        } else if (params.mode === 'double') {
            const crit = tr.r * (1 - Math.cos(rad)), escape = params.d <= crit + 1e-6;
            title = '双边界：' + (escape ? '穿出远边界' : '返回近边界');
            val = '临界宽度 <i>d</i><sub>c</sub> = ' + crit.toFixed(2) + ' m，当前 <i>d</i> = ' + params.d.toFixed(1) + ' m';
            conc = escape ? '<i>d</i> ≤ <i>d</i><sub>c</sub>：粒子穿出远边界，偏转角约 ' + tr.defl.toFixed(0) + '°。' : '<i>d</i> > <i>d</i><sub>c</sub>：粒子在场内转回，从近边界射出，偏转角 ' + (2 * params.theta).toFixed(0) + '°。';
        } else {
            const delta = 2 * Math.atan(tr.Rm / tr.r) * 180 / Math.PI;
            title = '圆形边界：径向射入';
            val = '偏转角 <i>δ</i> = ' + delta.toFixed(0) + '°';
            conc = '沿半径射入的粒子必沿半径射出。<i>R</i><sub>m</sub> 越大、<i>R</i> 越小，偏转越大。';
        }
        $('modeTitle').textContent = title; $('modeVal').innerHTML = val; $('conclude').innerHTML = conc;
        $('modeFormula').innerHTML = FML['c_' + params.mode] || '';
        $('hint').textContent = HINTS[params.mode];
        $('pTheta').classList.toggle('hidden', !(params.mode === 'single' || params.mode === 'double'));
        $('pWidth').classList.toggle('hidden', params.mode !== 'double');
        $('pRmag').classList.toggle('hidden', params.mode !== 'circle');
        syncPlay(); render();
    }

    function step(now) {
        const dtReal = Math.min(0.05, state.last ? (now - state.last) / 1000 : 0); state.last = now;
        if (state.playing && !state.done && state.traj) {
            state.t += dtReal * params.speed;
            const total = (state.traj.path.length - 1) * state.traj.dt;
            if (params.mode === 'none') {
                if (state.t >= state.traj.T) state.t -= state.traj.T;
                state.idx = Math.floor(state.t / state.traj.dt) % state.traj.path.length;
            } else if (state.t >= total) { state.t = total; state.idx = state.traj.path.length - 1; state.done = true; state.playing = false; syncPlay(); }
            else state.idx = Math.floor(state.t / state.traj.dt);
        }
        render(); requestAnimationFrame(step);
    }

    function fit(c) {
        const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
        if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
        const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx, w: r.width, h: r.height };
    }

    function arrow(ctx, x1, y1, x2, y2, color, lw) {
        const ang = Math.atan2(y2 - y1, x2 - x1), hl = 11;
        ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - hl * Math.cos(ang - 0.42), y2 - hl * Math.sin(ang - 0.42)); ctx.lineTo(x2 - hl * Math.cos(ang + 0.42), y2 - hl * Math.sin(ang + 0.42)); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    function drawCross(ctx, x, y) {
        const s = 5; ctx.strokeStyle = 'rgba(0,158,115,0.55)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke();
    }
    function drawCrosses(ctx, w, h) {
        const stp = 40;
        for (let sx = 20; sx < w; sx += stp) for (let sy = 20; sy < h; sy += stp) if (fieldTest(params.mode, PW(sx, sy), params)) drawCross(ctx, sx, sy);
    }
    const rich = (ctx, s, x, y, o) => drawRich(ctx, s, x, y, o);

    function drawTrajectory(ctx, upTo) {
        const tr = state.traj, P = params, n = tr.path.length;
        const faintIn = new Path2D(), faintOut = new Path2D(), brIn = new Path2D(), brOut = new Path2D();
        for (let i = 1; i < n; i++) {
            const a = TP(tr.path[i - 1]), b = TP(tr.path[i]);
            const mid = { x: (tr.path[i - 1].x + tr.path[i].x) / 2, y: (tr.path[i - 1].y + tr.path[i].y) / 2 };
            const inside = fieldTest(P.mode, mid, P);
            (inside ? faintIn : faintOut).moveTo(a.x, a.y); (inside ? faintIn : faintOut).lineTo(b.x, b.y);
            if (i <= upTo) { (inside ? brIn : brOut).moveTo(a.x, a.y); (inside ? brIn : brOut).lineTo(b.x, b.y); }
        }
        ctx.lineWidth = 2; ctx.setLineDash([]); ctx.strokeStyle = 'rgba(213,94,0,0.25)'; ctx.stroke(faintIn);
        ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(119,119,119,0.4)'; ctx.stroke(faintOut); ctx.setLineDash([]);
        if (upTo > 1) {
            ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.strokeStyle = COL.orange; ctx.stroke(brIn);
            ctx.strokeStyle = COL.grey; ctx.setLineDash([7, 7]); ctx.stroke(brOut); ctx.setLineDash([]);
        }
    }

    function drawScene() {
        const { ctx, w, h } = fit($('scene')); ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        computeView(w, h);
        const tr = state.traj; if (!tr) return;
        const P = params;
        ctx.save();
        const FILL = 'rgba(0,158,115,0.08)', EDGE = 'rgba(0,158,115,0.9)';
        if (P.mode === 'none') { ctx.fillStyle = FILL; ctx.fillRect(0, 0, w, h); drawCrosses(ctx, w, h); }
        else if (P.mode === 'single') {
            const x0 = TP({ x: 0, y: 0 }).x;
            ctx.fillStyle = FILL; ctx.fillRect(x0, 0, w - x0, h); drawCrosses(ctx, w, h);
            ctx.strokeStyle = EDGE; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, h); ctx.stroke();
            rich(ctx, '磁场边界', x0 - 8, 24, { size: 15, color: COL.tealInk, align: 'right' });
        } else if (P.mode === 'double') {
            const xa = TP({ x: 0, y: 0 }).x, xb = TP({ x: P.d, y: 0 }).x;
            ctx.fillStyle = FILL; ctx.fillRect(xa, 0, xb - xa, h); drawCrosses(ctx, w, h);
            ctx.strokeStyle = EDGE; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(xa, 0); ctx.lineTo(xa, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(xb, 0); ctx.lineTo(xb, h); ctx.stroke();
            rich(ctx, '近边界', xa - 8, 24, { size: 15, color: COL.tealInk, align: 'right' });
            rich(ctx, '远边界', xb + 8, 24, { size: 15, color: COL.tealInk });
            rich(ctx, '磁场区，宽 *d* = ' + P.d.toFixed(1) + ' m', (xa + xb) / 2, h - 12, { size: 15, color: COL.tealInk, align: 'center' });
        } else {
            const c0 = TP({ x: 0, y: 0 }), Rpx = P.Rm * VIEW.scale;
            ctx.beginPath(); ctx.arc(c0.x, c0.y, Rpx, 0, 7); ctx.closePath(); ctx.fillStyle = FILL; ctx.fill(); ctx.strokeStyle = EDGE; ctx.lineWidth = 2.5; ctx.stroke();
            drawCrosses(ctx, w, h);
            rich(ctx, '圆形磁场区 *R*_m = ' + P.Rm.toFixed(1) + ' m', c0.x, c0.y + Rpx + 26, { size: 15, color: COL.tealInk, align: 'center' });
        }
        ctx.restore();

        const C = curvatureCenter(), Cc = TP(C);
        ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(Cc.x, Cc.y, 3.5, 0, 7); ctx.fill();
        drawTrajectory(ctx, Math.max(1, state.idx));

        const i = Math.min(state.idx, tr.path.length - 1), Pp = TP(tr.path[i]);
        const vel = dir(tr.path[Math.min(i + 1, tr.path.length - 1)], tr.path[Math.max(i - 1, 0)]), vl = 40;
        const insideNow = fieldTest(P.mode, tr.path[i], P);
        if (insideNow) {
            ctx.strokeStyle = 'rgba(0,114,178,0.6)'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(Cc.x, Cc.y); ctx.lineTo(Pp.x, Pp.y); ctx.stroke(); ctx.setLineDash([]);
            rich(ctx, '*R* = ' + tr.r.toFixed(2) + ' m', (Cc.x + Pp.x) / 2 + 8, (Cc.y + Pp.y) / 2 - 8, { size: 15, color: COL.blue });
            const toC = { x: Cc.x - Pp.x, y: Cc.y - Pp.y }, cl = Math.hypot(toC.x, toC.y) || 1;
            arrow(ctx, Pp.x, Pp.y, Pp.x + toC.x / cl * 36, Pp.y + toC.y / cl * 36, COL.amber, 3.4);
            rich(ctx, '*F*', Pp.x + toC.x / cl * 36 + 6, Pp.y + toC.y / cl * 36 + 4, { size: 17, color: COL.amber });
        }
        arrow(ctx, Pp.x, Pp.y, Pp.x + vel.x * vl, Pp.y - vel.y * vl, COL.blue, 3.4);
        rich(ctx, '*v*', Pp.x + vel.x * vl + 6, Pp.y - vel.y * vl - 4, { size: 17, color: COL.blue });
        ctx.fillStyle = COL.orange; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(Pp.x, Pp.y, 8, 0, 7); ctx.fill(); ctx.stroke();
        rich(ctx, params.qsign > 0 ? '+' : '−', Pp.x, Pp.y + 0.5, { size: 12, color: '#fff', align: 'center', weight: 'bold', base: 'middle' });

        if (P.mode !== 'none' && tr.entryIdx >= 0) {
            const outward = pt => {
                if (P.mode === 'circle') { const dx = pt.x - TP({ x: 0, y: 0 }).x, dy = pt.y - TP({ x: 0, y: 0 }).y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; }
                return { x: -1, y: 0 };
            };
            const tag = (idx, text) => {
                const pt = TP(tr.path[idx]), u = outward(pt);
                rich(ctx, text, pt.x + u.x * 24, pt.y + u.y * 24 + 5, { size: 14, color: COL.ink, align: u.x < -0.3 ? 'right' : u.x > 0.3 ? 'left' : 'center' });
            };
            tag(tr.entryIdx, '入射');
            if (tr.exitIdx >= 0 && tr.exitIdx < tr.path.length - 1) tag(tr.exitIdx, '出射');
        }
    }

    function syncPlay() { $('playBtn').textContent = state.playing ? '暂停' : (state.done ? '重播' : '开始'); }
    function render() {
        const running = state.playing && !state.done;
        $('phaseText').textContent = state.done ? '已结束' : (running ? '运动中' : '已暂停');
        drawScene();
    }

    document.querySelectorAll('#modes .chip').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('#modes .chip').forEach(x => x.classList.toggle('on', x === b));
        params.mode = b.dataset.mode; state.playing = false; rebuild();
    }));
    const bind = (id, out, key, fmt, rb) => $(id).addEventListener('input', e => { params[key] = parseFloat(e.target.value); $(out).textContent = fmt(params[key]); if (rb !== false) rebuild(); });
    bind('v0s', 'v0sets', 'v0', v => v.toFixed(1) + ' m/s'); bind('bs', 'bsets', 'B', v => v.toFixed(1) + ' T');
    bind('qs', 'qsets', 'qabs', v => v.toFixed(1)); bind('ms', 'msets', 'm', v => v.toFixed(1));
    bind('ths', 'thset', 'theta', v => v.toFixed(0) + '°'); bind('ds', 'dset', 'd', v => v.toFixed(1) + ' m');
    bind('rms', 'rmsets', 'Rm', v => v.toFixed(1) + ' m'); bind('spds', 'spdset', 'speed', v => v.toFixed(1) + '×', false);
    $('qsignBtn').addEventListener('click', () => { params.qsign *= -1; $('qsignBtn').textContent = '电荷：' + (params.qsign > 0 ? '正（+）' : '负（−）'); rebuild(); });
    $('playBtn').addEventListener('click', () => { if (state.done) rebuild(); state.playing = !state.playing; syncPlay(); });
    $('resetBtn').addEventListener('click', () => { state.playing = false; rebuild(); });
    window.addEventListener('keydown', e => {
        if (e.repeat || e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
        if (e.key === ' ') { e.preventDefault(); $('playBtn').click(); }
        if (e.key === 'r' || e.key === 'R') $('resetBtn').click();
    });

    const dlg = $('explain');
    $('explainBtn').onclick = () => dlg.showModal();
    $('explainClose').onclick = () => dlg.close();
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

    fillFormulas(document);
    rebuild(); requestAnimationFrame(step);
})();
