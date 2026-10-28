'use strict';
// 磁流体发电机：等离子体穿过磁场，两极板间产生电动势 E = BLv。
(function () {
    const $ = id => document.getElementById(id);
    const canvas = $('mainCanvas'), ctx = canvas.getContext('2d');
    const W = 780, H = 540;
    const fig = canvas.parentElement;
    function fit() {
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const cs = getComputedStyle(fig);
        const aw = fig.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const ah = fig.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        const k = Math.max(0.2, Math.min(aw / W, ah / H));
        canvas.style.width = (W * k) + 'px'; canvas.style.height = (H * k) + 'px';
        canvas.width = Math.round(W * k * dpr); canvas.height = Math.round(H * k * dpr);
    }
    new ResizeObserver(fit).observe(fig); fit();

    const C = { pos: '#D55E00', neg: '#0072B2', force: '#B07A00', b: '#009E73', bText: '#007a58', ink: '#222', mute: '#666', wire: '#333' };
    const rich = (s, x, y, o) => drawRich(ctx, s, x, y, o);

    const L = 0.10;
    let fluidSpeed = 5.0, Bf = 1.0, rIn = 0.5, RLoad = 3.0;
    let closed = true, mode = 'deflection';
    let EMF = 0, I = 0, Vout = 0;

    function updatePhysics() {
        EMF = fluidSpeed * Bf * L;
        const tot = rIn + RLoad;
        if (closed && tot > 0) { I = EMF / tot; Vout = EMF * RLoad / tot; }
        else { I = 0; Vout = closed ? 0 : EMF; }
        $('dataEMF').textContent = EMF.toFixed(3) + ' V';
        $('dataCurrent').textContent = I.toFixed(3) + ' A';
        $('dataVout').textContent = Vout.toFixed(3) + ' V';
    }

    const chX = 100, chY = 150, chW = 550, chH = 240;
    const centerY = chY + chH / 2;
    const eTopY = chY - 20, eBotY = chY + chH + 8, eW = 130;
    const NUM = 120, TRAIL = 8;
    let particles = [];
    const baseSpeed = 180;
    const pxSpeed = () => baseSpeed * (fluidSpeed / 5);

    function spawn(p) {
        p.x = chX - Math.random() * 40;
        p.y = chY + 10 + Math.random() * (chH - 20);
        p.vy = mode === 'deflection' ? (Math.random() - 0.5) * 4 : 0;
        p.vx = pxSpeed();
        p.history = [];
        for (let j = 0; j < TRAIL; j++) p.history.push({ x: p.x - j * 2, y: p.y });
    }
    function initParticles() {
        particles = [];
        for (let i = 0; i < NUM; i++) {
            const p = { charge: Math.random() < 0.5 ? 1 : -1, radius: 2.4 + Math.random() * 1.6 };
            spawn(p); particles.push(p);
        }
    }
    const flowDots = Array.from({ length: 14 }, (_, i) => ({ t: i / 14 }));

    function drawMagneticField() {
        ctx.strokeStyle = 'rgba(0,158,115,0.55)'; ctx.lineWidth = 1.4;
        for (let x = chX + 15; x < chX + chW - 10; x += 30) {
            for (let y = chY + 15; y < chY + chH - 10; y += 30) {
                const s = 6; ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke();
            }
        }
        rich('*B*（垂直纸面向里）', chX + chW - 4, chY - 10, { size: 15, color: C.bText, align: 'right' });
    }

    function drawMagnetPoles() {
        const px = chX - 55, pyTop = chY + 40, pyBot = chY + chH - 40;
        ctx.fillStyle = C.pos; ctx.beginPath(); ctx.ellipse(px, pyTop, 24, 15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.neg; ctx.beginPath(); ctx.ellipse(px, pyBot, 24, 15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('N', px, pyTop + 1); ctx.fillText('S', px, pyBot + 1);
        ctx.strokeStyle = '#999'; ctx.lineWidth = 1.3; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(px, pyTop + 16); ctx.lineTo(px, pyBot - 16); ctx.stroke(); ctx.setLineDash([]);
    }

    function drawEntry() {
        ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(chX - 10, chY); ctx.lineTo(chX - 10, chY + chH); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#888';
        for (let y = chY + 15; y < chY + chH - 5; y += 20) { ctx.beginPath(); ctx.moveTo(chX - 15, y - 4); ctx.lineTo(chX - 5, y); ctx.lineTo(chX - 15, y + 4); ctx.fill(); }
        rich('持续射入', chX - 30, chY - 10, { size: 12, color: C.mute, align: 'center' });
    }

    function drawElectrodes() {
        const x0 = chX + chW / 2 - eW / 2;
        ctx.fillStyle = C.pos; ctx.fillRect(x0, eTopY - 16, eW, 16);
        ctx.fillStyle = C.neg; ctx.fillRect(x0, eBotY, eW, 16);
        rich('上极板（+）', x0 - 10, eTopY - 3, { size: 14, color: C.pos, align: 'right', weight: 'bold' });
        rich('下极板（−）', x0 - 10, eBotY + 13, { size: 14, color: C.neg, align: 'right', weight: 'bold' });
        return { top: { x: x0 + eW / 2, y: eTopY - 16 }, bot: { x: x0 + eW / 2, y: eBotY + 16 } };
    }

    function drawField() {
        // 板间电场：随极板电荷积累增强；稳定后与洛伦兹力平衡
        const sx = chX + chW / 2, sy = chY + 20, ey = chY + chH - 20;
        ctx.strokeStyle = 'rgba(176,122,0,0.8)'; ctx.fillStyle = 'rgba(176,122,0,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, ey - 8); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(sx, ey); ctx.lineTo(sx - 5, ey - 10); ctx.lineTo(sx + 5, ey - 10); ctx.closePath(); ctx.fill();
        rich('板间电场 *E*_0（向下）', sx + 12, (sy + ey) / 2, { size: 14, color: C.force });
    }

    function drawCircuit(top, bot) {
        const rx = chX + chW + 45, topY = top.y - 8, botY = bot.y + 8;
        ctx.strokeStyle = C.wire; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(top.x, topY); ctx.lineTo(rx, topY); ctx.lineTo(rx, topY + 45); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bot.x, bot.y); ctx.lineTo(bot.x, botY); ctx.lineTo(rx, botY); ctx.lineTo(rx, botY - 45); ctx.stroke();
        const zigTop = topY + 45, zigBot = botY - 45;
        ctx.strokeStyle = C.force; ctx.lineWidth = 2.8;
        const segs = 5, step = (zigBot - zigTop) / segs;
        ctx.beginPath(); ctx.moveTo(rx, zigTop);
        for (let s = 0; s < segs; s++) { const sy = zigTop + s * step; ctx.lineTo(rx + (s % 2 ? -22 : 22), sy + step / 2); ctx.lineTo(rx, zigTop + (s + 1) * step); }
        ctx.stroke();
        rich('*R*', rx + 30, (zigTop + zigBot) / 2 - 4, { size: 16, color: C.force });
        rich('负载', rx + 30, (zigTop + zigBot) / 2 + 16, { size: 14, color: C.force });
        const swY = zigBot + 18, gap = closed ? 0 : 9;
        ctx.strokeStyle = C.wire; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(rx, zigBot); ctx.lineTo(rx, swY - gap); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rx, swY + gap); ctx.lineTo(rx, botY - 45); ctx.stroke();
        ctx.fillStyle = closed ? '#1f7a4c' : '#b7354a';
        if (closed) { ctx.beginPath(); ctx.arc(rx, swY, 4, 0, Math.PI * 2); ctx.fill(); }
        rich(closed ? '闭合' : '断开', rx + 10, swY + 5, { size: 13, color: closed ? '#1f7a4c' : '#b7354a' });
        return {
            topPath: [top, { x: top.x, y: topY }, { x: rx, y: topY }, { x: rx, y: zigTop }],
            botPath: [{ x: rx, y: zigBot }, { x: rx, y: swY }, { x: rx, y: botY - 45 }, { x: rx, y: botY }, { x: bot.x, y: botY }, bot]
        };
    }

    function drawFlowDot(path, t) {
        if (path.length < 2) return;
        let total = 0; const segs = [];
        for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); segs.push(d); total += d; }
        if (total < 0.1) return;
        let dist = t * total, acc = 0, idx = 0;
        for (let i = 0; i < segs.length; i++) { if (acc + segs[i] >= dist) { idx = i; break; } acc += segs[i]; idx = i; }
        const lt = segs[idx] > 0 ? (dist - acc) / segs[idx] : 0;
        const p0 = path[idx], p1 = path[Math.min(idx + 1, path.length - 1)];
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p0.x + (p1.x - p0.x) * lt, p0.y + (p1.y - p0.y) * lt, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    function updateParticles(dt) {
        const coeff = 0.14, hallK = 0.9;
        for (const p of particles) {
            if (mode === 'deflection') {
                let ay = -p.charge * p.vx * Bf * coeff;
                if (!closed) ay -= hallK * (p.y - centerY);
                p.vy += ay * dt; p.y += p.vy * dt;
            } else { p.vy = 0; p.y += (Math.random() - 0.5) * 0.4; }
            p.x += p.vx * dt;
            p.y = Math.max(chY + 2, Math.min(chY + chH - 2, p.y));
            p.history.push({ x: p.x, y: p.y }); if (p.history.length > TRAIL) p.history.shift();
            if (p.x > chX + chW + 15) spawn(p);
            if (mode === 'deflection' && (p.y <= chY + 4 || p.y >= chY + chH - 4)) spawn(p);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const col = p.charge > 0 ? C.pos : C.neg;
            ctx.lineCap = 'round'; ctx.strokeStyle = col;
            for (let i = 1; i < p.history.length; i++) {
                ctx.globalAlpha = (i / p.history.length) * 0.5; ctx.lineWidth = p.radius * 1.2;
                ctx.beginPath(); ctx.moveTo(p.history[i - 1].x, p.history[i - 1].y); ctx.lineTo(p.history[i].x, p.history[i].y); ctx.stroke();
            }
            ctx.globalAlpha = 0.9; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
            if (mode === 'deflection') {
                const a = -p.charge * p.vx * Bf * 0.14, len = Math.abs(a) * 0.09 + 5, dir = a > 0 ? 1 : -1;
                const sy = p.y + (dir > 0 ? p.radius + 3 : -p.radius - 3), ey = sy + dir * len;
                ctx.strokeStyle = C.force; ctx.fillStyle = C.force; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(p.x, sy); ctx.lineTo(p.x, ey); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(p.x, ey); ctx.lineTo(p.x - 4.5, ey - dir * 6); ctx.lineTo(p.x + 4.5, ey - dir * 6); ctx.fill();
            }
        }
    }

    let lastT = 0, animT = 0;
    function render(ts) {
        if (!lastT) lastT = ts;
        const dt = Math.min(0.1, (ts - lastT) / 1000); lastT = ts; animT += dt;
        ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#f5f6f7'; ctx.fillRect(chX, chY, chW, chH);
        ctx.strokeStyle = '#555'; ctx.lineWidth = 2.5; ctx.strokeRect(chX, chY, chW, chH);

        drawEntry(); drawMagneticField(); drawMagnetPoles();
        if (mode === 'steady') drawField();
        const conn = drawElectrodes();
        const paths = drawCircuit(conn.top, conn.bot);
        updateParticles(dt); drawParticles();

        if (closed && I > 0.001) {
            const fs = 0.3 + I * 0.4;
            flowDots.forEach(d => { d.t += fs * dt; if (d.t > 1) d.t -= 1; drawFlowDot(paths.topPath, d.t); drawFlowDot(paths.botPath, d.t); });
        }

        rich('流体速度 *v*', chX + 60, chY - 34, { size: 14, color: C.mute, align: 'center' });
        ctx.strokeStyle = '#666'; ctx.fillStyle = '#666'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(chX + 10, chY - 20); ctx.lineTo(chX + 100, chY - 20); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(chX + 104, chY - 20); ctx.lineTo(chX + 92, chY - 27); ctx.lineTo(chX + 92, chY - 13); ctx.fill();

        rich('*E* = *BLv* = ' + Bf.toFixed(2) + '×' + L.toFixed(2) + '×' + fluidSpeed.toFixed(1) + ' = ' + EMF.toFixed(3) + ' V', W / 2, 44, { size: 17, color: C.force, align: 'center', weight: 'bold' });
        rich((closed ? '电路闭合' : '电路断开') + (mode === 'steady' ? '，稳态流动' : '，粒子偏转'), W / 2, 492, { size: 16, color: closed ? '#1f7a4c' : '#b7354a', align: 'center' });
        requestAnimationFrame(render);
    }

    function setTitle() {
        $('stageTitle').textContent = mode === 'deflection' ? '偏转过程：离子在磁场中偏向两极板' : '稳定状态：电场力与洛伦兹力平衡，粒子不再偏转';
    }
    const grp = $('grpMode');
    grp.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
        grp.querySelectorAll('.chip').forEach(o => o.classList.remove('on')); b.classList.add('on');
        mode = b.dataset.v; initParticles(); setTitle();
    }));
    const bindS = (id, out, fmt, set) => $(id).addEventListener('input', e => { const v = +e.target.value; set(v); $(out).textContent = fmt(v); updatePhysics(); });
    bindS('sliderSpeed', 'valSpeed', v => v.toFixed(1) + ' m/s', v => { fluidSpeed = v; particles.forEach(p => p.vx = pxSpeed()); });
    bindS('sliderB', 'valB', v => v.toFixed(2) + ' T', v => { Bf = v; });
    bindS('sliderRin', 'valRin', v => v.toFixed(2) + ' Ω', v => { rIn = v; });
    bindS('sliderRload', 'valRload', v => v.toFixed(1) + ' Ω', v => { RLoad = v; });
    $('btnSwitch').addEventListener('click', e => {
        closed = !closed; e.target.textContent = closed ? '电路闭合' : '电路断开';
        e.target.classList.toggle('open', !closed); e.target.setAttribute('aria-pressed', closed);
        updatePhysics();
    });

    const dlg = $('explain');
    $('explainBtn').onclick = () => dlg.showModal();
    $('explainClose').onclick = () => dlg.close();
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

    fillFormulas(document);
    initParticles(); updatePhysics(); setTitle();
    requestAnimationFrame(render);
})();
