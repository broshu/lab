'use strict';
// 霍尔元件：电流 I 沿薄片通过，磁场 B 垂直薄片，M、N 间出现霍尔电压 U_H = BI/(nqd)。
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

    const C = { pos: '#D55E00', neg: '#0072B2', force: '#B07A00', b: '#009E73', bText: '#007a58', ink: '#222', mute: '#666', wire: '#333', ok: '#1f7a4c', bad: '#b7354a' };
    const rich = (s, x, y, o) => drawRich(ctx, s, x, y, o);

    // 物理量（国际单位）：n = 1.0×10^22 m^-3，q = 1.6×10^-19 C，M、N 间距 b = 5 mm
    const N_DENS = 1.0e22, Q = 1.6e-19, B_WIDTH = 5e-3;
    let Ima = 10, Bf = 0.5, dmm = 0.5;
    let mode = 'deflection', carrier = 'pos', bdir = 'in';
    let acc = 0;               // 电荷积累程度 0–1（稳定时为 1）
    let v = 0, UHmax = 0;

    const sCar = () => carrier === 'pos' ? 1 : -1;    // 载流子电性
    const sB = () => bdir === 'in' ? 1 : -1;          // 磁场方向：向里为 +1
    // 磁场向里、电流向右时，无论正负载流子都受向上的洛伦兹力；M 端电势符号 = 电性 × 磁场方向
    const sM = () => sCar() * sB();

    function updatePhysics() {
        const I = Ima * 1e-3, d = dmm * 1e-3;
        v = I / (N_DENS * Q * B_WIDTH * d);
        UHmax = Bf * v * B_WIDTH;                      // = BI/(nqd)
        const U = acc * UHmax * sM();                  // U_MN = φ_M − φ_N
        $('dataV').textContent = v.toFixed(2) + ' m/s';
        $('dataUH').textContent = (UHmax * 1e3).toFixed(2) + ' mV';
        $('dataUMN').textContent = (U * 1e3 >= 0 ? '' : '−') + Math.abs(U * 1e3).toFixed(2) + ' mV';
        $('dataHigh').textContent = acc < 0.02 ? '—' : (sM() > 0 ? 'M（上侧）' : 'N（下侧）');
    }

    // 画面几何
    const sx = 140, sy = 175, sw = 420, sh = 190;      // 薄片
    const cy = sy + sh / 2, cxm = sx + sw / 2;
    const NUM = 70;
    let particles = [];
    const pxSpeed = () => 60 + 12 * Ima;               // 视觉速度随电流增大
    const upDir = () => -1;                             // 画布上方向（向上为 −y）
    // 偏转方向：磁场向里 → 向上；向外 → 向下
    const defl = () => (bdir === 'in' ? -1 : 1);

    function spawn(p, first) {
        const dirX = sCar();                            // 正载流子向右，负载流子向左（电流向右）
        p.x = first ? sx + Math.random() * sw : (dirX > 0 ? sx - Math.random() * 20 : sx + sw + Math.random() * 20);
        p.y = sy + 8 + Math.random() * (sh - 16);
        p.hist = [];
    }
    function initParticles() {
        particles = [];
        for (let i = 0; i < NUM; i++) { const p = { r: 2.6 + Math.random() * 1.4 }; spawn(p, true); particles.push(p); }
    }

    function drawSlab() {
        ctx.fillStyle = '#f5f6f7'; ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = '#555'; ctx.lineWidth = 2.5; ctx.strokeRect(sx, sy, sw, sh);
        // 磁场符号
        ctx.strokeStyle = 'rgba(0,158,115,0.6)'; ctx.fillStyle = 'rgba(0,158,115,0.6)'; ctx.lineWidth = 1.4;
        for (let x = sx + 22; x < sx + sw - 8; x += 36) {
            for (let y = sy + 22; y < sy + sh - 8; y += 36) {
                if (bdir === 'in') { const s = 5; ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke(); }
                else { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke(); }
            }
        }
        rich(bdir === 'in' ? '*B*（垂直纸面向里）' : '*B*（垂直纸面向外）', sx + sw, sy + sh + 24, { size: 15, color: C.bText, align: 'right' });
    }

    function drawEdgeCharges() {
        const n = Math.round(acc * 12);
        if (n <= 0) return;
        const topSign = sM();                           // 上侧积累电荷的符号
        for (let i = 0; i < n; i++) {
            const x = sx + 22 + i * ((sw - 44) / 11);
            ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = topSign > 0 ? C.pos : C.neg; ctx.fillText(topSign > 0 ? '+' : '−', x, sy + 10);
            ctx.fillStyle = topSign > 0 ? C.neg : C.pos; ctx.fillText(topSign > 0 ? '−' : '+', x, sy + sh - 10);
        }
    }

    function drawField() {
        if (acc < 0.03) return;
        // 横向电场：由电势高的一侧指向电势低的一侧
        const down = sM() > 0;                          // 上侧电势高 → 电场向下
        const len = 22 + 90 * acc;
        ctx.strokeStyle = 'rgba(204,121,167,0.85)'; ctx.fillStyle = 'rgba(204,121,167,0.9)'; ctx.lineWidth = 2;
        for (let i = 1; i <= 3; i++) {
            const x = sx + i * sw / 4 + (i === 2 ? 0 : 0);
            if (i === 2) continue;                      // 中间留给受力示意
            const y0 = cy - (down ? len / 2 : -len / 2), y1 = cy + (down ? len / 2 : -len / 2);
            ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
            const dir = down ? 1 : -1;
            ctx.beginPath(); ctx.moveTo(x, y1 + dir * 2); ctx.lineTo(x - 5, y1 - dir * 8); ctx.lineTo(x + 5, y1 - dir * 8); ctx.fill();
        }
        rich('横向电场 *E*_{H}', sx + sw / 4, sy + sh - 36, { size: 13, color: '#a0527f', align: 'center' });
    }

    // 中央示意载流子：同时显示洛伦兹力与静电力
    function drawFocusCarrier() {
        const x = cxm, y = cy;
        const col = carrier === 'pos' ? C.pos : C.neg;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(carrier === 'pos' ? '+' : '−', x, y + 0.5);
        const L = 52, up = defl() < 0;
        arrow(x, y + (up ? -10 : 10), x, y + (up ? -10 - L : 10 + L), C.force, 3);
        rich('*F*_{洛}', x + 12, y + (up ? -10 - L + 8 : 10 + L - 4), { size: 14, color: C.force, weight: 'bold' });
        const Le = L * acc;
        if (Le > 4) {
            arrow(x, y + (up ? 10 : -10), x, y + (up ? 10 + Le : -10 - Le), C.neg === col ? '#7a3fa3' : '#7a3fa3', 3);
            rich('*F*_{电}', x + 12, y + (up ? 10 + Le - 4 : -10 - Le + 8), { size: 14, color: '#7a3fa3', weight: 'bold' });
        }
        // 速度箭头
        const vx = sCar();
        arrow(x + vx * 12, y, x + vx * 42, y, '#555', 2);
        rich('*v*', x + vx * 42 + (vx > 0 ? 8 : -8), y - 8, { size: 14, color: '#555', align: vx > 0 ? 'left' : 'right' });
    }
    function arrow(x0, y0, x1, y1, col, lw) {
        const a = Math.atan2(y1 - y0, x1 - x0), h = 8;
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * 4, y1 - Math.sin(a) * 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - h * Math.cos(a - 0.4), y1 - h * Math.sin(a - 0.4)); ctx.lineTo(x1 - h * Math.cos(a + 0.4), y1 - h * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
    }

    function updateParticles(dt) {
        const dirX = sCar(), sp = pxSpeed();
        const vdef = (1 - acc) * (20 + 70 * Bf) * (Ima / 10 * 0.5 + 0.5);
        for (const p of particles) {
            p.x += dirX * sp * dt;
            if (mode === 'deflection') p.y += defl() * vdef * dt;
            else p.y += (Math.random() - 0.5) * 0.3;
            p.y = Math.max(sy + 4, Math.min(sy + sh - 4, p.y));
            p.hist.push({ x: p.x, y: p.y }); if (p.hist.length > 7) p.hist.shift();
            if ((dirX > 0 && p.x > sx + sw + 14) || (dirX < 0 && p.x < sx - 14)) spawn(p, false);
        }
        if (mode === 'deflection') acc = Math.min(1, acc + (1 - acc) * dt / 11 + dt * 0.002);
        else acc = 1;
    }

    function drawParticles() {
        const col = carrier === 'pos' ? C.pos : C.neg;
        for (const p of particles) {
            if (p.x < sx - 12 || p.x > sx + sw + 12) continue;
            ctx.lineCap = 'round'; ctx.strokeStyle = col;
            for (let i = 1; i < p.hist.length; i++) {
                ctx.globalAlpha = (i / p.hist.length) * 0.45; ctx.lineWidth = p.r * 1.1;
                ctx.beginPath(); ctx.moveTo(p.hist[i - 1].x, p.hist[i - 1].y); ctx.lineTo(p.hist[i].x, p.hist[i].y); ctx.stroke();
            }
            ctx.globalAlpha = 0.9; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        }
    }

    function drawLeadsAndMeter() {
        // E、F 电极与电流方向
        ctx.fillStyle = '#888'; ctx.fillRect(sx - 14, sy + 8, 14, sh - 16); ctx.fillRect(sx + sw, sy + 8, 14, sh - 16);
        ctx.strokeStyle = C.wire; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(sx - 14, cy); ctx.lineTo(sx - 70, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx + sw + 14, cy); ctx.lineTo(sx + sw + 70, cy); ctx.stroke();
        rich('*E*', sx - 22, sy - 10, { size: 17, color: C.ink, align: 'center', weight: 'bold' });
        rich('*F*', sx + sw + 22, sy - 10, { size: 17, color: C.ink, align: 'center', weight: 'bold' });
        rich('接电源正极', sx - 70, cy + 22, { size: 12, color: C.mute, align: 'center' });
        rich('接电源负极', sx + sw + 70, cy + 22, { size: 12, color: C.mute, align: 'center' });
        arrow(sx - 66, cy - 16, sx - 24, cy - 16, C.ink, 2.2);
        rich('*I*', sx - 45, cy - 26, { size: 16, color: C.ink, align: 'center' });

        // M、N 电极
        const topHigh = acc > 0.02 && sM() > 0, botHigh = acc > 0.02 && sM() < 0;
        const tCol = acc < 0.02 ? '#999' : (sM() > 0 ? C.pos : C.neg);
        const bCol = acc < 0.02 ? '#999' : (sM() > 0 ? C.neg : C.pos);
        ctx.fillStyle = tCol; ctx.fillRect(cxm - 28, sy - 14, 56, 14);
        ctx.fillStyle = bCol; ctx.fillRect(cxm - 28, sy + sh, 56, 14);
        rich('*M*', cxm - 40, sy - 5, { size: 16, color: C.ink, align: 'right', weight: 'bold' });
        rich('*N*', cxm - 40, sy + sh + 20, { size: 16, color: C.ink, align: 'right', weight: 'bold' });
        void topHigh; void botHigh;

        // 电压表
        const mx = sx + sw + 130, my = cy;
        ctx.strokeStyle = C.wire; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(cxm, sy - 14); ctx.lineTo(cxm, sy - 48); ctx.lineTo(mx, sy - 48); ctx.lineTo(mx, my - 34); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cxm, sy + sh + 14); ctx.lineTo(cxm, sy + sh + 48); ctx.lineTo(mx, sy + sh + 48); ctx.lineTo(mx, my + 34); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.strokeStyle = C.wire; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(mx, my, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        rich('V', mx, my - 14, { size: 20, color: C.ink, align: 'center', base: 'middle', weight: 'bold' });
        const U = acc * UHmax * sM() * 1e3;
        rich((U < 0 ? '−' : '') + Math.abs(U).toFixed(2), mx, my + 10, { size: 15, color: C.ink, align: 'center', base: 'middle', weight: 'bold' });
        rich('mV', mx, my + 26, { size: 11, color: C.mute, align: 'center', base: 'middle' });
        rich('+', mx - 22, my - 40, { size: 13, color: C.pos, align: 'center' });
        rich('−', mx + 22, my + 50, { size: 13, color: C.neg, align: 'center' });
        void my;
    }

    let lastT = 0;
    function render(ts) {
        if (!lastT) lastT = ts;
        const dt = Math.min(0.1, (ts - lastT) / 1000); lastT = ts;
        ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

        updateParticles(dt); updatePhysics();
        drawSlab(); drawField();
        drawLeadsAndMeter();
        drawParticles(); drawEdgeCharges(); drawFocusCarrier();

        // 顶部公式
        rich('*U*_{H} = *Bvb* = ' + Bf.toFixed(2) + '×' + v.toFixed(2) + '×' + (B_WIDTH * 1e3).toFixed(0) + '×10^{-3} = ' + (UHmax * 1e3).toFixed(2) + ' mV', W / 2, 44, { size: 17, color: C.force, align: 'center', weight: 'bold' });
        rich('厚度 *d* = ' + dmm.toFixed(2) + ' mm，宽 *b* = 5.0 mm', W / 2, 78, { size: 13, color: C.mute, align: 'center' });
        const state = (carrier === 'pos' ? '载流子带正电' : '载流子带负电') + '，磁场' + (bdir === 'in' ? '向里' : '向外');
        rich(state + (mode === 'steady' ? '，稳态' : (acc > 0.97 ? '，已趋于稳定' : '，电荷积累中')), W / 2, 495, { size: 16, color: C.ok, align: 'center' });
        requestAnimationFrame(render);
    }

    function setTitle() {
        $('stageTitle').textContent = mode === 'deflection' ? '偏转过程：载流子在洛伦兹力作用下偏向一侧' : '稳定状态：静电力与洛伦兹力平衡，载流子不再偏转';
    }
    function reset() { acc = mode === 'steady' ? 1 : 0; initParticles(); setTitle(); }
    function bindGroup(id, set) {
        const g = $(id);
        g.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
            g.querySelectorAll('.chip').forEach(o => o.classList.remove('on')); b.classList.add('on');
            set(b.dataset.v); reset();
        }));
    }
    bindGroup('grpMode', x => { mode = x; });
    bindGroup('grpCarrier', x => { carrier = x; });
    bindGroup('grpB', x => { bdir = x; });
    $('btnReplay').addEventListener('click', () => {
        mode = 'deflection';
        $('grpMode').querySelectorAll('.chip').forEach(o => o.classList.toggle('on', o.dataset.v === 'deflection'));
        reset();
    });
    const bindS = (id, out, fmt, set) => $(id).addEventListener('input', e => { const x = +e.target.value; set(x); $(out).textContent = fmt(x); });
    bindS('sliderI', 'valI', x => x.toFixed(1) + ' mA', x => { Ima = x; });
    bindS('sliderB', 'valB', x => x.toFixed(2) + ' T', x => { Bf = x; });
    bindS('sliderD', 'valD', x => x.toFixed(2) + ' mm', x => { dmm = x; });

    const dlg = $('explain');
    $('explainBtn').onclick = () => dlg.showModal();
    $('explainClose').onclick = () => dlg.close();
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

    fillFormulas(document);
    reset(); updatePhysics();
    requestAnimationFrame(render);
})();
