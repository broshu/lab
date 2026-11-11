'use strict';
// 磁聚焦与磁发散的几何计算。数学坐标：磁场区域圆心 O 在原点，y 轴向上，磁场垂直纸面向里。
// 正电荷在纸面内逆时针偏转（sign = +1），负电荷顺时针偏转（sign = -1）。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MF = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
  const len = a => Math.hypot(a.x, a.y);
  const unit = a => mul(a, 1 / len(a));
  const left = a => ({ x: -a.y, y: a.x }); // 逆时针转 90°
  const mod = (a, m) => ((a % m) + m) % m;

  // 粒子从磁场边界上的 P 点以方向 dir 进入磁场，轨迹半径 r，返回圆心、出射点、偏转角等。
  function arcInField(P, dir, r, R, sign) {
    const u = unit(dir);
    const C = add(P, mul(left(u), sign * r)); // 圆心在速度的受力一侧
    const d = len(C);
    // 两圆交点：一个是 P，另一个是出射点 Q
    const a = (R * R - r * r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, R * R - a * a));
    const base = mul(C, a / d);
    const n = left(mul(C, 1 / d));
    const q1 = add(base, mul(n, h)), q2 = add(base, mul(n, -h));
    const Q = len(sub(q1, P)) > len(sub(q2, P)) ? q1 : q2;
    const phiP = Math.atan2(P.y - C.y, P.x - C.x);
    const phiQ = Math.atan2(Q.y - C.y, Q.x - C.x);
    const sweep = sign > 0 ? mod(phiQ - phiP, TAU) : mod(phiP - phiQ, TAU);
    const vOut = mul(left(mul(sub(Q, C), 1 / r)), sign);
    return { C, P, Q, phiP, sweep, vOut, r, sign };
  }

  // 磁聚焦：一束平行于 +x 方向的粒子，入射高度 h（|h| < R）。
  function focusTrack(h, r, R, sign) {
    const P = { x: -Math.sqrt(R * R - h * h), y: h };
    return arcInField(P, { x: 1, y: 0 }, r, R, sign);
  }

  // 磁发散：粒子从边界上的点 S 射入，方向角 alpha（弧度，相对 +x 轴）。
  function divergeTrack(S, alpha, r, R, sign) {
    return arcInField(S, { x: Math.cos(alpha), y: Math.sin(alpha) }, r, R, sign);
  }

  // 聚焦点（r = R 时）：与入射速度垂直的半径的端点，在受力一侧。
  function focusPoint(R, sign) { return { x: 0, y: sign * R }; }

  // 理论偏转角（r = R、磁聚焦）：cos θ = sign·h / R
  function focusAngle(h, R, sign) { return Math.acos(sign * h / R); }

  return { TAU, DEG, sub, add, mul, len, unit, left, arcInField, focusTrack, divergeTrack, focusPoint, focusAngle };
});
