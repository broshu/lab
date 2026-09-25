'use strict';
const assert = require('node:assert/strict');
const { solve } = require('../js/physics.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
let cases = 0;

// 例题数据：v0 = 10 m/s，h = 175 m，g = 10 m/s²
const s = solve(10, 175, 10);
close(s.tUp, 1); close(s.rise, 5); close(s.peak, 180); close(s.tDown, 6);
close(s.T, 7); close(s.vLand, 60);
close(s.roots[0], 7); close(s.roots[1], -5);
close(s.at(7).y, 0); close(s.at(7).v, -60); close(s.at(1).v, 0); close(s.at(1).y, 180);
assert.equal(s.at(0).phase, 'release'); assert.equal(s.at(0.5).phase, 'rising');
assert.equal(s.at(1).phase, 'peak'); assert.equal(s.at(3).phase, 'falling');
assert.equal(s.at(7).phase, 'landed'); assert.equal(s.at(99).t, 7);
cases++;

for (const v0 of [0, 1, 5, 10, 20, 30]) for (const h of [10, 50, 175, 300]) for (const g of [9.8, 10]) {
  const r = solve(v0, h, g); cases++;
  // 两种解法结果一致
  close(r.T, r.roots[0], 1e-9);
  close(r.vLand, g * r.tDown, 1e-9);
  assert.ok(r.roots[1] <= 1e-12);
  const end = r.at(r.T);
  close(end.y, 0, 1e-7); close(end.v, -r.vLand, 1e-9);
  // 机械能守恒与 v² − v0² = −2g·s
  for (let i = 0; i <= 200; i++) {
    const p = r.at(r.T * i / 200);
    close(p.v * p.v - v0 * v0, -2 * g * p.s, 1e-7);
    assert.ok(p.y <= r.peak + 1e-9 && p.y >= 0);
  }
}
assert.throws(() => solve(10, 0, 10)); assert.throws(() => solve(-1, 10, 10));
console.log(`OK · ${cases} 组参数`);
