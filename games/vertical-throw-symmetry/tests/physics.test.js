'use strict';
const assert = require('node:assert/strict');
const { solve } = require('../js/physics.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
let cases = 0;

// 默认数据：v0 = 20 m/s，g = 10，A = 8.75 m，B = 18.75 m
const s = solve(20, 10);
close(s.H, 20); close(s.T, 4); close(s.tTop, 2);
const seg = s.segment(8.75, 18.75);
close(seg.t1, 0.5); close(seg.t2, 1.5); close(seg.t3, 2.5); close(seg.t4, 3.5);
close(seg.dtUp, 1); close(seg.dtDown, 1); close(seg.vA, 15); close(seg.vB, 5);
close(s.at(seg.t1).v, 15); close(s.at(seg.t4).v, -15);
cases++;

for (const v0 of [5, 12, 20, 33.3, 40]) for (const g of [9.8, 10]) {
  const r = solve(v0, g);
  for (let i = 0; i <= 20; i++) for (let j = i; j <= 20; j++) {
    const yA = r.H * i / 20, yB = r.H * j / 20, q = r.segment(yA, yB);
    cases++;
    close(q.dtUp, q.dtDown, 1e-9);                         // 等时性
    close(q.t1 + q.t4, r.T, 1e-9); close(q.t2 + q.t3, r.T, 1e-9); // 时刻关于 t_top 对称
    for (const [t, y, sgn] of [[q.t1, yA, 1], [q.t2, yB, 1], [q.t3, yB, -1], [q.t4, yA, -1]]) {
      const p = r.at(t);
      close(p.y, y, 1e-7);
      close(Math.abs(p.v), r.speedAt(y), 1e-6);              // 速度大小相等
      if (Math.abs(p.v) > 1e-6) assert.equal(Math.sign(p.v), sgn); // 方向相反
    }
    close(q.dtUp, (q.vA - q.vB) / g, 1e-9);
  }
}
assert.throws(() => solve(0, 10));
console.log(`OK · ${cases} 组线段`);
