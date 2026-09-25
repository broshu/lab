/* 力能否突变 —— 物理模型（不依赖 DOM，可在 node 中测试）
 *
 * 1. 悬挂小球：钢丝（硬物体）与弹簧，F = kx，只是 k 相差三千多倍。
 * 2. 水平面上的物块：测力计拉动，静摩擦 / 滑动摩擦。
 * 3. 微观：原子链（硬物体的弹力）、螺旋钢丝（弹簧）、接触点（摩擦）。
 *
 * 约定：g = 10 m/s²；竖直方向向下为正；力的单位 N（原子链为 pN）。
 */
(function (root) {
  'use strict';

  const g = 10;

  // ---------------------------------------------------------------------------
  // 1. 悬挂小球
  // ---------------------------------------------------------------------------
  // 钢丝：长 1 m、直径 1 mm，E = 2×10¹¹ Pa，k = EA/L ≈ 1.6×10⁵ N/m。
  // 弹簧：k = 50 N/m。两者都是 F = kx。
  const HANG = {
    rigid: { k: 1.6e5, m: 1, zeta: 0.15, tensionOnly: true, yMin: -1.0e-4, yMax: 50 / 1.6e5, dt: 2e-5 },
    spring: { k: 50, m: 1, zeta: 0.04, tensionOnly: false, yMin: -0.15, yMax: 0.9, dt: 5e-4 },
    microSpring: { k: 50, m: 1, zeta: 0.04, tensionOnly: false, yMin: -0.12, yMax: 0.4, dt: 5e-4 }
  };
  const HAND_OMEGA = 40; // 手跟随光标的快慢（rad/s），手的运动是连续的

  function createHanging(kind) {
    const p = HANG[kind];
    const y0 = p.m * g / p.k;
    return {
      kind, k: p.k, m: p.m, c: 2 * p.zeta * Math.sqrt(p.k * p.m), dt: p.dt,
      tensionOnly: p.tensionOnly, yMin: p.yMin, yMax: p.yMax,
      t: 0, y: y0, v: 0, a: 0, held: false, target: y0, hand: 0
    };
  }

  // 连接物（钢丝/弹簧）对小球的弹力，向上为正。钢丝只能拉，不能推。
  function hangForce(s) {
    const F = s.k * s.y;
    return s.tensionOnly ? Math.max(0, F) : F;
  }

  function stepHanging(s, dt) {
    if (s.held) {
      // 手握住小球：小球位置被手带着连续地移向目标位置。
      const target = Math.min(s.yMax, Math.max(s.yMin, s.target));
      s.a = HAND_OMEGA * HAND_OMEGA * (target - s.y) - 2 * HAND_OMEGA * s.v;
      s.v += s.a * dt;
      s.y += s.v * dt;
      // 手的拉力（向下为正）由牛顿第二定律反推：ma = mg + F手 − T − cv
      s.hand = s.m * s.a + hangForce(s) + s.c * s.v - s.m * g;
    } else {
      s.hand = 0;
      s.a = (s.m * g - hangForce(s) - s.c * s.v) / s.m;
      s.v += s.a * dt;
      s.y += s.v * dt;
    }
    s.t += dt;
  }

  // ---------------------------------------------------------------------------
  // 2. 摩擦力（宏观）
  // ---------------------------------------------------------------------------
  // 最大静摩擦 5 N，滑动摩擦 3.5 N（10 : 7，与第2讲例2的图像一致）。
  const FRICTION = { m: 1, N: 10, muS: 0.5, muK: 0.35, kg: 25, L0: 0.30, dt: 5e-4 };

  function createFriction() {
    return {
      m: FRICTION.m, N: FRICTION.N, fsMax: FRICTION.muS * FRICTION.N, fk: FRICTION.muK * FRICTION.N,
      kg: FRICTION.kg, L0: FRICTION.L0, dt: FRICTION.dt,
      t: 0, X: 0, V: 0, H: FRICTION.L0, attached: true, stuck: true, auto: 0,
      F: 0, f: 0, events: []
    };
  }

  function gaugeForce(s) {
    return s.attached ? s.kg * (s.H - s.X - s.L0) : 0;
  }

  function stepFriction(s, dt) {
    if (s.auto && s.attached) s.H += s.auto * dt;
    const F = gaugeForce(s);
    s.F = F;
    if (s.stuck) {
      if (Math.abs(F) <= s.fsMax) {
        s.f = -F; // 静摩擦力随拉力变化，大小相等、方向相反
        s.V = 0;
      } else {
        const before = -F;
        s.stuck = false;
        s.f = -Math.sign(F) * s.fk;
        s.events.push({ t: s.t, type: 'static-kinetic', from: before, to: s.f });
      }
    }
    if (!s.stuck) {
      const dir = s.V !== 0 ? Math.sign(s.V) : Math.sign(F);
      s.f = -dir * s.fk;
      const a = (F + s.f) / s.m;
      const V = s.V + a * dt;
      if (V === 0 || Math.sign(V) !== dir) {
        // 速度在这一步里减到零
        s.V = 0;
        if (Math.abs(F) <= s.fsMax) {
          const before = s.f;
          s.stuck = true;
          s.f = -F;
          s.events.push({ t: s.t, type: 'kinetic-static', from: before, to: s.f });
        }
      } else {
        s.V = V;
        s.X += V * dt;
      }
    }
    s.t += dt;
  }

  function releaseFriction(s) {
    if (!s.attached) return;
    const before = s.f;
    s.attached = false;
    s.auto = 0;
    if (s.stuck && Math.abs(before) > 1e-9) s.events.push({ t: s.t, type: 'release', from: before, to: 0 });
    if (s.stuck) s.f = 0;
  }

  // ---------------------------------------------------------------------------
  // 3. 原子链：硬物体的弹力从哪里来、传得多快
  // ---------------------------------------------------------------------------
  // 无量纲单位：原子间距 r₀ = 1，键的劲度 k = 1，原子质量 m = 1。
  // 换算（铁）：r₀ ≈ 0.25 nm，k ≈ 20 N/m，m ≈ 9.3×10⁻²⁶ kg
  //   → 力的单位 k·r₀ = 5000 pN，时间单位 √(m/k) ≈ 0.068 ps。
  const CHAIN = { n: 12, gamma: 0.08, dt: 0.02, forceUnit_pN: 5000, timeUnit_ps: 0.068, handOmega: 0.3 };

  function createChain() {
    const n = CHAIN.n;
    const x = [], v = [];
    for (let i = 0; i <= n; i++) { x.push(i); v.push(0); }
    return { n, x, v, t: 0, held: false, target: n, dt: CHAIN.dt };
  }

  function bondStrain(s, i) { // 第 i 个键（连接 i−1 与 i），伸长为正
    return s.x[i] - s.x[i - 1] - 1;
  }

  function stepChain(s, dt) {
    const n = s.n, x = s.x, v = s.v;
    const acc = new Array(n + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      const left = x[i] - x[i - 1] - 1;
      const right = i < n ? x[i + 1] - x[i] - 1 : 0;
      acc[i] = right - left - CHAIN.gamma * v[i];
    }
    if (s.held) {
      const w = CHAIN.handOmega;
      acc[n] = w * w * (s.target - x[n]) - 2 * w * v[n];
    }
    for (let i = 1; i <= n; i++) { v[i] += acc[i] * dt; x[i] += v[i] * dt; }
    s.t += dt;
  }

  function chainForces(s) {
    return { wall: bondStrain(s, 1), hand: bondStrain(s, s.n) };
  }

  // 螺旋弹簧中钢丝的剪切形变 γ = τ/G，τ = 8FD/(πd³)
  // 钢丝直径 d = 1 mm，弹簧圈直径 D = 20 mm，G = 79 GPa，25 圈时 k ≈ 49 N/m。
  const COIL = { d: 1e-3, D: 20e-3, G: 79e9 };
  function wireShear(F) {
    return 8 * F * COIL.D / (Math.PI * COIL.d ** 3 * COIL.G);
  }

  // ---------------------------------------------------------------------------
  // 4. 接触点模型：摩擦力的微观来源
  // ---------------------------------------------------------------------------
  // 两个表面只在少数凸起处真正接触，接触处的原子结合在一起（接触点）。
  // 接触点像很硬的小弹簧：物块稍一移动（不到 1 μm），接触点就被剪切，产生摩擦力。
  // 超过各自的极限就断开，随后在新的位置重新结合。
  // 单位：位移 μm，时间 s，力 N。
  const MF = {
    n: 24, width: 40, kj: 0.30, zcMin: 0.6, zcMax: 1.4,
    kg: 0.5, m: 1, c: 100, tauF: 1e-4, dt: 1e-5, handSpeed: 5
  };

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createContacts(seed) {
    const rand = rng(seed || 20260925);
    const junctions = [];
    for (let i = 0; i < MF.n; i++) {
      const u = (i + 0.2 + 0.6 * rand()) * MF.width / MF.n;
      junctions.push({ u, a: u, zc: MF.zcMin + (MF.zcMax - MF.zcMin) * rand(), on: true, wait: 0 });
    }
    return {
      rand, junctions, t: 0, X: 0, V: 0, H: 0, attached: true, auto: 0, dt: MF.dt,
      F: 0, f: 0, bonded: MF.n, breaks: 0
    };
  }

  function stepContacts(s, dt) {
    if (s.auto && s.attached) s.H += s.auto * dt;
    const F = s.attached ? MF.kg * (s.H - s.X) : 0;
    let fj = 0, bonded = 0;
    for (const j of s.junctions) {
      if (j.on) {
        const z = s.X + j.u - j.a;
        if (Math.abs(z) > j.zc) {
          j.on = false;
          j.wait = -MF.tauF * Math.log(1 - s.rand());
          s.breaks++;
        } else {
          fj += MF.kj * z;
          bonded++;
        }
      } else {
        j.wait -= dt;
        if (j.wait <= 0) { // 在当前位置重新结合，形变从零开始
          j.on = true;
          j.a = s.X + j.u;
          j.zc = MF.zcMin + (MF.zcMax - MF.zcMin) * s.rand();
          bonded++;
        }
      }
    }
    const damp = MF.c * s.V * 1e-6; // V 以 μm/s 计
    s.F = F;
    s.f = -(fj + damp);
    s.bonded = bonded;
    const a = (F + s.f) / MF.m * 1e6; // μm/s²
    s.V += a * dt;
    s.X += s.V * dt;
    s.t += dt;
  }

  function strainOf(s, j) { return s.X + j.u - j.a; }

  const api = {
    g, HANG, FRICTION, CHAIN, COIL, MF,
    createHanging, hangForce, stepHanging,
    createFriction, gaugeForce, stepFriction, releaseFriction,
    createChain, stepChain, chainForces, bondStrain, wireShear,
    createContacts, stepContacts, strainOf
  };
  root.ForcePhysics = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
