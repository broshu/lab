'use strict';
// 质谱仪：加速电场 → 速度选择器 → 偏转磁场 → 照相底片。
// 取 q = 1，质量以相对质量计，数值只用来比较大小；轨迹按比例缩放后绘制。
const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

const ISOTOPES = [
    { name: '<sup>1</sup>H 氕', label: '^1H', mass: 1, charge: 1, color: '#D55E00' },
    { name: '<sup>2</sup>H 氘', label: '^2H', mass: 2, charge: 1, color: '#0072B2' },
    { name: '<sup>3</sup>H 氚', label: '^3H', mass: 3, charge: 1, color: '#CC79A7' }
];
const params = { U: 1000, B2: 1.0, selected: new Set([0, 1, 2]) };

let particles = [];
let running = true;
let lastSpawn = 0;
let lastTime = performance.now();

const GEOM = { s1Y: 78, s2Y: 159, s3Y: 292, sourceX: 450, SCALE: 1.25, rMax: 120, dimBase: 432 };
const SEL = { B1: 0.50, mRef: 2 };

function vSelector() { return Math.sqrt(2 * params.U / SEL.mRef); }
function selE() { return SEL.B1 * vSelector(); }
function rPhysical(mass, charge) { return mass * vSelector() / (charge * params.B2); }
function currentScale() {
    let maxRaw = 0;
    params.selected.forEach(i => { const iso = ISOTOPES[i]; maxRaw = Math.max(maxRaw, rPhysical(iso.mass, iso.charge)); });
    if (maxRaw <= 0) return GEOM.SCALE;
    return Math.min(GEOM.SCALE, GEOM.rMax / maxRaw);
}

function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
}

class Particle {
    constructor(iso) {
        this.iso = iso; this.mass = iso.mass; this.charge = iso.charge; this.color = iso.color; this.label = iso.label;
        this.x = GEOM.sourceX; this.y = GEOM.s1Y;
        this.stage = 'accelerating'; this.alive = true; this.trail = []; this.progress = 0;
        this.angle = 0; this.radius = 0; this.centerX = 0; this.centerY = 0; this.angularSpeed = 0; this.hitX = null;
    }
    update(dt) {
        if (!this.alive) return;
        const ACCEL_DUR = 0.6, SEL_DUR = 0.5, DEF_DUR = 1.6;
        if (this.stage === 'accelerating') {
            this.progress += dt / ACCEL_DUR;
            const p = Math.min(1, this.progress);
            this.y = GEOM.s1Y + (GEOM.s2Y - GEOM.s1Y) * p * p; this.x = GEOM.sourceX;
            if (p >= 1) { this.y = GEOM.s2Y; this.stage = 'selecting'; this.progress = 0; }
        } else if (this.stage === 'selecting') {
            this.progress += dt / SEL_DUR;
            const p = Math.min(1, this.progress);
            this.y = GEOM.s2Y + (GEOM.s3Y - GEOM.s2Y) * p; this.x = GEOM.sourceX;
            if (p >= 1) {
                this.y = GEOM.s3Y; this.stage = 'deflecting';
                const scale = currentScale();
                this.radius = Math.min(Math.max(16, rPhysical(this.mass, this.charge) * scale), GEOM.rMax);
                this.centerX = GEOM.sourceX - this.radius; this.centerY = GEOM.s3Y;
                this.angle = 0; this.angularSpeed = Math.PI / DEF_DUR;
            }
        } else if (this.stage === 'deflecting') {
            this.angle += this.angularSpeed * dt;
            if (this.angle > Math.PI) this.angle = Math.PI;
            this.x = this.centerX + this.radius * Math.cos(this.angle);
            this.y = this.centerY + this.radius * Math.sin(this.angle);
            if (this.angle >= Math.PI - 0.005) {
                this.angle = Math.PI; this.x = GEOM.sourceX - 2 * this.radius; this.y = GEOM.s3Y;
                this.hitX = this.x; this.alive = false; recordHit(this);
            }
        }
        if (this.x < 0 || this.x > 920 || this.y < 0 || this.y > 660) this.alive = false;
    }
    draw(g) {
        if (this.trail.length > 1) {
            el('path', { d: this.trail.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' '), fill: 'none', stroke: this.color, 'stroke-width': 2, opacity: 0.6, 'stroke-linecap': 'round' }, g);
        }
        el('circle', { cx: this.x, cy: this.y, r: 11, fill: this.color, opacity: 0.22 }, g);
        el('circle', { cx: this.x, cy: this.y, r: 5.5, fill: this.color, stroke: '#fff', 'stroke-width': 1.3 }, g);
    }
}

function recordHit(p) {
    const g = $('hits');
    const full = p.trail.concat([{ x: p.hitX, y: GEOM.s3Y }]);
    if (full.length > 1) {
        el('path', { d: full.map((pt, i) => (i === 0 ? 'M' : 'L') + pt.x.toFixed(1) + ',' + pt.y.toFixed(1)).join(' '), fill: 'none', stroke: p.color, 'stroke-width': 1.6, opacity: 0.35 }, g);
    }
    el('circle', { cx: p.hitX, cy: GEOM.s3Y, r: 7, fill: p.color, stroke: '#fff', 'stroke-width': 1.5, opacity: 0.95 }, g);
    const t = el('text', { x: p.hitX, y: GEOM.s3Y - 14, fill: p.color, 'font-size': 14, 'font-weight': 700, 'text-anchor': 'middle' }, g);
    t.innerHTML = mk(p.label);
    while (g.childNodes.length > 45) g.removeChild(g.firstChild);
}

function drawDims() {
    const g = $('dims'); g.innerHTML = '';
    const idxs = [...params.selected].sort((a, b) => a - b);
    const scale = currentScale();
    el('line', { x1: GEOM.sourceX, y1: GEOM.s3Y + 4, x2: GEOM.sourceX, y2: GEOM.dimBase + idxs.length * 24 - 8, stroke: '#999', 'stroke-width': 1, 'stroke-dasharray': '3,4' }, g);
    idxs.forEach((idx, k) => {
        const iso = ISOTOPES[idx];
        const rPhys = rPhysical(iso.mass, iso.charge);
        const rDisp = Math.min(Math.max(16, rPhys * scale), GEOM.rMax);
        const hitX = GEOM.sourceX - 2 * rDisp, yD = GEOM.dimBase + k * 24;
        el('line', { x1: hitX, y1: GEOM.s3Y + 4, x2: hitX, y2: yD + 4, stroke: iso.color, 'stroke-width': 1, 'stroke-dasharray': '3,4', opacity: 0.6 }, g);
        el('line', { x1: GEOM.sourceX, y1: yD, x2: hitX, y2: yD, stroke: '#555', 'stroke-width': 1.5, 'marker-start': 'url(#mArrowL)', 'marker-end': 'url(#mArrowR)' }, g);
        const t = el('text', { x: (GEOM.sourceX + hitX) / 2, y: yD - 5, fill: iso.color, 'font-size': 13, 'font-weight': 600, 'text-anchor': 'middle' }, g);
        t.innerHTML = mk('*X*_' + (idx + 1) + ' = ' + (2 * rPhys).toFixed(1));
    });
}

function render() {
    const g = $('particles'); while (g.firstChild) g.removeChild(g.firstChild);
    particles.forEach(p => p.draw(g));
}

function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000); lastTime = now;
    if (running) {
        lastSpawn += dt;
        if (lastSpawn > 0.6) {
            lastSpawn = 0;
            params.selected.forEach(idx => particles.push(new Particle(ISOTOPES[idx])));
            if (particles.length > 60) particles = particles.slice(-50);
        }
        particles.forEach(p => {
            if (p.alive) { p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > 220) p.trail.shift(); }
            p.update(dt);
        });
        particles = particles.filter(p => p.alive);
    }
    updateInfo(); render();
    requestAnimationFrame(loop);
}

let selCache = '';
function updateInfo() {
    const v0 = vSelector();
    $('infoV').textContent = v0.toFixed(1);
    if (params.selected.size > 0) {
        const iso = ISOTOPES[Math.min(...params.selected)];
        const r = rPhysical(iso.mass, iso.charge);
        $('infoR').textContent = r.toFixed(1);
        $('infoX').textContent = (2 * r).toFixed(1);
    } else { $('infoR').textContent = '--'; $('infoX').textContent = '--'; }
    const key = params.U + '|' + params.B2;
    if (key !== selCache) {
        selCache = key;
        $('selE').innerHTML = mk('*E* = ' + selE().toFixed(1) + '（向右）');
        $('selB1').innerHTML = mk('*B*_1 = ' + SEL.B1.toFixed(2) + ' T（垂直纸面向外）');
        $('selV').innerHTML = mk('*v* = *E*/*B*_1 = ' + v0.toFixed(1));
        $('selTune').innerHTML = mk('已按 *U* = ' + params.U + ' V 自动调谐');
    }
    $('scaleNote').style.display = currentScale() < GEOM.SCALE - 0.0001 ? '' : 'none';
    updateDerive();
}

let deriveCache = '';
function updateDerive() {
    const tb = $('deriveBody'), v0 = vSelector();
    let html = '';
    ISOTOPES.forEach((iso, idx) => {
        const r = rPhysical(iso.mass, iso.charge);
        html += '<tr' + (params.selected.has(idx) ? '' : ' class="dim"') + '><td style="color:' + iso.color + '">' + iso.name + '</td><td>' + iso.mass + '</td><td>' + v0.toFixed(1) + '</td><td>' + r.toFixed(1) + '</td><td>' + (2 * r).toFixed(1) + '</td></tr>';
    });
    if (html !== deriveCache) { tb.innerHTML = html; deriveCache = html; }
}

function bindGroup(groupId, key, valId, fmt) {
    const grp = $(groupId);
    grp.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', () => {
            grp.querySelectorAll('.chip').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            params[key] = parseFloat(btn.dataset.v);
            $(valId).textContent = fmt(params[key]);
            drawDims();
        });
    });
}
bindGroup('grpU', 'U', 'valU', v => v + ' V');
bindGroup('grpB', 'B2', 'valB2', v => v.toFixed(1) + ' T');

ISOTOPES.forEach((iso, idx) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'iso active';
    b.innerHTML = '<span class="dot" style="background:' + iso.color + '"></span><span class="name">' + iso.name + '</span><span class="mass">m = ' + iso.mass + ' u</span>';
    b.addEventListener('click', () => {
        if (params.selected.has(idx)) { params.selected.delete(idx); b.classList.remove('active'); }
        else { params.selected.add(idx); b.classList.add('active'); }
        drawDims();
    });
    $('isoList').appendChild(b);
});

function dotsMark(g, pts, r) {
    pts.forEach(([x, y]) => { el('circle', { cx: x, cy: y, r: r + 3, fill: 'none', stroke: '#009E73', 'stroke-width': 1.2 }, g); el('circle', { cx: x, cy: y, r: 1.4, fill: '#009E73' }, g); });
}
(function buildDots() {
    const b = [];
    [[180, 370], [250, 330], [330, 315], [410, 320], [480, 340], [150, 430], [220, 400], [300, 390], [460, 400], [520, 450], [170, 500], [240, 470], [320, 460], [400, 460], [480, 480], [200, 560], [280, 540], [360, 540], [440, 550], [300, 610], [400, 600]].forEach(p => b.push(p));
    dotsMark($('bdots'), b, 2);
    dotsMark($('seldots'), [[430, 200], [475, 200], [425, 224], [478, 224], [425, 254], [478, 254], [430, 276], [475, 276]], 1);
})();

$('btnReset').addEventListener('click', () => { $('hits').innerHTML = ''; });
$('btnPause').addEventListener('click', e => { running = !running; e.target.textContent = running ? '暂停' : '继续'; });

const dlg = $('explain');
$('explainBtn').onclick = () => dlg.showModal();
$('explainClose').onclick = () => dlg.close();
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

fillFormulas(document);
typesetSvg(document);
drawDims();
requestAnimationFrame(loop);
