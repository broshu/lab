(function () {
    "use strict";

    /* ---------- canvas setup ---------- */
    const canvas = document.getElementById("caliper");
    const ctx = canvas.getContext("2d");
    const W = 1140, H = 500;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.scale(DPR, DPR);

    /* ---------- geometry ---------- */
    const PPM = 10;            // pixels per millimetre (main view)
    const X0 = 70;             // x of the 0 mm main-scale mark
    const MAIN_MM = 100;       // length of the main scale (mm)
    const MAX_VALUE = 50;      // largest measurement (mm)

    const Y_DIV = 322;         // line dividing main scale (above) / vernier (below)
    const BEAM_TOP = 272;
    const VERN_BOT = 376;
    const JAW_BOT = 478;
    const BLOCK_TOP = 396, BLOCK_BOT = 456;

    const MAG = { x: 366, y: 20, w: 408, h: 160, ppm: 40 };

    /* ---------- vernier modes ---------- */
    const MODES = {
        10: { full: 10, prec: 0.1,  decimals: 1, labelEvery: 5  },
        20: { full: 20, prec: 0.05, decimals: 2, labelEvery: 5  },
        50: { full: 50, prec: 0.02, decimals: 2, labelEvery: 10 }
    };

    let modeKey = 10;
    let steps = 324;           // measurement = steps / full  (exact integer math)

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

    const STEEL_L = "#f1f4f7", STEEL_D = "#c4ccd4", EDGE = "#8c98a4";
    const SLIDER_L = "#dfe7ef", SLIDER_D = "#aab6c3";
    const INK = "#14212f", BLUE = "#235f9c", RED = "#df5b5b", MUTED = "#7c8794";

    /* ---------- main caliper ---------- */
    function drawBeam() {
        // fixed beam
        ctx.fillStyle = vGrad(0, BEAM_TOP, BEAM_BOT_H(), STEEL_L, STEEL_D);
        roundRect(X0 - 36, BEAM_TOP, MAIN_MM * PPM + 96, Y_DIV - BEAM_TOP, 6);
        ctx.fill();
        ctx.strokeStyle = EDGE;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // fixed (left) jaw
        ctx.fillStyle = vGrad(X0 - 40, BEAM_TOP, JAW_BOT - BEAM_TOP, STEEL_L, "#aeb8c1");
        ctx.beginPath();
        ctx.moveTo(X0 - 40, BEAM_TOP + 4);
        ctx.lineTo(X0, BEAM_TOP + 4);
        ctx.lineTo(X0, JAW_BOT);
        ctx.lineTo(X0 - 14, JAW_BOT);
        ctx.lineTo(X0 - 40, JAW_BOT - 70);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // fixed upper (internal) jaw
        ctx.beginPath();
        ctx.moveTo(X0 - 2, BEAM_TOP);
        ctx.lineTo(X0 - 2, BEAM_TOP - 56);
        ctx.lineTo(X0 - 18, BEAM_TOP - 56);
        ctx.lineTo(X0 - 18, BEAM_TOP);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    function BEAM_BOT_H() { return Y_DIV - BEAM_TOP; }

    function drawBlock() {
        const w = value() * PPM;
        if (w < 1.5) return;
        const x = X0;
        ctx.fillStyle = vGrad(x, BLOCK_TOP, BLOCK_BOT - BLOCK_TOP, "#f3c777", "#d99a2f");
        roundRect(x, BLOCK_TOP, w, BLOCK_BOT - BLOCK_TOP, 3);
        ctx.fill();
        ctx.strokeStyle = "#b9831f";
        ctx.lineWidth = 1.2;
        ctx.stroke();
    }

    function drawSlider() {
        const xv = X0 + value() * PPM;                 // vernier-zero / sliding-jaw face
        const plateR = xv + verSpan() * PPM + 16;

        // sliding jaw (drops below the vernier plate)
        ctx.fillStyle = vGrad(xv, VERN_BOT - 30, JAW_BOT - VERN_BOT + 30, SLIDER_L, SLIDER_D);
        ctx.strokeStyle = EDGE;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(xv, VERN_BOT - 30);
        ctx.lineTo(xv, JAW_BOT);
        ctx.lineTo(xv + 16, JAW_BOT);
        ctx.lineTo(xv + 40, JAW_BOT - 70);
        ctx.lineTo(xv + 40, VERN_BOT - 30);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // vernier plate
        ctx.fillStyle = vGrad(xv, Y_DIV - 4, VERN_BOT - Y_DIV + 4, SLIDER_L, SLIDER_D);
        roundRect(xv - 16, Y_DIV - 4, plateR - (xv - 16), VERN_BOT - Y_DIV + 4, 6);
        ctx.fill();
        ctx.stroke();

        // upper grip riding on the beam
        ctx.fillStyle = vGrad(xv - 16, BEAM_TOP - 26, 44, SLIDER_L, SLIDER_D);
        roundRect(xv - 16, BEAM_TOP - 26, 86, 44, 7);
        ctx.fill();
        ctx.stroke();

        // upper (internal) sliding jaw
        ctx.fillStyle = vGrad(xv, BEAM_TOP - 56, 56, SLIDER_L, SLIDER_D);
        ctx.beginPath();
        ctx.moveTo(xv + 2, BEAM_TOP);
        ctx.lineTo(xv + 2, BEAM_TOP - 56);
        ctx.lineTo(xv + 18, BEAM_TOP - 56);
        ctx.lineTo(xv + 18, BEAM_TOP);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // thumb wheel
        ctx.beginPath();
        ctx.arc(xv + 40, BEAM_TOP - 4, 12, 0, Math.PI * 2);
        ctx.fillStyle = "#9aa6b2";
        ctx.fill();
        ctx.strokeStyle = "#6f7a86";
        ctx.stroke();
        for (let a = 0; a < 12; a++) {
            const ang = (a / 12) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(xv + 40 + Math.cos(ang) * 6, BEAM_TOP - 4 + Math.sin(ang) * 6);
            ctx.lineTo(xv + 40 + Math.cos(ang) * 11, BEAM_TOP - 4 + Math.sin(ang) * 11);
            ctx.stroke();
        }
    }

    function drawMainScale() {
        ctx.strokeStyle = INK;
        ctx.fillStyle = INK;
        ctx.textAlign = "center";
        for (let mm = 0; mm <= MAIN_MM; mm++) {
            const x = X0 + mm * PPM;
            let len = 9;
            if (mm % 5 === 0) len = 15;
            if (mm % 10 === 0) len = 21;
            ctx.lineWidth = mm % 10 === 0 ? 1.6 : 1;
            ctx.beginPath();
            ctx.moveTo(x, Y_DIV);
            ctx.lineTo(x, Y_DIV - len);
            ctx.stroke();
            if (mm % 10 === 0) {
                ctx.font = "600 12px 'Avenir Next', sans-serif";
                ctx.fillText(String(mm), x, Y_DIV - len - 7);
            }
        }
        // unit hint
        ctx.font = "600 11px 'Avenir Next', sans-serif";
        ctx.fillStyle = MUTED;
        ctx.textAlign = "left";
        ctx.fillText("mm", X0 + MAIN_MM * PPM + 12, Y_DIV - 8);
    }

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
            if (aligned) len = 22;
            ctx.strokeStyle = aligned ? RED : INK;
            ctx.lineWidth = aligned ? 2.2 : 1;
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
        ctx.fillText(M().prec.toFixed(2) + " mm", xv - 13, VERN_BOT - 6);
    }

    function drawAlignGuide() {
        const r = reading();
        const x = X0 + (r.mainMM + r.k) * PPM;
        ctx.save();
        ctx.strokeStyle = "rgba(223,91,91,0.55)";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x, Y_DIV - 26);
        ctx.lineTo(x, Y_DIV + 30);
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

        // panel
        ctx.save();
        ctx.fillStyle = "#f6f9fc";
        roundRect(MAG.x, MAG.y, MAG.w, MAG.h, 12);
        ctx.fill();
        ctx.strokeStyle = "#cdd6df";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.clip();

        // faint bands: beam (top) and vernier plate (bottom)
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
            const len = major ? 34 : (mm % 5 === 0 ? 26 : 18);
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
            const len = hit ? 34 : 20;
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
        drawBeam();
        drawBlock();
        drawSlider();
        drawAlignGuide();
        drawMainScale();
        drawVernierScale();
        updateReadout();
    }

    /* ---------- readout ---------- */
    function updateReadout() {
        const r = reading();
        const d = M().decimals;
        const vern = r.k * r.prec;
        document.getElementById("rMain").textContent = r.mainMM + " mm";
        document.getElementById("rVern").innerHTML =
            r.k + " &times; " + r.prec.toFixed(2) + " = " + vern.toFixed(d) + " mm";
        document.getElementById("rTotal").textContent = r.total.toFixed(d) + " mm";
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
        const onSlider = p.x >= xv - 22 && p.x <= xv + verSpan() * PPM + 22 &&
                         p.y >= BEAM_TOP - 30 && p.y <= JAW_BOT;
        const onBlock = p.x >= X0 && p.x <= xv &&
                        p.y >= BLOCK_TOP - 6 && p.y <= BLOCK_BOT + 6;
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
        steps = Math.round(v * full());          // keep the physical measurement
        steps = Math.max(0, Math.min(MAX_VALUE * full(), steps));
        draw();
    });

    document.getElementById("resetBtn").addEventListener("click", function () {
        steps = Math.round(0 * full());
        draw();
    });

    draw();
})();
