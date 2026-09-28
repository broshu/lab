/* Vertical throw from the ground, up is positive. Symmetry of the rising and falling halves. */
(function (root) {
  'use strict';

  function solve(v0, g) {
    if (!(v0 > 0) || !(g > 0)) throw new Error('Require v0 > 0 and g > 0.');
    const tTop = v0 / g, H = v0 * v0 / (2 * g), T = 2 * tTop;

    // 离地高度 y 处的速度大小（与上升/下降无关）
    function speedAt(y) { return Math.sqrt(Math.max(v0 * v0 - 2 * g * y, 0)); }
    // 经过高度 y 的两个时刻：上升时 tUp，下降时 tDown
    function timesAt(y) {
      const r = speedAt(y);
      return { up: (v0 - r) / g, down: (v0 + r) / g };
    }
    // 线段 [yA, yB]（yA < yB）的上升/下降通过时间与端点速度
    function segment(yA, yB) {
      const a = timesAt(yA), b = timesAt(yB);
      return {
        yA, yB, vA: speedAt(yA), vB: speedAt(yB),
        t1: a.up, t2: b.up, t3: b.down, t4: a.down,
        dtUp: b.up - a.up, dtDown: a.down - b.down,
      };
    }
    function at(t) {
      const time = Math.min(Math.max(t, 0), T);
      return { t: time, y: Math.max(v0 * time - 0.5 * g * time * time, 0), v: v0 - g * time };
    }
    return { v0, g, tTop, H, T, speedAt, timesAt, segment, at };
  }

  const api = { solve };
  root.ThrowSymmetry = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
