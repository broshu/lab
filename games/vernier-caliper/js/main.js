(function () {
    "use strict";

    /* ---------- canvas setup ---------- */
    const canvas = document.getElementById("caliper");
    const ctx = canvas.getContext("2d");
    const W = 1620, H = 500;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.scale(DPR, DPR);

    /* ---------- geometry ---------- */
    const PPM = 10;            // pixels per millimetre (main view)
    const X0 = 72;             // x of the 0 mm main-scale mark
    const MAIN_MM = 100;       // length of the main scale (mm)
    const MAX_VALUE = 50;      // largest measurement (mm)

    const BEAM_TOP = 268;
    const Y_DIV = 320;         // line dividing main scale (above) / vernier (below)
    const VERN_BOT = 376;
    const JAW_BOT = 488;
    const BLOCK_TOP = 396, BLOCK_BOT = 444;
    const BEAM_R = X0 + MAIN_MM * PPM + 16;     // right end of the beam
    const ROD_Y = (BEAM_TOP + Y_DIV) / 2;       // depth-rod centre line

    const MAG = { x: 600, y: 14, w: 440, h: 168, ppm: 44 };

    /* ---------- vernier modes ---------- */
    const MODES = {
        10: { full: 10, prec: 0.1,  decimals: 1, labelEvery: 5  },
        20: { full: 20, prec: 0.05, decimals: 2, labelEvery: 5  },
        50: { full: 50, prec: 0.02, decimals: 2, labelEvery: 10 }
    };

    let modeKey = 10;
    let steps = 324;           // measurement = steps / full  (exact integer math)
    let revealed = true;       // whether the reading is shown (class use: hide / show)

    function M()        { return MODES[modeKey]; }
    function full()     { return M().full; }
    function value()    { return steps / full(); }
    function verSpan()  { return full() - 1; }                 // vernier length, mm
    function verPitch() { return (full() - 1) / full(); }      // vernier division, mm

    function reading() {
        const f = full();
        const k = ((steps % f) + f) % f;       // aligned vernier line index
        const mainMM = (steps - k) / f;        // main-scale reading (whole mm)
        return { mainMM: mainMM, k: k, prec: M().prec, total: steps / f };
    }

    /* ---------- helpers ---------- */
    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    function vGrad(x, y, h, c1, c2) {
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, c1);
        g.addColorStop(1, c2);
        return g;
    }

    const STEEL_L = "#fbfcfd", STEEL_M = "#dde2e7", STEEL_D = "#bdc6ce";
    const EDGE = "#8a95a0";
    const SLIDER_L = "#eef2f5", SLIDER_M = "#cdd5dc", SLIDER_D = "#a9b4bf";
    const SLIDER_E = "#7f8b97";
    const INK = "#14212f", BLUE = "#235f9c", RED = "#df5b5b", MUTED = "#7c8794";

    /* ---------- depth rod (thin blade from the right end) ---------- */
    function drawDepthRod() {
        const len = value() * PPM;
        if (len < 1) return;
        ctx.fillStyle = vGrad(BEAM_R, ROD_Y - 4, 8, "#dde3e8", "#aab4bd");
        roundRect(BEAM_R - 12, ROD_Y - 4, len + 14, 8, 2);
        ctx.fill();
        ctx.strokeStyle = EDGE;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    /* ---------- fixed frame: beam + fixed jaws ---------- */
    function drawBeam() {
        // main beam
        ctx.fillStyle = vGrad(0, BEAM_TOP, Y_DIV - BEAM_TOP, STEEL_L, STEEL_M);
        roundRect(X0 - 56, BEAM_TOP, BEAM_R - (X0 - 56), Y_DIV - BEAM_TOP, 5);
        ctx.fill();
        ctx.strokeStyle = EDGE;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // fixed external jaw (lower, blocky, measuring face at x = X0)
        ctx.fillStyle = vGrad(X0 - 56, BEAM_TOP, JAW_BOT - BEAM_TOP, STEEL_L, STEEL_D);
        ctx.beginPath();
        ctx.moveTo(X0, BEAM_TOP);
        ctx.lineTo(X0, JAW_BOT - 9);                      // inner measuring face
        ctx.lineTo(X0 - 11, JAW_BOT);                     // inner-bottom chamfer
        ctx.lineTo(X0 - 44, JAW_BOT);                     // flat bottom
        ctx.lineTo(X0 - 56, JAW_BOT - 26);                // outer-bottom chamfer
        ctx.lineTo(X0 - 56, BEAM_TOP);                    // outer face
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // fixed internal jaw (upper tapered knife edge, measuring face at x = X0)
        ctx.fillStyle = vGrad(X0, BEAM_TOP - 72, 76, STEEL_L, STEEL_D);
        ctx.beginPath();
        ctx.moveTo(X0, BEAM_TOP);
        ctx.lineTo(X0, BEAM_TOP - 58);
        ctx.lineTo(X0 + 5, BEAM_TOP - 70);                // pointed tip
        ctx.lineTo(X0 + 21, BEAM_TOP - 26);               // tapered inner edge
        ctx.lineTo(X0 + 21, BEAM_TOP);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // small rivets on the fixed frame
        ctx.fillStyle = "#aeb8c1";
        ctx.strokeStyle = EDGE;
        ctx.lineWidth = 1;
        [[X0 - 30, BEAM_TOP + 26], [X0 - 30, JAW_BOT - 70]].forEach(function (p) {
            ctx.beginPath();
            ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }

    /* ---------- measured block ---------- */
    function drawBlock() {
        const w = value() * PPM;
        if (w < 1.5) return;
        ctx.fillStyle = vGrad(X0, BLOCK_TOP, BLOCK_BOT - BLOCK_TOP, "#f4ca7c", "#d9992c");
        roundRect(X0, BLOCK_TOP, w, BLOCK_BOT - BLOCK_TOP, 3);
        ctx.fill();
        ctx.strokeStyle = "#b9831f";
        ctx.lineWidth = 1.2;
        ctx.stroke();
    }

    /* ---------- sliding assembly ---------- */
    function drawSlider() {
        const xv = X0 + value() * PPM;                 // vernier-zero / sliding-jaw face
        const sliderL = xv - 24;
        const plateR = xv + verSpan() * PPM + 24;
        const winTop = 297;                            // main-scale window: winTop..Y_DIV

        // fine-feed thumb roller (behind the vernier plate)
        const rx = xv + 74, ry = VERN_BOT + 3, rr = 18;
        ctx.fillStyle = vGrad(rx - rr, ry - rr, 2 * rr, "#c6cdd5", "#8c97a3");
        ctx.beginPath();
        ctx.arc(rx, ry, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#737e8a";
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.lineWidth = 1;
        for (let a = 0; a < 24; a++) {
            const ang = (a / 24) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(rx + Math.cos(ang) * (rr - 5), ry + Math.sin(ang) * (rr - 5));
            ctx.lineTo(rx + Math.cos(ang) * (rr - 1), ry + Math.sin(ang) * (rr - 1));
            ctx.stroke();
        }

        ctx.strokeStyle = SLIDER_E;
        ctx.lineWidth = 1.5;

        // movable external jaw (lower, blocky, measuring face at x = xv)
        ctx.fillStyle = vGrad(xv, VERN_BOT - 20, JAW_BOT - VERN_BOT + 20, SLIDER_L, SLIDER_D);
        ctx.beginPath();
        ctx.moveTo(xv, VERN_BOT - 20);
        ctx.lineTo(xv, JAW_BOT - 9);                      // inner measuring face
        ctx.lineTo(xv + 11, JAW_BOT);                     // inner-bottom chamfer
        ctx.lineTo(xv + 44, JAW_BOT);                     // flat bottom
        ctx.lineTo(xv + 56, JAW_BOT - 26);                // outer-bottom chamfer
        ctx.lineTo(xv + 56, VERN_BOT - 20);               // outer face
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // vernier plate (lower lip of the slider, carries the vernier scale)
        ctx.fillStyle = vGrad(xv, Y_DIV, VERN_BOT - Y_DIV, SLIDER_L, SLIDER_M);
        roundRect(sliderL, Y_DIV, plateR - sliderL, VERN_BOT - Y_DIV, 4);
        ctx.fill();
        ctx.stroke();

        // side rails framing the main-scale window
        ctx.fillStyle = vGrad(sliderL, winTop, Y_DIV - winTop, SLIDER_M, SLIDER_D);
        ctx.fillRect(sliderL, winTop - 2, 15, Y_DIV - winTop + 4);
        ctx.strokeRect(sliderL, winTop - 2, 15, Y_DIV - winTop + 4);
        ctx.fillRect(plateR - 15, winTop - 2, 15, Y_DIV - winTop + 4);
        ctx.strokeRect(plateR - 15, winTop - 2, 15, Y_DIV - winTop + 4);

        // upper body (rides on top of the beam)
        ctx.fillStyle = vGrad(sliderL, BEAM_TOP - 16, winTop - (BEAM_TOP - 16), SLIDER_L, SLIDER_M);
        roundRect(sliderL, BEAM_TOP - 16, plateR - sliderL, winTop - (BEAM_TOP - 16), 5);
        ctx.fill();
        ctx.stroke();

        // movable internal jaw (upper tapered knife edge, measuring face at x = xv)
        ctx.fillStyle = vGrad(xv, BEAM_TOP - 72, 76, SLIDER_L, SLIDER_D);
        ctx.beginPath();
        ctx.moveTo(xv, BEAM_TOP);
        ctx.lineTo(xv, BEAM_TOP - 58);
        ctx.lineTo(xv - 5, BEAM_TOP - 70);                // pointed tip
        ctx.lineTo(xv - 23, BEAM_TOP - 26);               // tapered inner edge
        ctx.lineTo(xv - 23, BEAM_TOP);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // knurled thumb screw rising from the upper body
        const sx = xv + 34, screwBase = BEAM_TOP - 16, screwTop = screwBase - 24;
        ctx.fillStyle = vGrad(sx - 12, screwTop, 26, "#c8d0d8", "#9aa5b0");
        roundRect(sx - 12, screwTop, 24, screwBase - screwTop + 2, 4);
        ctx.fill();
        ctx.strokeStyle = "#737e8a";
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
            const lx = sx - 9 + i * 3.6;
            ctx.beginPath();
            ctx.moveTo(lx, screwTop + 4);
            ctx.lineTo(lx, screwBase - 3);
            ctx.stroke();
        }
        ctx.fillStyle = "#aab4bf";
        roundRect(sx - 13, screwTop - 6, 26, 9, 3);
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.stroke();
    }

    /* ---------- main scale (on the beam) ---------- */
    function drawMainScale() {
        ctx.strokeStyle = INK;
        ctx.fillStyle = INK;
        ctx.textAlign = "center";
        for (let mm = 0; mm <= MAIN_MM; mm++) {
            const x = X0 + mm * PPM;
            let len = 9;
            if (mm % 5 === 0) len = 15;
            if (mm % 10 === 0) len = 22;
            ctx.lineWidth = mm % 10 === 0 ? 1.7 : 1;
            ctx.beginPath();
            ctx.moveTo(x, Y_DIV);
            ctx.lineTo(x, Y_DIV - len);
            ctx.stroke();
            if (mm % 10 === 0) {
                ctx.font = "600 12px 'Avenir Next', sans-serif";
                ctx.fillText(String(mm), x, Y_DIV - len - 6);
            }
        }
    }

    /* ---------- vernier scale (on the slider) ---------- */
    function drawVernierScale() {
        const f = full();
        const r = reading();
        const sparse = M().labelEvery;
        const xv = X0 + value() * PPM;

        for (let i = 0; i <= f; i++) {
            const x = xv + i * verPitch() * PPM;
            const aligned = i === r.k;
            let len = 11;
            if (i % sparse === 0) len = 17;
            if (aligned) len = 23;
            ctx.strokeStyle = aligned ? RED : INK;
            ctx.lineWidth = aligned ? 2.3 : 1;
            ctx.beginPath();
            ctx.moveTo(x, Y_DIV);
            ctx.lineTo(x, Y_DIV + len);
            ctx.stroke();
            if (i % sparse === 0 || aligned) {
                ctx.fillStyle = aligned ? RED : INK;
                ctx.font = (aligned ? "700 " : "600 ") + "12px 'Avenir Next', sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(String(i), x, Y_DIV + len + 13);
            }
        }
        // precision tag near the vernier zero
        ctx.fillStyle = MUTED;
        ctx.font = "600 11px 'Avenir Next', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(M().prec.toFixed(2) + " mm", xv - 14, VERN_BOT - 7);
    }

    function drawAlignGuide() {
        const r = reading();
        const x = X0 + (r.mainMM + r.k) * PPM;
        ctx.save();
        ctx.strokeStyle = "rgba(223,91,91,0.55)";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x, Y_DIV - 28);
        ctx.lineTo(x, Y_DIV + 32);
        ctx.stroke();
        ctx.restore();
    }

    /* ---------- magnifier ---------- */
    function drawMagnifier() {
        const r = reading();
        const f = full();
        const centerMM = r.mainMM + r.k;          // aligned line, absolute mm
        const cx = MAG.x + MAG.w / 2;
        const yDiv = MAG.y + MAG.h * 0.52;
        const z = MAG.ppm;

        ctx.save();
        ctx.fillStyle = "#f6f9fc";
        roundRect(MAG.x, MAG.y, MAG.w, MAG.h, 12);
        ctx.fill();
        ctx.strokeStyle = "#cdd6df";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.clip();

        ctx.fillStyle = "#eef2f6";
        ctx.fillRect(MAG.x, MAG.y, MAG.w, yDiv - MAG.y);
        ctx.fillStyle = "#e3ecf4";
        ctx.fillRect(MAG.x, yDiv, MAG.w, MAG.y + MAG.h - yDiv);

        const winMM = MAG.w / z / 2 + 1;

        // main-scale ticks (point up)
        ctx.textAlign = "center";
        for (let mm = Math.ceil(centerMM - winMM); mm <= centerMM + winMM; mm++) {
            if (mm < 0 || mm > MAIN_MM) continue;
            const x = cx + (mm - centerMM) * z;
            const major = mm % 10 === 0;
            const hit = mm === centerMM;
            ctx.strokeStyle = hit ? RED : INK;
            ctx.lineWidth = hit ? 2.4 : (major ? 1.8 : 1.1);
            const len = major ? 36 : (mm % 5 === 0 ? 27 : 19);
            ctx.beginPath();
            ctx.moveTo(x, yDiv);
            ctx.lineTo(x, yDiv - len);
            ctx.stroke();
            ctx.fillStyle = hit ? RED : INK;
            ctx.font = (hit ? "700 " : "600 ") + "12px 'Avenir Next', sans-serif";
            ctx.fillText(String(mm), x, yDiv - len - 6);
        }

        // vernier ticks (point down)
        for (let i = 0; i <= f; i++) {
            const posMM = value() + i * verPitch();
            const x = cx + (posMM - centerMM) * z;
            if (x < MAG.x - 4 || x > MAG.x + MAG.w + 4) continue;
            const hit = i === r.k;
            ctx.strokeStyle = hit ? RED : INK;
            ctx.lineWidth = hit ? 2.4 : 1.1;
            const len = hit ? 36 : 21;
            ctx.beginPath();
            ctx.moveTo(x, yDiv);
            ctx.lineTo(x, yDiv + len);
            ctx.stroke();
            ctx.fillStyle = hit ? RED : INK;
            ctx.font = (hit ? "700 " : "600 ") + "12px 'Avenir Next', sans-serif";
            ctx.fillText(String(i), x, yDiv + len + 13);
        }

        // coincidence marker
        ctx.strokeStyle = RED;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cx, MAG.y + 6);
        ctx.lineTo(cx, MAG.y + MAG.h - 6);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    /* ---------- compose ---------- */
    function draw() {
        ctx.clearRect(0, 0, W, H);
        drawMagnifier();
        drawDepthRod();
        drawBeam();
        drawMainScale();
        drawBlock();
        drawSlider();
        drawAlignGuide();
        drawVernierScale();
        updateReadout();
    }

    /* ---------- readout ---------- */
    function updateReadout() {
        const r = reading();
        const d = M().decimals;
        const vern = r.k * r.prec;
        const elMain = document.getElementById("rMain");
        const elVern = document.getElementById("rVern");
        const elTotal = document.getElementById("rTotal");
        if (revealed) {
            elMain.textContent = r.mainMM + " mm";
            elVern.innerHTML =
                r.k + " &times; " + r.prec.toFixed(2) + " = " + vern.toFixed(d) + " mm";
            elTotal.textContent = r.total.toFixed(d) + " mm";
        } else {
            elMain.textContent = "? mm";
            elVern.innerHTML = "?";
            elTotal.textContent = "? mm";
        }
        [elMain, elVern, elTotal].forEach(function (e) {
            e.classList.toggle("masked", !revealed);
        });
    }

    /* ---------- interaction ---------- */
    let dragging = false, grabRefMM = 0;

    function toLocal(ev) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (ev.clientX - rect.left) * (W / rect.width),
            y: (ev.clientY - rect.top) * (H / rect.height)
        };
    }
    function setSteps(s) {
        steps = Math.max(0, Math.min(MAX_VALUE * full(), Math.round(s)));
        draw();
    }
    function inGrabZone(p) {
        const xv = X0 + value() * PPM;
        const right = xv + Math.max(verSpan() * PPM + 24, 76);
        const onSlider = p.x >= xv - 26 && p.x <= right &&
                         p.y >= BEAM_TOP - 78 && p.y <= JAW_BOT;
        const onBlock = p.x >= X0 && p.x <= xv &&
                        p.y >= BLOCK_TOP - 8 && p.y <= BLOCK_BOT + 8;
        return onSlider || onBlock;
    }

    canvas.addEventListener("pointerdown", function (ev) {
        const p = toLocal(ev);
        if (!inGrabZone(p)) return;
        dragging = true;
        grabRefMM = (p.x - X0) / PPM - value();
        canvas.setPointerCapture(ev.pointerId);
        canvas.style.cursor = "grabbing";
        canvas.focus();
    });
    canvas.addEventListener("pointermove", function (ev) {
        const p = toLocal(ev);
        if (!dragging) {
            canvas.style.cursor = inGrabZone(p) ? "grab" : "default";
            return;
        }
        const v = (p.x - X0) / PPM - grabRefMM;
        setSteps(v * full());
    });
    function endDrag(ev) {
        if (!dragging) return;
        dragging = false;
        canvas.style.cursor = "grab";
        if (ev.pointerId !== undefined && canvas.hasPointerCapture(ev.pointerId)) {
            canvas.releasePointerCapture(ev.pointerId);
        }
    }
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    canvas.addEventListener("keydown", function (ev) {
        let handled = true;
        if (ev.key === "ArrowRight") setSteps(steps + 1);
        else if (ev.key === "ArrowLeft") setSteps(steps - 1);
        else if (ev.key === "ArrowUp") setSteps(steps + full());
        else if (ev.key === "ArrowDown") setSteps(steps - full());
        else handled = false;
        if (handled) ev.preventDefault();
    });

    /* ---------- mode switching ---------- */
    document.getElementById("modeControl").addEventListener("click", function (ev) {
        const btn = ev.target.closest(".mode-button");
        if (!btn) return;
        const v = value();
        modeKey = parseInt(btn.dataset.mode, 10);
        document.querySelectorAll(".mode-button").forEach(function (b) {
            b.classList.toggle("active", b === btn);
        });
        steps = Math.max(0, Math.min(MAX_VALUE * full(), Math.round(v * full())));
        draw();
    });

    const revealBtn = document.getElementById("revealBtn");
    revealBtn.addEventListener("click", function () {
        revealed = !revealed;
        revealBtn.textContent = revealed ? "Hide answer" : "Show answer";
        revealBtn.classList.toggle("hidden-state", !revealed);
        updateReadout();
    });

    document.getElementById("resetBtn").addEventListener("click", function () {
        steps = 0;
        draw();
    });

    draw();
})();
