(() => {
    const screen = document.getElementById("screenCanvas");
    const beam = document.getElementById("beamCanvas");
    const sctx = screen.getContext("2d");
    const bctx = beam.getContext("2d");

    const ui = {
        voltageX: document.getElementById("voltageX"),
        voltageY: document.getElementById("voltageY"),
        intensity: document.getElementById("intensity"),
        modeButtons: [...document.querySelectorAll(".mode-button")],
        trace: document.getElementById("traceToggle"),
        animate: document.getElementById("animateToggle"),
        reset: document.getElementById("resetBtn"),
        voltageXLabel: document.getElementById("voltageXLabel"),
        voltageYLabel: document.getElementById("voltageYLabel"),
        intensityLabel: document.getElementById("intensityLabel"),
        xShift: document.getElementById("xShift"),
        yShift: document.getElementById("yShift"),
        fieldXLabel: document.getElementById("fieldXLabel"),
        fieldYLabel: document.getElementById("fieldYLabel")
    };

    const state = {
        vx: 0,
        vy: 0,
        manualX: 0,
        manualY: 0,
        xMode: "manual",
        yMode: "manual",
        intensity: 72,
        time: 0,
        sweepPhase: 0,
        history: []
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const signed = (value) => `${value > 0 ? "+" : ""}${value.toFixed(0)}`;

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

    function computeVoltages(time) {
        state.sweepPhase = (time / 3.2) % 1;
        state.vx = state.xMode === "sweep"
            ? -120 + state.sweepPhase * 240
            : state.manualX;
        state.vy = state.yMode === "sine"
            ? 96 * Math.sin(state.sweepPhase * Math.PI * 4)
            : state.manualY;
    }

    function updateReadouts() {
        if (state.xMode === "sweep") {
            ui.voltageX.value = String(Math.round(state.vx));
        }
        if (state.yMode === "sine") {
            ui.voltageY.value = String(Math.round(state.vy));
        }
        state.intensity = Number(ui.intensity.value);
        ui.voltageXLabel.textContent = `${signed(state.vx)} V`;
        ui.voltageYLabel.textContent = `${signed(state.vy)} V`;
        ui.intensityLabel.textContent = `${state.intensity}%`;
        ui.xShift.textContent = (state.vx / 40).toFixed(1);
        ui.yShift.textContent = (-state.vy / 40).toFixed(1);
        ui.fieldXLabel.textContent = `Ex = ${(state.vx / 120).toFixed(2)}`;
        ui.fieldYLabel.textContent = `Ey = ${(state.vy / 120).toFixed(2)}`;
    }

    function syncStateFromInputs() {
        if (state.xMode === "manual") {
            state.manualX = Number(ui.voltageX.value);
        }
        if (state.yMode === "manual") {
            state.manualY = Number(ui.voltageY.value);
        }
        computeVoltages(state.time);
        updateReadouts();
    }

    function spotPosition(width, height) {
        const range = 120;
        const radius = Math.min(width, height) * 0.37;
        return {
            x: width / 2 + (state.vx / range) * radius,
            y: height / 2 - (state.vy / range) * radius
        };
    }

    function drawScreen() {
        const { width, height } = canvasSize(screen);
        const cx = width / 2;
        const cy = height / 2;
        const radius = Math.min(width, height) * 0.44;
        const spot = spotPosition(width, height);

        sctx.clearRect(0, 0, width, height);
        sctx.fillStyle = "#081018";
        sctx.fillRect(0, 0, width, height);

        const tubeGlow = sctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius);
        tubeGlow.addColorStop(0, "#132a2d");
        tubeGlow.addColorStop(0.72, "#0b1b1e");
        tubeGlow.addColorStop(1, "#050a0f");
        sctx.fillStyle = tubeGlow;
        sctx.beginPath();
        sctx.arc(cx, cy, radius, 0, Math.PI * 2);
        sctx.fill();

        sctx.save();
        sctx.beginPath();
        sctx.arc(cx, cy, radius * 0.96, 0, Math.PI * 2);
        sctx.clip();
        drawScopeGrid(cx, cy, radius);
        drawCrosshair(cx, cy, radius);
        drawTrace(spot);
        drawSpot(spot);
        sctx.restore();

        sctx.strokeStyle = "rgba(165, 244, 196, 0.36)";
        sctx.lineWidth = 2;
        sctx.beginPath();
        sctx.arc(cx, cy, radius, 0, Math.PI * 2);
        sctx.stroke();

        sctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
        sctx.lineWidth = 9;
        sctx.beginPath();
        sctx.arc(cx, cy, radius + 7, 0, Math.PI * 2);
        sctx.stroke();
    }

    function drawScopeGrid(cx, cy, radius) {
        const step = radius / 4;
        sctx.lineWidth = 1;

        for (let i = -4; i <= 4; i++) {
            const x = cx + i * step;
            const y = cy + i * step;
            const alpha = i === 0 ? 0.32 : 0.15;
            sctx.strokeStyle = `rgba(111, 235, 168, ${alpha})`;
            sctx.beginPath();
            sctx.moveTo(x, cy - radius);
            sctx.lineTo(x, cy + radius);
            sctx.stroke();
            sctx.beginPath();
            sctx.moveTo(cx - radius, y);
            sctx.lineTo(cx + radius, y);
            sctx.stroke();
        }
    }

    function drawCrosshair(cx, cy, radius) {
        sctx.fillStyle = "rgba(151, 255, 190, 0.55)";
        for (let i = -4; i <= 4; i++) {
            const x = cx + i * radius / 4;
            const y = cy + i * radius / 4;
            sctx.fillRect(x - 1, cy - 5, 2, 10);
            sctx.fillRect(cx - 5, y - 1, 10, 2);
        }
    }

    function drawTrace(spot) {
        if (ui.trace.checked) {
            state.history.push({ x: spot.x, y: spot.y, life: 1 });
            if (state.history.length > 180) {
                state.history.shift();
            }
        } else {
            state.history.length = 0;
        }

        for (const point of state.history) {
            point.life *= 0.986;
            const alpha = point.life * 0.32;
            if (alpha < 0.01) continue;
            sctx.fillStyle = `rgba(43, 183, 191, ${alpha})`;
            sctx.beginPath();
            sctx.arc(point.x, point.y, 5 + (1 - point.life) * 10, 0, Math.PI * 2);
            sctx.fill();
        }

        state.history = state.history.filter((point) => point.life > 0.04);
    }

    function drawSpot(spot) {
        const glow = 18 + state.intensity * 0.25;
        const alpha = 0.45 + state.intensity / 190;
        const gradient = sctx.createRadialGradient(spot.x, spot.y, 2, spot.x, spot.y, glow);
        gradient.addColorStop(0, `rgba(240, 255, 224, ${alpha})`);
        gradient.addColorStop(0.18, `rgba(105, 245, 143, ${alpha})`);
        gradient.addColorStop(1, "rgba(94, 226, 143, 0)");
        sctx.fillStyle = gradient;
        sctx.beginPath();
        sctx.arc(spot.x, spot.y, glow, 0, Math.PI * 2);
        sctx.fill();

        sctx.fillStyle = "#efffe7";
        sctx.beginPath();
        sctx.arc(spot.x, spot.y, 3.8, 0, Math.PI * 2);
        sctx.fill();
    }

    function drawBeam() {
        const { width, height } = canvasSize(beam);
        bctx.clearRect(0, 0, width, height);
        drawBeamGrid(width, height);
        drawTube(width, height);
        drawPlates(width, height, "rear");
        drawIonPath(width, height);
        drawPlates(width, height, "front");
        drawLabels(width, height);
    }

    function drawBeamGrid(width, height) {
        bctx.strokeStyle = "rgba(35, 95, 156, 0.08)";
        bctx.lineWidth = 1;
        for (let x = 40; x < width; x += 40) {
            bctx.beginPath();
            bctx.moveTo(x, 0);
            bctx.lineTo(x, height);
            bctx.stroke();
        }
        for (let y = 40; y < height; y += 40) {
            bctx.beginPath();
            bctx.moveTo(0, y);
            bctx.lineTo(width, y);
            bctx.stroke();
        }
    }

    function drawTube(width, height) {
        const mid = height / 2;
        bctx.strokeStyle = "rgba(20, 33, 47, 0.28)";
        bctx.lineWidth = 2;
        bctx.beginPath();
        bctx.roundRect(28, mid - 92, width - 56, 184, 16);
        bctx.stroke();

        bctx.fillStyle = "#202f3d";
        bctx.fillRect(42, mid - 34, 54, 68);
        bctx.fillStyle = "#f0b44c";
        bctx.fillRect(94, mid - 9, 20, 18);
        bctx.fillStyle = "#14212f";
        bctx.font = "13px Avenir Next, Segoe UI, sans-serif";
        bctx.textAlign = "left";
        bctx.fillText("Ion source", 38, mid + 62);

        bctx.fillStyle = "#253d54";
        bctx.fillRect(width - 92, mid - 74, 18, 148);
        bctx.fillText("Screen", width - 118, mid + 100);
    }

    function drawPlates(width, height, layer) {
        const mid = height / 2;
        const plateY = width * 0.38;
        const plateX = width * 0.58;

        if (layer === "rear") {
            drawPlatePair(plateY, mid, true, state.vy, "Y plates");
        }
        drawXPlates3D(plateX, mid, state.vx, layer);
    }

    function drawPlatePair(x, mid, horizontal, voltage, label) {
        const gap = 68;
        const len = 112;
        const positiveFirst = voltage >= 0;
        bctx.font = "13px Avenir Next, Segoe UI, sans-serif";
        bctx.textAlign = "center";
        bctx.fillStyle = "#34465a";
        bctx.fillText(label, x, mid + 108);

        if (horizontal) {
            drawPlate(x - len / 2, mid - gap, len, 10, positiveFirst);
            drawPlate(x - len / 2, mid + gap - 10, len, 10, !positiveFirst);
            drawFieldArrow(x, mid + (positiveFirst ? -24 : 24), Math.PI / 2 * (positiveFirst ? 1 : -1), Math.abs(voltage));
        }
    }

    function drawXPlates3D(x, mid, voltage, layer) {
        const positiveFront = voltage >= 0;
        const front = perspectivePlate(x - 54, mid - 42, 112, 84, 5, -4);
        const rear = perspectivePlate(x - 38, mid - 54, 112, 84, 5, -4);

        if (layer === "rear") {
            drawPerspectivePlate(rear, !positiveFront, 0.28);
            drawPerspectiveGap(x, mid);
        } else {
            drawPerspectivePlate(front, positiveFront, 1);
            drawFieldArrow(x - 4, mid - 8, positiveFront ? -0.22 : Math.PI - 0.22, Math.abs(voltage));
            bctx.font = "13px Avenir Next, Segoe UI, sans-serif";
            bctx.textAlign = "center";
            bctx.fillStyle = "#34465a";
            bctx.fillText("X plates", x, mid + 108);
        }
    }

    function perspectivePlate(x, y, w, h, dx, dy) {
        return {
            face: [
                { x, y },
                { x: x + w, y },
                { x: x + w, y: y + h },
                { x, y: y + h }
            ],
            top: [
                { x, y },
                { x: x + w, y },
                { x: x + w + dx, y: y + dy },
                { x: x + dx, y: y + dy }
            ],
            side: [
                { x: x + w, y },
                { x: x + w + dx, y: y + dy },
                { x: x + w + dx, y: y + dy + h },
                { x: x + w, y: y + h }
            ]
        };
    }

    function drawPerspectivePlate(plate, positive, alpha) {
        const color = positive ? "223, 91, 91" : "35, 95, 156";
        bctx.strokeStyle = `rgba(20, 33, 47, ${0.16 + alpha * 0.3})`;
        bctx.lineWidth = 1.2;

        drawPolygon(plate.top, `rgba(${color}, ${Math.min(alpha * 0.52, 1)})`);
        drawPolygon(plate.side, `rgba(${color}, ${Math.min(alpha * 0.4, 1)})`);
        drawPolygon(plate.face, `rgba(${color}, ${alpha})`);

        const cx = (plate.face[0].x + plate.face[1].x + plate.face[2].x + plate.face[3].x) / 4;
        const cy = (plate.face[0].y + plate.face[1].y + plate.face[2].y + plate.face[3].y) / 4;
        bctx.fillStyle = `rgba(255, 255, 255, ${0.72 + alpha * 0.2})`;
        bctx.font = "bold 14px Avenir Next, Segoe UI, sans-serif";
        bctx.textAlign = "center";
        bctx.textBaseline = "middle";
        bctx.fillText(positive ? "+" : "-", cx, cy);
        bctx.textBaseline = "alphabetic";
    }

    function drawPolygon(points, fillStyle) {
        bctx.fillStyle = fillStyle;
        bctx.beginPath();
        bctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach((point) => bctx.lineTo(point.x, point.y));
        bctx.closePath();
        bctx.fill();
        bctx.stroke();
    }

    function drawPerspectiveGap(x, mid) {
        bctx.strokeStyle = "rgba(35, 95, 156, 0.14)";
        bctx.lineWidth = 2;
        bctx.setLineDash([5, 7]);
        bctx.beginPath();
        bctx.moveTo(x - 22, mid - 48);
        bctx.lineTo(x + 74, mid - 58);
        bctx.stroke();
        bctx.beginPath();
        bctx.moveTo(x - 38, mid + 36);
        bctx.lineTo(x + 58, mid + 26);
        bctx.stroke();
        bctx.setLineDash([]);
    }

    function drawPlate(x, y, w, h, positive) {
        bctx.fillStyle = positive ? "#df5b5b" : "#235f9c";
        bctx.beginPath();
        bctx.roundRect(x, y, w, h, 4);
        bctx.fill();

        bctx.fillStyle = "#fff";
        bctx.font = "bold 14px Avenir Next, Segoe UI, sans-serif";
        bctx.textAlign = "center";
        bctx.textBaseline = "middle";
        bctx.fillText(positive ? "+" : "-", x + w / 2, y + h / 2);
        bctx.textBaseline = "alphabetic";
    }

    function drawFieldArrow(x, y, angle, voltage) {
        if (voltage < 4) return;
        const length = 20 + voltage * 0.26;
        bctx.save();
        bctx.translate(x, y);
        bctx.rotate(angle);
        bctx.strokeStyle = "rgba(223, 91, 91, 0.72)";
        bctx.fillStyle = "rgba(223, 91, 91, 0.72)";
        bctx.lineWidth = 2;
        bctx.beginPath();
        bctx.moveTo(-length / 2, 0);
        bctx.lineTo(length / 2, 0);
        bctx.stroke();
        bctx.beginPath();
        bctx.moveTo(length / 2, 0);
        bctx.lineTo(length / 2 - 8, -5);
        bctx.lineTo(length / 2 - 8, 5);
        bctx.closePath();
        bctx.fill();
        bctx.restore();
    }

    function drawIonPath(width, height) {
        const mid = height / 2;
        const start = { x: 112, y: mid };
        const endScreen = { x: width - 83, y: mid - state.vy * 0.55 };
        const control1 = { x: width * 0.38, y: mid - state.vy * 0.18 };
        const control2 = { x: width * 0.64, y: mid - state.vy * 0.42 };
        const sideOffset = state.vx * 0.12;

        bctx.strokeStyle = "rgba(43, 183, 191, 0.22)";
        bctx.lineWidth = 12;
        bctx.beginPath();
        bctx.moveTo(start.x, start.y);
        bctx.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, endScreen.x, endScreen.y);
        bctx.stroke();

        bctx.strokeStyle = "#2bb7bf";
        bctx.lineWidth = 3;
        bctx.beginPath();
        bctx.moveTo(start.x, start.y);
        bctx.bezierCurveTo(control1.x + sideOffset, control1.y, control2.x + sideOffset, control2.y, endScreen.x, endScreen.y);
        bctx.stroke();

        const progress = ui.animate.checked ? (state.time % 1) : 1;
        const ion = cubicPoint(start, control1, control2, endScreen, progress);
        ion.x += Math.sin(progress * Math.PI) * sideOffset;
        drawIon(ion.x, ion.y, progress);
    }

    function cubicPoint(p0, p1, p2, p3, t) {
        const u = 1 - t;
        return {
            x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
            y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
        };
    }

    function drawIon(x, y, progress) {
        const pulse = 0.5 + Math.sin(progress * Math.PI * 2) * 0.18;
        const radius = 7 + state.intensity * 0.04;
        bctx.fillStyle = `rgba(94, 226, 143, ${0.72 + pulse * 0.2})`;
        bctx.beginPath();
        bctx.arc(x, y, radius, 0, Math.PI * 2);
        bctx.fill();
        bctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        bctx.lineWidth = 2;
        bctx.stroke();
    }

    function drawLabels(width, height) {
        const mid = height / 2;
        bctx.fillStyle = "#14212f";
        bctx.font = "13px Avenir Next, Segoe UI, sans-serif";
        bctx.textAlign = "left";
        bctx.fillText("The accelerated ion beam enters two perpendicular deflection fields", 132, mid - 116);
        bctx.textAlign = "right";
        bctx.fillText(`Spot voltage: X ${signed(state.vx)} V, Y ${signed(state.vy)} V`, width - 74, mid - 96);
    }

    function drawFrame(now) {
        state.time = now / 1000;
        computeVoltages(state.time);
        updateReadouts();
        drawScreen();
        drawBeam();
        requestAnimationFrame(drawFrame);
    }

    function handleInput() {
        syncStateFromInputs();
    }

    function reset() {
        ui.voltageX.value = 0;
        ui.voltageY.value = 0;
        ui.intensity.value = 72;
        state.manualX = 0;
        state.manualY = 0;
        state.xMode = "manual";
        state.yMode = "manual";
        state.history.length = 0;
        updateModeButtons();
        syncStateFromInputs();
    }

    function updateModeButtons() {
        ui.modeButtons.forEach((button) => {
            const active = button.dataset.axis === "x"
                ? button.dataset.mode === state.xMode
                : button.dataset.mode === state.yMode;
            button.classList.toggle("active", active);
        });
        ui.voltageX.disabled = state.xMode !== "manual";
        ui.voltageY.disabled = state.yMode !== "manual";
        if (state.xMode === "manual") {
            ui.voltageX.value = String(Math.round(state.manualX));
        }
        if (state.yMode === "manual") {
            ui.voltageY.value = String(Math.round(state.manualY));
        }
    }

    function setMode(axis, mode) {
        if (axis === "x") {
            state.manualX = Number(ui.voltageX.value);
            state.xMode = mode;
        } else {
            state.manualY = Number(ui.voltageY.value);
            state.yMode = mode;
        }
        state.history.length = 0;
        updateModeButtons();
        syncStateFromInputs();
    }

    function resizeAll() {
        resizeCanvas(screen, sctx);
        resizeCanvas(beam, bctx);
        state.history.length = 0;
    }

    [ui.voltageX, ui.voltageY, ui.intensity, ui.trace, ui.animate].forEach((control) => {
        control.addEventListener("input", handleInput);
        control.addEventListener("change", handleInput);
    });
    ui.modeButtons.forEach((button) => {
        button.addEventListener("click", () => setMode(button.dataset.axis, button.dataset.mode));
    });
    ui.reset.addEventListener("click", reset);
    window.addEventListener("resize", resizeAll);

    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r) {
            const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
            this.moveTo(x + radius, y);
            this.arcTo(x + w, y, x + w, y + h, radius);
            this.arcTo(x + w, y + h, x, y + h, radius);
            this.arcTo(x, y + h, x, y, radius);
            this.arcTo(x, y, x + w, y, radius);
            return this;
        };
    }

    updateModeButtons();
    syncStateFromInputs();
    resizeAll();
    requestAnimationFrame(drawFrame);
})();
