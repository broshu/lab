// 力的合成与分解：纯计算，不依赖 DOM。力用 {x, y}（单位 N）表示，角度一律用度，x 轴正方向为 0°，逆时针为正。
(function (root) {
  'use strict';

  const RAD = Math.PI / 180;
  const EPS = 1e-9;

  function polar(mag, deg) {
    return { x: mag * Math.cos(deg * RAD), y: mag * Math.sin(deg * RAD) };
  }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
  function scale(a, k) { return { x: a.x * k, y: a.y * k }; }
  function mag(a) { return Math.hypot(a.x, a.y); }
  function angle(a) { return Math.atan2(a.y, a.x) / RAD; }
  function dot(a, b) { return a.x * b.x + a.y * b.y; }

  // 把角度化到 (-180, 180]。
  function wrap(deg) {
    let d = ((deg % 360) + 360) % 360;
    if (d > 180) d -= 360;
    return d;
  }

  // 两个力之间的夹角，0°～180°。
  function between(a, b) {
    const ma = mag(a), mb = mag(b);
    if (ma < EPS || mb < EPS) return 0;
    const c = Math.max(-1, Math.min(1, dot(a, b) / (ma * mb)));
    return Math.acos(c) / RAD;
  }

  function resultant(forces) {
    return forces.reduce((s, f) => add(s, f), { x: 0, y: 0 });
  }

  // 余弦定理：F = √(F₁² + F₂² + 2F₁F₂cosθ)
  function resultantMagnitude(f1, f2, thetaDeg) {
    return Math.sqrt(Math.max(0, f1 * f1 + f2 * f2 + 2 * f1 * f2 * Math.cos(thetaDeg * RAD)));
  }

  function range2(f1, f2) {
    return { min: Math.abs(f1 - f2), max: f1 + f2 };
  }

  // 三个力合力的范围：最大为三力之和；若最大的力不超过另两力之和，最小为 0，否则为最大力减另两力之和。
  function range3(a, b, c) {
    const s = [a, b, c].sort((p, q) => q - p);
    return { min: Math.max(0, s[0] - s[1] - s[2]), max: a + b + c };
  }

  // 沿两个已知方向分解 F：F = k₁·u₁ + k₂·u₂。k 为带符号的分量（负值表示与所给方向相反）。两方向共线时返回 null。
  function decompose(F, dir1, dir2) {
    const u1 = polar(1, dir1), u2 = polar(1, dir2);
    const det = u1.x * u2.y - u1.y * u2.x;
    if (Math.abs(det) < 1e-6) return null;
    const k1 = (F.x * u2.y - F.y * u2.x) / det;
    const k2 = (u1.x * F.y - u1.y * F.x) / det;
    return { k1, k2, f1: scale(u1, k1), f2: scale(u2, k2) };
  }

  // 已知 F 的大小、F₁ 的方向（与 F 夹角 α，0 < α < 90°）和 F₂ 的大小，求 F₁ 的大小（只取 F₁ > 0 的解）。
  // 余弦定理：F₂² = F² + F₁² − 2FF₁cosα  ⇒  F₁ = F cosα ± √(F₂² − F²sin²α)
  function uniqueness(F, alphaDeg, F2) {
    const s = F * Math.sin(alphaDeg * RAD);
    const c = F * Math.cos(alphaDeg * RAD);
    const tol = 1e-6 * Math.max(1, F);
    let roots = [];
    let kase;
    if (F2 < s - tol) {
      kase = 'none';
    } else if (Math.abs(F2 - s) <= tol) {
      kase = 'tangent';
      roots = [c];
    } else {
      const d = Math.sqrt(F2 * F2 - s * s);
      roots = [c - d, c + d].filter((r) => r > tol);
      kase = roots.length === 2 ? 'two' : 'one';
    }
    return { kase, roots, Fsin: s, count: roots.length };
  }

  // 正交分解：坐标轴转过 axisDeg 后，每个力在 x′、y′ 轴上的分量。
  function components(forces, axisDeg) {
    const ux = polar(1, axisDeg), uy = polar(1, axisDeg + 90);
    const list = forces.map((f) => ({ x: dot(f, ux), y: dot(f, uy) }));
    const Fx = list.reduce((s, c) => s + c.x, 0);
    const Fy = list.reduce((s, c) => s + c.y, 0);
    return { list, Fx, Fy, F: Math.hypot(Fx, Fy), phi: Math.atan2(Fy, Fx) / RAD };
  }

  // 按效果分解的四个典型情境，返回两个分力的大小。
  const scenarios = {
    // 斜向上拉物体：F 与水平成 θ
    pull(F, theta) { return { a: F * Math.cos(theta * RAD), b: F * Math.sin(theta * RAD) }; },
    // 斜面上的物体：倾角 α
    incline(G, alpha) { return { a: G * Math.sin(alpha * RAD), b: G * Math.cos(alpha * RAD) }; },
    // 光滑斜面上被竖直挡板挡住的球：压紧挡板 mg·tanα，压紧斜面 mg/cosα
    ball(G, alpha) { return { a: G * Math.tan(alpha * RAD), b: G / Math.cos(alpha * RAD) }; },
    // 两绳悬挂：OA 与竖直成 θ，OB 水平；拉 OA 的分力 G/cosθ，拉 OB 的分力 G·tanθ
    hang(G, theta) { return { a: G / Math.cos(theta * RAD), b: G * Math.tan(theta * RAD) }; }
  };

  const api = { RAD, polar, add, sub, scale, mag, angle, dot, wrap, between, resultant, resultantMagnitude, range2, range3, decompose, uniqueness, components, scenarios };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FC = api;
})(typeof window !== 'undefined' ? window : globalThis);
