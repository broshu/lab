'use strict';
// 速度选择器：粒子在正交电磁场中的运动。
// 屏幕坐标：x 向右，y 向下。上极板为正，电场向下。
(function () {
    const $ = id => document.getElementById(id);
    const canvas = $('mainCanvas');
    const ctx = canvas.getContext('2d');
    const W = 820, H = 540;
    const fig = canvas.parentElement;
    let kScale = 1;
    // 按显示尺寸设置画布分辨率，避免放大后发虚
    function fit() {
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const cs = getComputedStyle(fig);
        const aw = fig.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const ah = fig.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        kScale = Math.max(0.2, Math.min(aw / W, ah / H));
        canvas.style.width = (W * kScale) + 'px'; canvas.style.height = (H * kScale) + 'px';
        canvas.width = Math.round(W * kScale * dpr); canvas.height = Math.round(H * kScale * dpr);
        ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    }
    new ResizeObserver(fit).observe(fig);
    fit();

    const C = { orange: '#D55E00', blue: '#0072B2', teal: '#009E73', amber: '#B07A00', ink: '#222', mute: '#666', grey: '#8a8a8a' };
    const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

    const plateLeft = 180, plateRight = 600, plateTop = 100, plateBot = 440;
    const plateMidY = (plateTop + plateBot) / 2, plateThick = 8;
    const barrierX = plateRight + 40, barrierWidth = 12, slitHalfH = 14;
    const entryX = plateLeft - 60;

    const kv = 0.0035;     // 每个物理速度单位对应的像素数（每帧）
    const S = 1.0e-4;      // 加速度缩放
    const STEP = 1 / 60;

    let particles = [];

    const sliderB = $('sliderB'), sliderE = $('sliderE'), sliderV = $('sliderV');
    const state = { charge: 1, bdir: -1 };
    const getB = () => parseFloat(sliderB.value), getE = () => parseFloat(sliderE.value), getV = () => parseFloat(sliderV.value);

    function bindChips(id, key) {
        const g = $(id);
        g.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
            g.querySelectorAll('.chip').forEach(o => o.classList.remove('on'));
            b.classList.add('on'); state[key] = parseInt(b.dataset.v, 10);
        }));
    }
    bindChips('grpCharge', 'charge'); bindChips('grpBdir', 'bdir');

    function updateLabels() {
        $('labelB').textContent = getB().toFixed(2) + ' T';
        $('labelE').textContent = getE().toFixed(0) + ' V/m';
        $('labelV').textContent = getV().toFixed(0) + ' m/s';
        const tv = getE() / getB();
        $('targetV').textContent = tv.toFixed(1);
        $('targetCard').classList.toggle('match', Math.abs(getV() - tv) / tv < 0.03);
    }
    [sliderB, sliderE, sliderV].forEach(s => s.addEventListener('input', updateLabels));
    updateLabels();

    function createParticle() {
        const v0 = getV();
        return {
            x: entryX, y: plateMidY, vx: v0 * kv, vy: 0,
            charge: state.charge, bdir: state.bdir, B: getB(), E: getE(), v0,
            trail: [{ x: entryX, y: plateMidY }],
            alive: true, result: 'flying',
            color: state.charge > 0 ? C.orange : C.blue,
            fe: 0, fm: 0, inField: false
        };
    }

    function stepParticle(p) {
        if (!p.alive) return;
        p.inField = (p.x >= plateLeft && p.x <= plateRight);
        if (p.inField) {
            const vxPhys = p.vx / kv, vyPhys = p.vy / kv;
            const ay = S * p.charge * (p.E + p.bdir * p.B * vxPhys);
            const ax = S * p.charge * (-p.bdir) * p.B * vyPhys;
            p.vx += ax; p.vy += ay;
            // 单位电荷所受的力（N/C），正负表示屏幕上向下 / 向上
            p.fe = p.charge * p.E;
            p.fm = p.charge * p.bdir * p.B * vxPhys;
        } else { p.fe = 0; p.fm = 0; }
        p.x += p.vx; p.y += p.vy;
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 2000) p.trail.shift();

        if (p.x >= plateLeft && p.x <= plateRight) {
            if (p.y <= plateTop + plateThick / 2 + 5) { p.y = plateTop + plateThick / 2 + 5; p.alive = false; p.result = 'blocked'; }
            if (p.y >= plateBot - plateThick / 2 - 5) { p.y = plateBot - plateThick / 2 - 5; p.alive = false; p.result = 'blocked'; }
        }
        if (p.x >= barrierX && p.x <= barrierX + barrierWidth) {
            if (Math.abs(p.y - plateMidY) > slitHalfH) { p.x = barrierX; p.alive = false; p.result = 'blocked'; }
            else p.result = 'passed';
        }
        if (p.x > W + 20 || p.x < -20 || p.y < -20 || p.y > H + 20) { p.alive = false; if (p.result === 'flying') p.result = 'missed'; }
        if (!p.alive && p.result === 'blocked') p.color = C.grey;
    }

    /* ---------- 绘图 ---------- */
    function text(str, x, y, o) {
        o = o || {};
        ctx.font = (o.style || '') + ' ' + (o.weight || '') + ' ' + (o.size || 14) + 'px ' + FONT;
        ctx.fillStyle = o.color || C.ink; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
        ctx.fillText(str, x, y);
    }
    // 斜体字母加下标
    function varSub(letter, sub, x, y, o) {
        o = o || {}; const size = o.size || 15;
        ctx.font = 'italic ' + size + 'px "Times New Roman",serif';
        ctx.fillStyle = o.color || C.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(letter, x, y);
        const w = ctx.measureText(letter).width;
        if (sub) { ctx.font = (size * 0.7) + 'px "Times New Roman",serif'; ctx.fillText(sub, x + w + 1, y + size * 0.28); }
        return w + (sub ? ctx.measureText(sub).width + 1 : 0);
    }

    function drawBackground() { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); }

    function drawPlates() {
        ctx.fillStyle = C.orange; ctx.fillRect(plateLeft, plateTop - plateThick / 2, plateRight - plateLeft, plateThick);
        ctx.fillStyle = C.blue; ctx.fillRect(plateLeft, plateBot - plateThick / 2, plateRight - plateLeft, plateThick);
        for (let x = plateLeft + 30; x < plateRight - 10; x += 60) {
            text('+', x, plateTop - 12, { size: 18, weight: 'bold', color: C.orange, align: 'center' });
            text('−', x, plateBot + 24, { size: 18, weight: 'bold', color: C.blue, align: 'center' });
        }
    }

    function drawEField() {
        ctx.strokeStyle = 'rgba(176,122,0,0.55)'; ctx.fillStyle = 'rgba(176,122,0,0.7)'; ctx.lineWidth = 1.2;
        for (let x = plateLeft + 25; x < plateRight; x += 50) {
            const y1 = plateTop + plateThick / 2 + 12, y2 = plateBot - plateThick / 2 - 12;
            ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x, y2 + 2); ctx.lineTo(x - 4.5, y2 - 8); ctx.lineTo(x + 4.5, y2 - 8); ctx.closePath(); ctx.fill();
        }
        const w = varSub('E', '', 24, 150, { size: 22, color: C.amber });
        text('电场方向向下', 24 + w + 6, 150, { size: 14, color: C.amber });
    }

    function drawBField() {
        const into = state.bdir < 0;
        ctx.strokeStyle = 'rgba(0,158,115,0.6)'; ctx.fillStyle = 'rgba(0,158,115,0.7)'; ctx.lineWidth = 1.5;
        for (let x = plateLeft + 25; x < plateRight - 12; x += 40) {
            for (let y = plateTop + 29; y < plateBot - 29 + 1; y += 40) {
                if (into) {
                    const s = 4.5; ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke();
                } else {
                    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
                    ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
                }
            }
        }
        const w = varSub('B', '', 24, 192, { size: 22, color: '#007a58' });
        text(into ? '磁场垂直纸面向里' : '磁场垂直纸面向外', 24 + w + 6, 192, { size: 14, color: '#007a58' });
    }

    function drawBarrier() {
        ctx.fillStyle = '#555';
        ctx.fillRect(barrierX, plateTop - 20, barrierWidth, (plateMidY - slitHalfH) - (plateTop - 20));
        ctx.fillRect(barrierX, plateMidY + slitHalfH, barrierWidth, (plateBot + 20) - (plateMidY + slitHalfH));
        text('挡板', barrierX + barrierWidth / 2, plateBot + 44, { size: 13, color: C.mute, align: 'center' });
        text('狭缝', barrierX + barrierWidth + 8, plateMidY + slitHalfH + 18, { size: 13, color: C.amber });
        text('筛选通过区', barrierX + barrierWidth + 52, plateMidY - 28, { size: 13, color: C.mute, align: 'center' });
    }

    function drawEntry() {
        ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(20, plateMidY); ctx.lineTo(plateLeft - 10, plateMidY); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#888'; ctx.beginPath(); ctx.moveTo(plateLeft - 10, plateMidY); ctx.lineTo(plateLeft - 19, plateMidY - 4.5); ctx.lineTo(plateLeft - 19, plateMidY + 4.5); ctx.closePath(); ctx.fill();
        const w = varSub('v', '', 60, plateMidY - 12, { size: 18, color: C.mute });
        text('→', 60 + w + 4, plateMidY - 12, { size: 14, color: C.mute });
        text('粒子入射', 16, H - 16, { size: 13, color: C.mute });
    }

    function drawTrail(p) {
        if (p.trail.length < 2) return;
        ctx.strokeStyle = p.color; ctx.globalAlpha = p.alive ? 0.75 : 0.45; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (let i = 1; i < p.trail.length; i++) ctx.lineTo(p.trail[i].x, p.trail[i].y);
        ctx.stroke(); ctx.globalAlpha = 1;
    }

    function drawParticle(p) {
        if (p.alive) { ctx.fillStyle = p.color; ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 8.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        text(p.charge > 0 ? '+' : '−', p.x, p.y + 0.5, { size: 13, weight: 'bold', color: '#fff', align: 'center', base: 'middle' });
    }

    function arrow(x1, y1, x2, y2, color) {
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
        if (len < 2) return;
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        const a = Math.atan2(dy, dx), h = 9;
        ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - h * Math.cos(a - 0.4), y2 - h * Math.sin(a - 0.4)); ctx.lineTo(x2 - h * Math.cos(a + 0.4), y2 - h * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
    }

    function drawForces(p) {
        if (!p.alive || !p.inField) return;
        const ref = Math.max(p.E, p.v0 * p.B, 1), L = 70;
        const le = p.fe / ref * L, lm = p.fm / ref * L;
        // 两个力的箭头略微左右错开，避免平衡时重叠
        arrow(p.x - 6, p.y, p.x - 6, p.y + le, C.amber);
        arrow(p.x + 6, p.y, p.x + 6, p.y + lm, C.teal);
        if (Math.abs(le) > 6) varSub('F', 'E', p.x - 30, p.y + le + (le > 0 ? 16 : -6), { size: 15, color: C.amber });
        if (Math.abs(lm) > 6) varSub('F', 'B', p.x + 14, p.y + lm + (lm > 0 ? 16 : -6), { size: 15, color: '#007a58' });
    }

    function drawResult(p) {
        if (p.alive) return;
        if (p.result === 'passed') text('通过', p.x, p.y - 18, { size: 15, weight: 'bold', color: '#1f7a4c', align: 'center' });
        else if (p.result === 'blocked') text('被阻挡', p.x, p.y - 18, { size: 15, weight: 'bold', color: '#b7354a', align: 'center' });
    }

    function render() {
        drawBackground(); drawEntry(); drawEField(); drawBField(); drawPlates(); drawBarrier();
        particles.forEach(drawTrail);
        particles.forEach(p => { drawParticle(p); drawForces(p); drawResult(p); });
    }

    function updateDisplay() {
        const p = particles.find(q => q.alive) || particles[particles.length - 1];
        const res = $('dispResult');
        if (!p) { ['dispV', 'dispDy', 'dispFe', 'dispFm'].forEach(i => $(i).textContent = '—'); res.textContent = '等待发射'; return; }
        $('dispV').textContent = (Math.hypot(p.vx, p.vy) / kv).toFixed(0) + ' m/s';
        const dy = p.y - plateMidY;
        $('dispDy').textContent = (dy > 0.05 ? '向下 ' : dy < -0.05 ? '向上 ' : '') + Math.abs(dy).toFixed(1) + ' px';
        $('dispFe').textContent = Math.abs(p.fe).toFixed(0) + ' N/C';
        $('dispFm').textContent = Math.abs(p.fm).toFixed(0) + ' N/C';
        res.textContent = p.result === 'passed' ? '通过狭缝' : p.result === 'blocked' ? '撞上挡板或极板' : p.result === 'missed' ? '飞出画面' : '运动中';
    }

    let last = null, acc = 0;
    function frame(ts) {
        if (last === null) last = ts;
        acc += Math.min(100, ts - last) / 1000; last = ts;
        while (acc >= STEP) { particles.forEach(stepParticle); acc -= STEP; }
        render(); updateDisplay();
        requestAnimationFrame(frame);
    }

    $('btnFire').addEventListener('click', () => { particles.push(createParticle()); if (particles.length > 12) particles.shift(); });
    $('btnReset').addEventListener('click', () => { particles = []; });

    const dlg = $('explain');
    $('explainBtn').onclick = () => dlg.showModal();
    $('explainClose').onclick = () => dlg.close();
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

    fillFormulas(document);
    requestAnimationFrame(frame);
    // 预览：打开时先发射一个速度合适的粒子
    particles.push(createParticle());
})();
