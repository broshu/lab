'use strict';
// 动态圆模型：平移圆、旋转圆、放缩圆。画布为 700×500 的逻辑坐标，按显示尺寸缩放。
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const W = 700, H = 500;
const fig = cv.parentElement;
function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cs = getComputedStyle(fig);
  const aw = fig.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = fig.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const k = Math.max(0.2, Math.min(aw / W, ah / H));
  cv.style.width = (W * k) + 'px'; cv.style.height = (H * k) + 'px';
  cv.width = Math.round(W * k * dpr); cv.height = Math.round(H * k * dpr);
}
// 画布文字：支持 *斜体*、_下标、^上标 的写法（见 typeset.js）
ctx.fillText = function (s, x, y) {
  const m = /(bold\s+)?(\d+(?:\.\d+)?)px/.exec(ctx.font);
  drawRich(ctx, String(s), x, y, { size: m ? +m[2] : 12, weight: m && m[1] ? 'bold' : '', color: ctx.fillStyle, align: ctx.textAlign === 'start' ? 'left' : ctx.textAlign });
};

let state = {
  model: 'translate',
  sub: 'board',
  translateY: 0.5,
  rotateAngle: 180,
  scaleR: 120,
  // 长板参数（自由移动）
  boardX: 350,
  boardY: 160,         // 改到入射点上方
  boardAngle: 0,       // 度
  boardGap: 0,         // px
  animating: false,
  animTime: 0,
};

const COL = {
  bg: '#ffffff',
  field: 'rgba(0,158,115,0.07)',
  fieldBorder: 'rgba(0,158,115,0.9)',
  fieldCross: 'rgba(0,158,115,0.5)',
  ghost: 'rgba(0,114,178,0.18)',
  arc: '#D55E00',
  arcGlow: 'rgba(0,0,0,0)',
  center: '#444444',
  centerDim: 'rgba(68,68,68,0.45)',
  centerLine: 'rgba(68,68,68,0.4)',
  particle: '#D55E00',
  velocity: '#0072B2',
  board: '#B07A00',
  boardGlow: 'rgba(176,122,0,0.28)',
  boardEdge: '#8a5f00',
  envelope: 'rgba(0,114,178,0.06)',
  envelopeBorder: 'rgba(0,114,178,0.5)',
  critical1: '#0072B2',
  critical2: '#a14d82',
  text: '#555555',
  textBright: '#333333',
};

// ==================== 工具函数 ====================
function drawBG() {
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, H);
}

function drawFieldCrosses(x1, y1, x2, y2) {
  ctx.strokeStyle = COL.fieldCross;
  ctx.lineWidth = 1.3;
  const step = 30;
  for (let x = x1 + step / 2; x < x2; x += step) {
    for (let y = y1 + step / 2; y < y2; y += step) {
      const s = 4;
      ctx.beginPath();
      ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
      ctx.stroke();
    }
  }
}

function drawFieldRect(x1, y1, x2, y2, label) {
  ctx.fillStyle = COL.field;
  ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  drawFieldCrosses(x1, y1, x2, y2);
  ctx.strokeStyle = COL.fieldBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  if (false) {
    ctx.fillStyle = '#007a58';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('匀强磁场 *B*，垂直纸面向里', x1 + 10, y1 + 20);
  }
}

function drawGhostCircle(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = COL.ghost;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawCenterDot(cx, cy, dim) {
  ctx.beginPath();
  ctx.arc(cx, cy, dim ? 2.5 : 3.5, 0, Math.PI * 2);
  ctx.fillStyle = dim ? COL.centerDim : COL.center;
  ctx.fill();
}

function drawParticleDot(x, y, color, r) {
  ctx.beginPath();
  ctx.arc(x, y, r || 5, 0, Math.PI * 2);
  ctx.fillStyle = color || COL.particle;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawArcPath(pts, color, lw) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || 2.5;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawArrow(x1, y1, x2, y2, color, lw) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = 10;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - len * Math.cos(angle - 0.4), y2 - len * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - len * Math.cos(angle + 0.4), y2 - len * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function traceArc(cx, cy, r, theta0, stopFn, maxSteps) {
  const pts = [];
  let theta = theta0;
  const step = 0.02;
  const maxN = maxSteps || 600;
  for (let i = 0; i < maxN; i++) {
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    pts.push({ x, y });
    if (stopFn && i > 0 && stopFn(x, y)) break;
    theta -= step;
  }
  return pts;
}

function centerFromAlpha(ox, oy, R, alpha) {
  return { cx: ox + R * Math.sin(alpha), cy: oy - R * Math.cos(alpha) };
}

function normalizeAngle(deg) { return ((deg % 360) + 360) % 360; }

function angleLabel(deg) {
  const d = normalizeAngle(deg);
  const labels = ['向右','右下','向下','左下','向左','左上','向上','右上'];
  const idx = Math.round(d / 45) % 8;
  const center = idx * 45;
  let diff = Math.abs(d - center);
  if (diff > 180) diff = 360 - diff;
  if (diff <= 22.5) return labels[idx];
  return '';
}

// ==================== 板几何工具 ====================
function worldToBoard(px, py, bcx, bcy, theta) {
  const dx = px - bcx;
  const dy = py - bcy;
  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  return {
    u: dx * cosT + dy * sinT,
    v: -dx * sinT + dy * cosT
  };
}

function checkHitBoard(px, py, bcx, bcy, theta, len, gap, tol) {
  const t = tol || 3.5;
  const { u, v } = worldToBoard(px, py, bcx, bcy, theta);
  if (Math.abs(v) > t) return null;
  const halfL = len / 2;
  const halfG = gap / 2;
  if (Math.abs(u) > halfL) return null;
  if (gap > 1 && Math.abs(u) < halfG) return null;
  return { u, v };
}

// ==================== 平移圆 ====================
const TR = {
  field: { x1: 260, y1: 60, x2: 660, y2: 440 },
  launchX: 170,
  R: 75,
  pyMin: 150,
  pyMax: 400,
};

function drawTranslate() {
  const py = TR.pyMin + (TR.pyMax - TR.pyMin) * state.translateY;
  const bx = TR.field.x1;
  const topY = TR.field.y1;

  drawFieldRect(TR.field.x1, TR.field.y1, TR.field.x2, TR.field.y2);

  ctx.strokeStyle = '#d8d8d8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(TR.launchX, TR.pyMin - 40);
  ctx.lineTo(TR.launchX, TR.pyMax + 40);
  ctx.stroke();
  ctx.fillStyle = COL.text;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('线状粒子源', TR.launchX - 6, TR.pyMin - 50);

  const nGhost = 9;
  for (let i = 0; i <= nGhost; i++) {
    const t = i / nGhost;
    const p = TR.pyMin + (TR.pyMax - TR.pyMin) * t;
    drawGhostCircle(bx, p - TR.R, TR.R);
    drawCenterDot(bx, p - TR.R, true);
  }

  ctx.strokeStyle = COL.centerLine;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(bx, TR.pyMin - TR.R);
  ctx.lineTo(bx, TR.pyMax - TR.R);
  ctx.stroke();
  ctx.setLineDash([]);

  const cx = bx, cy = py - TR.R;

  ctx.strokeStyle = COL.particle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(TR.launchX, py);
  ctx.lineTo(bx, py);
  ctx.stroke();

  drawArrow(TR.launchX + 8, py - 12, TR.launchX + 45, py - 12, COL.velocity, 2.4);

  ctx.beginPath();
  ctx.arc(cx, cy, TR.R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,114,178,0.3)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const s = (topY - py + TR.R) / TR.R;
  let endAngle = -Math.PI / 2;
  let hitBoard = false;
  if (s >= -1 && s <= 1) {
    const t = Math.asin(s);
    if (t < Math.PI / 2 - 0.001) {
      endAngle = t;
      hitBoard = true;
    }
  }

  const pts = [];
  let theta = Math.PI / 2;
  const step = 0.02;
  while (theta > endAngle - 0.001) {
    pts.push({ x: cx + TR.R * Math.cos(theta), y: cy + TR.R * Math.sin(theta) });
    theta -= step;
    if (theta < endAngle) break;
  }
  pts.push({ x: cx + TR.R * Math.cos(endAngle), y: cy + TR.R * Math.sin(endAngle) });

  
  drawArcPath(pts, COL.arc, 3);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = COL.centerDim;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(bx, py);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COL.center;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('*R*', bx + 6, cy + TR.R / 2 + 4);

  drawCenterDot(cx, cy);
  drawParticleDot(bx, py, COL.particle, 4.5);

  const ex = cx + TR.R * Math.cos(endAngle);
  const ey = cy + TR.R * Math.sin(endAngle);
  drawParticleDot(ex, ey, hitBoard ? COL.board : '#0072B2', 5);

  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  if (hitBoard) {
    ctx.fillStyle = COL.board;
    ctx.fillText('击中上边界', ex, ey - 12);
  } else {
    ctx.fillStyle = '#0072B2';
    ctx.fillText('从边界射出', ex, ey - 12);
  }

  ctx.fillStyle = COL.text;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('入射点 *y* = ' + Math.round(py), TR.launchX + 5, py + 20);
}

// ==================== 旋转圆 — 长板边界（自由移动/旋转/断开） ====================
// 入射点上移至 (350, 250)，包络圆从 y=100 到 y=400，完整显示在画布中央
const RO_B = {
  ox: 350, oy: 250,
  R: 75,
  boardLen: 620,
};

function drawRotateBoard() {
  const { ox, oy, R } = RO_B;
  const dNorm = normalizeAngle(state.rotateAngle);
  const alpha = dNorm * Math.PI / 180;

  // 板参数（自由移动）
  const bcx = state.boardX;
  const bcy = state.boardY;
  const bTheta = state.boardAngle * Math.PI / 180;
  const bLen = RO_B.boardLen;
  const bGap = state.boardGap;
  const halfL = bLen / 2;
  const halfG = bGap / 2;

  const cosT = Math.cos(bTheta);
  const sinT = Math.sin(bTheta);

  // ===== 包络圆 =====
  ctx.beginPath();
  ctx.arc(ox, oy, 2 * R, 0, Math.PI * 2);
  ctx.fillStyle = COL.envelope;
  ctx.fill();
  ctx.strokeStyle = COL.envelopeBorder;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#005a8c';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('包络圆 2*R*（粒子可到达区域）', ox, oy + 2 * R + 18);

  // ===== 绘制板（两段） =====
  function drawSegment(u1, u2) {
    const x1 = bcx + u1 * cosT;
    const y1 = bcy + u1 * sinT;
    const x2 = bcx + u2 * cosT;
    const y2 = bcy + u2 * sinT;
    ctx.strokeStyle = COL.boardGlow;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = COL.board;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  if (bGap > 1) {
    drawSegment(-halfL, -halfG);
    drawSegment(halfG, halfL);
  } else {
    drawSegment(-halfL, halfL);
  }

  // 端点标记
  const end1 = { x: bcx - halfL * cosT, y: bcy - halfL * sinT };
  const end2 = { x: bcx + halfL * cosT, y: bcy + halfL * sinT };
  ctx.fillStyle = COL.board;
  ctx.beginPath(); ctx.arc(end1.x, end1.y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(end2.x, end2.y, 3, 0, Math.PI * 2); ctx.fill();

  // 板中心标记
  ctx.beginPath(); ctx.arc(bcx, bcy, 4, 0, Math.PI * 2);
  ctx.fillStyle = COL.boardEdge;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 板标签
  ctx.fillStyle = COL.board;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('长板', end1.x - 40, end1.y - 10);

  // 板间隙标注
  if (bGap > 1) {
    const gx1 = bcx - halfG * cosT;
    const gy1 = bcy - halfG * sinT;
    const gx2 = bcx + halfG * cosT;
    const gy2 = bcy + halfG * sinT;
    ctx.strokeStyle = 'rgba(176,122,0,0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(gx1, gy1);
    ctx.lineTo(gx2, gy2);
    ctx.stroke();
    ctx.setLineDash([]);
    const gmx = (gx1 + gx2) / 2 + Math.sin(bTheta) * 20;
    const gmy = (gy1 + gy2) / 2 - Math.cos(bTheta) * 20;
    ctx.fillStyle = COL.boardEdge;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('间隙 ' + bGap, gmx, gmy);
  }

  // ===== 幽灵轨迹 =====
  const nDir = 90;
  const hitInfo = [];

  for (let i = 0; i < nDir; i++) {
    const a = (i / nDir) * Math.PI * 2;
    const { cx, cy } = centerFromAlpha(ox, oy, R, a);
    const theta0 = Math.atan2(oy - cy, ox - cx);

    const stopFn = (x, y) => {
      const hit = checkHitBoard(x, y, bcx, bcy, bTheta, bLen, bGap, 3);
      if (hit) return true;
      if (x < -50 || x > W + 50 || y < -50 || y > H + 50) return true;
      return false;
    };

    const pts = traceArc(cx, cy, R, theta0, stopFn, 700);

    const last = pts[pts.length - 1];
    let hitThis = null;
    if (last) {
      const hit = checkHitBoard(last.x, last.y, bcx, bcy, bTheta, bLen, bGap, 4);
      if (hit) {
        hitThis = { u: hit.u, x: last.x, y: last.y };
        hitInfo.push(hitThis);
      }
    }

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
    ctx.strokeStyle = hitThis ? 'rgba(176,122,0,0.45)' : 'rgba(0,114,178,0.16)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // ===== 高亮当前角度 =====
  const { cx, cy } = centerFromAlpha(ox, oy, R, alpha);
  const theta0 = Math.atan2(oy - cy, ox - cx);

  const stopFn = (x, y) => {
    const hit = checkHitBoard(x, y, bcx, bcy, bTheta, bLen, bGap, 3);
    if (hit) return true;
    if (x < -50 || x > W + 50 || y < -50 || y > H + 50) return true;
    return false;
  };
  const pts = traceArc(cx, cy, R, theta0, stopFn, 700);

  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,114,178,0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();

  
  drawArcPath(pts, COL.arc, 3);
  ctx.shadowBlur = 0;

  drawParticleDot(ox, oy, COL.particle, 6);

  const vLen = 46;
  drawArrow(ox, oy, ox + vLen * Math.cos(alpha), oy + vLen * Math.sin(alpha), COL.velocity, 3);

  drawCenterDot(cx, cy);

  // ===== 打板范围（沿板方向） =====
  if (hitInfo.length > 1) {
    const uList = hitInfo.map(h => h.u);
    const minU = Math.min(...uList);
    const maxU = Math.max(...uList);

    const hx1 = bcx + minU * cosT;
    const hy1 = bcy + minU * sinT;
    const hx2 = bcx + maxU * cosT;
    const hy2 = bcy + maxU * sinT;

    ctx.strokeStyle = 'rgba(176,122,0,0.3)';
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx1, hy1);
    ctx.lineTo(hx2, hy2);
    ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.beginPath(); ctx.arc(hx1, hy1, 6, 0, Math.PI * 2); ctx.fillStyle = COL.board; ctx.fill();
    ctx.beginPath(); ctx.arc(hx2, hy2, 6, 0, Math.PI * 2); ctx.fillStyle = COL.board; ctx.fill();

    const nx = -sinT, ny = cosT;
    ctx.strokeStyle = COL.board;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx1 + nx * 30, hy1 + ny * 30);
    ctx.lineTo(hx2 + nx * 30, hy2 + ny * 30);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx1 + nx * 26, hy1 + ny * 26);
    ctx.lineTo(hx1 + nx * 34, hy1 + ny * 34);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx2 + nx * 26, hy2 + ny * 26);
    ctx.lineTo(hx2 + nx * 34, hy2 + ny * 34);
    ctx.stroke();

    const midX = (hx1 + hx2) / 2 + nx * 45;
    const midY = (hy1 + hy2) / 2 + ny * 45;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(midX - 72, midY - 13, 144, 20);
    ctx.fillStyle = COL.board;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('打板范围 Δ*u* = ' + Math.round(maxU - minU) + ' px', midX, midY);
  }

  // ===== 圆心分布圆 =====
  ctx.strokeStyle = COL.centerLine;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(ox, oy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = COL.center;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('圆心分布圆 *R*', ox + R * 0.72 + 6, oy - R * 0.72 - 4);

  // ===== 状态文字 =====
  const lbl = angleLabel(state.rotateAngle);
  ctx.fillStyle = '#005a8c';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('*v* 方向：' + Math.round(dNorm) + '°' + (lbl ? '（' + lbl + '）' : ''), 20, 30);

  const last = pts[pts.length - 1];
  const isHit = last && checkHitBoard(last.x, last.y, bcx, bcy, bTheta, bLen, bGap, 4);
  if (isHit) {
    drawParticleDot(last.x, last.y, COL.board, 5);
    ctx.fillStyle = COL.board;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('击中！', last.x, last.y - 12);
  } else if (last) {
    drawParticleDot(last.x, last.y, '#0072B2', 4.5);
  }

  ctx.fillStyle = '#005a8c';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('击中板的方向数：' + hitInfo.length + ' / ' + nDir, 20, 50);
}

// ==================== 旋转圆 — 圆形边界 ====================
const RO_C = {
  fieldCx: 460, fieldCy: 260, fieldR: 140,
  ox: 370, oy: 230,
  R: 70,
};

function drawRotateCircle() {
  const { fieldCx, fieldCy, fieldR, ox, oy, R } = RO_C;
  const dNorm = normalizeAngle(state.rotateAngle);
  const alpha = dNorm * Math.PI / 180;

  ctx.beginPath();
  ctx.arc(fieldCx, fieldCy, fieldR, 0, Math.PI * 2);
  ctx.fillStyle = COL.field;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(fieldCx, fieldCy, fieldR, 0, Math.PI * 2);
  ctx.clip();
  drawFieldCrosses(fieldCx - fieldR, fieldCy - fieldR, fieldCx + fieldR, fieldCy + fieldR);
  ctx.restore();

  ctx.strokeStyle = COL.fieldBorder;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(fieldCx, fieldCy, fieldR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#007a58';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('圆形磁场区域', fieldCx, fieldCy - fieldR - 12);

  ctx.save();
  ctx.beginPath();
  ctx.arc(fieldCx, fieldCy, fieldR, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(ox, oy, 2 * R, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,114,178,0.13)';
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(ox, oy, 2 * R, 0, Math.PI * 2);
  ctx.strokeStyle = COL.envelopeBorder;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  const nDir = 72;
  const inField = (x, y) => {
    const dx = x - fieldCx, dy = y - fieldCy;
    return dx * dx + dy * dy <= fieldR * fieldR + 1;
  };

  for (let i = 0; i < nDir; i++) {
    const a = (i / nDir) * Math.PI * 2;
    const { cx, cy } = centerFromAlpha(ox, oy, R, a);
    const theta0 = Math.atan2(oy - cy, ox - cx);

    const pts = traceArc(cx, cy, R, theta0, (x, y) => !inField(x, y), 500);

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
    ctx.strokeStyle = 'rgba(0,114,178,0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  const { cx, cy } = centerFromAlpha(ox, oy, R, alpha);
  const theta0 = Math.atan2(oy - cy, ox - cx);

  const pts = traceArc(cx, cy, R, theta0, (x, y) => !inField(x, y), 500);

  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,114,178,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  
  drawArcPath(pts, COL.arc, 3);
  ctx.shadowBlur = 0;

  drawCenterDot(cx, cy);
  drawParticleDot(ox, oy, COL.particle, 6);

  const vLen = 46;
  drawArrow(ox, oy, ox + vLen * Math.cos(alpha), oy + vLen * Math.sin(alpha), COL.velocity, 3);

  const last = pts[pts.length - 1];
  if (last) {
    drawParticleDot(last.x, last.y, '#0072B2', 5);

    ctx.strokeStyle = COL.centerDim;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#0072B2';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('射出点', last.x, last.y - 12);
  }

  ctx.strokeStyle = COL.centerLine;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(ox, oy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = COL.center;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('圆心分布圆 *R*', ox + R * 0.72 + 6, oy - R * 0.72 - 4);

  ctx.fillStyle = '#005a8c';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('扫过区域（包络圆 ∩ 磁场）', fieldCx - 60, fieldCy + fieldR + 16);

  const lbl = angleLabel(state.rotateAngle);
  ctx.fillStyle = '#005a8c';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('*v* 方向：' + Math.round(dNorm) + '°' + (lbl ? '（' + lbl + '）' : ''), 20, 30);
}

// ==================== 放缩圆 ====================
const SC = {
  field: { x1: 280, y1: 70, x2: 430, y2: 420 },
  ox: 280, oy: 245,
  Rc1: 87.5,
  Rc2: 150,
};

function traceParticleArc(cx, cy, R, rect) {
  const pts = [];
  let theta = Math.PI / 2;
  const step = 0.012;
  const maxIter = 1200;
  const eps = 0.8;
  for (let i = 0; i < maxIter; i++) {
    const x = cx + R * Math.cos(theta);
    const y = cy + R * Math.sin(theta);
    if (i > 0) {
      if (x < rect.x1 - eps || x > rect.x2 + eps || y < rect.y1 - eps || y > rect.y2 + eps) {
        pts.push({ x, y });
        break;
      }
    }
    pts.push({ x, y });
    theta -= step;
  }
  return pts;
}

function drawScale() {
  const f = SC.field;
  const ox = SC.ox, oy = SC.oy;
  const R = state.scaleR;

  drawFieldRect(f.x1, f.y1, f.x2, f.y2);

  ctx.strokeStyle = COL.centerLine;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox, f.y1 - 30);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = COL.center;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('圆心所在直线 ⊥ *v*', ox - 8, f.y1 + 40);

  const ghostRadii = [50, 70, SC.Rc1, 110, SC.Rc2, 180];
  for (const rr of ghostRadii) {
    if (Math.abs(rr - R) < 2) continue;
    const ccx = ox, ccy = oy - rr;
    const pts = traceParticleArc(ccx, ccy, rr, f);
    if (pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
    ctx.strokeStyle = 'rgba(0,114,178,0.2)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  {
    const rr = SC.Rc1;
    const ccx = ox, ccy = oy - rr;
    const pts = traceParticleArc(ccx, ccy, rr, f);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
    ctx.strokeStyle = '#0072B2';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COL.critical1;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('上边界相切 *R* = *h*/4', f.x1 + 6, f.y1 - 4);
  }

  {
    const rr = SC.Rc2;
    const ccx = ox, ccy = oy - rr;
    const pts = traceParticleArc(ccx, ccy, rr, f);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
    ctx.strokeStyle = '#CC79A7';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COL.critical2;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('右边界相切 *R* = *w*', f.x2 + 8, oy - rr + 4);
  }

  const cx = ox, cy = oy - R;
  const pts = traceParticleArc(cx, cy, R, f);

  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,114,178,0.28)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  
  drawArcPath(pts, COL.arc, 3);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = COL.centerDim;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = COL.center;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('*R* = ' + Math.round(R), ox + 6, oy - R / 2);

  drawCenterDot(cx, cy);
  drawParticleDot(ox, oy, COL.particle, 5);

  drawArrow(ox - 70, oy, ox - 20, oy, COL.velocity, 2.4);
  ctx.strokeStyle = COL.particle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ox - 80, oy);
  ctx.lineTo(ox, oy);
  ctx.stroke();

  const last = pts[pts.length - 1];
  if (last) {
    let edge = '';
    let color = '#0072B2';
    if (last.x < f.x1 + 4) { edge = '左边界射出'; color = '#0072B2'; }
    else if (last.x > f.x2 - 4) { edge = '击中右边界'; color = COL.board; }
    else if (last.y < f.y1 + 4) { edge = '击中上边界'; color = COL.board; }
    else if (last.y > f.y2 - 4) { edge = '击中下边界'; color = COL.board; }

    drawParticleDot(last.x, last.y, color, 5);

    ctx.fillStyle = color;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(edge, last.x, last.y - 14);
  }

  ctx.fillStyle = '#005a8c';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  let status = '';
  if (R < SC.Rc1) status = '状态：粒子从左侧边界射出';
  else if (R < SC.Rc2) status = '状态：击中上边界';
  else status = '状态：击中右边界';

  ctx.fillText('*R* = ' + Math.round(R) + ' px  |  ' + status, 20, 30);

  ctx.fillStyle = '#8a5f00';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('*R* < *h*/4：左侧射出 | *h*/4 < *R* < *w*：上边界 | *R* > *w*：右边界', 20, H - 15);
}

// ==================== 主绘制 ====================
function draw() {
  drawBG();

  if (state.model === 'translate') {
    drawTranslate();
  } else if (state.model === 'rotate') {
    if (state.sub === 'board') drawRotateBoard();
    else drawRotateCircle();
  } else {
    drawScale();
  }
}

// ==================== 信息面板 ====================
const FML = window.FORMULAS || {};
const INFO = {
  translate: {
    title: '平移圆',
    desc: '速度大小、方向都相同，入射点沿一条直线移动。各粒子轨迹圆半径相同，圆心排在同一直线上。',
    formula: 'f_translate',
    formulaNote: '半径相同，圆心轨迹线与入射点轨迹线平行',
    crit: ['轨迹圆与边界相切，是恰好射出或恰好不射出的临界', '运动时间最长：轨迹为半圆（圆心角 180°）', '运动时间最短：弦长最短（圆心角最小）'],
    exam: ['线状粒子源从某边界射出的区域长度', '运动时间的最长、最短问题', '三角形或平行边界中的临界分析']
  },
  rotate: {
    title: '旋转圆',
    desc: '速度大小一定、方向不同，入射点相同。轨迹圆半径相同，圆心分布在以入射点为圆心、半径为 <i>R</i> 的圆上。',
    formula: 'f_rotate',
    formulaNote: '圆心分布圆半径 R，包络圆半径 2R；滑块从“向左”起转一整圈',
    crit: ['板的位置可自由移动：放在入射点的任意方位', '板旋转：倾斜的板改变相切临界，要用几何关系重新求解', '板间隙：粒子可从间隙穿过，两段板各自被打到的范围分别计算', '打板范围：沿板方向高亮，由两端相切轨迹的击点确定'],
    exam: ['板在入射点上方、下方、侧方时的打板范围差异', '倾斜板上的打板范围（需旋转坐标系）', '带缝隙的板：能打到的粒子数占比', '圆形磁场边界加旋转圆的极值问题']
  },
  scale: {
    title: '放缩圆',
    desc: '矩形有界磁场，粒子从左侧短边中点水平射入。速度方向相同、大小不同，轨迹圆在入射点有公切线，圆心都在过入射点且垂直于 <i>v</i> 的直线上。',
    formula: 'f_scale',
    formulaNote: '速度越大，半径越大',
    crit: ['与上边界相切：<span class="tex" data-f="c_top"></span>（<i>h</i> 为磁场高度）', '与右边界相切：<span class="tex" data-f="c_right"></span>（<i>w</i> 为磁场宽度）', '<i>R</i> &lt; <i>h</i>/4：粒子从左侧边界射出', '<i>h</i>/4 &lt; <i>R</i> &lt; <i>w</i>：粒子击中上边界', '<i>R</i> &gt; <i>w</i>：粒子击中右边界'],
    exam: ['求能从某边界射出的速度范围', '求恰好不射出的临界速度', '利用弦切角和几何关系快速确定临界半径', '多解问题：不同半径对应不同边界']
  }
};
function ul(items) { return '<ul class="bullets">' + items.map(t => '<li>' + t + '</li>').join('') + '</ul>'; }

function updateInfo() {
  const d = INFO[state.model];
  document.getElementById('panelTitle').textContent = d.title + ' · 控制';
  document.getElementById('formulaText').innerHTML = FML[d.formula] || '';
  document.getElementById('formulaNote').innerHTML = d.formulaNote.replace(/\bR\b/g, '<i>R</i>');
  document.getElementById('info').innerHTML =
    '<div class="card"><h3>' + d.title + '模型</h3><p class="note">' + d.desc + '</p></div>' +
    '<div class="card"><h3>' + (state.model === 'rotate' ? '长板参数（考点）' : state.model === 'scale' ? '临界条件' : '临界条件') + '</h3>' + ul(d.crit) + '</div>' +
    '<div class="card"><h3>典型考法</h3>' + ul(d.exam) + '</div>';
  fillFormulas(document.getElementById('info'));
}

// ==================== 控制面板可见性 ====================
function show(id, on) { document.getElementById(id).classList.toggle('hidden', !on); }
function updateControlVisibility() {
  const isRotate = state.model === 'rotate', isBoard = isRotate && state.sub === 'board';
  show('ctrlTranslate', state.model === 'translate');
  show('ctrlRotate', isRotate);
  show('ctrlScale', state.model === 'scale');
  show('ctrlBoardX', isBoard); show('ctrlBoardY', isBoard); show('ctrlBoardAngle', isBoard); show('ctrlBoardGap', isBoard);
  show('subTabs', isRotate);
}

// ==================== 事件绑定 ====================
const $ = id => document.getElementById(id);
function offsetLabel(pct) { return pct < 25 ? '高' : pct < 50 ? '中高' : pct < 75 ? '中低' : '低'; }
function angleText() { const d = normalizeAngle(state.rotateAngle), l = angleLabel(state.rotateAngle); return Math.round(d) + '°' + (l ? '（' + l + '）' : ''); }

document.querySelectorAll('#modelTabs .chip').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#modelTabs .chip').forEach(c => c.classList.toggle('on', c === b));
  state.model = b.dataset.model; updateControlVisibility(); updateInfo(); draw();
}));
document.querySelectorAll('#subTabs .chip').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#subTabs .chip').forEach(c => c.classList.toggle('on', c === b));
  state.sub = b.dataset.sub; updateControlVisibility(); draw();
}));

$('sliderOffset').addEventListener('input', e => { state.translateY = e.target.value / 100; $('valOffset').textContent = offsetLabel(parseInt(e.target.value)); draw(); });
$('sliderAngle').addEventListener('input', e => { state.rotateAngle = parseInt(e.target.value); $('valAngle').textContent = angleText(); draw(); });
$('sliderBoardX').addEventListener('input', e => { state.boardX = parseInt(e.target.value); $('valBoardX').textContent = state.boardX; draw(); });
$('sliderBoardY').addEventListener('input', e => { state.boardY = parseInt(e.target.value); $('valBoardY').textContent = state.boardY; draw(); });
$('sliderBoardAngle').addEventListener('input', e => { state.boardAngle = parseInt(e.target.value); $('valBoardAngle').textContent = state.boardAngle + '°'; draw(); });
$('sliderBoardGap').addEventListener('input', e => { state.boardGap = parseInt(e.target.value); $('valBoardGap').textContent = state.boardGap; draw(); });
$('sliderScale').addEventListener('input', e => { state.scaleR = parseInt(e.target.value); $('valScale').textContent = state.scaleR; draw(); });

$('btnReset').addEventListener('click', () => {
  Object.assign(state, { translateY: 0.5, rotateAngle: 180, scaleR: 120, boardX: 350, boardY: 160, boardAngle: 0, boardGap: 0, animating: false });
  $('sliderOffset').value = 50; $('sliderAngle').value = 180; $('sliderScale').value = 120;
  $('sliderBoardX').value = 350; $('sliderBoardY').value = 160; $('sliderBoardAngle').value = 0; $('sliderBoardGap').value = 0;
  $('valOffset').textContent = '中'; $('valAngle').textContent = '180°（向左）'; $('valScale').textContent = '120';
  $('valBoardX').textContent = '350'; $('valBoardY').textContent = '160'; $('valBoardAngle').textContent = '0°'; $('valBoardGap').textContent = '0';
  $('btnPlay').textContent = '自动演示';
  draw();
});

// ==================== 自动动画 ====================
function animate() {
  if (!state.animating) return;
  state.animTime += 0.018;
  if (state.model === 'translate') {
    state.translateY = 0.5 + 0.5 * Math.sin(state.animTime);
    const pct = Math.round(state.translateY * 100);
    $('sliderOffset').value = pct; $('valOffset').textContent = offsetLabel(pct);
  } else if (state.model === 'rotate') {
    state.rotateAngle += 1.6; if (state.rotateAngle > 540) state.rotateAngle = 180;
    $('sliderAngle').value = Math.round(state.rotateAngle); $('valAngle').textContent = angleText();
  } else {
    const t = (Math.sin(state.animTime * 0.7) + 1) / 2;
    state.scaleR = Math.round(50 + t * 140);
    $('sliderScale').value = state.scaleR; $('valScale').textContent = state.scaleR;
  }
  draw();
  requestAnimationFrame(animate);
}
$('btnPlay').addEventListener('click', () => {
  state.animating = !state.animating;
  $('btnPlay').textContent = state.animating ? '暂停演示' : '自动演示';
  if (state.animating) animate();
});

const dlg = $('explain');
$('explainBtn').onclick = () => dlg.showModal();
$('explainClose').onclick = () => dlg.close();
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

// ==================== 初始化 ====================
fillFormulas(document);
new ResizeObserver(() => { fitCanvas(); draw(); }).observe(fig);
fitCanvas();
updateControlVisibility();
updateInfo();
draw();
