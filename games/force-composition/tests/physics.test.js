'use strict';
const assert = require('node:assert/strict');
const P = require('../js/physics.js');

const near = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' ≠ ' + b);

// 1. 余弦定理与矢量相加一致；60 N、60 N 夹角约 68° 时合力约 100 N
for (const [f1, f2, th] of [[3, 4, 90], [5, 5, 120], [6, 8, 37], [60, 60, 67.1]]) {
  const sum = P.mag(P.add(P.polar(f1, 0), P.polar(f2, th)));
  near(P.resultantMagnitude(f1, f2, th), sum, 1e-9, 'law of cosines');
}
near(P.resultantMagnitude(3, 4, 90), 5);
near(P.resultantMagnitude(5, 5, 120), 5, 1e-9, '120° 等大');
near(P.resultantMagnitude(60, 60, 67.1), 100, 0.2, '提水');

// 2. 合力范围
assert.deepEqual(P.range2(5, 12), { min: 7, max: 17 });
assert.deepEqual(P.range3(3, 4, 10), { min: 3, max: 17 });
assert.deepEqual(P.range3(5, 7, 9), { min: 0, max: 21 });

// 3. 沿两方向分解：分量之和还原 F；斜向上拉 F cosθ、F sinθ
const F = P.polar(10, 30);
const d = P.decompose(F, 0, 90);
near(d.k1, 10 * Math.cos(30 * P.RAD)); near(d.k2, 5);
const d2 = P.decompose(F, 10, 140);
const back = P.add(d2.f1, d2.f2);
near(back.x, F.x); near(back.y, F.y);
assert.equal(P.decompose(F, 20, 200), null, '共线方向无法分解');

// 4. 分解的唯一性：F = 10 N，α = 30°
assert.equal(P.uniqueness(10, 30, 4).kase, 'none');
assert.equal(P.uniqueness(10, 30, 5).kase, 'tangent');
near(P.uniqueness(10, 30, 5).roots[0], 10 * Math.cos(30 * P.RAD));
assert.equal(P.uniqueness(10, 30, 6).count, 2);
assert.equal(P.uniqueness(10, 30, 12).count, 1);
for (const r of P.uniqueness(10, 30, 6).roots) {
  // F₂ = F − F₁ 的大小应为 6 N
  near(P.mag(P.sub(P.polar(10, 30), P.polar(r, 0))), 6, 1e-9, 'root check');
}

// 5. 正交分解：例题 3，合力 20 N，与 x 轴成 53°
const forces = [P.polar(20, 0), P.polar(10, 180 - 36.8699), P.polar(10, 90)];
const c = P.components(forces, 0);
near(c.Fx, 12, 1e-3); near(c.Fy, 16, 1e-3); near(c.F, 20, 1e-3); near(c.phi, 53.13, 0.01);
// 坐标轴转动后合力大小不变
near(P.components(forces, 25).F, 20, 1e-3, 'axis rotation');

// 6. 按效果分解的情境
const s = P.scenarios;
near(s.incline(20, 37).a, 12, 0.05); near(s.incline(20, 37).b, 16, 0.05);
near(s.ball(30, 30).a, 10 * Math.sqrt(3), 1e-9); near(s.ball(30, 30).b, 20 * Math.sqrt(3), 1e-9);
near(s.hang(20, 36.8699).a, 25, 1e-3); near(s.hang(20, 36.8699).b, 15, 1e-3);
// 每个情境的两个分力按平行四边形合成后等于原来的力
{
  const G = P.polar(20, -90), al = 37;
  const dd = P.decompose(G, 180 + al, -90 + al); // 沿斜面向下、垂直斜面向下
  near(dd.k1, s.incline(20, al).a, 1e-9); near(dd.k2, s.incline(20, al).b, 1e-9);
  const r = P.add(dd.f1, dd.f2); near(r.x, G.x, 1e-9); near(r.y, G.y, 1e-9);
}

console.log('force-composition: all tests passed');
