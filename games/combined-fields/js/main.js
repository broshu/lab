"use strict";

/* =========================================================
   全局状态
   ========================================================= */
const state = { view: 'menu' };

const P = {
  m: 1.0, q: 1.0, v0: 6.0, theta0: 0,
  E: 0.0, Eangle: 0, B: 1.0, Bdir: 1,
  g: 10.0, gOn: true,
  c_m: 1.0, c_q: 1.0, c_v0: 4.0, c_theta0: 0,
  c_startOffset: 0, c_gOn: false
};

let fields = [];
let fieldIdCounter = 0;

const FIELD_DEFS = {
  E_accel: {
    name: '加速电场', color: '#8a5f00',
    params: [
      { key: 'x0', label: '左边界', min: -7, max: 7, step: 0.1 },
      { key: 'x1', label: '右边界', min: -7, max: 7, step: 0.1 },
      { key: 'E',  label: '场强 <i class="v">E</i>', min: 0, max: 200, step: 1 },
      { key: 'Eangle', label: '方向角', min: 0, max: 360, step: 5 }
    ],
    defaults: { x0: -3, x1: -2, E: 10, Eangle: 0 }
  },
  E_deflect: {
    name: '偏转电场', color: '#8a5f00',
    params: [
      { key: 'x0', label: '左边界', min: -7, max: 7, step: 0.1 },
      { key: 'x1', label: '右边界', min: -7, max: 7, step: 0.1 },
      { key: 'E',  label: '场强 <i class="v">E</i>', min: 0, max: 200, step: 1 },
      { key: 'Eangle', label: '方向角', min: 0, max: 360, step: 5 }
    ],
    defaults: { x0: -1, x1: 1, E: 5, Eangle: 90 }
  },
  E_alt: {
    name: '交变电场', color: '#8a5f00',
    params: [
      { key: 'x0', label: '左边界', min: -7, max: 7, step: 0.1 },
      { key: 'x1', label: '右边界', min: -7, max: 7, step: 0.1 },
      { key: 'E',  label: '场强 <i class="v">E</i>', min: 0, max: 200, step: 1 },
      { key: 'Eangle', label: '方向角', min: 0, max: 360, step: 5 },
      { key: 'period', label: '周期 <i class="v">T</i>', min: 0.1, max: 5, step: 0.1 }
    ],
    defaults: { x0: 0, x1: 3, E: 8, Eangle: 90, period: 1 }
  },
  E_inf: {
    name: '无限宽电场', color: '#8a5f00',
    params: [
      { key: 'E',  label: '场强 <i class="v">E</i>', min: 0, max: 200, step: 1 },
      { key: 'Eangle', label: '方向角', min: 0, max: 360, step: 5 }
    ],
    defaults: { E: 5, Eangle: 0 }
  },
  E_radial: {
    name: '辐射电场', color: '#8a5f00',
    params: [
      { key: 'cx', label: '圆心 <i class="v">x</i>', min: -7, max: 7, step: 0.1 },
      { key: 'cy', label: '圆心 <i class="v">y</i>', min: -5, max: 5, step: 0.1 },
      { key: 'r1', label: '内半径', min: 0, max: 3, step: 0.05 },
      { key: 'r2', label: '外半径', min: 0.1, max: 4, step: 0.05 },
      { key: 'E',  label: '场强 <i class="v">E</i>', min: 0, max: 200, step: 1 }
    ],
    defaults: { cx: 0, cy: 0, r1: 0.5, r2: 2.0, E: 10, radialDir: 1 }
  },
  B_rect: {
    name: '矩形磁场', color: '#007a58',
    params: [
      { key: 'x0', label: '左边界', min: -7, max: 7, step: 0.1 },
      { key: 'x1', label: '右边界', min: -7, max: 7, step: 0.1 },
      { key: 'B',  label: '场强 <i class="v">B</i>', min: 0, max: 100, step: 0.5 }
    ],
    defaults: { x0: 1, x1: 3, B: 1, Bdir: -1 }
  },
  B_circle: {
    name: '圆形磁场', color: '#007a58',
    params: [
      { key: 'cx', label: '圆心 <i class="v">x</i>', min: -7, max: 7, step: 0.1 },
      { key: 'cy', label: '圆心 <i class="v">y</i>', min: -5, max: 5, step: 0.1 },
      { key: 'r',  label: '半径 <i class="v">r</i>', min: 0.1, max: 3, step: 0.05 },
      { key: 'B',  label: '场强 <i class="v">B</i>', min: 0, max: 100, step: 0.5 }
    ],
    defaults: { cx: 1, cy: 0, r: 0.8, B: 1, Bdir: -1 }
  },
  B_half: {
    name: '半圆形磁场', color: '#007a58',
    params: [
      { key: 'cx', label: '圆心 <i class="v">x</i>', min: -7, max: 7, step: 0.1 },
      { key: 'cy', label: '圆心 <i class="v">y</i>', min: -5, max: 5, step: 0.1 },
      { key: 'r',  label: '半径 <i class="v">r</i>', min: 0.1, max: 3, step: 0.05 },
      { key: 'B',  label: '场强 <i class="v">B</i>', min: 0, max: 100, step: 0.5 }
    ],
    defaults: { cx: 1, cy: 0, r: 1.0, B: 1, Bdir: -1 }
  },
  B_ring: {
    name: '环形磁场', color: '#007a58',
    params: [
      { key: 'cx', label: '圆心 <i class="v">x</i>', min: -7, max: 7, step: 0.1 },
      { key: 'cy', label: '圆心 <i class="v">y</i>', min: -5, max: 5, step: 0.1 },
      { key: 'r1', label: '内半径', min: 0.1, max: 3, step: 0.05 },
      { key: 'r2', label: '外半径', min: 0.2, max: 4, step: 0.05 },
      { key: 'B',  label: '场强 <i class="v">B</i>', min: 0, max: 100, step: 0.5 }
    ],
    defaults: { cx: 0, cy: 0, r1: 0.5, r2: 1.2, B: 1, Bdir: -1 }
  },
  B_alt: {
    name: '周期性磁场', color: '#007a58',
    params: [
      { key: 'x0', label: '左边界', min: -7, max: 7, step: 0.1 },
      { key: 'x1', label: '右边界', min: -7, max: 7, step: 0.1 },
      { key: 'B',  label: '场强 <i class="v">B</i>', min: 0, max: 100, step: 0.5 },
      { key: 'period', label: '周期 <i class="v">T</i>', min: 0.1, max: 5, step: 0.1 }
    ],
    defaults: { x0: 1, x1: 3, B: 1, Bdir: -1, period: 1 }
  },
  B_inf: {
    name: '无限宽磁场', color: '#007a58',
    params: [
      { key: 'B',  label: '场强 <i class="v">B</i>', min: 0, max: 100, step: 0.5 }
    ],
    defaults: { B: 1, Bdir: -1 }
  }
};

let traj = null;
let tCur = 0;
let playing = false;
let speedMul = 1.0;
let lastTs = 0;
let draggingTime = false;

const showLines = { v: true, vx: true, vy: true };

const sceneSuper = document.getElementById('sceneSuper');
const sceneCombo = document.getElementById('sceneCombo');
const graphSuper = document.getElementById('graphSuper');
const timeSlider  = document.getElementById('timeSlider');
const timeLabel   = document.getElementById('timeLabel');
const speedSlider = document.getElementById('speedSlider');
const speedLabel  = document.getElementById('speedLabel');
const btnPlay     = document.getElementById('btnPlay');

/* =========================================================
   场管理
   ========================================================= */
function createField(type) {
  const def = FIELD_DEFS[type];
  if (!def) return;
  const id = ++fieldIdCounter;
  fields.push({ id, type, ...def.defaults });
  renderFieldList();
  rebuild(true);
}
function removeField(id) {
  fields = fields.filter(f => f.id !== id);
  renderFieldList();
  rebuild(true);
}
function renderFieldList() {
  const list = document.getElementById('fieldList');
  list.innerHTML = '';
  if (fields.length === 0) {
    list.innerHTML = '<div class="empty-tip">点击上方按钮添加场<br>可自由组合电场与磁场</div>';
    return;
  }
  for (const f of fields) list.appendChild(createFieldCard(f));
}
function createFieldCard(f) {
  const def = FIELD_DEFS[f.type];
  const card = document.createElement('div');
  card.className = 'field-card';
  card.dataset.id = f.id;
  card.style.borderLeft = '3px solid ' + def.color;

  const header = document.createElement('div');
  header.className = 'fc-header';
  header.innerHTML = `
    <span class="fc-name" style="color:${def.color}">${def.name}</span>
    <button class="fc-del" data-del="${f.id}">×</button>
  `;
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'fc-body';
  for (const p of def.params) {
    const row = document.createElement('div');
    row.className = 'fc-row';
    const val = f[p.key] !== undefined ? f[p.key] : 0;
    row.innerHTML = `
      <span class="fc-label">${p.label}</span>
      <button class="fc-btn" data-fid="${f.id}" data-pkey="${p.key}" data-fdir="-1">−</button>
      <input type="range" data-fid="${f.id}" data-pkey="${p.key}"
             min="${p.min}" max="${p.max}" step="${p.step}" value="${val}">
      <button class="fc-btn" data-fid="${f.id}" data-pkey="${p.key}" data-fdir="1">+</button>
      <span class="fc-val" data-vid="${f.id}-${p.key}">${formatFieldVal(p.key, val)}</span>
    `;
    body.appendChild(row);
  }
  if (f.type === 'B_rect' || f.type === 'B_circle' || f.type === 'B_ring' ||
      f.type === 'B_half' || f.type === 'B_alt' || f.type === 'B_inf') {
    const row = document.createElement('div');
    row.className = 'fc-row';
    row.innerHTML = `
      <span class="fc-label">方向</span>
      <button class="toggle ${f.Bdir < 0 ? 'on' : ''}" data-bdirtoggle="${f.id}"
              style="flex:1;padding:3px 8px;font-size:13px">
        ${f.Bdir < 0 ? '× 向里' : '· 向外'}
      </button>
      <span style="width:40px"></span>
    `;
    body.appendChild(row);
  }
  if (f.type === 'E_radial') {
    const row = document.createElement('div');
    row.className = 'fc-row';
    row.innerHTML = `
      <span class="fc-label">方向</span>
      <button class="toggle ${f.radialDir < 0 ? 'on' : ''}" data-radialdirtoggle="${f.id}"
              style="flex:1;padding:3px 8px;font-size:13px">
        ${f.radialDir < 0 ? '指向圆心' : '背离圆心'}
      </button>
      <span style="width:40px"></span>
    `;
    body.appendChild(row);
  }
  card.appendChild(body);
  return card;
}
function formatFieldVal(key, val) {
  if (key === 'E' || key === 'B' || key === 'period') return val.toFixed(1);
  if (key === 'Eangle') return Math.round(val) + '°';
  return val.toFixed(2);
}

document.getElementById('fieldList').addEventListener('input', (e) => {
  const inp = e.target.closest('input[data-fid]');
  if (!inp) return;
  const fid = +inp.dataset.fid;
  const pkey = inp.dataset.pkey;
  const val = parseFloat(inp.value);
  const f = fields.find(ff => ff.id === fid);
  if (!f) return;
  f[pkey] = val;
  const label = document.querySelector(`[data-vid="${fid}-${pkey}"]`);
  if (label) label.textContent = formatFieldVal(pkey, val);
  rebuild(true);
});

document.getElementById('fieldList').addEventListener('click', (e) => {
  if (e.target.dataset.del) { removeField(+e.target.dataset.del); return; }
  if (e.target.dataset.bdirtoggle) {
    const fid = +e.target.dataset.bdirtoggle;
    const f = fields.find(ff => ff.id === fid);
    if (!f) return;
    f.Bdir = -f.Bdir;
    e.target.textContent = f.Bdir < 0 ? '× 向里' : '· 向外';
    e.target.classList.toggle('on', f.Bdir < 0);
    rebuild(true);
    return;
  }
  if (e.target.dataset.radialdirtoggle) {
    const fid = +e.target.dataset.radialdirtoggle;
    const f = fields.find(ff => ff.id === fid);
    if (!f) return;
    f.radialDir = -f.radialDir;
    e.target.textContent = f.radialDir < 0 ? '指向圆心' : '背离圆心';
    e.target.classList.toggle('on', f.radialDir < 0);
    rebuild(true);
    return;
  }
  if (e.target.dataset.fdir !== undefined && e.target.dataset.fid) {
    const fid = +e.target.dataset.fid;
    const pkey = e.target.dataset.pkey;
    const dir = parseFloat(e.target.dataset.fdir);
    const f = fields.find(ff => ff.id === fid);
    if (!f) return;
    const def = FIELD_DEFS[f.type];
    const p = def.params.find(pp => pp.key === pkey);
    if (!p) return;
    const step = p.step || 0.1;
    let v = (f[pkey] !== undefined ? f[pkey] : 0) + dir * step;
    v = Math.round(v / step) * step;
    v = Math.min(p.max, Math.max(p.min, v));
    f[pkey] = v;
    const slider = document.querySelector(
      `#fieldList input[data-fid="${fid}"][data-pkey="${pkey}"]`
    );
    if (slider) slider.value = v;
    const label = document.querySelector(`[data-vid="${fid}-${pkey}"]`);
    if (label) label.textContent = formatFieldVal(pkey, v);
    rebuild(true);
  }
});

document.querySelectorAll('.field-add-btn').forEach(btn => {
  btn.addEventListener('click', () => createField(btn.dataset.add));
});

/* =========================================================
   配置导出 / 导入
   ========================================================= */
function exportConfig() {
  const data = {
    version: 1,
    type: 'combo',
    timestamp: new Date().toISOString(),
    particle: {
      m: P.c_m, q: P.c_q, v0: P.c_v0,
      theta0: P.c_theta0, startOffset: P.c_startOffset, gOn: P.c_gOn
    },
    fields: fields.map(f => {
      const copy = { type: f.type };
      const def = FIELD_DEFS[f.type];
      if (def) {
        for (const p of def.params) {
          if (f[p.key] !== undefined) copy[p.key] = f[p.key];
        }
        if (f.Bdir !== undefined) copy.Bdir = f.Bdir;
        if (f.radialDir !== undefined) copy.radialDir = f.radialDir;
      }
      return copy;
    })
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const ts = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fname = `组合场配置_${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}.json`;
  const a = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importConfig(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || typeof data !== 'object') throw new Error('格式错误');
      if (!Array.isArray(data.fields)) throw new Error('缺少场数据');

      if (data.particle) {
        const pt = data.particle;
        if (typeof pt.m === 'number') P.c_m = pt.m;
        if (typeof pt.q === 'number') P.c_q = pt.q;
        if (typeof pt.v0 === 'number') P.c_v0 = pt.v0;
        if (typeof pt.theta0 === 'number') P.c_theta0 = pt.theta0;
        if (typeof pt.startOffset === 'number') P.c_startOffset = pt.startOffset;
        if (typeof pt.gOn === 'boolean') P.c_gOn = pt.gOn;
      }

      fields = [];
      fieldIdCounter = 0;
      let skipped = 0;
      for (const f of data.fields) {
        if (!f || !f.type || !FIELD_DEFS[f.type]) { skipped++; continue; }
        const def = FIELD_DEFS[f.type];
        fieldIdCounter++;
        const newField = { id: fieldIdCounter, type: f.type };
        for (const k of Object.keys(def.defaults)) newField[k] = def.defaults[k];
        for (const p of def.params) {
          if (typeof f[p.key] === 'number') {
            newField[p.key] = Math.min(p.max, Math.max(p.min, f[p.key]));
          }
        }
        if (typeof f.Bdir === 'number') newField.Bdir = f.Bdir;
        if (typeof f.radialDir === 'number') newField.radialDir = f.radialDir;
        fields.push(newField);
      }

      document.querySelector('#viewCombo input[data-ck="m"]').value = P.c_m;
      document.querySelector('#viewCombo input[data-ck="q"]').value = P.c_q;
      document.querySelector('#viewCombo input[data-ck="v0"]').value = P.c_v0;
      document.querySelector('#viewCombo input[data-ck="theta0"]').value = P.c_theta0;
      document.querySelector('#viewCombo input[data-ck="startOffset"]').value = P.c_startOffset;
      document.getElementById('c_gBtn').classList.toggle('on', P.c_gOn);
      syncComboOutputs();
      renderFieldList();
      rebuild(true);

      let msg = `导入成功！共载入 ${fields.length} 个场`;
      if (skipped > 0) msg += `（跳过 ${skipped} 个无法识别的场）`;
      showToast(msg);
    } catch (err) {
      showToast('导入失败：' + err.message, true);
    }
  };
  reader.readAsText(file);
}

function showToast(msg, isError) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: ${isError ? '#fef2f2' : '#ecfdf5'};
    color: ${isError ? '#a14d82' : '#444'};
    padding: 10px 22px; border-radius: 8px;
    font-size: 13px; z-index: 1000;
    box-shadow: 0 4px 20px rgba(15,23,42,0.12);
    border: 1px solid ${isError ? '#fecaca' : '#a7f3d0'};
    font-family: inherit; font-weight: 500;
    transition: opacity 0.3s;
  `;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2200);
}

document.getElementById('exportBtn').addEventListener('click', exportConfig);
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFileInput').click();
});
document.getElementById('importFileInput').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) importConfig(file);
  e.target.value = '';
});

/* =========================================================
   加速度计算
   ========================================================= */
function getStartX() {
  if (fields.length === 0) return -6.5;
  let hasInfinite = false;
  for (const f of fields) {
    if (f.type === 'E_inf' || f.type === 'B_inf') { hasInfinite = true; break; }
  }
  if (hasInfinite) return -6.5;

  let minX = Infinity;
  for (const f of fields) {
    let fx0;
    if (f.type === 'B_circle' || f.type === 'B_half') fx0 = f.cx - f.r;
    else if (f.type === 'B_ring') fx0 = f.cx - f.r2;
    else if (f.type === 'E_radial') fx0 = f.cx - f.r2;
    else fx0 = Math.min(f.x0, f.x1);
    if (fx0 < minX) minX = fx0;
  }
  return Math.max(-6.5, minX - 0.6);
}

function accelAt(x, y, vx, vy, t) {
  let Fx = 0, Fy = 0;

  if (state.view === 'super') {
    const Ex = P.E * Math.cos(P.Eangle * Math.PI / 180);
    const Ey = P.E * Math.sin(P.Eangle * Math.PI / 180);
    const qB = P.q * P.B * P.Bdir;
    Fx += P.q * Ex + vy * qB;
    Fy += P.q * Ey - vx * qB;
    if (P.gOn) Fy -= P.m * P.g;
    return [Fx / P.m, Fy / P.m];
  }

  if (P.c_gOn) Fy -= P.c_m * 10;

  for (const f of fields) {
    if (f.type === 'E_accel' || f.type === 'E_deflect' || f.type === 'E_alt') {
      const x0 = Math.min(f.x0, f.x1), x1 = Math.max(f.x0, f.x1);
      if (x < x0 || x > x1) continue;
      let E = f.E;
      if (f.type === 'E_alt') {
        const phase = ((t % f.period) + f.period) % f.period / f.period;
        if (phase >= 0.5) E = -E;
      }
      const ang = f.Eangle * Math.PI / 180;
      Fx += P.c_q * E * Math.cos(ang);
      Fy += P.c_q * E * Math.sin(ang);
    } else if (f.type === 'E_inf') {
      const ang = f.Eangle * Math.PI / 180;
      Fx += P.c_q * f.E * Math.cos(ang);
      Fy += P.c_q * f.E * Math.sin(ang);
    } else if (f.type === 'E_radial') {
      const dx = x - f.cx, dy = y - f.cy;
      const d2 = dx*dx + dy*dy;
      const d = Math.sqrt(d2);
      if (d < f.r1 || d > f.r2 || d < 1e-3) continue;
      const ux = dx / d, uy = dy / d;
      const sign = f.radialDir;
      Fx += P.c_q * f.E * sign * ux;
      Fy += P.c_q * f.E * sign * uy;
    } else if (f.type === 'B_rect') {
      const x0 = Math.min(f.x0, f.x1), x1 = Math.max(f.x0, f.x1);
      if (x < x0 || x > x1) continue;
      const qB = P.c_q * f.B * f.Bdir;
      Fx += vy * qB; Fy += -vx * qB;
    } else if (f.type === 'B_circle') {
      const dx = x - f.cx, dy = y - f.cy;
      if (dx*dx + dy*dy > f.r * f.r) continue;
      const qB = P.c_q * f.B * f.Bdir;
      Fx += vy * qB; Fy += -vx * qB;
    } else if (f.type === 'B_half') {
      const dx = x - f.cx, dy = y - f.cy;
      if (dy < 0 || dx*dx + dy*dy > f.r * f.r) continue;
      const qB = P.c_q * f.B * f.Bdir;
      Fx += vy * qB; Fy += -vx * qB;
    } else if (f.type === 'B_ring') {
      const dx = x - f.cx, dy = y - f.cy;
      const d2 = dx*dx + dy*dy;
      if (d2 < f.r1*f.r1 || d2 > f.r2*f.r2) continue;
      const qB = P.c_q * f.B * f.Bdir;
      Fx += vy * qB; Fy += -vx * qB;
    } else if (f.type === 'B_alt') {
      const x0 = Math.min(f.x0, f.x1), x1 = Math.max(f.x0, f.x1);
      if (x < x0 || x > x1) continue;
      let Beff = f.B;
      const phase = ((t % f.period) + f.period) % f.period / f.period;
      if (phase >= 0.5) Beff = -Beff;
      const qB = P.c_q * Beff * f.Bdir;
      Fx += vy * qB; Fy += -vx * qB;
    } else if (f.type === 'B_inf') {
      const qB = P.c_q * f.B * f.Bdir;
      Fx += vy * qB; Fy += -vx * qB;
    }
  }

  return [Fx / P.c_m, Fy / P.c_m];
}

/* =========================================================
   轨迹构建
   ========================================================= */
function buildTrajectory() {
  if (state.view === 'super') buildTrajectorySuper();
  else buildTrajectoryCombo();
}

function buildTrajectorySuper() {
  const th = P.theta0 * Math.PI / 180;
  let x = 0, y = 0;
  let vx = P.v0 * Math.cos(th);
  let vy = P.v0 * Math.sin(th);

  const T_TOTAL = 20;
  const qB_over_m = P.q * P.B * P.Bdir / P.m;
  let n = 18000;
  let dt = T_TOTAL / n;
  if (Math.abs(qB_over_m) > 1e-9) {
    const Tc = 2 * Math.PI / Math.abs(qB_over_m);
    if (dt > Tc / 240) {
      dt = Tc / 240;
      n = Math.min(60000, Math.ceil(T_TOTAL / dt));
    }
  }
  dt = Math.max(dt, 1e-7);

  const xs = new Float32Array(n + 1);
  const ys = new Float32Array(n + 1);
  const vxs = new Float32Array(n + 1);
  const vys = new Float32Array(n + 1);
  const axs = new Float32Array(n + 1);
  const ays = new Float32Array(n + 1);
  xs[0] = x; ys[0] = y; vxs[0] = vx; vys[0] = vy;
  const a0 = accelAt(x, y, vx, vy, 0);
  axs[0] = a0[0]; ays[0] = a0[1];

  let used = 0;
  for (let i = 0; i < n; i++) {
    const [k1ax, k1ay] = accelAt(x, y, vx, vy, i * dt);
    const k1x = vx, k1y = vy;
    const x2 = x + 0.5*dt*k1x, y2 = y + 0.5*dt*k1y;
    const vx2 = vx + 0.5*dt*k1ax, vy2 = vy + 0.5*dt*k1ay;
    const [k2ax, k2ay] = accelAt(x2, y2, vx2, vy2, (i + 0.5) * dt);
    const k2x = vx2, k2y = vy2;
    const x3 = x + 0.5*dt*k2x, y3 = y + 0.5*dt*k2y;
    const vx3 = vx + 0.5*dt*k2ax, vy3 = vy + 0.5*dt*k2ay;
    const [k3ax, k3ay] = accelAt(x3, y3, vx3, vy3, (i + 0.5) * dt);
    const k3x = vx3, k3y = vy3;
    const x4 = x + dt*k3x, y4 = y + dt*k3y;
    const vx4 = vx + dt*k3ax, vy4 = vy + dt*k3ay;
    const [k4ax, k4ay] = accelAt(x4, y4, vx4, vy4, (i + 1) * dt);
    const k4x = vx4, k4y = vy4;

    x  += dt/6 * (k1x + 2*k2x + 2*k3x + k4x);
    y  += dt/6 * (k1y + 2*k2y + 2*k3y + k4y);
    vx += dt/6 * (k1ax + 2*k2ax + 2*k3ax + k4ax);
    vy += dt/6 * (k1ay + 2*k2ay + 2*k3ay + k4ay);
    if (!isFinite(x) || !isFinite(y)) break;
    xs[i+1] = x; ys[i+1] = y;
    vxs[i+1] = vx; vys[i+1] = vy;
    axs[i+1] = k4ax; ays[i+1] = k4ay;
    used = i + 1;
  }
  finalizeTraj(xs, ys, vxs, vys, axs, ays, used, dt);
}

function buildTrajectoryCombo() {
  const startX = getStartX() + P.c_startOffset;
  const th = P.c_theta0 * Math.PI / 180;
  let x = startX, y = 0;
  let vx = P.c_v0 * Math.cos(th);
  let vy = P.c_v0 * Math.sin(th);

  let dt = 0.002;
  for (const f of fields) {
    if (f.type === 'E_alt' || f.type === 'B_alt') dt = Math.min(dt, f.period / 120);
  }
  dt = Math.max(dt, 1e-4);
  const T_TOTAL = 30;
  let n = Math.min(60000, Math.round(T_TOTAL / dt));
  dt = T_TOTAL / n;

  const xs = new Float32Array(n + 1);
  const ys = new Float32Array(n + 1);
  const vxs = new Float32Array(n + 1);
  const vys = new Float32Array(n + 1);
  const axs = new Float32Array(n + 1);
  const ays = new Float32Array(n + 1);
  xs[0] = x; ys[0] = y; vxs[0] = vx; vys[0] = vy;
  const a0 = accelAt(x, y, vx, vy, 0);
  axs[0] = a0[0]; ays[0] = a0[1];

  let used = 0;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const [k1ax, k1ay] = accelAt(x, y, vx, vy, t);
    const k1x = vx, k1y = vy;
    const x2 = x + 0.5*dt*k1x, y2 = y + 0.5*dt*k1y;
    const vx2 = vx + 0.5*dt*k1ax, vy2 = vy + 0.5*dt*k1ay;
    const [k2ax, k2ay] = accelAt(x2, y2, vx2, vy2, t + 0.5*dt);
    const k2x = vx2, k2y = vy2;
    const x3 = x + 0.5*dt*k2x, y3 = y + 0.5*dt*k2y;
    const vx3 = vx + 0.5*dt*k2ax, vy3 = vy + 0.5*dt*k2ay;
    const [k3ax, k3ay] = accelAt(x3, y3, vx3, vy3, t + 0.5*dt);
    const k3x = vx3, k3y = vy3;
    const x4 = x + dt*k3x, y4 = y + dt*k3y;
    const vx4 = vx + dt*k3ax, vy4 = vy + dt*k3ay;
    const [k4ax, k4ay] = accelAt(x4, y4, vx4, vy4, t + dt);
    const k4x = vx4, k4y = vy4;

    x  += dt/6 * (k1x + 2*k2x + 2*k3x + k4x);
    y  += dt/6 * (k1y + 2*k2y + 2*k3y + k4y);
    vx += dt/6 * (k1ax + 2*k2ax + 2*k3ax + k4ax);
    vy += dt/6 * (k1ay + 2*k2ay + 2*k3ay + k4ay);
    if (!isFinite(x) || !isFinite(y)) break;

    xs[i+1] = x; ys[i+1] = y;
    vxs[i+1] = vx; vys[i+1] = vy;
    axs[i+1] = k4ax; ays[i+1] = k4ay;
    used = i + 1;

    if (Math.abs(x) > 40 || Math.abs(y) > 40) break;
  }
  finalizeTraj(xs, ys, vxs, vys, axs, ays, used, dt);
}

function finalizeTraj(xs, ys, vxs, vys, axs, ays, used, dt) {
  if (used < 20) used = Math.min(xs.length - 1, 20);
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (let i = 0; i <= used; i++) {
    const px = xs[i], py = ys[i];
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  traj = {
    xs, ys, vxs, vys, axs, ays,
    n: used, dt,
    duration: used * dt,
    bounds: { minX, maxX, minY, maxY }
  };
}

/* =========================================================
   状态判断
   ========================================================= */
function computeState(x, y, vx, vy, t) {
  const sp = Math.hypot(vx, vy);
  if (state.view === 'super') {
    if (P.E < 1e-9 && P.B < 1e-9) {
      return sp < 1e-6 ? '静止' : '匀速直线运动';
    }
    if (P.E < 1e-9 && P.B > 1e-9) {
      return sp < 1e-6 ? '磁场中：静止' : '磁场中：匀速圆周运动';
    }
    if (P.E > 1e-9 && P.B < 1e-9) {
      if (sp < 1e-6) return '电场中：由静止加速';
      return '电场中：类平抛 / 匀变速';
    }
    if (P.gOn) return '复合场中的复杂曲线运动';
    return '叠加场：E×B 漂移 / 摆线运动';
  }

  let inE = false, inB = false, inAlt = false, inBAlt = false, inRadial = false;
  for (const f of fields) {
    if (f.type === 'E_accel' || f.type === 'E_deflect') {
      const x0 = Math.min(f.x0, f.x1), x1 = Math.max(f.x0, f.x1);
      if (x >= x0 && x <= x1) inE = true;
    } else if (f.type === 'E_alt') {
      const x0 = Math.min(f.x0, f.x1), x1 = Math.max(f.x0, f.x1);
      if (x >= x0 && x <= x1) inAlt = true;
    } else if (f.type === 'E_inf') {
      inE = true;
    } else if (f.type === 'E_radial') {
      const dx = x - f.cx, dy = y - f.cy;
      const d2 = dx*dx + dy*dy;
      if (d2 >= f.r1*f.r1 && d2 <= f.r2*f.r2) inRadial = true;
    } else if (f.type === 'B_rect') {
      const x0 = Math.min(f.x0, f.x1), x1 = Math.max(f.x0, f.x1);
      if (x >= x0 && x <= x1) inB = true;
    } else if (f.type === 'B_circle') {
      const dx = x - f.cx, dy = y - f.cy;
      if (dx*dx + dy*dy <= f.r * f.r) inB = true;
    } else if (f.type === 'B_half') {
      const dx = x - f.cx, dy = y - f.cy;
      if (dy >= 0 && dx*dx + dy*dy <= f.r * f.r) inB = true;
    } else if (f.type === 'B_ring') {
      const dx = x - f.cx, dy = y - f.cy;
      const d2 = dx*dx + dy*dy;
      if (d2 >= f.r1*f.r1 && d2 <= f.r2*f.r2) inB = true;
    } else if (f.type === 'B_alt') {
      const x0 = Math.min(f.x0, f.x1), x1 = Math.max(f.x0, f.x1);
      if (x >= x0 && x <= x1) inBAlt = true;
    } else if (f.type === 'B_inf') {
      inB = true;
    }
  }
  if (inBAlt) return '周期性磁场中：变向圆周运动';
  if (inB) return '磁场中：匀速圆周运动';
  if (inRadial) return '辐射电场中：径向受力运动';
  if (inAlt) return '交变电场中：往复运动';
  if (inE) {
    if (sp < 1e-6) return '电场中：由静止开始加速';
    return '电场中：类平抛 / 匀变速';
  }
  return '区域外：匀速直线运动';
}

/* =========================================================
   绘图工具
   ========================================================= */
function enableRich(ctx) {
  if (ctx.__rich) return; ctx.__rich = true;
  const orig = CanvasRenderingContext2D.prototype.fillText;
  ctx.fillText = function (s, x, y) {
    s = String(s);
    if (!/[*_^]/.test(s)) return orig.call(ctx, s, x, y);
    const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font), w = /(?:^|\s)(bold|[5-9]00)\s/.exec(ctx.font);
    drawRich(ctx, s, x, y, { size: m ? +m[1] : 12, weight: w ? w[1] : '', color: ctx.fillStyle,
      align: ctx.textAlign === 'start' ? 'left' : ctx.textAlign === 'end' ? 'right' : ctx.textAlign, base: ctx.textBaseline });
  };
}
function fitCanvas(cv) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return null;
  const W = Math.max(1, Math.round(w * dpr));
  const H = Math.max(1, Math.round(h * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d');
  enableRich(ctx);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function drawArrow(ctx, x0, y0, x1, y1, color, width) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  const ang = Math.atan2(dy, dx);
  const hs = Math.min(11, len * 0.42);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - hs * Math.cos(ang - 0.42), y1 - hs * Math.sin(ang - 0.42));
  ctx.lineTo(x1 - hs * Math.cos(ang + 0.42), y1 - hs * Math.sin(ang + 0.42));
  ctx.closePath(); ctx.fill();
}
function niceCeil(v) {
  if (!isFinite(v) || v <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / e;
  let nm;
  if (m <= 1) nm = 1; else if (m <= 1.5) nm = 1.5;
  else if (m <= 2) nm = 2; else if (m <= 2.5) nm = 2.5;
  else if (m <= 3) nm = 3; else if (m <= 4) nm = 4;
  else if (m <= 5) nm = 5; else if (m <= 8) nm = 8; else nm = 10;
  return nm * e;
}

/* =========================================================
   场景绘制 - 叠加场
   ========================================================= */
function drawSceneSuper() {
  const fit = fitCanvas(sceneSuper);
  if (!fit || !traj) return;
  const { ctx, w, h } = fit;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);

  const b = traj.bounds;
  let bw = Math.max(b.maxX - b.minX, 1e-3);
  let bh = Math.max(b.maxY - b.minY, 1e-3);
  bw = Math.max(bw * 1.30, 4);
  bh = Math.max(bh * 1.30, 4);
  const asp = w / h;
  if (bw / bh < asp) bw = bh * asp;
  else bh = bw / asp;
  const scale = w / bw;
  const cxw = (b.minX + b.maxX) / 2;
  const cyw = (b.minY + b.maxY) / 2;
  const SX = x => w / 2 + (x - cxw) * scale;
  const SY = y => h / 2 - (y - cyw) * scale;
  const xL = cxw - (w / 2) / scale, xR = cxw + (w / 2) / scale;
  const yB = cyw - (h / 2) / scale, yT = cyw + (h / 2) / scale;

  const cands = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 50, 100];
  let gs = cands[cands.length - 1];
  for (const c of cands) { if (c * scale >= 46) { gs = c; break; } }
  ctx.save();
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = 1.2; ctx.setLineDash([5, 6]);
  ctx.beginPath();
  const ix0 = Math.ceil(xL / gs), ix1 = Math.floor(xR / gs);
  for (let i = ix0; i <= ix1; i++) {
    const px = Math.round(SX(i * gs)) + 0.5;
    ctx.moveTo(px, 0); ctx.lineTo(px, h);
  }
  const iy0 = Math.ceil(yB / gs), iy1 = Math.floor(yT / gs);
  for (let i = iy0; i <= iy1; i++) {
    const py = Math.round(SY(i * gs)) + 0.5;
    ctx.moveTo(0, py); ctx.lineTo(w, py);
  }
  ctx.stroke(); ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(100,116,139,0.55)';
  ctx.lineWidth = 1.5; ctx.setLineDash([]);
  ctx.beginPath();
  if (xL < 0 && xR > 0) {
    const px = Math.round(SX(0)) + 0.5;
    ctx.moveTo(px, 0); ctx.lineTo(px, h);
  }
  if (yB < 0 && yT > 0) {
    const py = Math.round(SY(0)) + 0.5;
    ctx.moveTo(0, py); ctx.lineTo(w, py);
  }
  ctx.stroke(); ctx.restore();

  if (P.E > 1e-9) {
    const ang = P.Eangle * Math.PI / 180;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const sp = 96 / scale;
    const j0 = Math.floor(xL / sp), j1 = Math.ceil(xR / sp);
    const k0 = Math.floor(yB / sp), k1 = Math.ceil(yT / sp);
    ctx.save(); ctx.globalAlpha = 0.45;
    const L = 22;
    for (let i = j0; i <= j1; i++) {
      for (let k = k0; k <= k1; k++) {
        const px = SX(i * sp), py = SY(k * sp);
        if (px < -30 || px > w + 30 || py < -30 || py > h + 30) continue;
        drawArrow(ctx, px - ux*L/2, py + uy*L/2,
                       px + ux*L/2, py - uy*L/2, '#B07A00', 1.8);
      }
    }
    ctx.restore();
  }
  if (P.B > 1e-9) {
    const sp = 60 / scale;
    const j0 = Math.floor(xL / sp), j1 = Math.ceil(xR / sp);
    const k0 = Math.floor(yB / sp), k1 = Math.ceil(yT / sp);
    ctx.save();
    ctx.strokeStyle = 'rgba(0,158,115,0.65)';
    ctx.fillStyle = 'rgba(0,158,115,0.65)';
    ctx.lineWidth = 1.6;
    for (let i = j0; i <= j1; i++) {
      for (let k = k0; k <= k1; k++) {
        const px = SX(i * sp), py = SY(k * sp);
        if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
        if (P.Bdir > 0) {
          ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
        } else {
          const d = 4.5;
          ctx.beginPath();
          ctx.moveTo(px - d, py - d); ctx.lineTo(px + d, py + d);
          ctx.moveTo(px + d, py - d); ctx.lineTo(px - d, py + d);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  const idx = curIndex();
  if (idx > 0) {
    ctx.save();
    ctx.strokeStyle = P.q >= 0 ? '#D55E00' : '#0072B2';
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const step = Math.max(1, Math.floor(idx / 1500));
    let first = true;
    for (let i = 0; i <= idx; i += step) {
      const px = SX(traj.xs[i]), py = SY(traj.ys[i]);
      if (first) { ctx.moveTo(px, py); first = false; }
      else ctx.lineTo(px, py);
    }
    ctx.lineTo(SX(traj.xs[idx]), SY(traj.ys[idx]));
    ctx.stroke(); ctx.restore();
  }
  {
    const px = SX(traj.xs[0]), py = SY(traj.ys[0]);
    ctx.save();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  const px = SX(traj.xs[idx]), py = SY(traj.ys[idx]);
  const isPos = P.q >= 0;
  ctx.save();
  ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
  ctx.fillStyle = isPos ? '#D55E00' : '#0072B2';
  ctx.fill(); ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px - 3.5, py); ctx.lineTo(px + 3.5, py);
  if (isPos) { ctx.moveTo(px, py - 3.5); ctx.lineTo(px, py + 3.5); }
  ctx.stroke(); ctx.restore();

  const vx = traj.vxs[idx], vy = traj.vys[idx];
  const spd = Math.hypot(vx, vy);
  ctx.save();
  ctx.font = '700 18px "PingFang SC", "Microsoft YaHei", sans-serif';
  if (spd > 1e-6) {
    const L = Math.min(spd * 8, 110);
    const ex = px + (vx / spd) * L, ey = py - (vy / spd) * L;
    drawArrow(ctx, px, py, ex, ey, '#0072B2', 3);
    ctx.fillStyle = '#0072B2'; ctx.fillText('*v*', ex + 7, ey - 6);
  }
  const ax = traj.axs[idx], ay = traj.ays[idx];
  const Fx = ax * P.m, Fy = ay * P.m;
  const Fm = Math.hypot(Fx, Fy);
  if (Fm > 1e-6) {
    const L = Math.min(Fm * 8, 110);
    const ex = px + (Fx / Fm) * L, ey = py - (Fy / Fm) * L;
    drawArrow(ctx, px, py, ex, ey, '#a14d82', 3);
    ctx.fillStyle = '#a14d82'; ctx.fillText('*F*_{合}', ex + 7, ey - 6);
  }
  ctx.restore();

  ctx.save();
  ctx.font = '700 16px "PingFang SC", "Microsoft YaHei", sans-serif';
  let ly = 20;
  if (P.B > 1e-9) {
    ctx.fillStyle = '#007a58';
    ctx.fillText('*B* = ' + P.B.toFixed(2) + ' T  ' + (P.Bdir > 0 ? '· 向外' : '× 向里'), 10, ly);
    ly += 22;
  }
  if (P.E > 1e-9) {
    ctx.fillStyle = '#B07A00';
    ctx.fillText('*E* = ' + P.E.toFixed(1) + ' N/C  *φ* = ' + P.Eangle + '°', 10, ly);
    ly += 22;
  }
  if (P.gOn) {
    ctx.fillStyle = '#666';
    ctx.fillText('*g* = ' + P.g.toFixed(1) + ' m/s²', 10, ly);
  }
  ctx.restore();

  ctx.save();
  ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('轨迹范围 ' + (b.maxX - b.minX).toFixed(1) + ' m × ' +
               (b.maxY - b.minY).toFixed(1) + ' m', 10, h - 12);
  ctx.restore();
}

/* =========================================================
   场景绘制 - 组合场
   ========================================================= */
function drawSceneCombo() {
  const fit = fitCanvas(sceneCombo);
  if (!fit || !traj) return;
  const { ctx, w, h } = fit;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);

  const VIEW_W = 14, VIEW_H = 10;
  const aspect = w / h;
  let worldW = VIEW_W, worldH = VIEW_H;
  if (worldW / worldH < aspect) worldW = worldH * aspect;
  else worldH = worldW / aspect;
  const scale = w / worldW;
  const cxw = 0, cyw = 0;

  const SX = x => w / 2 + (x - cxw) * scale;
  const SY = y => h / 2 - (y - cyw) * scale;
  const xL = cxw - (w / 2) / scale, xR = cxw + (w / 2) / scale;
  const yB = cyw - (h / 2) / scale, yT = cyw + (h / 2) / scale;

  const cands = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10];
  let gs = cands[cands.length - 1];
  for (const c of cands) { if (c * scale >= 46) { gs = c; break; } }
  ctx.save();
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = 1.2; ctx.setLineDash([5, 6]);
  ctx.beginPath();
  const ix0 = Math.ceil(xL / gs), ix1 = Math.floor(xR / gs);
  for (let i = ix0; i <= ix1; i++) {
    const px = Math.round(SX(i * gs)) + 0.5;
    ctx.moveTo(px, 0); ctx.lineTo(px, h);
  }
  const iy0 = Math.ceil(yB / gs), iy1 = Math.floor(yT / gs);
  for (let i = iy0; i <= iy1; i++) {
    const py = Math.round(SY(i * gs)) + 0.5;
    ctx.moveTo(0, py); ctx.lineTo(w, py);
  }
  ctx.stroke(); ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(100,116,139,0.55)';
  ctx.lineWidth = 1.5; ctx.setLineDash([]);
  ctx.beginPath();
  const px0 = Math.round(SX(0)) + 0.5;
  const py0 = Math.round(SY(0)) + 0.5;
  ctx.moveTo(px0, 0); ctx.lineTo(px0, h);
  ctx.moveTo(0, py0); ctx.lineTo(w, py0);
  ctx.stroke(); ctx.restore();

  ctx.save();
  ctx.fillStyle = '#64748b';
  ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = ix0; i <= ix1; i++) {
    if (i === 0) continue;
    const px = SX(i * gs);
    ctx.fillText((i * gs).toFixed(0), px, py0 + 4);
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let i = iy0; i <= iy1; i++) {
    if (i === 0) continue;
    const py = SY(i * gs);
    ctx.fillText((i * gs).toFixed(0), px0 - 4, py);
  }
  ctx.restore();

  for (const f of fields) {
    drawField(ctx, f, SX, SY, scale, w, h, xL, xR, yB, yT);
  }

  const idx = curIndex();
  if (idx > 0) {
    ctx.save();
    ctx.strokeStyle = P.c_q >= 0 ? '#D55E00' : '#0072B2';
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const step = Math.max(1, Math.floor(idx / 1500));
    let first = true;
    for (let i = 0; i <= idx; i += step) {
      const px = SX(traj.xs[i]), py = SY(traj.ys[i]);
      if (first) { ctx.moveTo(px, py); first = false; }
      else ctx.lineTo(px, py);
    }
    ctx.lineTo(SX(traj.xs[idx]), SY(traj.ys[idx]));
    ctx.stroke(); ctx.restore();
  }
  {
    const px = SX(traj.xs[0]), py = SY(traj.ys[0]);
    ctx.save();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  const px = SX(traj.xs[idx]), py = SY(traj.ys[idx]);
  const isPos = P.c_q >= 0;
  ctx.save();
  ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
  ctx.fillStyle = isPos ? '#D55E00' : '#0072B2';
  ctx.fill(); ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px - 3.5, py); ctx.lineTo(px + 3.5, py);
  if (isPos) { ctx.moveTo(px, py - 3.5); ctx.lineTo(px, py + 3.5); }
  ctx.stroke(); ctx.restore();

  const vx = traj.vxs[idx], vy = traj.vys[idx];
  const spd = Math.hypot(vx, vy);
  ctx.save();
  ctx.font = '700 18px "PingFang SC", "Microsoft YaHei", sans-serif';
  if (spd > 1e-6) {
    const L = Math.min(spd * 8, 110);
    const ex = px + (vx / spd) * L, ey = py - (vy / spd) * L;
    drawArrow(ctx, px, py, ex, ey, '#0072B2', 3);
    ctx.fillStyle = '#0072B2'; ctx.fillText('*v*', ex + 7, ey - 6);
  }
  const ax = traj.axs[idx], ay = traj.ays[idx];
  const Fx = ax * P.c_m, Fy = ay * P.c_m;
  const Fm = Math.hypot(Fx, Fy);
  if (Fm > 1e-6) {
    const L = Math.min(Fm * 6, 110);
    const ex = px + (Fx / Fm) * L, ey = py - (Fy / Fm) * L;
    drawArrow(ctx, px, py, ex, ey, '#a14d82', 3);
    ctx.fillStyle = '#a14d82'; ctx.fillText('*F*_{合}', ex + 7, ey - 6);
  }
  ctx.restore();
}

function drawField(ctx, f, SX, SY, scale, w, h, xL, xR, yB, yT) {
  if (f.type === 'B_rect') {
    const x0 = Math.min(f.x0, f.x1), x1 = Math.max(f.x0, f.x1);
    ctx.save();
    ctx.fillStyle = 'rgba(0,158,115,0.08)';
    ctx.fillRect(SX(x0), 0, (x1 - x0) * scale, h);
    ctx.strokeStyle = 'rgba(0,158,115,0.75)';
    ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
    ctx.strokeRect(SX(x0), 0, (x1 - x0) * scale, h);
    ctx.restore();
    drawBSymbolsInRect(ctx, f, x0, x1, SX, SY, scale, w, h, yB, yT);
  } else if (f.type === 'B_inf') {
    ctx.save();
    ctx.fillStyle = 'rgba(0,158,115,0.05)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    const sp = 55 / scale;
    const j0 = Math.floor(xL / sp), j1 = Math.ceil(xR / sp);
    const k0 = Math.floor(yB / sp), k1 = Math.ceil(yT / sp);
    ctx.save();
    ctx.strokeStyle = 'rgba(0,158,115,0.75)';
    ctx.fillStyle = 'rgba(0,158,115,0.75)';
    ctx.lineWidth = 1.5;
    for (let i = j0; i <= j1; i++) {
      for (let k = k0; k <= k1; k++) {
        const px = SX(i * sp), py = SY(k * sp);
        if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
        drawBSym(ctx, px, py, f.Bdir);
      }
    }
    ctx.restore();
  } else if (f.type === 'B_circle') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(SX(f.cx), SY(f.cy), f.r * scale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,158,115,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,158,115,0.8)';
    ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();
    drawBSymbolsInCircle(ctx, f, SX, SY, scale, w, h);
  } else if (f.type === 'B_half') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(SX(f.cx), SY(f.cy), f.r * scale, Math.PI, 2 * Math.PI, false);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,158,115,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,158,115,0.8)';
    ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();
    drawBSymbolsInHalf(ctx, f, SX, SY, scale, w, h);
  } else if (f.type === 'B_ring') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(SX(f.cx), SY(f.cy), f.r2 * scale, 0, Math.PI * 2);
    ctx.arc(SX(f.cx), SY(f.cy), f.r1 * scale, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(0,158,115,0.10)';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(0,158,115,0.8)';
    ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(SX(f.cx), SY(f.cy), f.r2 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(SX(f.cx), SY(f.cy), f.r1 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawBSymbolsInRing(ctx, f, SX, SY, scale, w, h);
  } else if (f.type === 'B_alt') {
    const x0 = Math.min(f.x0, f.x1), x1 = Math.max(f.x0, f.x1);
    ctx.save();
    ctx.fillStyle = 'rgba(0,158,115,0.08)';
    ctx.fillRect(SX(x0), 0, (x1 - x0) * scale, h);
    ctx.strokeStyle = 'rgba(0,158,115,0.8)';
    ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]);
    ctx.strokeRect(SX(x0), 0, (x1 - x0) * scale, h);
    ctx.restore();
    drawBSymbolsInRect(ctx, f, x0, x1, SX, SY, scale, w, h, yB, yT);
  } else if (f.type === 'E_accel' || f.type === 'E_deflect' || f.type === 'E_alt') {
    const x0 = Math.min(f.x0, f.x1), x1 = Math.max(f.x0, f.x1);
    ctx.save();
    ctx.fillStyle = f.type === 'E_alt' ? 'rgba(138,95,0,0.07)' : 'rgba(176,122,0,0.07)';
    ctx.fillRect(SX(x0), 0, (x1 - x0) * scale, h);
    ctx.strokeStyle = f.type === 'E_alt' ? 'rgba(138,95,0,0.8)' : 'rgba(176,122,0,0.75)';
    ctx.lineWidth = 1.5;
    if (f.type === 'E_alt') ctx.setLineDash([8, 4]);
    else ctx.setLineDash([6, 4]);
    ctx.strokeRect(SX(x0), 0, (x1 - x0) * scale, h);
    ctx.restore();

    if (f.E > 1e-9) {
      const ang = f.Eangle * Math.PI / 180;
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const sp = 85 / scale;
      const j0 = Math.floor(x0 / sp), j1 = Math.ceil(x1 / sp);
      const k0 = Math.floor(yB / sp), k1 = Math.ceil(yT / sp);
      ctx.save(); ctx.globalAlpha = 0.55;
      const L = 26;
      for (let i = j0; i <= j1; i++) {
        const wx = i * sp;
        if (wx < x0 || wx > x1) continue;
        for (let k = k0; k <= k1; k++) {
          const px = SX(wx), py = SY(k * sp);
          if (px < -30 || px > w + 30 || py < -30 || py > h + 30) continue;
          drawArrow(ctx, px - ux*L/2, py + uy*L/2,
                         px + ux*L/2, py - uy*L/2,
                         f.type === 'E_alt' ? '#8a5f00' : '#B07A00', 1.6);
        }
      }
      ctx.restore();
    }
  } else if (f.type === 'E_inf') {
    ctx.save();
    ctx.fillStyle = 'rgba(176,122,0,0.04)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    if (f.E > 1e-9) {
      const ang = f.Eangle * Math.PI / 180;
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const sp = 85 / scale;
      const j0 = Math.floor(xL / sp), j1 = Math.ceil(xR / sp);
      const k0 = Math.floor(yB / sp), k1 = Math.ceil(yT / sp);
      ctx.save(); ctx.globalAlpha = 0.5;
      const L = 26;
      for (let i = j0; i <= j1; i++) {
        for (let k = k0; k <= k1; k++) {
          const px = SX(i * sp), py = SY(k * sp);
          if (px < -30 || px > w + 30 || py < -30 || py > h + 30) continue;
          drawArrow(ctx, px - ux*L/2, py + uy*L/2,
                         px + ux*L/2, py - uy*L/2, '#B07A00', 1.6);
        }
      }
      ctx.restore();
    }
  } else if (f.type === 'E_radial') {
    const r1 = f.r1, r2 = f.r2;
    const cxS = SX(f.cx), cyS = SY(f.cy);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cxS, cyS, r2 * scale, 0, Math.PI * 2);
    if (r1 > 0.01) ctx.arc(cxS, cyS, r1 * scale, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(138,95,0,0.08)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(138,95,0,0.8)';
    ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(cxS, cyS, r2 * scale, 0, Math.PI * 2);
    ctx.stroke();
    if (r1 > 0.01) {
      ctx.beginPath();
      ctx.arc(cxS, cyS, r1 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    if (f.E > 1e-9 && r2 > r1) {
      const nAng = 8;
      const nRad = Math.max(1, Math.min(3, Math.floor((r2 - r1) * scale / 40) || 1));
      const arrowLen = 18;
      const dirSign = f.radialDir;
      ctx.save();
      ctx.globalAlpha = 0.75;
      for (let ai = 0; ai < nAng; ai++) {
        const theta = ai * 2 * Math.PI / nAng;
        const cosT = Math.cos(theta), sinT = Math.sin(theta);
        for (let ri = 0; ri < nRad; ri++) {
          const rr = r1 + (r2 - r1) * (ri + 0.5) / nRad;
          const wx = f.cx + rr * cosT;
          const wy = f.cy + rr * sinT;
          const px = SX(wx), py = SY(wy);
          if (px < -30 || px > w + 30 || py < -30 || py > h + 30) continue;
          const ex = px + dirSign * cosT * arrowLen;
          const ey = py - dirSign * sinT * arrowLen;
          drawArrow(ctx, px, py, ex, ey, '#8a5f00', 1.6);
        }
      }
      ctx.restore();
    }
  }
}

function drawBSymbolsInRect(ctx, f, x0, x1, SX, SY, scale, w, h, yB, yT) {
  if (f.B < 1e-9) return;
  const sp = 55 / scale;
  const j0 = Math.floor(x0 / sp), j1 = Math.ceil(x1 / sp);
  const k0 = Math.floor(yB / sp), k1 = Math.ceil(yT / sp);
  ctx.save();
  ctx.strokeStyle = 'rgba(0,158,115,0.75)';
  ctx.fillStyle = 'rgba(0,158,115,0.75)';
  ctx.lineWidth = 1.5;
  for (let i = j0; i <= j1; i++) {
    const wx = i * sp;
    if (wx < x0 || wx > x1) continue;
    for (let k = k0; k <= k1; k++) {
      const px = SX(wx), py = SY(k * sp);
      if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
      drawBSym(ctx, px, py, f.Bdir);
    }
  }
  ctx.restore();
}
function drawBSymbolsInCircle(ctx, f, SX, SY, scale, w, h) {
  if (f.B < 1e-9) return;
  const sp = 55 / scale;
  const j0 = Math.floor((f.cx - f.r) / sp), j1 = Math.ceil((f.cx + f.r) / sp);
  const k0 = Math.floor((f.cy - f.r) / sp), k1 = Math.ceil((f.cy + f.r) / sp);
  ctx.save();
  ctx.strokeStyle = 'rgba(0,158,115,0.75)';
  ctx.fillStyle = 'rgba(0,158,115,0.75)';
  ctx.lineWidth = 1.5;
  for (let i = j0; i <= j1; i++) {
    for (let k = k0; k <= k1; k++) {
      const wx = i * sp, wy = k * sp;
      const dx = wx - f.cx, dy = wy - f.cy;
      if (dx*dx + dy*dy > f.r * f.r) continue;
      const px = SX(wx), py = SY(wy);
      if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
      drawBSym(ctx, px, py, f.Bdir);
    }
  }
  ctx.restore();
}
function drawBSymbolsInHalf(ctx, f, SX, SY, scale, w, h) {
  if (f.B < 1e-9) return;
  const sp = 55 / scale;
  const j0 = Math.floor((f.cx - f.r) / sp), j1 = Math.ceil((f.cx + f.r) / sp);
  const k0 = Math.floor((f.cy - 0.1) / sp), k1 = Math.ceil((f.cy + f.r) / sp);
  ctx.save();
  ctx.strokeStyle = 'rgba(0,158,115,0.75)';
  ctx.fillStyle = 'rgba(0,158,115,0.75)';
  ctx.lineWidth = 1.5;
  for (let i = j0; i <= j1; i++) {
    for (let k = k0; k <= k1; k++) {
      const wx = i * sp, wy = k * sp;
      const dx = wx - f.cx, dy = wy - f.cy;
      if (dy < 0 || dx*dx + dy*dy > f.r * f.r) continue;
      const px = SX(wx), py = SY(wy);
      if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
      drawBSym(ctx, px, py, f.Bdir);
    }
  }
  ctx.restore();
}
function drawBSymbolsInRing(ctx, f, SX, SY, scale, w, h) {
  if (f.B < 1e-9) return;
  const sp = 55 / scale;
  const j0 = Math.floor((f.cx - f.r2) / sp), j1 = Math.ceil((f.cx + f.r2) / sp);
  const k0 = Math.floor((f.cy - f.r2) / sp), k1 = Math.ceil((f.cy + f.r2) / sp);
  ctx.save();
  ctx.strokeStyle = 'rgba(0,158,115,0.75)';
  ctx.fillStyle = 'rgba(0,158,115,0.75)';
  ctx.lineWidth = 1.5;
  for (let i = j0; i <= j1; i++) {
    for (let k = k0; k <= k1; k++) {
      const wx = i * sp, wy = k * sp;
      const dx = wx - f.cx, dy = wy - f.cy;
      const d2 = dx*dx + dy*dy;
      if (d2 < f.r1*f.r1 || d2 > f.r2*f.r2) continue;
      const px = SX(wx), py = SY(wy);
      if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
      drawBSym(ctx, px, py, f.Bdir);
    }
  }
  ctx.restore();
}
function drawBSym(ctx, px, py, Bdir) {
  if (Bdir > 0) {
    ctx.beginPath(); ctx.arc(px, py, 2.3, 0, Math.PI * 2); ctx.fill();
  } else {
    const d = 4.2;
    ctx.beginPath();
    ctx.moveTo(px - d, py - d); ctx.lineTo(px + d, py + d);
    ctx.moveTo(px + d, py - d); ctx.lineTo(px - d, py + d);
    ctx.stroke();
  }
}

/* =========================================================
   v-t 图像（叠加场）
   ========================================================= */
function drawGraphSuper() {
  const fit = fitCanvas(graphSuper);
  if (!fit || !traj) return;
  const { ctx, w, h } = fit;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);

  const padL = 56, padR = 16, padT = 30, padB = 40;
  const gx = padL, gy = padT;
  const gw = w - padL - padR, gh = h - padT - padB;
  if (gw < 20 || gh < 20) return;

  const n = traj.n;
  const dur = traj.duration || 1;

  let vm = 0;
  const scan = Math.max(1, Math.floor(n / 2500));
  for (let i = 0; i <= n; i += scan) {
    const a = Math.abs(traj.vxs[i]);
    const b = Math.abs(traj.vys[i]);
    if (a > vm) vm = a;
    if (b > vm) vm = b;
  }
  vm = niceCeil(Math.max(vm, 0.5));

  const X = t => gx + (t / dur) * gw;
  const Y = v => gy + gh / 2 - (v / vm) * (gh / 2);

  ctx.save();
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = 1.2; ctx.setLineDash([5, 6]);
  ctx.beginPath();
  for (let k = -2; k <= 2; k++) {
    const py = Math.round(Y(vm * k / 2)) + 0.5;
    ctx.moveTo(gx, py); ctx.lineTo(gx + gw, py);
  }
  const tCands = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20];
  let ts = 5;
  for (const c of tCands) { if ((c / dur) * gw >= 48) { ts = c; break; } }
  for (let t = 0; t <= dur + 1e-9; t += ts) {
    const px = Math.round(X(t)) + 0.5;
    ctx.moveTo(px, gy); ctx.lineTo(px, gy + gh);
  }
  ctx.stroke(); ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(100,116,139,0.7)';
  ctx.lineWidth = 1.5; ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(100,116,139,0.35)';
  ctx.beginPath();
  const y0 = Math.round(Y(0)) + 0.5;
  ctx.moveTo(gx, y0); ctx.lineTo(gx + gw, y0);
  ctx.stroke(); ctx.restore();

  ctx.save();
  ctx.fillStyle = '#64748b';
  ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let k = -2; k <= 2; k++) {
    const val = vm * k / 2;
    ctx.fillText(val.toFixed(Math.abs(vm) < 5 ? 1 : 0), gx - 7, Y(val));
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let t = 0; t <= dur + 1e-9; t += ts) {
    ctx.fillText(t.toFixed(ts < 1 ? 1 : 0), X(t), gy + gh + 6);
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#475569';
  ctx.font = '700 14px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('*v* / (m·s^{-1})', gx - 46, gy - 22);
  ctx.textAlign = 'right';
  ctx.fillText('*t* / s', gx + gw, gy + gh + 20);
  ctx.restore();

  function plot(getVal, color, width) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
    ctx.beginPath();
    const step = Math.max(1, Math.floor(n / 1000));
    let first = true;
    for (let i = 0; i <= n; i += step) {
      const t = i * traj.dt;
      const px = X(t), py = Y(getVal(i));
      if (first) { ctx.moveTo(px, py); first = false; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke(); ctx.restore();
  }
  if (showLines.vx) plot(i => traj.vxs[i], '#0072B2', 2);
  if (showLines.vy) plot(i => traj.vys[i], '#D55E00', 2);
  if (showLines.v)  plot(i => Math.hypot(traj.vxs[i], traj.vys[i]), '#444', 2.6);

  const cx = X(Math.min(tCur, dur));
  ctx.save();
  ctx.strokeStyle = '#B07A00';
  ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(cx, gy); ctx.lineTo(cx, gy + gh);
  ctx.stroke(); ctx.restore();

  const idx = curIndex();
  ctx.save();
  if (showLines.v) {
    ctx.beginPath();
    ctx.arc(cx, Y(Math.hypot(traj.vxs[idx], traj.vys[idx])), 3.4, 0, Math.PI * 2);
    ctx.fillStyle = '#444'; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  if (showLines.vx) {
    ctx.beginPath();
    ctx.arc(cx, Y(traj.vxs[idx]), 3.4, 0, Math.PI * 2);
    ctx.fillStyle = '#0072B2'; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  if (showLines.vy) {
    ctx.beginPath();
    ctx.arc(cx, Y(traj.vys[idx]), 3.4, 0, Math.PI * 2);
    ctx.fillStyle = '#D55E00'; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.font = '700 14px "PingFang SC", "Microsoft YaHei", sans-serif';
  const items = [];
  if (showLines.v) items.push(['|*v*|', '#444']);
  if (showLines.vx) items.push(['*v*_x', '#0072B2']);
  if (showLines.vy) items.push(['*v*_y', '#D55E00']);
  let lx = gx + gw - 200;
  const lyy = gy - 14;
  for (const [txt, col] of items) {
    ctx.strokeStyle = col; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(lx, lyy); ctx.lineTo(lx + 18, lyy);
    ctx.stroke();
    ctx.fillStyle = col; ctx.fillText(txt, lx + 24, lyy + 5);
    lx += 66;
  }
  ctx.restore();
}

/* =========================================================
   数据面板
   ========================================================= */
const elCache = {};
function setText(id, txt) {
  let el = elCache[id];
  if (!el) { el = document.getElementById(id); elCache[id] = el; }
  if (el && el.textContent !== txt) el.textContent = txt;
}

function updateDataSuper() {
  if (!traj) return;
  const idx = curIndex();
  const t = idx * traj.dt;
  const x = traj.xs[idx], y = traj.ys[idx];
  const vx = traj.vxs[idx], vy = traj.vys[idx];
  const axx = traj.axs[idx], ayy = traj.ays[idx];
  const v = Math.hypot(vx, vy), a = Math.hypot(axx, ayy);
  const F = a * P.m;
  const qB = Math.abs(P.q * P.B);

  setText('d_t', t.toFixed(2) + ' s');
  setText('d_pos', x.toFixed(2) + ', ' + y.toFixed(2) + ' m');
  setText('d_v', v.toFixed(2) + ' m/s');
  setText('d_vx', vx.toFixed(2) + ' m/s');
  setText('d_vy', vy.toFixed(2) + ' m/s');
  setText('d_a', a.toFixed(2) + ' m/s²');
  setText('d_F', F.toFixed(2) + ' N');
  setText('d_Ek', (0.5 * P.m * v * v).toFixed(2) + ' J');
  setText('d_Fe', (Math.abs(P.q) * P.E).toFixed(2) + ' N');
  setText('d_Fl', (qB * v).toFixed(2) + ' N');
  setText('d_Fg', (P.gOn ? P.m * P.g : 0).toFixed(2) + ' N');
  if (qB > 1e-9) {
    setText('d_r', (P.m * v / qB).toFixed(2) + ' m');
    setText('d_T', (2 * Math.PI * P.m / qB).toFixed(2) + ' s');
    setText('d_f', (qB / (2 * Math.PI * P.m)).toFixed(3) + ' Hz');
  } else {
    setText('d_r', '—'); setText('d_T', '—'); setText('d_f', '—');
  }
  setText('d_state', computeState(x, y, vx, vy, t));
}

function updateDataCombo() {
  if (!traj) return;
  const idx = curIndex();
  const t = idx * traj.dt;
  const x = traj.xs[idx], y = traj.ys[idx];
  const vx = traj.vxs[idx], vy = traj.vys[idx];
  const axx = traj.axs[idx], ayy = traj.ays[idx];
  const v = Math.hypot(vx, vy), a = Math.hypot(axx, ayy);
  const m = P.c_m, q = P.c_q;
  const F = a * m;

  let Etot = 0, Btot = 0;
  for (const f of fields) {
    if (f.type === 'E_accel' || f.type === 'E_deflect' || f.type === 'E_alt') {
      const x0 = Math.min(f.x0, f.x1), x1 = Math.max(f.x0, f.x1);
      if (x >= x0 && x <= x1) Etot = Math.max(Etot, Math.abs(f.E));
    } else if (f.type === 'E_inf') {
      Etot = Math.max(Etot, Math.abs(f.E));
    } else if (f.type === 'E_radial') {
      const dx = x - f.cx, dy = y - f.cy;
      const d2 = dx*dx + dy*dy;
      if (d2 >= f.r1*f.r1 && d2 <= f.r2*f.r2) Etot = Math.max(Etot, Math.abs(f.E));
    } else if (f.type === 'B_rect' || f.type === 'B_alt') {
      const x0 = Math.min(f.x0, f.x1), x1 = Math.max(f.x0, f.x1);
      if (x >= x0 && x <= x1) Btot = Math.max(Btot, f.B);
    } else if (f.type === 'B_circle') {
      const dx = x - f.cx, dy = y - f.cy;
      if (dx*dx + dy*dy <= f.r * f.r) Btot = Math.max(Btot, f.B);
    } else if (f.type === 'B_half') {
      const dx = x - f.cx, dy = y - f.cy;
      if (dy >= 0 && dx*dx + dy*dy <= f.r * f.r) Btot = Math.max(Btot, f.B);
    } else if (f.type === 'B_ring') {
      const dx = x - f.cx, dy = y - f.cy;
      const d2 = dx*dx + dy*dy;
      if (d2 >= f.r1*f.r1 && d2 <= f.r2*f.r2) Btot = Math.max(Btot, f.B);
    } else if (f.type === 'B_inf') {
      Btot = Math.max(Btot, f.B);
    }
  }
  const qB = Math.abs(q * Btot);

  setText('c_d_t', t.toFixed(2) + ' s');
  setText('c_d_pos', x.toFixed(2) + ', ' + y.toFixed(2) + ' m');
  setText('c_d_v', v.toFixed(2) + ' m/s');
  setText('c_d_vx', vx.toFixed(2) + ' m/s');
  setText('c_d_vy', vy.toFixed(2) + ' m/s');
  setText('c_d_a', a.toFixed(2) + ' m/s²');
  setText('c_d_F', F.toFixed(2) + ' N');
  setText('c_d_Ek', (0.5 * m * v * v).toFixed(2) + ' J');
  setText('c_d_Fe', (Math.abs(q) * Etot).toFixed(2) + ' N');
  setText('c_d_Fl', (qB * v).toFixed(2) + ' N');
  setText('c_d_Fg', (P.c_gOn ? m * 10 : 0).toFixed(2) + ' N');
  if (qB > 1e-9) {
    setText('c_d_r', (m * v / qB).toFixed(2) + ' m');
    setText('c_d_T', (2 * Math.PI * m / qB).toFixed(2) + ' s');
    setText('c_d_f', (qB / (2 * Math.PI * m)).toFixed(3) + ' Hz');
  } else {
    setText('c_d_r', '—'); setText('c_d_T', '—'); setText('c_d_f', '—');
  }
  setText('c_d_state', computeState(x, y, vx, vy, t));
}

/* =========================================================
   索引与时间
   ========================================================= */
function curIndex() {
  if (!traj) return 0;
  const i = Math.round(tCur / traj.dt);
  return Math.max(0, Math.min(traj.n, i));
}
function updateTimeUI() {
  if (!traj) return;
  if (!draggingTime) timeSlider.value = tCur.toFixed(2);
  timeLabel.textContent = tCur.toFixed(2) + ' / ' + traj.duration.toFixed(2) + ' s';
}

/* =========================================================
   主循环
   ========================================================= */
function loop(ts) {
  if (!lastTs) lastTs = ts;
  let dtReal = (ts - lastTs) / 1000;
  lastTs = ts;
  if (dtReal > 0.08) dtReal = 0.08;

  if (playing && traj) {
    tCur += dtReal * speedMul;
    if (tCur >= traj.duration) {
      tCur = traj.duration;
      playing = false;
      updatePlayButton();
    }
  }

  if (state.view === 'super') {
    drawSceneSuper();
    drawGraphSuper();
    updateDataSuper();
    updateTimeUI();
  } else if (state.view === 'combo') {
    drawSceneCombo();
    updateDataCombo();
    updateTimeUI();
  }
  requestAnimationFrame(loop);
}

/* =========================================================
   交互
   ========================================================= */
function updatePlayButton() {
  btnPlay.innerHTML = playing ? '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="1" width="3.6" height="12" fill="currentColor"/><rect x="8.4" y="1" width="3.6" height="12" fill="currentColor"/></svg>' : '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.5 12 7 3 12.5z" fill="currentColor"/></svg>';
}
function togglePlay() {
  if (!traj) return;
  if (tCur >= traj.duration - 1e-6) tCur = 0;
  playing = !playing;
  updatePlayButton();
}
btnPlay.addEventListener('click', togglePlay);
document.getElementById('btnReset').addEventListener('click', () => {
  tCur = 0; playing = false; updatePlayButton();
});
window.addEventListener('keydown', e => {
  if (e.code === 'Space' && !document.getElementById('explain').open) {
    e.preventDefault(); togglePlay();
  }
});
timeSlider.addEventListener('pointerdown', () => { draggingTime = true; });
window.addEventListener('pointerup', () => { draggingTime = false; });
timeSlider.addEventListener('input', () => { tCur = parseFloat(timeSlider.value); });
speedSlider.addEventListener('input', () => {
  speedMul = parseFloat(speedSlider.value);
  speedLabel.textContent = speedMul.toFixed(1) + '×';
});
document.getElementById('showV').addEventListener('change', e => showLines.v = e.target.checked);
document.getElementById('showVx').addEventListener('change', e => showLines.vx = e.target.checked);
document.getElementById('showVy').addEventListener('change', e => showLines.vy = e.target.checked);

function formatSuperValue(key, val) {
  switch (key) {
    case 'm': return val.toFixed(2) + ' <i>kg</i>';
    case 'q': return (val >= 0 ? '+' : '') + val.toFixed(2) + ' <i>C</i>';
    case 'v0': return val.toFixed(1) + ' <i>m/s</i>';
    case 'theta0': return Math.round(val) + ' <i>°</i>';
    case 'E': return val.toFixed(1) + ' <i>N/C</i>';
    case 'Eangle': return Math.round(val) + ' <i>°</i>';
    case 'B': return val.toFixed(1) + ' <i>T</i>';
    case 'g': return val.toFixed(1) + ' <i>m/s²</i>';
    default: return val.toFixed(2);
  }
}
function formatComboValue(key, val) {
  switch (key) {
    case 'm': return val.toFixed(2) + ' <i>kg</i>';
    case 'q': return (val >= 0 ? '+' : '') + val.toFixed(2) + ' <i>C</i>';
    case 'v0': return val.toFixed(1) + ' <i>m/s</i>';
    case 'theta0': return Math.round(val) + ' <i>°</i>';
    case 'startOffset': return val.toFixed(2) + ' <i>m</i>';
    default: return val.toFixed(2);
  }
}

function syncSuperOutputs() {
  document.querySelectorAll('#viewSuper input[type=range]').forEach(inp => {
    const key = inp.dataset.sk;
    const outId = inp.dataset.so;
    if (outId) {
      const el = document.getElementById(outId);
      if (el) el.innerHTML = formatSuperValue(key, P[key]);
    }
  });
  document.getElementById('v_bdir').textContent = P.Bdir > 0 ? '向外 ·' : '向里 ×';
  document.getElementById('v_gon').textContent = P.gOn ? '已启用' : '已关闭';
}
function syncComboOutputs() {
  document.querySelectorAll('#viewCombo input[type=range]').forEach(inp => {
    const key = inp.dataset.ck;
    const outId = inp.dataset.co;
    if (outId) {
      const el = document.getElementById(outId);
      if (el) {
        const val = key === 'm' ? P.c_m :
                    key === 'q' ? P.c_q :
                    key === 'v0' ? P.c_v0 :
                    key === 'theta0' ? P.c_theta0 :
                    key === 'startOffset' ? P.c_startOffset : 0;
        el.innerHTML = formatComboValue(key, val);
      }
    }
  });
  document.getElementById('c_v_gon').textContent = P.c_gOn ? '已启用' : '已关闭';
}

function rebuild(resetTime) {
  buildTrajectory();
  if (resetTime !== false) tCur = 0;
  timeSlider.max = traj.duration.toFixed(2);
}

document.querySelectorAll('#viewSuper input[type=range]').forEach(inp => {
  inp.addEventListener('input', () => {
    const key = inp.dataset.sk;
    P[key] = parseFloat(inp.value);
    syncSuperOutputs();
    rebuild(true);
  });
});
document.querySelectorAll('#viewSuper .sbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.sp;
    const dir = parseFloat(btn.dataset.d);
    const inp = document.querySelector(`#viewSuper input[data-sk="${key}"]`);
    if (!inp) return;
    const step = parseFloat(inp.step) || 0.1;
    const min = parseFloat(inp.min);
    const max = parseFloat(inp.max);
    let v = parseFloat(inp.value) + dir * step;
    v = Math.round(v / step) * step;
    v = Math.min(max, Math.max(min, v));
    inp.value = v;
    P[key] = v;
    syncSuperOutputs();
    rebuild(true);
  });
});
document.getElementById('bdirBtn').addEventListener('click', function () {
  P.Bdir = -P.Bdir;
  this.classList.toggle('on', P.Bdir > 0);
  syncSuperOutputs();
  rebuild(true);
});
document.getElementById('gBtn').addEventListener('click', function () {
  P.gOn = !P.gOn;
  this.classList.toggle('on', P.gOn);
  syncSuperOutputs();
  rebuild(true);
});

document.querySelectorAll('#viewCombo input[type=range]').forEach(inp => {
  inp.addEventListener('input', () => {
    const key = inp.dataset.ck;
    const val = parseFloat(inp.value);
    if (key === 'm') P.c_m = val;
    else if (key === 'q') P.c_q = val;
    else if (key === 'v0') P.c_v0 = val;
    else if (key === 'theta0') P.c_theta0 = val;
    else if (key === 'startOffset') P.c_startOffset = val;
    syncComboOutputs();
    rebuild(true);
  });
});
document.querySelectorAll('#viewCombo .sbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.cp;
    const dir = parseFloat(btn.dataset.d);
    const inp = document.querySelector(`#viewCombo input[data-ck="${key}"]`);
    if (!inp) return;
    const step = parseFloat(inp.step) || 0.1;
    const min = parseFloat(inp.min);
    const max = parseFloat(inp.max);
    let v = parseFloat(inp.value) + dir * step;
    v = Math.round(v / step) * step;
    v = Math.min(max, Math.max(min, v));
    inp.value = v;
    if (key === 'm') P.c_m = v;
    else if (key === 'q') P.c_q = v;
    else if (key === 'v0') P.c_v0 = v;
    else if (key === 'theta0') P.c_theta0 = v;
    else if (key === 'startOffset') P.c_startOffset = v;
    syncComboOutputs();
    rebuild(true);
  });
});
document.getElementById('c_gBtn').addEventListener('click', function () {
  P.c_gOn = !P.c_gOn;
  this.classList.toggle('on', P.c_gOn);
  syncComboOutputs();
  rebuild(true);
});

/* =========================================================
   视图切换
   ========================================================= */
function setView(view) {
  state.view = view;

  document.querySelectorAll('.view-tabs .chip').forEach(c => c.classList.toggle('on', c.dataset.view === view));

  const titleEl = document.getElementById('titleText');
  const viewSuper = document.getElementById('viewSuper');
  const viewCombo = document.getElementById('viewCombo');

  if (view === 'super') {
    titleEl.textContent = '叠加场：电场、磁场、重力场在同一区域叠加';
    viewSuper.classList.add('active');
    viewCombo.classList.remove('active');

    P.m = 1.0; P.q = 1.0; P.v0 = 6.0; P.theta0 = 0;
    P.E = 0.0; P.Eangle = 0; P.B = 1.0;
    P.Bdir = 1; P.g = 10.0; P.gOn = true;

    document.querySelector('#viewSuper input[data-sk="m"]').value = P.m;
    document.querySelector('#viewSuper input[data-sk="q"]').value = P.q;
    document.querySelector('#viewSuper input[data-sk="v0"]').value = P.v0;
    document.querySelector('#viewSuper input[data-sk="theta0"]').value = P.theta0;
    document.querySelector('#viewSuper input[data-sk="E"]').value = P.E;
    document.querySelector('#viewSuper input[data-sk="Eangle"]').value = P.Eangle;
    document.querySelector('#viewSuper input[data-sk="B"]').value = P.B;
    document.querySelector('#viewSuper input[data-sk="g"]').value = P.g;
    document.getElementById('bdirBtn').classList.toggle('on', P.Bdir > 0);
    document.getElementById('gBtn').classList.toggle('on', P.gOn);
    syncSuperOutputs();
  } else {
    titleEl.textContent = '组合场：自由搭建电场与磁场区域，粒子依次穿过';
    viewSuper.classList.remove('active');
    viewCombo.classList.add('active');

    document.querySelector('#viewCombo input[data-ck="m"]').value = P.c_m;
    document.querySelector('#viewCombo input[data-ck="q"]').value = P.c_q;
    document.querySelector('#viewCombo input[data-ck="v0"]').value = P.c_v0;
    document.querySelector('#viewCombo input[data-ck="theta0"]').value = P.c_theta0;
    document.querySelector('#viewCombo input[data-ck="startOffset"]').value = P.c_startOffset;
    document.getElementById('c_gBtn').classList.toggle('on', P.c_gOn);
    syncComboOutputs();

    if (fields.length === 0) {
      createField('E_accel');
      createField('B_rect');
    }
    renderFieldList();
  }

  setTimeout(() => rebuild(true), 0);
  playing = false;
  updatePlayButton();
}

document.querySelectorAll('.view-tabs .chip').forEach(c => {
  c.addEventListener('click', () => setView(c.dataset.view));
});
const dlg = document.getElementById('explain');
document.getElementById('explainBtn').onclick = () => dlg.showModal();
document.getElementById('explainClose').onclick = () => dlg.close();
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

/* =========================================================
   初始化
   ========================================================= */
function init() {
  fillFormulas(document);
  state.view = 'super';
  renderFieldList();
  requestAnimationFrame(loop);
  setView('super');
}

init();
