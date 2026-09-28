/* Vertical throw of a weight released from a rising balloon. Up is positive. */
(function (root) {
  'use strict';

  function solve(v0, h, g) {
    if (![v0, h, g].every(Number.isFinite) || v0 < 0 || h <= 0 || g <= 0) {
      throw new Error('Require v0 >= 0, h > 0, g > 0.');
    }
    const tUp = v0 / g;                         // time to the highest point
    const rise = v0 * v0 / (2 * g);             // extra height above the release point
    const peak = h + rise;                      // highest point above the ground
    const tDown = Math.sqrt(2 * peak / g);      // free fall from the highest point
    const T = tUp + tDown;                      // total time in the air
    const vLand = Math.sqrt(v0 * v0 + 2 * g * h);
    // Whole-journey method: (g/2)t² − v0·t − h = 0
    const disc = v0 * v0 + 2 * g * h;
    const roots = [(v0 + Math.sqrt(disc)) / g, (v0 - Math.sqrt(disc)) / g];

    // 绳断前：气球带着重物从地面匀速上升，历时 t0（t < 0 的阶段）
    const t0 = v0 > 0 ? h / v0 : 0;

    function at(t) {
      if (t < 0) {
        const time = Math.max(t, -t0);
        return { t: time, s: v0 * time, y: Math.max(h + v0 * time, 0), v: v0, phase: 'ascent' };
      }
      const time = Math.min(t, T);
      const s = v0 * time - 0.5 * g * time * time;   // displacement from release point
      const v = v0 - g * time;
      let phase = 'release';
      if (time >= T - 1e-9) phase = 'landed';
      else if (time > 0 && Math.abs(time - tUp) < 1e-9) phase = 'peak';
      else if (time > 0 && time < tUp) phase = 'rising';
      else if (time > tUp) phase = 'falling';
      return { t: time, s, y: Math.max(h + s, 0), v, phase };
    }

    return { v0, h, g, t0, tUp, rise, peak, tDown, T, vLand, roots, at };
  }

  const api = { solve };
  root.VerticalThrow = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
