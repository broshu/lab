(() => {
    // -----------------------------------------------------------------
    // Physical constants (SI) and copper parameters
    // -----------------------------------------------------------------
    const E_CHARGE = 1.602176634e-19;    // C
    const E_MASS   = 9.1093837015e-31;   // kg
    const N_CU     = 8.46e28;            // free-electron density of copper, m^-3
    const RHO_293  = 1.68e-8;            // copper resistivity at 293 K, Ω·m
    const RHO_RES  = 1.5e-11;            // residual resistivity (high-purity Cu)
    const V_FERMI  = 1.5694e6;           // Fermi speed in copper, m/s
    const A_NN     = 0.256e-9;           // Cu fcc nearest-neighbour distance, m
    const R_METAL  = 0.128e-9;           // Cu metallic radius = a_NN/2 (atoms touch in lattice)
    // For comparison: Cu+ Shannon ionic core ≈ 0.077 nm; bare Cu nucleus ≈ 5 × 10⁻⁶ nm.

    // ρ(T): residual + linear phonon contribution (Bloch–Grüneisen, high-T limit).
    // Good to ~10% above ~80 K; deliberately simple at low T (real ρ ~ T^5 below ~50 K).
    function rhoOfT(T) {
        return RHO_RES + (RHO_293 - RHO_RES) * (T / 293);
    }
    function tauOfT(T) { return E_MASS / (N_CU * E_CHARGE * E_CHARGE * rhoOfT(T)); }
    function lambdaOfT(T) { return V_FERMI * tauOfT(T); }

    // -----------------------------------------------------------------
    // DOM
    // -----------------------------------------------------------------
    const wireCanvas  = document.getElementById("wireCanvas");
    const chartCanvas = document.getElementById("chartCanvas");
    const wctx = wireCanvas.getContext("2d");
    const cctx = chartCanvas.getContext("2d");

    const ui = {
        field:           document.getElementById("fieldInput"),
        fieldInputLabel: document.getElementById("fieldInputLabel"),
        temp:            document.getElementById("tempInput"),
        tempLabel:       document.getElementById("tempLabel"),
        trace:           document.getElementById("traceToggle"),
        fieldOn:         document.getElementById("fieldToggle"),
        pause:           document.getElementById("pauseToggle"),
        reset:           document.getElementById("resetBtn"),
        modeButtons:     [...document.querySelectorAll(".mode-button")],
        modeReadout:     document.getElementById("modeReadout"),
        rhoLabel:        document.getElementById("rhoLabel"),
        tauLabel:        document.getElementById("tauLabel"),
        lambdaLabel:     document.getElementById("lambdaLabel"),
        fermiLabel:      document.getElementById("fermiLabel"),
        driftLabel:      document.getElementById("driftLabel"),
        jLabel:          document.getElementById("jLabel"),
        currentLabel:    document.getElementById("currentLabel"),
        windowWidthLabel:document.getElementById("windowWidthLabel"),
        latticeLabel:    document.getElementById("latticeLabel"),
        electronCountLabel: document.getElementById("electronCountLabel"),
        timeScaleLabel:  document.getElementById("timeScaleLabel"),
        driftPerSecLabel:document.getElementById("driftPerSecLabel"),
        fluxLabel:       document.getElementById("fluxLabel"),
        caption:         document.getElementById("caption")
    };

    // -----------------------------------------------------------------
    // Mode configuration.  Real mode is faithful copper in SI units.
    // Demo mode is dimensionally consistent (still SI-like) but with
    // a slow thermal speed, a long τ, and an amplified charge coupling
    // so that drift becomes visible on screen.
    // -----------------------------------------------------------------
    const MODES = {
        demo: {
            label: "Demo",
            physWidth_m:  1.0,                  // arbitrary "demo wire" 1 unit wide
            physHeight_m: 0.473,                // matches canvas aspect (1100:520)
            thermalSpeed: 0.36,                 // demo units / s
            mass:    1.0,                       // demo mass (arbitrary)
            charge:  30.0,                      // demo charge coupling
            // τ at 293 K (demo seconds); scales linearly with T like Cu
            tau293:  0.18,
            dtPerFrame: 1 / 60,                 // 1 frame = 1/60 s (real-time)
            electronCount: 70,
            // demo lattice — coarse, just decorative
            useRealLattice: false,
            latticeCols: 12,
            latticeRows: 6,
            ionRadius_m: 0.04,
            wallTimeScale: 1.0                  // 1 s screen = 1 s demo
        },
        real: {
            label: "Real copper",
            // ~30 nm × 14 nm slice of copper, ~3/4 of one mean free path wide
            physWidth_m:  30e-9,
            physHeight_m: 14.2e-9,
            thermalSpeed: V_FERMI,
            mass:    E_MASS,
            charge:  E_CHARGE,
            tau293:  null,                      // computed from real ρ(T)
            dtPerFrame: 1e-15,                  // 1 frame = 1 fs of real time
            electronCount: 120,                 // a sample of ~10⁴ in the slice
            useRealLattice: true,
            latticeSpacing_m: A_NN,             // 0.256 nm NN distance
            ionRadius_m: R_METAL,               // 0.128 nm — atoms touch in lattice
            wallTimeScale: 60e-15               // 1 s screen ≈ 60 fs real
        }
    };

    // -----------------------------------------------------------------
    // State
    // -----------------------------------------------------------------
    const state = {
        mode: "demo",
        cfg: MODES.demo,
        electrons: [],
        tagged: 0,
        tracePoints: [],
        crossingsRight: 0,
        crossingsLeft: 0,
        history: [],
        elapsedAnim: 0,
        lastTs: null,
        running: true,
        latticeBitmap: null,                    // offscreen canvas
        latticeBitmapKey: ""                    // invalidates when window resizes
    };

    // -----------------------------------------------------------------
    // Geometry helpers
    // -----------------------------------------------------------------
    function resizeCanvas(canvas, ctx) {
        const ratio = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const cssW = Math.max(1, rect.width);
        const cssH = Math.max(1, rect.height);
        canvas.width  = Math.round(cssW * ratio);
        canvas.height = Math.round(cssH * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        canvas.dataset.cssWidth  = cssW;
        canvas.dataset.cssHeight = cssH;
    }

    function cssSize(canvas) {
        return {
            w: Number(canvas.dataset.cssWidth)  || canvas.width,
            h: Number(canvas.dataset.cssHeight) || canvas.height
        };
    }

    function physToPixel(canvas) {
        const { w, h } = cssSize(canvas);
        const cfg = state.cfg;
        return { sx: w / cfg.physWidth_m, sy: h / cfg.physHeight_m, w, h };
    }

    // -----------------------------------------------------------------
    // Current τ used by the integrator (depends on mode and temperature)
    // -----------------------------------------------------------------
    function currentTau() {
        if (state.cfg === MODES.real) return tauOfT(state.temperature);
        // demo: scale demo τ linearly with T like phonon copper does
        const T = state.temperature;
        return state.cfg.tau293 * Math.max(0.02, T / 293);
    }

    // -----------------------------------------------------------------
    // Setup
    // -----------------------------------------------------------------
    function makeElectrons() {
        const cfg = state.cfg;
        const arr = [];
        for (let k = 0; k < cfg.electronCount; k++) {
            const angle = Math.random() * 2 * Math.PI;
            arr.push({
                x: Math.random() * cfg.physWidth_m,
                y: Math.random() * cfg.physHeight_m,
                vx: cfg.thermalSpeed * Math.cos(angle),
                vy: cfg.thermalSpeed * Math.sin(angle)
            });
        }
        return arr;
    }

    function initSimulation() {
        state.electrons = makeElectrons();
        state.tagged = 0;
        state.tracePoints = [];
        state.crossingsRight = 0;
        state.crossingsLeft = 0;
        state.history = [{ t: 0, net: 0 }];
        state.elapsedAnim = 0;
        buildLatticeBitmap(true);
    }

    // -----------------------------------------------------------------
    // Lattice rendering (pre-rendered once per resize/mode change)
    // -----------------------------------------------------------------
    function buildLatticeBitmap(force) {
        const cfg = state.cfg;
        const { w, h } = cssSize(wireCanvas);
        const ratio = window.devicePixelRatio || 1;
        const key = `${state.mode}|${w}|${h}|${ratio}`;
        if (!force && key === state.latticeBitmapKey) return;
        state.latticeBitmapKey = key;

        const off = document.createElement("canvas");
        off.width  = Math.max(1, Math.round(w * ratio));
        off.height = Math.max(1, Math.round(h * ratio));
        const o = off.getContext("2d");
        o.setTransform(ratio, 0, 0, ratio, 0, 0);

        const sx = w / cfg.physWidth_m;
        const sy = h / cfg.physHeight_m;

        if (cfg.useRealLattice) {
            // (111) projection of fcc Cu: triangular lattice, NN distance a,
            // row pitch a·√3/2.  Atoms drawn at the metallic radius (a/2) so
            // nearest neighbours touch — packing fraction 0.907.
            const a         = cfg.latticeSpacing_m;
            const rowPitchM = a * Math.sqrt(3) / 2;          // = 0.222 nm for Cu
            const cols      = Math.ceil(cfg.physWidth_m  / a)        + 2;
            const rows      = Math.ceil(cfg.physHeight_m / rowPitchM) + 2;
            // ensure the drawn radius is at least 1 px on screen
            const rPx       = Math.max(1.0, cfg.ionRadius_m * sx);
            o.fillStyle = "#a85f25";
            for (let j = 0; j < rows; j++) {
                const xOff = (j % 2 === 0) ? 0 : 0.5 * a;
                const y    = j * rowPitchM * sy;
                if (y < -rPx || y > h + rPx) continue;
                for (let i = -1; i < cols; i++) {
                    const x = (i * a + xOff) * sx;
                    if (x < -rPx || x > w + rPx) continue;
                    o.beginPath();
                    o.arc(x, y, rPx, 0, 2 * Math.PI);
                    o.fill();
                }
            }
            // very faint highlight on each atom for legibility
            o.globalCompositeOperation = "lighter";
            o.fillStyle = "rgba(255, 220, 180, 0.05)";
            o.fillRect(0, 0, w, h);
            o.globalCompositeOperation = "source-over";
        } else {
            // decorative demo lattice
            const dx = cfg.physWidth_m  / cfg.latticeCols;
            const dy = cfg.physHeight_m / cfg.latticeRows;
            const r = cfg.ionRadius_m * Math.min(sx, sy);
            for (let i = 0; i < cfg.latticeCols; i++) {
                for (let j = 0; j < cfg.latticeRows; j++) {
                    const x = (i + 0.5) * dx * sx;
                    const y = (j + 0.5) * dy * sy;
                    const grad = o.createRadialGradient(x, y, r * 0.2, x, y, r);
                    grad.addColorStop(0, "#f0b87a");
                    grad.addColorStop(1, "#a05f24");
                    o.fillStyle = grad;
                    o.beginPath();
                    o.arc(x, y, r, 0, 2 * Math.PI);
                    o.fill();
                    o.fillStyle = "#5e3414";
                    o.font = "bold 10px sans-serif";
                    o.textAlign = "center";
                    o.textBaseline = "middle";
                    o.fillText("+", x, y);
                }
            }
        }
        state.latticeBitmap = off;
    }

    // -----------------------------------------------------------------
    // Drude integrator
    // -----------------------------------------------------------------
    function step(dt) {
        const cfg  = state.cfg;
        const E    = state.fieldEnabled ? state.eField : 0;
        const accel = cfg.charge * E / cfg.mass;
        const tau  = currentTau();
        const pCollide = 1 - Math.exp(-dt / tau);

        for (let k = 0; k < state.electrons.length; k++) {
            const e = state.electrons[k];

            e.vx += accel * dt;
            const oldX = e.x;
            e.x += e.vx * dt;
            e.y += e.vy * dt;

            if (e.x >= cfg.physWidth_m) {
                e.x -= cfg.physWidth_m;
                state.crossingsRight++;
            } else if (e.x < 0) {
                e.x += cfg.physWidth_m;
                state.crossingsLeft++;
            }

            if (e.y < 0)                 { e.y = -e.y;                          e.vy = -e.vy; }
            else if (e.y > cfg.physHeight_m) {
                                            e.y = 2 * cfg.physHeight_m - e.y;   e.vy = -e.vy; }

            if (Math.random() < pCollide) {
                const a = Math.random() * 2 * Math.PI;
                e.vx = cfg.thermalSpeed * Math.cos(a);
                e.vy = cfg.thermalSpeed * Math.sin(a);
            }

            if (k === state.tagged && state.traceOn) {
                if (Math.abs(e.x - oldX) > cfg.physWidth_m / 2) {
                    state.tracePoints.push(null);
                }
                state.tracePoints.push({ x: e.x, y: e.y });
                if (state.tracePoints.length > 1500) {
                    state.tracePoints.splice(0, state.tracePoints.length - 1500);
                }
            }
        }
    }

    // -----------------------------------------------------------------
    // Controls → state, plus all read-outs
    // -----------------------------------------------------------------
    function readControls() {
        state.eField       = Number(ui.field.value);            // V/m
        state.temperature  = Number(ui.temp.value);             // K
        state.traceOn      = ui.trace.checked;
        state.fieldEnabled = ui.fieldOn.checked;
        state.running      = !ui.pause.checked;

        ui.fieldInputLabel.textContent = fmtField(state.eField);
        ui.tempLabel.textContent       = `${state.temperature} K`;

        // Always quote real-copper Drude numbers in the read-outs (the demo
        // is just a visualisation device — physics belongs to real Cu).
        const T   = state.temperature;
        const rho = rhoOfT(T);
        const tau = tauOfT(T);
        const lam = lambdaOfT(T);
        const E   = state.fieldEnabled ? state.eField : 0;
        const vd  = E_CHARGE * E * tau / E_MASS;
        const J   = N_CU * E_CHARGE * vd;
        const I1mm2 = J * 1e-6;

        ui.rhoLabel.textContent     = fmtSI(rho, "Ω·m");
        ui.tauLabel.textContent     = `${(tau * 1e15).toFixed(2)} fs`;
        ui.lambdaLabel.textContent  = `${(lam * 1e9).toFixed(1)} nm`;
        ui.fermiLabel.textContent   = `${(V_FERMI / 1e6).toFixed(2)} × 10⁶ m/s`;
        ui.driftLabel.textContent   = fmtSI(vd, "m/s");
        ui.jLabel.textContent       = fmtSI(J, "A/m²");
        ui.currentLabel.textContent = fmtSI(I1mm2, "A");

        // scale-of-view box
        const cfg = state.cfg;
        if (cfg === MODES.real) {
            ui.windowWidthLabel.textContent = `${(cfg.physWidth_m * 1e9).toFixed(0)} nm × ${(cfg.physHeight_m * 1e9).toFixed(1)} nm`;
            ui.latticeLabel.textContent     = `${(A_NN * 1e9).toFixed(3)} / ${(R_METAL * 1e9).toFixed(3)} nm`;
            const electronsInSlice =
                N_CU * cfg.physWidth_m * cfg.physHeight_m * A_NN;
            ui.electronCountLabel.textContent =
                `${cfg.electronCount} / ~${Math.round(electronsInSlice).toLocaleString()}`;
            ui.timeScaleLabel.textContent =
                `1 s on screen ≈ ${(cfg.wallTimeScale * 1e15).toFixed(0)} fs of real time`;
            const driftOnScreenPerWallSec = vd * cfg.wallTimeScale;  // m
            ui.driftPerSecLabel.textContent =
                `${fmtSI(driftOnScreenPerWallSec, "m")}/s on screen`;
        } else {
            ui.windowWidthLabel.textContent = "1 demo unit (arbitrary)";
            ui.latticeLabel.textContent     = "decorative only";
            ui.electronCountLabel.textContent = `${cfg.electronCount} (sample)`;
            ui.timeScaleLabel.textContent   = "1 s on screen = 1 s in the demo";
            ui.driftPerSecLabel.textContent = "(drift visually exaggerated)";
        }
    }

    function fmtSI(x, unit) {
        if (x === 0) return `0 ${unit}`;
        const abs = Math.abs(x);
        const sgn = x < 0 ? "-" : "";
        const exp = Math.floor(Math.log10(abs));
        const mant = abs / Math.pow(10, exp);
        if (exp >= -2 && exp <= 3) return `${sgn}${abs.toPrecision(3)} ${unit}`;
        const sup = String(exp)
            .replace(/-/g, "⁻")
            .replace(/0/g, "⁰").replace(/1/g, "¹").replace(/2/g, "²")
            .replace(/3/g, "³").replace(/4/g, "⁴").replace(/5/g, "⁵")
            .replace(/6/g, "⁶").replace(/7/g, "⁷").replace(/8/g, "⁸")
            .replace(/9/g, "⁹");
        return `${sgn}${mant.toFixed(2)} × 10${sup} ${unit}`;
    }

    function fmtField(E) {
        if (E === 0) return "0 V/m";
        const a = Math.abs(E);
        if (a < 1) return `${(E * 1000).toFixed(1)} mV/m`;
        if (a < 1000) return `${E.toFixed(2)} V/m`;
        return `${(E / 1000).toFixed(2)} kV/m`;
    }

    // -----------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------
    function drawWire() {
        const { sx, sy, w, h } = physToPixel(wireCanvas);
        wctx.clearRect(0, 0, w, h);

        if (state.latticeBitmap) {
            const ratio = window.devicePixelRatio || 1;
            wctx.drawImage(state.latticeBitmap,
                0, 0, state.latticeBitmap.width, state.latticeBitmap.height,
                0, 0, w, h);
        }

        // dashed cross-section line
        wctx.strokeStyle = "rgba(35, 95, 156, 0.55)";
        wctx.setLineDash([6, 5]);
        wctx.lineWidth = 1.5;
        wctx.beginPath();
        wctx.moveTo(w / 2, 0); wctx.lineTo(w / 2, h);
        wctx.stroke();
        wctx.setLineDash([]);
        wctx.fillStyle = "rgba(35, 95, 156, 0.85)";
        wctx.font = "11px sans-serif";
        wctx.textAlign = "left";
        wctx.fillText("cross-section (counts flux →)", w / 2 + 6, 14);

        // tagged-electron trace
        if (state.traceOn && state.tracePoints.length > 1) {
            wctx.strokeStyle = "rgba(240, 180, 76, 0.85)";
            wctx.lineWidth = 1.1;
            wctx.beginPath();
            let started = false;
            for (const p of state.tracePoints) {
                if (p === null) { started = false; continue; }
                const x = p.x * sx;
                const y = p.y * sy;
                if (!started) { wctx.moveTo(x, y); started = true; }
                else            wctx.lineTo(x, y);
            }
            wctx.stroke();
        }

        // electrons
        const cfg = state.cfg;
        const eR = cfg === MODES.real ? 2.6 : Math.max(3, sx * cfg.physWidth_m * 0.004);
        for (let k = 0; k < state.electrons.length; k++) {
            const e = state.electrons[k];
            const x = e.x * sx;
            const y = e.y * sy;
            if (k === state.tagged) {
                wctx.fillStyle = "#f0b44c";
                wctx.beginPath();
                wctx.arc(x, y, eR * 1.9, 0, 2 * Math.PI);
                wctx.fill();
                wctx.strokeStyle = "rgba(94, 39, 0, 0.55)";
                wctx.lineWidth = 1;
                wctx.stroke();
            } else {
                wctx.fillStyle = "#3a87cf";
                wctx.beginPath();
                wctx.arc(x, y, eR, 0, 2 * Math.PI);
                wctx.fill();
            }
        }

        // field arrow
        const E = state.fieldEnabled ? state.eField : 0;
        if (E !== 0) {
            const dir = E > 0 ? 1 : -1;
            const cx = w - 80, cy = 22;
            wctx.strokeStyle = "#df5b5b";
            wctx.fillStyle   = "#df5b5b";
            wctx.lineWidth = 2;
            wctx.beginPath();
            wctx.moveTo(cx - 30 * dir, cy);
            wctx.lineTo(cx + 30 * dir, cy);
            wctx.stroke();
            wctx.beginPath();
            wctx.moveTo(cx + 30 * dir, cy);
            wctx.lineTo(cx + 22 * dir, cy - 6);
            wctx.lineTo(cx + 22 * dir, cy + 6);
            wctx.closePath();
            wctx.fill();
            wctx.font = "12px sans-serif";
            wctx.textAlign = "right";
            wctx.fillText("E", cx - 36 * dir, cy + 4);
        }

        drawScaleBar(w, h);
    }

    function drawScaleBar(w, h) {
        const cfg = state.cfg;
        let barLengthPhys, label;
        if (cfg === MODES.real) { barLengthPhys = 5e-9; label = "5 nm"; }
        else                    { barLengthPhys = 0.2;  label = "0.2 demo unit"; }
        const barPx = barLengthPhys * (w / cfg.physWidth_m);
        const x0 = 16, y0 = h - 18;
        wctx.strokeStyle = "rgba(20, 33, 47, 0.75)";
        wctx.lineWidth = 2;
        wctx.beginPath();
        wctx.moveTo(x0, y0); wctx.lineTo(x0 + barPx, y0);
        wctx.moveTo(x0, y0 - 5); wctx.lineTo(x0, y0 + 5);
        wctx.moveTo(x0 + barPx, y0 - 5); wctx.lineTo(x0 + barPx, y0 + 5);
        wctx.stroke();
        wctx.fillStyle = "rgba(20, 33, 47, 0.85)";
        wctx.font = "12px sans-serif";
        wctx.textAlign = "left";
        wctx.fillText(label, x0 + barPx + 8, y0 + 4);
    }

    function drawChart() {
        const { w, h } = cssSize(chartCanvas);
        cctx.clearRect(0, 0, w, h);
        cctx.strokeStyle = "#d8e0e8";
        cctx.lineWidth = 1;
        cctx.strokeRect(0.5, 0.5, w - 1, h - 1);

        cctx.strokeStyle = "rgba(20,33,47,0.4)";
        cctx.beginPath();
        cctx.moveTo(40, h - 28); cctx.lineTo(w - 12, h - 28);
        cctx.moveTo(40, 12);     cctx.lineTo(40, h - 28);
        cctx.stroke();
        cctx.fillStyle = "rgba(20,33,47,0.7)";
        cctx.font = "12px sans-serif";
        cctx.textAlign = "left";
        cctx.fillText("net crossings (right − left)", 46, 24);
        cctx.textAlign = "right";
        cctx.fillText("animation time →", w - 16, h - 10);

        if (state.history.length < 2) return;
        const tMin = state.history[0].t;
        const tMax = state.history[state.history.length - 1].t;
        const tSpan = Math.max(0.5, tMax - tMin);
        let nMin = Infinity, nMax = -Infinity;
        for (const p of state.history) {
            if (p.net < nMin) nMin = p.net;
            if (p.net > nMax) nMax = p.net;
        }
        if (nMin === nMax) { nMin -= 1; nMax += 1; }

        const x0 = 40, y0 = h - 28, plotW = w - 12 - x0, plotH = h - 40;
        const zeroY = y0 - ((0 - nMin) / (nMax - nMin)) * plotH;
        cctx.strokeStyle = "rgba(20,33,47,0.2)";
        cctx.setLineDash([3, 3]);
        cctx.beginPath();
        cctx.moveTo(x0, zeroY); cctx.lineTo(w - 12, zeroY); cctx.stroke();
        cctx.setLineDash([]);

        cctx.strokeStyle = state.mode === "real" ? "#2bb7bf" : "#235f9c";
        cctx.lineWidth = 2;
        cctx.beginPath();
        for (let i = 0; i < state.history.length; i++) {
            const p = state.history[i];
            const x = x0 + ((p.t - tMin) / tSpan) * plotW;
            const y = y0 - ((p.net - nMin) / (nMax - nMin)) * plotH;
            if (i === 0) cctx.moveTo(x, y); else cctx.lineTo(x, y);
        }
        cctx.stroke();
    }

    // -----------------------------------------------------------------
    // Loop
    // -----------------------------------------------------------------
    function frame(ts) {
        if (state.lastTs === null) state.lastTs = ts;
        const wallDt = Math.min(0.05, (ts - state.lastTs) / 1000);
        state.lastTs = ts;

        if (state.running) {
            // Convert one second of wall time into the right amount of "physics
            // time" for the current mode (cfg.wallTimeScale seconds per wall s),
            // then sub-step the integrator.
            const cfg = state.cfg;
            const physDt = wallDt * cfg.wallTimeScale;
            // Pick sub-step count so each sub-step is ≤ cfg.dtPerFrame
            const substeps = Math.max(1, Math.min(120, Math.ceil(physDt / cfg.dtPerFrame)));
            const dt = physDt / substeps;
            for (let i = 0; i < substeps; i++) step(dt);
            state.elapsedAnim += wallDt;
            state.history.push({
                t: state.elapsedAnim,
                net: state.crossingsRight - state.crossingsLeft
            });
            if (state.history.length > 600) state.history.shift();
        }

        readControls();
        drawWire();
        drawChart();
        const net = state.crossingsRight - state.crossingsLeft;
        ui.fluxLabel.textContent =
            `Crossings: → ${state.crossingsRight}   ← ${state.crossingsLeft}   net ${net >= 0 ? "+" : ""}${net}`;
        requestAnimationFrame(frame);
    }

    // -----------------------------------------------------------------
    // Wiring
    // -----------------------------------------------------------------
    function setMode(mode) {
        state.mode = mode;
        state.cfg  = MODES[mode];
        ui.modeReadout.textContent = state.cfg.label;
        ui.modeButtons.forEach(b => {
            b.classList.toggle("active", b.dataset.mode === mode);
        });
        ui.caption.textContent = mode === "demo"
            ? "Demo mode: thermal motion and drift are both shown at human-friendly speeds, with drift exaggerated so directed flow is visible by eye. The lattice is decorative; the slider physics (E and T) still drive the same Drude equations."
            : "Real mode: a 30 nm × 14 nm slice of fcc copper at the chosen temperature, shown in the (111) projection. Atoms sit on the true 0.256 nm nearest-neighbour lattice and are drawn at the metallic radius 0.128 nm, so neighbours touch. (The actual nucleus is ~5 × 10⁻⁶ nm — ~25 000× smaller than a pixel.) Conduction electrons fly at the Fermi speed (1.57 × 10⁶ m/s) and scatter every τ(T) ~ 25 fs at room temperature. The drift superimposed on this is ~10¹⁰× slower than the thermal motion, so it is invisible by eye even though it carries the macroscopic current.";
        initSimulation();
    }

    ui.modeButtons.forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
    ui.reset.addEventListener("click", () => initSimulation());

    [ui.field, ui.temp, ui.trace, ui.fieldOn, ui.pause]
        .forEach(el => el.addEventListener("input", readControls));
    ui.trace.addEventListener("change", () => {
        if (!ui.trace.checked) state.tracePoints = [];
    });

    window.addEventListener("resize", () => {
        resizeCanvas(wireCanvas, wctx);
        resizeCanvas(chartCanvas, cctx);
        buildLatticeBitmap(true);
    });

    // boot
    resizeCanvas(wireCanvas, wctx);
    resizeCanvas(chartCanvas, cctx);
    setMode("demo");
    readControls();
    requestAnimationFrame(frame);
})();
