(() => {
    const motionCanvas = document.getElementById("motionCanvas");
    const graphCanvas = document.getElementById("graphCanvas");
    const mctx = motionCanvas.getContext("2d");
    const gctx = graphCanvas.getContext("2d");

    const ui = {
        phaseInput: document.getElementById("phaseInput"),
        phaseLabel: document.getElementById("phaseLabel"),
        phaseReadout: document.getElementById("phaseReadout"),
        exitReadout: document.getElementById("exitReadout"),
        voltageReadout: document.getElementById("voltageReadout"),
        countReadout: document.getElementById("countReadout"),
        playBtn: document.getElementById("playBtn"),
        clearBtn: document.getElementById("clearBtn"),
        resetBtn: document.getElementById("resetBtn"),
        presetButtons: [...document.querySelectorAll(".preset-button")]
    };

    const C = {
        accel: 4,
        vx: 2,
        plateLength: 2,
        gap: 1,
        period: 1,
        spawnInterval: 0.07,
        timeScale: 0.18,
        maxParticles: 120,
        graphDuration: 2,
        grid: 40
    };

    const state = {
        time: 0,
        selectedPhase: 0.25,
        running: true,
        particles: [],
        nextSpawn: 0,
        lastFrame: 0
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const wrap = (value) => ((value % 1) + 1) % 1;
    const voltageSignAt = (time) => wrap(time) < 0.5 ? 1 : -1;
    const accelAt = (time) => voltageSignAt(time) * C.accel;

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
        const candidates = [
            [0, "0"],
            [0.125, "T/8"],
            [0.25, "T/4"],
            [0.375, "3T/8"],
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
        const hit = candidates.find(([phase]) => Math.abs(phase - value) < 0.004);
        return hit ? hit[1] : `${value.toFixed(3)}T`;
    }

    function trajectoryAt(release, age) {
        let vy = 0;
        let y = 0;
        let t = release;
        let remaining = Math.max(0, age);
        while (remaining > 1e-9) {
            const phase = wrap(t);
            const stepToSwitch = phase < 0.5 ? 0.5 - phase : 1 - phase;
            const dt = Math.min(remaining, stepToSwitch || 0.5);
            const a = accelAt(t);
            y += vy * dt + 0.5 * a * dt * dt;
            vy += a * dt;
            t += dt;
            remaining -= dt;
        }
        return {
            x: C.vx * age,
            y,
            vy
        };
    }

    function exitYForPhase(phase) {
        return trajectoryAt(phase, 1).y;
    }

    function exitText(y) {
        if (Math.abs(y) < 0.035) return "plate P edge";
        if (Math.abs(y - 0.5) < 0.04) return "midline";
        if (Math.abs(y - 1) < 0.04) return "plate Q edge";
        if (y < 0) return "above plate P";
        if (y > 1) return "below plate Q";
        return `${y.toFixed(2)}d from P`;
    }

    function syncLabels() {
        const text = phaseText(state.selectedPhase);
        ui.phaseLabel.textContent = text;
        ui.phaseReadout.textContent = text;
        ui.exitReadout.textContent = exitText(exitYForPhase(state.selectedPhase));
        ui.voltageReadout.textContent = voltageSignAt(state.time) > 0 ? "+U0" : "-U0";
        ui.countReadout.textContent = String(state.particles.length);
        ui.presetButtons.forEach((button) => {
            button.classList.toggle("active", Math.abs(Number(button.dataset.phase) - state.selectedPhase) < 0.004);
        });
        drawGraphs();
    }

    function spawnParticle(release, highlighted = false) {
        state.particles.push({
            release,
            highlighted,
            trail: []
        });
        if (state.particles.length > C.maxParticles) {
            state.particles.splice(0, state.particles.length - C.maxParticles);
        }
    }

    function resetSimulation() {
        state.time = 0;
        state.nextSpawn = 0;
        state.particles = [];
        spawnParticle(state.selectedPhase, true);
        syncLabels();
        drawMotion();
    }

    function clearStream() {
        state.particles = [];
        state.nextSpawn = state.time;
        spawnParticle(state.selectedPhase, true);
        syncLabels();
    }

    function update(dtSeconds) {
        if (!state.running) return;
        const dt = clamp(dtSeconds * C.timeScale, 0, 0.018);
        state.time += dt;
        if (state.time > C.graphDuration) {
            state.time = 0;
            state.nextSpawn = 0;
            state.particles = [];
            spawnParticle(state.selectedPhase, true);
        }

        while (state.nextSpawn <= state.time) {
            spawnParticle(state.nextSpawn, false);
            state.nextSpawn += C.spawnInterval;
        }

        const highlightAge = state.time - state.selectedPhase;
        const hasHighlight = state.particles.some((particle) => particle.highlighted);
        if (!hasHighlight && highlightAge >= 0 && highlightAge <= 1.15) {
            spawnParticle(state.selectedPhase, true);
        }

        for (const particle of state.particles) {
            const age = state.time - particle.release;
            if (age < 0 || age > 1.2) continue;
            const pos = trajectoryAt(particle.release, Math.min(age, 1));
            particle.trail.push({ x: pos.x, y: pos.y });
            if (particle.trail.length > 36) {
                particle.trail.shift();
            }
        }

        state.particles = state.particles.filter((particle) => {
            const age = state.time - particle.release;
            return particle.highlighted || (age > -0.02 && age < 1.18);
        });
        syncLabels();
    }

    function worldToScreen(x, y, bounds) {
        return {
            x: bounds.left + (x / C.plateLength) * bounds.width,
            y: bounds.top + y * bounds.gapHeight
        };
    }

    function drawMotion() {
        const { width, height } = canvasSize(motionCanvas);
        const bounds = {
            left: Math.max(90, width * 0.12),
            right: width - Math.max(72, width * 0.08),
            top: height * 0.24,
            bottom: height * 0.72
        };
        bounds.width = bounds.right - bounds.left;
        bounds.gapHeight = bounds.bottom - bounds.top;

        mctx.clearRect(0, 0, width, height);
        drawGrid(mctx, width, height);
        drawPlates(bounds);
        drawSource(bounds);
        drawField(bounds);
        drawParticles(bounds);
        drawMotionLabels(bounds);
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

    function drawPlates(bounds) {
        mctx.strokeStyle = "#1c2735";
        mctx.lineWidth = 8;
        mctx.beginPath();
        mctx.moveTo(bounds.left, bounds.top);
        mctx.lineTo(bounds.right, bounds.top);
        mctx.moveTo(bounds.left, bounds.bottom);
        mctx.lineTo(bounds.right, bounds.bottom);
        mctx.stroke();

        const sign = voltageSignAt(state.time);
        mctx.fillStyle = sign > 0 ? "#d64f62" : "#2468a6";
        mctx.font = "700 18px Avenir Next, Segoe UI, sans-serif";
        mctx.textAlign = "right";
        mctx.fillText(sign > 0 ? "+" : "-", bounds.left - 18, bounds.top + 6);
        mctx.fillStyle = sign > 0 ? "#2468a6" : "#d64f62";
        mctx.fillText(sign > 0 ? "-" : "+", bounds.left - 18, bounds.bottom + 6);

        mctx.fillStyle = "#172333";
        mctx.font = "700 28px Avenir Next, Segoe UI, sans-serif";
        mctx.textAlign = "center";
        mctx.fillText("P", bounds.left - 56, bounds.top - 18);
        mctx.fillText("Q", bounds.left - 56, bounds.bottom + 38);
    }

    function drawSource(bounds) {
        const source = worldToScreen(0, 0, bounds);
        mctx.fillStyle = "#172333";
        mctx.fillRect(source.x - 72, source.y + 18, 48, 18);
        mctx.fillStyle = "#172333";
        mctx.font = "700 28px Avenir Next, Segoe UI, sans-serif";
        mctx.textAlign = "center";
        mctx.fillText("A", source.x - 44, source.y + 72);
    }

    function drawField(bounds) {
        const sign = voltageSignAt(state.time);
        const xPositions = [0.25, 0.5, 0.75].map((p) => bounds.left + p * bounds.width);
        const y1 = sign > 0 ? bounds.top + 26 : bounds.bottom - 26;
        const y2 = sign > 0 ? bounds.bottom - 26 : bounds.top + 26;
        mctx.strokeStyle = sign > 0 ? "#2468a6" : "#21867a";
        mctx.fillStyle = mctx.strokeStyle;
        mctx.lineWidth = 2.2;
        xPositions.forEach((x) => drawArrow(x, y1, x, y2));
    }

    function drawArrow(x1, y1, x2, y2) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = 10;
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

    function drawParticles(bounds) {
        const ordered = [...state.particles].sort((a, b) => Number(a.highlighted) - Number(b.highlighted));
        for (const particle of ordered) {
            const age = state.time - particle.release;
            if (age < 0 || age > 1.15) continue;
            const pos = trajectoryAt(particle.release, Math.min(age, 1));
            const screen = worldToScreen(pos.x, pos.y, bounds);
            if (screen.x < bounds.left - 8 || screen.x > bounds.right + 12) continue;

            drawTrail(particle, bounds);
            const radius = particle.highlighted ? 9 : 5;
            const glow = particle.highlighted ? 24 : 13;
            const grad = mctx.createRadialGradient(screen.x, screen.y, 2, screen.x, screen.y, glow);
            grad.addColorStop(0, particle.highlighted ? "rgba(255, 249, 215, 0.98)" : "rgba(235, 241, 255, 0.95)");
            grad.addColorStop(0.35, particle.highlighted ? "rgba(230, 157, 40, 0.7)" : "rgba(111, 91, 184, 0.45)");
            grad.addColorStop(1, "rgba(111, 91, 184, 0)");
            mctx.fillStyle = grad;
            mctx.beginPath();
            mctx.arc(screen.x, screen.y, glow, 0, Math.PI * 2);
            mctx.fill();

            mctx.fillStyle = particle.highlighted ? "#f7c44d" : "#6f5bb8";
            mctx.strokeStyle = particle.highlighted ? "#8f5d10" : "#46347a";
            mctx.lineWidth = 1.8;
            mctx.beginPath();
            mctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
            mctx.fill();
            mctx.stroke();
        }
    }

    function drawTrail(particle, bounds) {
        if (particle.trail.length < 2) return;
        mctx.strokeStyle = particle.highlighted ? "rgba(230, 157, 40, 0.55)" : "rgba(111, 91, 184, 0.2)";
        mctx.lineWidth = particle.highlighted ? 2.4 : 1.2;
        mctx.beginPath();
        particle.trail.forEach((point, index) => {
            const screen = worldToScreen(point.x, point.y, bounds);
            if (index === 0) mctx.moveTo(screen.x, screen.y);
            else mctx.lineTo(screen.x, screen.y);
        });
        mctx.stroke();
    }

    function drawMotionLabels(bounds) {
        const sign = voltageSignAt(state.time);
        mctx.fillStyle = "#25384d";
        mctx.font = "700 14px Avenir Next, Segoe UI, sans-serif";
        mctx.textAlign = "left";
        mctx.fillText(`UPQ = ${sign > 0 ? "+U0" : "-U0"}`, 24, 34);
        mctx.fillText(`t = ${phaseText(wrap(state.time))}`, 24, 58);
        mctx.fillText(`2d`, bounds.left + bounds.width / 2 - 8, bounds.bottom + 46);
        mctx.fillText(`d`, bounds.right + 18, bounds.top + bounds.gapHeight / 2);
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
        drawAxes(pad.left, midU, graphW, "UPQ");
        drawAxes(pad.left, midV, graphW, "vy");
        drawVoltageWave(pad.left, midU, graphW, uAmp);
        drawVelocityWave(pad.left, midV, graphW, vAmp);
        drawMarkers(pad.left, midU, midV, graphW);
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
            const sign = voltageSignAt(time);
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
    }

    function drawVelocityWave(startX, midY, graphW, amp) {
        const release = state.selectedPhase;
        const visibleDuration = Math.max(0, C.graphDuration - release);
        const sampleCount = 360;
        const points = [];
        let vy = 0;
        let maxAbs = 0.001;
        for (let i = 0; i <= sampleCount; i++) {
            const age = (visibleDuration * i) / sampleCount;
            if (i > 0) {
                const previous = release + (visibleDuration * (i - 1)) / sampleCount;
                vy += accelAt(previous) * (visibleDuration / sampleCount);
            }
            maxAbs = Math.max(maxAbs, Math.abs(vy));
            points.push({ t: release + age, vy });
        }

        const scale = amp / maxAbs;
        gctx.strokeStyle = "#6f5bb8";
        gctx.lineWidth = 2.4;
        gctx.beginPath();
        points.forEach((point, index) => {
            const x = xForTime(startX, graphW, point.t);
            const y = midY - point.vy * scale;
            if (index === 0) gctx.moveTo(x, y);
            else gctx.lineTo(x, y);
        });
        gctx.stroke();

        gctx.fillStyle = "rgba(111, 91, 184, 0.12)";
        gctx.beginPath();
        points.forEach((point, index) => {
            const x = xForTime(startX, graphW, point.t);
            const y = midY - point.vy * scale;
            if (index === 0) gctx.moveTo(x, midY);
            gctx.lineTo(x, y);
        });
        gctx.lineTo(xForTime(startX, graphW, C.graphDuration), midY);
        gctx.closePath();
        gctx.fill();
    }

    function drawMarkers(startX, midU, midV, graphW) {
        const releaseX = xForTime(startX, graphW, state.selectedPhase);
        const nowX = xForTime(startX, graphW, clamp(state.time, 0, C.graphDuration));
        drawMarker(releaseX, midU, midV, "#d64f62", `release ${phaseText(state.selectedPhase)}`);
        drawMarker(nowX, midU, midV, "#e69d28", `t = ${phaseText(clamp(state.time, 0, C.graphDuration))}`);
    }

    function drawMarker(x, midU, midV, color, label) {
        gctx.strokeStyle = color;
        gctx.lineWidth = 2;
        gctx.setLineDash([5, 5]);
        gctx.beginPath();
        gctx.moveTo(x, midU - 72);
        gctx.lineTo(x, midV + 78);
        gctx.stroke();
        gctx.setLineDash([]);

        gctx.fillStyle = color;
        gctx.font = "700 13px Avenir Next, Segoe UI, sans-serif";
        gctx.textAlign = "center";
        gctx.fillText(label, x, midU - 82);
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
            gctx.setLineDash([6, 6]);
            gctx.strokeStyle = "rgba(23, 35, 51, 0.35)";
            gctx.beginPath();
            gctx.moveTo(x, midU - 46);
            gctx.lineTo(x, midU + 34);
            gctx.stroke();
            gctx.setLineDash([]);
            gctx.fillRect(x - 1, midV - 4, 2, 8);
            gctx.fillText(label, x, midU + 22);
        });
        gctx.fillText("time", startX + graphW - 22, midV + 26);
    }

    function onPhaseChange(value) {
        state.selectedPhase = Number(value);
        state.particles = state.particles.filter((particle) => !particle.highlighted);
        if (state.time >= state.selectedPhase && state.time <= state.selectedPhase + 1.15) {
            spawnParticle(state.selectedPhase, true);
        }
        ui.phaseInput.value = String(state.selectedPhase);
        syncLabels();
        drawMotion();
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
    ui.presetButtons.forEach((button) => {
        button.addEventListener("click", () => onPhaseChange(button.dataset.phase));
    });
    ui.playBtn.addEventListener("click", () => {
        state.running = !state.running;
        ui.playBtn.textContent = state.running ? "Pause" : "Play";
    });
    ui.clearBtn.addEventListener("click", clearStream);
    ui.resetBtn.addEventListener("click", resetSimulation);
    window.addEventListener("resize", () => {
        resizeCanvas(motionCanvas, mctx);
        resizeCanvas(graphCanvas, gctx);
        drawMotion();
        drawGraphs();
    });

    resizeCanvas(motionCanvas, mctx);
    resizeCanvas(graphCanvas, gctx);
    resetSimulation();
    requestAnimationFrame(frame);
})();
