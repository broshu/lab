'use strict';
const assert = require('node:assert/strict');
const P = require('../js/physics.js');

const near = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' ≠ ' + b);
const R = 150;

// 1. r = R：平行入射的粒子全部经过聚焦点，偏转角满足 cos θ = h / R
for (const sign of [1, -1]) {
  const F = P.focusPoint(R, sign);
  for (let h = -0.95 * R; h <= 0.95 * R; h += 0.05 * R) {
    const t = P.focusTrack(h, R, R, sign);
    near(t.Q.x, F.x, 1e-7, 'focus x'); near(t.Q.y, F.y, 1e-7, 'focus y');
    near(t.sweep, P.focusAngle(h, R, sign), 1e-9, 'deflection angle');
    near(P.len(P.sub(t.C, t.P)), R, 1e-9, 'radius');
  }
}

// 2. r ≠ R：出射点不再重合
const a = P.focusTrack(-0.5 * R, 1.3 * R, R, 1).Q, b = P.focusTrack(0.5 * R, 1.3 * R, R, 1).Q;
assert.ok(P.len(P.sub(a, b)) > 1, 'r ≠ R 时不汇聚');

// 3. 坐标验证：|O′Q|² − r² = 2(R − r)(R − h)
for (const r of [0.6 * R, R, 1.7 * R]) {
  for (const h of [-0.8 * R, 0, 0.4 * R]) {
    const C = { x: -Math.sqrt(R * R - h * h), y: h + r };
    near(P.len(P.sub(C, { x: 0, y: R })) ** 2 - r * r, 2 * (R - r) * (R - h), 1e-6, 'identity');
  }
}

// 4. r = R：从边界一点射入的粒子，出射速度全部垂直于 OS（正电荷从顶点射入 → 全部向右）
const S = { x: 0, y: R };
for (let deg = -175; deg <= -5; deg += 10) {
  const t = P.divergeTrack(S, deg * P.DEG, R, R, 1);
  near(t.vOut.x, 1, 1e-9, 'parallel x'); near(t.vOut.y, 0, 1e-9, 'parallel y');
}
for (let deg = -175; deg <= -5; deg += 10) {
  const t = P.divergeTrack(S, deg * P.DEG, R, R, -1);
  near(t.vOut.x, -1, 1e-9, 'negative charge exits leftwards');
}
console.log('magnetic-focusing physics ok');
