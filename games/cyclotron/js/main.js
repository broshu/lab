'use strict';
// 回旋加速器：物理量按真实公式计算，轨迹为示意（15 段螺旋）。
const E_C = 1.6e-19, U_KG = 1.66e-27;
const PART = {
    H: { name: '质子 <sup>1</sup>H', short: '质子', m: 1, q: 1, color: '#0072B2' },
    D: { name: '氘核 <sup>2</sup>H', short: '氘核', m: 2, q: 1, color: '#009E73' },
    A: { name: 'α 粒子', short: 'α 粒子', m: 4, q: 2, color: '#D55E00' }
};
const params = { p: 'H', B: 1.0, R: 0.5, U: 100, spd: 1 };
const GEO = { cx: 430, cy: 370, Rpx: 250 };
const DUR = { cross: 380, arc: 1250, exit: 900, hold: 2200 };
const $ = id => document.getElementById(id);
const FML = window.FORMULAS || {};

let phys = null, segs = [], totalDur = 0, trailStr = '', simTime = 0, paused = false, curSeg = -1;

function fillFormulas(root) {
    root.querySelectorAll('[data-f]').forEach(el => { el.innerHTML = FML[el.dataset.f] || ''; });
}

function computePhysics() {
    const pt = PART[params.p], m = pt.m * U_KG, q = pt.q * E_C, B = params.B, R = params.R, U = params.U * 1000;
    const T = 2 * Math.PI * m / (q * B), f = 1 / T;
    const vm = q * B * R / m, Ekm = 0.5 * m * vm * vm, EkmMeV = Ekm / E_C / 1e6;
    let n = Math.round(q * B * B * R * R / (2 * m * U)); n = Math.max(n, 5);
    const tt = Math.PI * B * R * R / (2 * U);
    return { pt, m, q, B, R, U, T, f, vm, EkmMeV, n, tt };
}

function buildTrajectory() {
    const N = phys.n, VisN = 15, g = 8;
    const d = [0];
    for (let i = 1; i <= VisN; i++) d[i] = 0.985 * GEO.Rpx * Math.pow(i / VisN, 0.55);
    const yA = [0];
    for (let i = 1; i <= VisN; i++) yA[i] = (i % 2 === 1) ? d[i] : -d[i];
    const r = [], nv = [];
    for (let i = 1; i <= VisN; i++) {
        r[i] = (d[i] + d[i - 1]) / 2;
        nv[i] = Math.max(1, Math.round(N * Math.pow(r[i] / GEO.Rpx, 2)));
    }
    nv[VisN] = N;
    segs = []; let t = 0;
    for (let i = 1; i <= VisN; i++) {
        const s = (i % 2 === 1) ? 1 : -1;
        const yv = GEO.cy + yA[i - 1];
        const p0 = (i === 1) ? [GEO.cx, GEO.cy] : [GEO.cx - s * g, yv];
        segs.push({ type: 'cross', i, t0: t, dur: DUR.cross, p0, p1: [GEO.cx + s * g, yv] });
        t += DUR.cross;
        const cyc = GEO.cy + (yA[i - 1] + yA[i]) / 2;
        const last = (i === VisN);
        segs.push({ type: 'arc', i, t0: t, dur: DUR.arc, s, g, r: r[i], cy: cyc, a0: 0, a1: last ? 1.25 : Math.PI });
        t += DUR.arc;
    }
    const pe = segPos(segs[segs.length - 1], 1);
    segs.push({ type: 'exit', t0: t, dur: DUR.exit, p0: pe, c1: [pe[0] + 58 * Math.cos(1.25), pe[1] + 58 * Math.sin(1.25)], c2: [708, 448], p1: [704, 506] });
    t += DUR.exit;
    totalDur = t + DUR.hold;
    phys.visN = VisN; phys.nv = nv;
    let dth = 'M ' + GEO.cx + ' ' + GEO.cy;
    for (const sg of segs) { for (let k = 0; k <= 24; k++) { const p = segPos(sg, k / 24); dth += ' L ' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); } }
    $('ghost').setAttribute('d', dth);
}

function segPos(s, k) {
    if (s.type === 'cross') return [s.p0[0] + (s.p1[0] - s.p0[0]) * k, s.p0[1]];
    if (s.type === 'arc') { const ps = s.a0 + (s.a1 - s.a0) * k; return [GEO.cx + s.g * s.s + s.r * s.s * Math.sin(ps), s.cy - s.r * s.s * Math.cos(ps)]; }
    const w = 1 - k;
    return [w * w * w * s.p0[0] + 3 * w * w * k * s.c1[0] + 3 * w * k * k * s.c2[0] + k * k * k * s.p1[0],
            w * w * w * s.p0[1] + 3 * w * w * k * s.c1[1] + 3 * w * k * k * s.c2[1] + k * k * k * s.p1[1]];
}

function buildBDots() {
    const g = $('bfield'); g.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';
    for (const rr of [70, 130, 190]) {
        for (let a = 15; a < 360; a += 30) {
            const x = GEO.cx + rr * Math.sin(a * Math.PI / 180), y = GEO.cy - rr * Math.cos(a * Math.PI / 180);
            if (Math.abs(x - GEO.cx) < 48) continue;
            const c = document.createElementNS(ns, 'circle');
            c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 4.4); c.setAttribute('fill', 'none'); c.setAttribute('stroke', '#009E73'); c.setAttribute('stroke-width', '1.4');
            const d2 = document.createElementNS(ns, 'circle');
            d2.setAttribute('cx', x); d2.setAttribute('cy', y); d2.setAttribute('r', '1.4'); d2.setAttribute('fill', '#009E73');
            g.appendChild(c); g.appendChild(d2);
        }
    }
}

function buildWave() {
    const n = phys.visN, half = 280 / n;
    let d = 'M10,18';
    for (let k = 1; k <= n; k++) { d += ' H' + (10 + k * half).toFixed(1); if (k < n) d += (k % 2 === 1 ? ' V46' : ' V18'); }
    $('wpath').setAttribute('d', d);
}

function setE(dir) {
    const xs = (dir === 'right') ? [424, 436] : [436, 424];
    ['e1', 'e2', 'e3'].forEach(id => { const el = $(id); el.setAttribute('x1', xs[0]); el.setAttribute('x2', xs[1]); });
    $('polL').textContent = (dir === 'right') ? '+' : '−';
    $('polL').setAttribute('fill', (dir === 'right') ? '#D55E00' : '#0072B2');
    $('polR').textContent = (dir === 'right') ? '−' : '+';
    $('polR').setAttribute('fill', (dir === 'right') ? '#0072B2' : '#D55E00');
    $('wdot').setAttribute('cy', (dir === 'right') ? 18 : 46);
    $('lvDir').innerHTML = (dir === 'right')
        ? '狭缝电场方向：向右（D<sub>1</sub> 为正，D<sub>2</sub> 为负）'
        : '狭缝电场方向：向左（D<sub>1</sub> 为负，D<sub>2</sub> 为正）';
}

function fmtT(s) { if (s < 1e-6) return (s * 1e9).toFixed(1) + ' ns'; if (s < 1e-3) return (s * 1e6).toFixed(2) + ' μs'; if (s < 1) return (s * 1e3).toFixed(2) + ' ms'; return s.toFixed(2) + ' s'; }
function fmtE(MeV) { return MeV >= 1 ? MeV.toFixed(2) + ' MeV' : (MeV * 1000).toFixed(1) + ' keV'; }
function fmtV(v) { return (v / 1e7).toFixed(2) + '×10<sup>7</sup> m/s'; }

function updateStatic() {
    $('dot').setAttribute('fill', phys.pt.color);
    $('dotHalo').setAttribute('fill', phys.pt.color);
    $('trail').setAttribute('stroke', phys.pt.color);
    $('stT').textContent = fmtT(phys.T);
    $('stF').textContent = (phys.f / 1e6).toFixed(1) + ' MHz';
    $('stVm').innerHTML = fmtV(phys.vm);
    $('stEkm').textContent = fmtE(phys.EkmMeV);
    $('stN').textContent = phys.n + ' 次';
    $('stTt').textContent = fmtT(phys.tt);
    $('lvP').innerHTML = phys.pt.name;
    const tb = $('dTbl');
    tb.innerHTML = '<tr><th>粒子</th><th><span class="tex" data-f="qm"></span><br>（×10<sup>7</sup> C/kg）</th><th><span class="tex" data-f="EkmS"></span></th><th><span class="tex" data-f="NS"></span></th></tr>';
    for (const key of ['H', 'D', 'A']) {
        const p = PART[key], m = p.m * U_KG, q = p.q * E_C;
        const vm = q * params.B * params.R / m, Ek = 0.5 * m * vm * vm / E_C / 1e6;
        const nn = Math.max(5, Math.round(q * params.B * params.B * params.R * params.R / (2 * m * params.U * 1000)));
        const tr = document.createElement('tr');
        tr.className = (key === params.p) ? 'on' : 'dim';
        tr.innerHTML = '<td>' + p.name + '</td><td>' + (q / m / 1e7).toFixed(1) + '</td><td>' + fmtE(Ek) + '</td><td>' + nn + '</td>';
        tb.appendChild(tr);
    }
    fillFormulas(tb);
}

function setLive(n, fin) {
    const N = phys.n, frac = (fin || n >= N) ? 1 : (n > 0 ? n / N : 0);
    const v = phys.vm * Math.sqrt(frac), rr = params.R * Math.sqrt(frac), Ek = phys.EkmMeV * frac;
    $('lvN').textContent = fin ? ('已出射，共加速 ' + N + ' 次') : ('第 ' + n + ' / ' + N + ' 次');
    $('lvV').innerHTML = (n > 0 || fin) ? fmtV(v) : '0';
    $('lvR').textContent = ((n > 0 || fin) ? rr.toFixed(3) : '0') + ' m';
    $('lvE').textContent = (n > 0 || fin) ? fmtE(Ek) : '0';
}

function resetRun() {
    phys = computePhysics();
    buildTrajectory(); buildWave();
    simTime = 0; curSeg = -1; trailStr = '';
    $('trail').setAttribute('d', '');
    ['dot', 'dotHalo'].forEach(id => { $(id).setAttribute('cx', GEO.cx); $(id).setAttribute('cy', GEO.cy); });
    $('wcur').setAttribute('x1', 10); $('wcur').setAttribute('x2', 10);
    $('wdot').setAttribute('cx', 10);
    setE('right'); setLive(0); updateStatic();
}

function onEnterSeg(s) {
    if (s.type === 'cross') { setE(s.i % 2 === 1 ? 'right' : 'left'); setLive(phys.nv[s.i]); }
    else if (s.type === 'arc') { if (s.i < phys.visN) setE((s.i + 1) % 2 === 1 ? 'right' : 'left'); }
    else { setLive(phys.n, true); }
}

let lastTs = null;
function loop(ts) {
    if (lastTs === null) lastTs = ts;
    const dt = Math.min(100, ts - lastTs) * params.spd; lastTs = ts;
    if (!paused && phys) {
        simTime += dt;
        if (simTime >= totalDur) { resetRun(); }
        else {
            let idx = 0;
            for (let k = 0; k < segs.length; k++) { if (simTime >= segs[k].t0 && simTime < segs[k].t0 + segs[k].dur) { idx = k; break; } idx = k; }
            if (idx !== curSeg) { curSeg = idx; onEnterSeg(segs[idx]); trailStr += ' M'; }
            else trailStr += ' L';
            const s = segs[idx], k = Math.min(1, (simTime - s.t0) / s.dur);
            const p = segPos(s, k);
            trailStr += p[0].toFixed(1) + ',' + p[1].toFixed(1);
            $('trail').setAttribute('d', 'M ' + GEO.cx + ' ' + GEO.cy + trailStr);
            ['dot', 'dotHalo'].forEach(id => { $(id).setAttribute('cx', p[0]); $(id).setAttribute('cy', p[1]); });
            const active = totalDur - DUR.hold;
            const wx = 10 + 280 * Math.min(1, simTime / active);
            $('wcur').setAttribute('x1', wx); $('wcur').setAttribute('x2', wx);
            $('wdot').setAttribute('cx', wx);
        }
    }
    requestAnimationFrame(loop);
}

function bindGroup(id, items, cur, cb) {
    const el = $(id);
    items.forEach(it => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip' + (it.v === cur ? ' on' : '');
        b.textContent = it.t;
        b.onclick = () => { el.querySelectorAll('.chip').forEach(o => o.classList.remove('on')); b.classList.add('on'); cb(it.v); };
        el.appendChild(b);
    });
}

bindGroup('grpP', [{ v: 'H', t: '质子' }, { v: 'D', t: '氘核' }, { v: 'A', t: 'α 粒子' }], params.p, v => { params.p = v; resetRun(); });
bindGroup('grpB', [0.5, 1.0, 1.5, 2.0].map(v => ({ v, t: v.toFixed(1) })), params.B, v => { params.B = v; resetRun(); });
bindGroup('grpR', [0.3, 0.5, 0.8, 1.0].map(v => ({ v, t: v.toFixed(1) })), params.R, v => { params.R = v; resetRun(); });
bindGroup('grpU', [10, 20, 50, 100].map(v => ({ v, t: v })), params.U, v => { params.U = v; resetRun(); });

$('btnPlay').onclick = () => { paused = !paused; $('btnPlay').textContent = paused ? '播放' : '暂停'; };
$('btnReset').onclick = () => { resetRun(); };
$('btnSlow').onclick = () => { const on = params.spd === 1; params.spd = on ? 0.5 : 1; $('btnSlow').textContent = on ? '正常 1×' : '慢速 0.5×'; };

const dlg = $('explain');
$('explainBtn').onclick = () => dlg.showModal();
$('explainClose').onclick = () => dlg.close();
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

fillFormulas(document);
buildBDots();
resetRun();
requestAnimationFrame(loop);
