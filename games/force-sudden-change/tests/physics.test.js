'use strict';
const assert = require('node:assert/strict');
const P = require('../js/physics.js');

function hold(kind, F) {
  const s = P.createHanging(kind);
  s.held = true;
  s.target = F / s.k;
  for (let i = 0; i < 3 / s.dt; i++) P.stepHanging(s, s.dt);
  return s;
}

// 1. 静止悬挂时弹力等于 mg
for (const kind of ['rigid', 'spring']) {
  const s = P.createHanging(kind);
  for (let i = 0; i < 1 / s.dt; i++) P.stepHanging(s, s.dt);
  assert.ok(Math.abs(P.hangForce(s) - 10) < 1e-6, kind + ' at rest');
}

// 2. 钢丝：拉到 40 N 松手，拉力 10 ms 内回到 mg 附近
const rigid = hold('rigid', 40);
assert.ok(Math.abs(P.hangForce(rigid) - 40) < 0.05);
assert.ok(Math.abs(rigid.hand - 30) < 0.05, 'hand force = T − mg');
rigid.held = false;
let tSettle = null;
for (let t = 0; t < 0.05; t += rigid.dt) {
  P.stepHanging(rigid, rigid.dt);
  if (tSettle === null && Math.abs(P.hangForce(rigid) - 10) <= 3) tSettle = t;
}
assert.ok(tSettle !== null && tSettle < 0.01, 'wire force settles within 10 ms: ' + tSettle);

// 3. 弹簧：松手前后弹力连续，加速度突变
const spring = hold('spring', 40);
const before = P.hangForce(spring);
spring.held = false;
P.stepHanging(spring, spring.dt);
const after = P.hangForce(spring);
assert.ok(Math.abs(after - before) < 0.05, 'spring force continuous: ' + before + ' → ' + after);
assert.ok(Math.abs(spring.a + 30) < 0.5, 'acceleration jumps to 30 m/s² upward: ' + spring.a);
let tSpring = null;
for (let t = 0; t < 1; t += spring.dt) {
  P.stepHanging(spring, spring.dt);
  if (tSpring === null && Math.abs(P.hangForce(spring) - 10) <= 3) tSpring = t;
}
assert.ok(tSpring > 0.15, 'spring needs a macroscopic time: ' + tSpring);

// 4. 摩擦：匀速拉动，5 N 处静→动，摩擦力突变为 3.5 N；之后动→静
const fr = P.createFriction();
fr.auto = 0.1;
for (let i = 0; i < 6 / fr.dt; i++) P.stepFriction(fr, fr.dt);
const sk = fr.events.find((e) => e.type === 'static-kinetic');
const ks = fr.events.find((e) => e.type === 'kinetic-static');
assert.ok(sk && Math.abs(Math.abs(sk.from) - 5) < 0.01 && Math.abs(Math.abs(sk.to) - 3.5) < 1e-9);
assert.ok(ks && Math.abs(Math.abs(ks.from) - 3.5) < 1e-9 && Math.abs(ks.to) < 3.5);
// 松手：静摩擦力随拉力一起变为 0
const fr2 = P.createFriction();
fr2.H += 0.1; // 拉力 2.5 N，物块不动
P.stepFriction(fr2, fr2.dt);
assert.ok(fr2.stuck && Math.abs(fr2.f + 2.5) < 1e-9);
P.releaseFriction(fr2);
P.stepFriction(fr2, fr2.dt);
assert.ok(fr2.f === 0);
assert.equal(fr2.events.at(-1).type, 'release');

// 5. 原子链：墙端的力比手端晚约 n 个时间单位
const ch = P.createChain();
ch.held = true;
ch.target = ch.n + 0.12;
let tHand = null, tWall = null;
for (let i = 0; i < 20000; i++) {
  P.stepChain(ch, ch.dt);
  if (tHand === null && P.bondStrain(ch, ch.n) >= 0.005) tHand = ch.t;
  if (tWall === null && P.bondStrain(ch, 1) >= 0.005) tWall = ch.t;
}
assert.ok(tWall - tHand > ch.n * 0.6 && tWall - tHand < ch.n * 1.6, 'propagation delay ' + (tWall - tHand));
const F = P.chainForces(ch);
assert.ok(Math.abs(F.wall - F.hand) < 1e-3, 'equilibrium: same force at both ends');
assert.ok(Math.abs(F.hand - 0.01) < 1e-3);

// 6. 螺旋钢丝：10 N 时剪切形变约 0.6%
assert.ok(Math.abs(P.wireShear(10) - 0.00645) < 2e-4);

// 7. 接触点：最大静摩擦力大于滑动时的平均摩擦力
const mc = P.createContacts();
mc.auto = P.MF.handSpeed;
let peak = 0, sum = 0, n = 0;
for (let i = 0; i < 6 / mc.dt; i++) {
  P.stepContacts(mc, mc.dt);
  const f = Math.abs(mc.f);
  if (Math.abs(mc.V) > 400) { sum += f; n++; } else peak = Math.max(peak, f);
}
const kinetic = sum / n;
assert.ok(peak > 4.5 && peak < 7, 'static peak ' + peak);
assert.ok(kinetic < 0.85 * peak, 'kinetic ' + kinetic + ' < static ' + peak);

console.log(JSON.stringify({
  rigidSettle_ms: +(tSettle * 1e3).toFixed(2),
  springSettle_s: +tSpring.toFixed(3),
  chainDelay_ps: +((tWall - tHand) * P.CHAIN.timeUnit_ps).toFixed(3),
  contactsPeak_N: +peak.toFixed(2),
  contactsKinetic_N: +kinetic.toFixed(2)
}, null, 2));
