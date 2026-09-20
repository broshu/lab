/*
 * Particle model for "Collision & Deformation".
 *
 * Units: equilibrium spacing r0 = 1, particle mass = 1, well depth D = 1.
 * Pair force: Morse shape (same shape as the textbook F–r curve), smoothly
 * tapered to zero between rs and rc.
 * Sign convention follows the textbook: F > 0 repulsive, F < 0 attractive.
 *
 * Both materials use the SAME F–r curve. The only difference:
 *   metal – any two particles that come close attract each other, so a
 *           particle can leave old neighbours and bond to new ones (slip);
 *   glass – only the original bonds attract; once a bond is pulled past the
 *           cut-off it is gone for good (no new bonds can form).
 */
(function (root) {
  "use strict";

  const R0 = 1;
  const H = Math.sqrt(3) / 2;   // row height of a triangular lattice
  const R_FORM = 1.18;          // closer than this -> counts as a bond (metal)

  function makePotential(a, rs, rc) {
    function morseF(r) {
      const e = Math.exp(-a * (r - R0));
      return -2 * a * (1 - e) * e;
    }
    function taper(r) {
      if (r <= rs) return 1;
      if (r >= rc) return 0;
      const t = (r - rs) / (rc - rs);
      return 1 - t * t * (3 - 2 * t);
    }
    function force(r) {
      if (r >= rc) return 0;
      return r <= rs ? morseF(r) : morseF(r) * taper(r);
    }
    const TAB_MIN = 0.4, TAB_N = 6000, TAB_DR = (rc - TAB_MIN) / TAB_N;
    const UTAB = new Float64Array(TAB_N + 1);
    for (let k = TAB_N - 1; k >= 0; k--) {
      const r1 = TAB_MIN + k * TAB_DR;
      UTAB[k] = UTAB[k + 1] + 0.5 * (force(r1) + force(r1 + TAB_DR)) * TAB_DR;
    }
    function U(r) {
      if (r >= rc) return 0;
      if (r <= TAB_MIN) return UTAB[0] + (TAB_MIN - r) * force(TAB_MIN);
      const f = (r - TAB_MIN) / TAB_DR;
      const k = Math.floor(f);
      const w = f - k;
      return UTAB[k] * (1 - w) + UTAB[k + 1] * w;
    }
    const uR0 = U(R0);
    let rm = R0, fmax = 0;
    for (let r = R0; r < rc; r += 0.0005) {
      const f = -force(r);
      if (f > fmax) { fmax = f; rm = r; }
    }
    return {
      a, rs, rc, rm, fmax, uR0, force, U,
      breakR: 1.5,
      repForce: (r) => (r < R0 ? morseF(r) : 0),
      repU: (r) => (r < R0 ? U(r) - uR0 : 0)
    };
  }

  const POT = makePotential(3.5, 1.45, 1.71);

  const DEFAULTS = {
    material: "metal",
    nx: 46,
    ny: 8,
    clamp: 3,
    ballR: 3.2,
    ballMass: 2000,
    speed: 0.08,
    gap: 4.5
  };

  function createWorld(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const pot = o.pot || POT;
    const xs = [], ys = [], fixed = [];
    const xmax = o.nx - 1 + 0.5;
    for (let j = 0; j < o.ny; j++) {
      for (let i = 0; i < o.nx; i++) {
        const x = i + (j % 2 ? 0.5 : 0);
        xs.push(x);
        ys.push(j * H);
        fixed.push(x < o.clamp - 0.01 || x > xmax - o.clamp + 0.01 ? 1 : 0);
      }
    }
    const n = xs.length;
    const w = {
      opts: o,
      pot,
      material: o.material,
      rebond: o.material === "metal",
      n,
      x: Float64Array.from(xs),
      y: Float64Array.from(ys),
      x0: Float64Array.from(xs),
      y0: Float64Array.from(ys),
      vx: new Float64Array(n),
      vy: new Float64Array(n),
      fx: new Float64Array(n),
      fy: new Float64Array(n),
      fixed: Uint8Array.from(fixed),
      width: xmax,
      height: (o.ny - 1) * H,
      t: 0,
      pe: 0,
      pe0: 0,
      contact: false,
      firstContact: null,
      initialKeys: new Set(),
      bondA: null, bondB: null, bondAlive: null, // original bond list (glass forces)
      bondSet: new Set(),                         // current bonds (keys)
      bondList: [],                               // flat [a, b, r, isNew, ...]
      stats: { broken: 0, formed: 0, pieces: 1 },
      maxStretch: { r: R0, a: -1, b: -1 },
      maxStretchRun: R0,
      cellHead: null,
      cellNext: new Int32Array(n)
    };

    const ba = [], bb = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = w.x[j] - w.x[i], dy = w.y[j] - w.y[i];
        if (dx * dx + dy * dy < 1.1 * 1.1) {
          w.initialKeys.add(i * n + j);
          ba.push(i); bb.push(j);
        }
      }
    }
    w.bondA = Int32Array.from(ba);
    w.bondB = Int32Array.from(bb);
    w.bondAlive = new Uint8Array(ba.length).fill(1);
    w.bondSet = new Set(w.initialKeys);

    w.ball = {
      x: w.width / 2,
      y: w.height + o.ballR + o.gap,
      vx: 0,
      vy: -o.speed,
      r: o.ballR,
      m: o.ballMass,
      fx: 0,
      fy: 0
    };
    w.ke0 = 0.5 * o.ballMass * o.speed * o.speed;

    // bounded cell grid; fragments that fly far away are clamped to edge cells
    const cs = pot.rc;
    w.grid = { minx: -12, miny: -60, cs, ncx: 0, ncy: 0 };
    w.grid.ncx = Math.ceil((w.width + 24) / cs) + 1;
    w.grid.ncy = Math.ceil((w.height + 100) / cs) + 1;
    w.cellHead = new Int32Array(w.grid.ncx * w.grid.ncy);

    computeForces(w);
    w.pe0 = w.pe;
    updateBonds(w);
    return w;
  }

  function fillCells(w) {
    const g = w.grid, head = w.cellHead, next = w.cellNext;
    head.fill(-1);
    const ncx = g.ncx, ncy = g.ncy, inv = 1 / g.cs;
    for (let i = 0; i < w.n; i++) {
      let cx = Math.floor((w.x[i] - g.minx) * inv);
      let cy = Math.floor((w.y[i] - g.miny) * inv);
      if (cx < 0) cx = 0; else if (cx >= ncx) cx = ncx - 1;
      if (cy < 0) cy = 0; else if (cy >= ncy) cy = ncy - 1;
      const c = cy * ncx + cx;
      next[i] = head[c];
      head[c] = i;
    }
  }

  // Visit every pair closer than sqrt(rc2) exactly once: cb(i, j, dx, dy, r2)
  const OFFX = [1, -1, 0, 1];
  const OFFY = [0, 1, 1, 1];
  function forEachPair(w, rc2, cb) {
    const g = w.grid, head = w.cellHead, next = w.cellNext;
    const x = w.x, y = w.y, ncx = g.ncx, ncy = g.ncy;
    for (let cy = 0; cy < ncy; cy++) {
      for (let cx = 0; cx < ncx; cx++) {
        for (let i = head[cy * ncx + cx]; i !== -1; i = next[i]) {
          const xi = x[i], yi = y[i];
          for (let j = next[i]; j !== -1; j = next[j]) {
            const dx = x[j] - xi, dy = y[j] - yi;
            const r2 = dx * dx + dy * dy;
            if (r2 < rc2) cb(i, j, dx, dy, r2);
          }
          for (let k = 0; k < 4; k++) {
            const nxC = cx + OFFX[k], nyC = cy + OFFY[k];
            if (nxC < 0 || nxC >= ncx || nyC >= ncy) continue;
            for (let j = head[nyC * ncx + nxC]; j !== -1; j = next[j]) {
              const dx = x[j] - xi, dy = y[j] - yi;
              const r2 = dx * dx + dy * dy;
              if (r2 < rc2) cb(i, j, dx, dy, r2);
            }
          }
        }
      }
    }
  }

  function computeForces(w) {
    const pot = w.pot, x = w.x, y = w.y, fx = w.fx, fy = w.fy, fixed = w.fixed;
    fx.fill(0);
    fy.fill(0);
    let pe = 0;
    fillCells(w);
    const metal = w.rebond;
    const rc2 = metal ? pot.rc * pot.rc : R0 * R0;

    forEachPair(w, rc2, (i, j, dx, dy, r2) => {
      if (fixed[i] && fixed[j]) return;
      const r = Math.sqrt(r2);
      let f;
      if (metal) { f = pot.force(r); pe += pot.U(r); }
      else { f = pot.repForce(r); pe += pot.repU(r); }
      const s = f / r;
      fx[i] -= s * dx; fy[i] -= s * dy;
      fx[j] += s * dx; fy[j] += s * dy;
    });

    if (!metal) {
      // original bonds add the attractive branch; a bond pulled past rc is gone
      const A = w.bondA, B = w.bondB, alive = w.bondAlive, rc = pot.rc;
      for (let k = 0; k < A.length; k++) {
        if (!alive[k]) continue;
        const i = A[k], j = B[k];
        if (fixed[i] && fixed[j]) continue;
        const dx = x[j] - x[i], dy = y[j] - y[i];
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r >= rc) { alive[k] = 0; continue; }
        if (r < R0) { pe += pot.uR0; continue; }
        pe += pot.U(r);
        const s = pot.force(r) / r;
        fx[i] -= s * dx; fy[i] -= s * dy;
        fx[j] += s * dx; fy[j] += s * dy;
      }
    }

    // rigid ball: repulsion only, same repulsive branch as between particles
    const b = w.ball;
    b.fx = 0; b.fy = 0;
    let contact = false;
    const br2 = b.r * b.r;
    for (let i = 0; i < w.n; i++) {
      const dx = x[i] - b.x, dy = y[i] - b.y;
      if (dx > b.r || dx < -b.r || dy > b.r || dy < -b.r) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= br2) continue;
      const d = Math.sqrt(d2);
      const rr = R0 + (d - b.r);
      const f = pot.repForce(rr);
      contact = true;
      pe += pot.repU(rr);
      const s = f / d;
      fx[i] += s * dx; fy[i] += s * dy;
      b.fx -= s * dx; b.fy -= s * dy;
    }
    w.contact = contact;
    if (contact && w.firstContact === null) w.firstContact = w.t;
    w.pe = pe;
  }

  function step(w, dt) {
    const n = w.n, x = w.x, y = w.y, vx = w.vx, vy = w.vy, fx = w.fx, fy = w.fy, fixed = w.fixed;
    const h = 0.5 * dt, b = w.ball;
    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      vx[i] += h * fx[i]; vy[i] += h * fy[i];
      x[i] += dt * vx[i]; y[i] += dt * vy[i];
    }
    b.vx += h * b.fx / b.m; b.vy += h * b.fy / b.m;
    b.x += dt * b.vx; b.y += dt * b.vy;
    computeForces(w);
    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      vx[i] += h * fx[i]; vy[i] += h * fy[i];
    }
    b.vx += h * b.fx / b.m; b.vy += h * b.fy / b.m;
    w.t += dt;
  }

  // Which pairs count as bonds right now (for drawing, the F–r dots and the counters).
  function updateBonds(w) {
    const n = w.n, pot = w.pot, fixed = w.fixed, init = w.initialKeys;
    const list = [];
    const set = new Set();
    let maxR = 0, maxA = -1, maxB = -1;
    const note = (a, b, r) => {
      const key = a * n + b;
      set.add(key);
      list.push(a, b, r, init.has(key) ? 0 : 1);
      if (!(fixed[a] && fixed[b]) && r > maxR) { maxR = r; maxA = a; maxB = b; }
    };
    if (w.rebond) {
      fillCells(w);
      const prev = w.bondSet, br = pot.breakR;
      forEachPair(w, br * br, (i, j, dx, dy, r2) => {
        const a = i < j ? i : j, b = i < j ? j : i;
        const r = Math.sqrt(r2);
        if (r < R_FORM || prev.has(a * n + b)) note(a, b, r);
      });
    } else {
      const A = w.bondA, B = w.bondB, alive = w.bondAlive;
      for (let k = 0; k < A.length; k++) {
        if (!alive[k]) continue;
        const dx = w.x[B[k]] - w.x[A[k]], dy = w.y[B[k]] - w.y[A[k]];
        note(A[k], B[k], Math.sqrt(dx * dx + dy * dy));
      }
    }
    w.bondSet = set;
    w.bondList = list;
    w.maxStretch = { r: maxR, a: maxA, b: maxB };
    if (maxR > w.maxStretchRun) w.maxStretchRun = maxR;

    let broken = 0;
    for (const key of init) if (!set.has(key)) broken++;
    let formed = 0;
    for (let k = 3; k < list.length; k += 4) formed += list[k];

    // connected pieces (union–find over current bonds)
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (let k = 0; k < list.length; k += 4) {
      const ra = find(list[k]), rb = find(list[k + 1]);
      if (ra !== rb) parent[ra] = rb;
    }
    const sizes = new Map();
    for (let i = 0; i < n; i++) { const r = find(i); sizes.set(r, (sizes.get(r) || 0) + 1); }
    let pieces = 0;
    for (const s of sizes.values()) if (s >= 6) pieces++;
    w.stats = { broken, formed, pieces };
    return w.stats;
  }

  function energies(w) {
    let ke = 0;
    for (let i = 0; i < w.n; i++) {
      if (w.fixed[i]) continue;
      ke += 0.5 * (w.vx[i] * w.vx[i] + w.vy[i] * w.vy[i]);
    }
    const b = w.ball;
    const ballKE = 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy);
    const pe = w.pe - w.pe0;
    return { ball: ballKE, latticeKE: ke, latticePE: pe, total: ballKE + ke + pe, ke0: w.ke0 };
  }

  const api = { R0, H, R_FORM, POT, DEFAULTS, makePotential, createWorld, step, updateBonds, energies };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Physics = api;
})(typeof window !== "undefined" ? window : globalThis);
