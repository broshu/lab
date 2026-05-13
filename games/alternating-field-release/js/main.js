(() => {
    const motionCanvas = document.getElementById("motionCanvas");
    const graphCanvas = document.getElementById("graphCanvas");
    const mctx = motionCanvas.getContext("2d");
    const gctx = graphCanvas.getContext("2d");

    const ui = {
        phaseInput: document.getElementById("phaseInput"),
        phaseLabel: document.getElementById("phaseLabel"),
        phaseReadout: document.getElementById("phaseReadout"),
        driftReadout: document.getElementById("driftReadout"),
        resultReadout: document.getElementById("resultReadout"),
        speedReadout: document.getElementById("speedReadout"),
        releaseBtn: document.getElementById("releaseBtn"),
        pauseBtn: document.getElementById("pauseBtn"),
        resetBtn: document.getElementById("resetBtn")
    };

    const C = {
        accel: 0.86,
        timeScale: 0.115,
        plateLimit: 1,
        maxTrail: 130,
        graphDuration: 2,
        grid: 40,
        particleRadius: 10
    };

    const state = {
        selectedPhase: 0.625,
        phase: 0.625,
        x: 0,
        v: 0,
        elapsed: 0,
        running: false,
        paused: false,
        result: null,
        trail: [],
        lastFrame: 0
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const wrap = (value) => ((value % 1) + 1) % 1;
    const fieldSignAt = (phase) => wrap(phase) < 0.5 ? 1 : -1;
    const accelerationAt = (phase) => fieldSignAt(phase) * C.accel;

    function resizeCanvas(canvas, context) {
        const ratio = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width);
        const cssHeight = Math.max(1, rect.height);
        canvas.width = Math.round(cssWidth * ratio);
        canvas.height = Math.round(cssHeight * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        canvas.dataset.cssWidth = cssWidth;
        canvas.dataset.cssHeight = cssHeight;
    }

    function canvasSize(canvas) {
        return {
            width: Number(canvas.dataset.cssWidth) || canvas.width,
            height: Number(canvas.dataset.cssHeight) || canvas.height
        };
    }

    function phaseText(value) {
        const scaled = value;
        const candidates = [
            [0, "0"],
            [0.125, "T/8"],
            [0.25, "T/4"],
            [0.5, "T/2"],
            [0.625, "5T/8"],
            [0.75, "3T/4"],
            [0.875, "7T/8"],
            [1, "T"],
            [1.25, "5T/4"],
            [1.5, "3T/2"],
            [1.75, "7T/4"],
            [2, "2T"]
        ];
        const hit = candidates.find(([phase]) => Math.abs(phase - scaled) < 0.004);
        return hit ? hit[1] : `${scaled.toFixed(3)}T`;
    }

    function driftForPhase(phase) {
        let x = 0;
        let v = 0;
        const steps = 900;
        const dt = 1 / steps;
        for (let i = 0; i < steps; i++) {
            const t = phase + i * dt;
            v += accelerationAt(t) * dt;
            x += v * dt;
        }
        return x;
    }

    function syncLabels() {
        const text = phaseText(state.selectedPhase);
        const drift = driftForPhase(state.selectedPhase);
        const direction = drift < 0 ? "to plate A" : "to plate B";
        ui.phaseLabel.textContent = text;
        ui.phaseReadout.textContent = text;
        ui.driftReadout.textContent = direction;
        ui.speedReadout.textContent = Math.abs(state.v).toFixed(2);

        drawGraphs();
    }

    function resetMotion(keepResult = false) {
        state.phase = state.selectedPhase;
        state.x = 0;
        state.v = 0;
        state.elapsed = 0;
        state.running = false;
        state.paused = false;
        state.result = keepResult ? state.result : null;
        state.trail = [];
        ui.pauseBtn.textContent = "Pause";
        ui.resultReadout.textContent = state.result || "ready";
        syncLabels();
        drawMotion();
    }

    function releaseParticle() {
        state.phase = state.selectedPhase;
        state.x = 0;
        state.v = 0;
        state.elapsed = 0;
        state.running = true;
        state.paused = false;
        state.result = null;
        state.trail = [];
        state.lastFrame = 0;
        ui.pauseBtn.textContent = "Pause";
        ui.resultReadout.textContent = "running";
        syncLabels();
    }

    function update(dtSeconds) {
        if (!state.running || state.paused || state.result) return;

        const dt = clamp(dtSeconds * C.timeScale, 0, 0.012);
        const a = accelerationAt(state.phase);
        state.v += a * dt;
        state.x += state.v * dt;
        state.phase = wrap(state.phase + dt);
        state.elapsed += dt;

        state.trail.push({
            x: state.x,
            v: state.v,
            phase: state.phase,
            life: 1
        });

        const keep = Math.round(18 + clamp(Math.abs(state.v) * 170, 0, C.maxTrail));
        if (state.trail.length > keep) {
            state.trail.splice(0, state.trail.length - keep);
        }
        for (const point of state.trail) {
            point.life *= 0.992;
        }

        if (state.x <= -C.plateLimit || state.x >= C.plateLimit) {
            state.x = clamp(state.x, -C.plateLimit, C.plateLimit);
            state.result = state.x < 0 ? "hit plate A" : "hit plate B";
            state.running = false;
            ui.resultReadout.textContent = state.result;
        }
        syncLabels();
    }

    function worldToScreenX(x, leftPlate, rightPlate) {
        const center = (leftPlate + rightPlate) / 2;
        return center + x * (rightPlate - leftPlate) / 2;
    }

    function drawMotion() {
        const { width, height } = canvasSize(motionCanvas);
        const leftPlate = Math.max(78, width * 0.14);
        const rightPlate = width - leftPlate;
        const centerY = height * 0.52;
        const plateTop = height * 0.18;
        const plateBottom = height * 0.84;
        const fieldSign = fieldSignAt(state.phase);
        const particleX = worldToScreenX(state.x, leftPlate, rightPlate);

        mctx.clearRect(0, 0, width, height);
        drawGrid(mctx, width, height);
        drawPlates(leftPlate, rightPlate, plateTop, plateBottom, fieldSign);
        drawFieldArrows(leftPlate, rightPlate, centerY, fieldSign);
        drawPointP(leftPlate, rightPlate, centerY);
        drawTrail(leftPlate, rightPlate, centerY);
        drawParticle(particleX, centerY);
        drawMotionLabels(leftPlate, rightPlate, centerY, fieldSign);
    }

    function drawGrid(ctx, width, height) {
        ctx.strokeStyle = "rgba(36, 104, 166, 0.08)";
        ctx.lineWidth = 1;
        for (let x = C.grid; x < width; x += C.grid) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = C.grid; y < height; y += C.grid) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    }

    function drawPlates(leftPlate, rightPlate, top, bottom, fieldSign) {
        const leftPositive = fieldSign > 0;
        drawPlate(leftPlate, top, bottom, "A", leftPositive);
        drawPlate(rightPlate, top, bottom, "B", !leftPositive);
    }

    function drawPlate(x, top, bottom, label, positive) {
        mctx.strokeStyle = "#1c2735";
        mctx.lineWidth = 4;
        mctx.beginPath();
        mctx.moveTo(x, top);
        mctx.lineTo(x, bottom);
        mctx.stroke();

        mctx.fillStyle = positive ? "#d64f62" : "#2468a6";
        mctx.font = "700 18px Avenir Next, Segoe UI, sans-serif";
        mctx.textAlign = "center";
        mctx.fillText(positive ? "+" : "-", x, top - 18);

        mctx.fillStyle = "#172333";
        mctx.font = "700 28px Avenir Next, Segoe UI, sans-serif";
        mctx.fillText(label, x, top - 48);
    }

    function drawFieldArrows(leftPlate, rightPlate, centerY, fieldSign) {
        const start = fieldSign > 0 ? leftPlate + 44 : rightPlate - 44;
        const end = fieldSign > 0 ? rightPlate - 44 : leftPlate + 44;
        const color = fieldSign > 0 ? "#2468a6" : "#21867a";
        const rows = [-62, 0, 62];

        mctx.strokeStyle = color;
        mctx.fillStyle = color;
        mctx.lineWidth = 2.4;
        rows.forEach((offset) => drawArrow(start, centerY + offset, end, centerY + offset));
    }

    function drawArrow(x1, y1, x2, y2) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = 12;
        mctx.beginPath();
        mctx.moveTo(x1, y1);
        mctx.lineTo(x2, y2);
        mctx.stroke();
        mctx.beginPath();
        mctx.moveTo(x2, y2);
        mctx.lineTo(x2 - Math.cos(angle - 0.55) * head, y2 - Math.sin(angle - 0.55) * head);
        mctx.lineTo(x2 - Math.cos(angle + 0.55) * head, y2 - Math.sin(angle + 0.55) * head);
        mctx.closePath();
        mctx.fill();
    }

    function drawPointP(leftPlate, rightPlate, centerY) {
        const center = (leftPlate + rightPlate) / 2;
        mctx.fillStyle = "rgba(23, 35, 51, 0.78)";
        mctx.beginPath();
        mctx.arc(center, centerY + 48, 4, 0, Math.PI * 2);
        mctx.fill();
        mctx.font = "700 18px Avenir Next, Segoe UI, sans-serif";
        mctx.textAlign = "center";
        mctx.fillText("P", center, centerY + 76);
    }

    function drawTrail(leftPlate, rightPlate, centerY) {
        const speed = Math.abs(state.v);
        const tailLimit = 20 + clamp(speed * 170, 0, C.maxTrail);
        const recent = state.trail.slice(-Math.round(tailLimit));

        for (let i = 0; i < recent.length; i++) {
            const point = recent[i];
            const alpha = (i + 1) / Math.max(1, recent.length);
            const x = worldToScreenX(point.x, leftPlate, rightPlate);
            const r = 3 + alpha * 7 + speed * 4;
            const hot = Math.round(230 - alpha * 80);
            mctx.fillStyle = `rgba(214, ${hot}, 78, ${0.08 + alpha * 0.34})`;
            mctx.beginPath();
            mctx.arc(x, centerY, r, 0, Math.PI * 2);
            mctx.fill();
        }

        if (recent.length > 1) {
            mctx.strokeStyle = "rgba(111, 91, 184, 0.36)";
            mctx.lineWidth = 2;
            mctx.beginPath();
            recent.forEach((point, index) => {
                const x = worldToScreenX(point.x, leftPlate, rightPlate);
                if (index === 0) mctx.moveTo(x, centerY + 28);
                else mctx.lineTo(x, centerY + 28);
            });
            mctx.stroke();
        }
    }

    function drawParticle(x, y) {
        const glow = 22 + Math.abs(state.v) * 20;
        const grad = mctx.createRadialGradient(x, y, 3, x, y, glow);
        grad.addColorStop(0, "rgba(255, 249, 215, 0.95)");
        grad.addColorStop(0.3, "rgba(230, 157, 40, 0.62)");
        grad.addColorStop(1, "rgba(230, 157, 40, 0)");
        mctx.fillStyle = grad;
        mctx.beginPath();
        mctx.arc(x, y, glow, 0, Math.PI * 2);
        mctx.fill();

        mctx.fillStyle = "#f7c44d";
        mctx.strokeStyle = "#8f5d10";
        mctx.lineWidth = 2;
        mctx.beginPath();
        mctx.arc(x, y, C.particleRadius, 0, Math.PI * 2);
        mctx.fill();
        mctx.stroke();

        mctx.fillStyle = "#5a3710";
        mctx.font = "800 13px Avenir Next, Segoe UI, sans-serif";
        mctx.textAlign = "center";
        mctx.textBaseline = "middle";
        mctx.fillText("+", x, y + 0.5);
        mctx.textBaseline = "alphabetic";
    }

    function drawMotionLabels(leftPlate, rightPlate, centerY, fieldSign) {
        const highPlate = fieldSign > 0 ? "A" : "B";
        const lowPlate = fieldSign > 0 ? "B" : "A";
        const phase = wrap(state.phase);
        const { height } = canvasSize(motionCanvas);
        const infoY = Math.max(centerY + 120, height - 78);
        mctx.fillStyle = "#25384d";
        mctx.font = "700 14px Avenir Next, Segoe UI, sans-serif";
        mctx.textAlign = "left";
        mctx.fillText(`UAB = ${phase < 0.5 ? "+U0" : "-U0"}  E: ${highPlate} -> ${lowPlate}`, 24, infoY);
        mctx.fillText(`t = ${state.elapsed.toFixed(2)}T`, 24, infoY + 24);
    }

    function drawGraphs() {
        const { width, height } = canvasSize(graphCanvas);
        const pad = { left: 58, right: 28, top: 28, bottom: 36 };
        const midU = height * 0.28;
        const midV = height * 0.68;
        const graphW = width - pad.left - pad.right;
        const uAmp = height * 0.12;
        const vAmp = height * 0.17;

        gctx.clearRect(0, 0, width, height);
        drawGraphGrid(width, height, pad);
        drawAxes(pad.left, midU, graphW, "UAB");
        drawAxes(pad.left, midV, graphW, "v");
        drawVoltageWave(pad.left, midU, graphW, uAmp);
        drawVelocityWave(pad.left, midV, graphW, vAmp);
        drawTimeMarker(pad.left, midU, midV, graphW);
        drawGraphTicks(pad.left, midU, midV, graphW);
    }

    function drawGraphGrid(width, height, pad) {
        gctx.strokeStyle = "rgba(36, 104, 166, 0.08)";
        gctx.lineWidth = 1;
        for (let x = pad.left; x < width - pad.right; x += 48) {
            gctx.beginPath();
            gctx.moveTo(x, 10);
            gctx.lineTo(x, height - 18);
            gctx.stroke();
        }
    }

    function drawAxes(x, y, graphW, label) {
        gctx.strokeStyle = "#25384d";
        gctx.fillStyle = "#25384d";
        gctx.lineWidth = 1.8;
        gctx.beginPath();
        gctx.moveTo(x, y);
        gctx.lineTo(x + graphW, y);
        gctx.stroke();
        gctx.beginPath();
        gctx.moveTo(x, y);
        gctx.lineTo(x, y - 72);
        gctx.stroke();
        gctx.font = "700 14px Avenir Next, Segoe UI, sans-serif";
        gctx.textAlign = "left";
        gctx.fillText(label, x + 8, y - 78);
    }

    function xForTime(startX, graphW, time) {
        return startX + (time / C.graphDuration) * graphW;
    }

    function drawVoltageWave(startX, midY, graphW, amp) {
        gctx.strokeStyle = "#172333";
        gctx.lineWidth = 2.6;
        gctx.beginPath();
        let time = 0;
        let first = true;
        while (time < C.graphDuration - 1e-6) {
            const phase = wrap(time);
            const sign = fieldSignAt(time);
            const nextSwitch = time + (phase < 0.5 ? 0.5 - phase : 1 - phase);
            const end = Math.min(nextSwitch, C.graphDuration);
            const y = midY - sign * amp;
            const x1 = xForTime(startX, graphW, time);
            const x2 = xForTime(startX, graphW, end);
            if (first) {
                gctx.moveTo(x1, y);
                first = false;
            } else {
                gctx.lineTo(x1, y);
            }
            gctx.lineTo(x2, y);
            time = end;
        }
        gctx.stroke();

        gctx.setLineDash([7, 6]);
        gctx.strokeStyle = "rgba(23, 35, 51, 0.55)";
        for (let t = 0.25; t <= C.graphDuration + 1e-6; t += 0.25) {
            const x = xForTime(startX, graphW, t);
            gctx.beginPath();
            gctx.moveTo(x, midY - amp);
            gctx.lineTo(x, midY + amp);
            gctx.stroke();
        }
        gctx.setLineDash([]);
    }

    function drawTimeMarker(startX, midU, midV, graphW) {
        const markerTime = clamp(state.selectedPhase + state.elapsed, 0, C.graphDuration);
        const x = xForTime(startX, graphW, markerTime);
        gctx.strokeStyle = "#d64f62";
        gctx.lineWidth = 2;
        gctx.setLineDash([5, 5]);
        gctx.beginPath();
        gctx.moveTo(x, midU - 72);
        gctx.lineTo(x, midV + 78);
        gctx.stroke();
        gctx.setLineDash([]);

        gctx.fillStyle = "#d64f62";
        gctx.font = "700 13px Avenir Next, Segoe UI, sans-serif";
        gctx.textAlign = "center";
        gctx.fillText(`t = ${phaseText(markerTime)}`, x, midU - 82);
    }

    function drawVelocityWave(startX, midY, graphW, amp) {
        const points = [];
        let v = 0;
        const sampleCount = 360;
        const release = state.selectedPhase;
        const visibleDuration = Math.max(0, C.graphDuration - release);
        let maxAbs = 0.001;
        for (let i = 0; i <= sampleCount; i++) {
            const dt = (visibleDuration * i) / sampleCount;
            if (i > 0) {
                const previous = release + (visibleDuration * (i - 1)) / sampleCount;
                v += accelerationAt(previous) * (visibleDuration / sampleCount);
            }
            maxAbs = Math.max(maxAbs, Math.abs(v));
            points.push({ t: release + dt, local: dt, v });
        }

        const scale = amp / maxAbs;
        gctx.strokeStyle = "#6f5bb8";
        gctx.lineWidth = 2.4;
        gctx.beginPath();
        points.forEach((point, index) => {
            const x = xForTime(startX, graphW, point.t);
            const y = midY - point.v * scale;
            if (index === 0) gctx.moveTo(x, y);
            else gctx.lineTo(x, y);
        });
        gctx.stroke();

        gctx.fillStyle = "rgba(111, 91, 184, 0.12)";
        gctx.beginPath();
        points.forEach((point, index) => {
            const x = xForTime(startX, graphW, point.t);
            const y = midY - point.v * scale;
            if (index === 0) gctx.moveTo(x, midY);
            gctx.lineTo(x, y);
        });
        gctx.lineTo(xForTime(startX, graphW, C.graphDuration), midY);
        gctx.closePath();
        gctx.fill();
    }

    function drawGraphTicks(startX, midU, midV, graphW) {
        const ticks = [
            [0, "0"],
            [0.25, "T/4"],
            [0.5, "T/2"],
            [0.75, "3T/4"],
            [1, "T"],
            [1.25, "5T/4"],
            [1.5, "3T/2"],
            [1.75, "7T/4"],
            [2, "2T"]
        ];
        gctx.fillStyle = "#42546a";
        gctx.font = "12px Avenir Next, Segoe UI, sans-serif";
        gctx.textAlign = "center";
        ticks.forEach(([t, label]) => {
            const x = xForTime(startX, graphW, t);
            gctx.fillRect(x - 1, midU - 4, 2, 8);
            gctx.fillRect(x - 1, midV - 4, 2, 8);
            gctx.fillText(label, x, midU + 22);
        });
        gctx.fillText("time", startX + graphW - 22, midV + 26);
    }

    function onPhaseChange(value) {
        state.selectedPhase = Number(value);
        if (!state.running) {
            state.phase = state.selectedPhase;
        }
        ui.phaseInput.value = String(state.selectedPhase);
        syncLabels();
        if (!state.running) drawMotion();
    }

    function frame(timestamp) {
        if (!state.lastFrame) state.lastFrame = timestamp;
        const dt = (timestamp - state.lastFrame) / 1000;
        state.lastFrame = timestamp;
        update(dt);
        drawMotion();
        requestAnimationFrame(frame);
    }

    ui.phaseInput.addEventListener("input", () => onPhaseChange(ui.phaseInput.value));
    ui.releaseBtn.addEventListener("click", releaseParticle);
    ui.pauseBtn.addEventListener("click", () => {
        if (!state.running || state.result) return;
        state.paused = !state.paused;
        ui.pauseBtn.textContent = state.paused ? "Resume" : "Pause";
    });
    ui.resetBtn.addEventListener("click", () => resetMotion(false));
    window.addEventListener("resize", () => {
        resizeCanvas(motionCanvas, mctx);
        resizeCanvas(graphCanvas, gctx);
        drawMotion();
        drawGraphs();
    });

    resizeCanvas(motionCanvas, mctx);
    resizeCanvas(graphCanvas, gctx);
    resetMotion(false);
    requestAnimationFrame(frame);
})();
