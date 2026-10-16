(function () {
    'use strict';

    var TWO_PI = Math.PI * 2;
    var WINDOW = 8; // seconds shown on the time axis
    var DEFAULTS = { omega: Math.PI, phi: 0, t: 3.3 };

    var omega = DEFAULTS.omega, phi = DEFAULTS.phi, t = DEFAULTS.t;
    var reduceMotion = false;
    try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    var playing = !reduceMotion, dirty = true, last = 0;

    // Fixed figure palette (colour-blind safe), drawn on a light surface in both site themes.
    var C = {
        paper: '#ffffff', ink: '#1a1a1a', muted: '#5f6b73', line: '#dde3e8',
        blue: '#0072B2', wash: '#d6e6f2', orange: '#D55E00'
    };
    var SANS = 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif';

    var cv = document.getElementById('stage');
    var ctx = cv.getContext('2d');
    var W = 0, H = 0;

    function $(id) { return document.getElementById(id); }
    var omegaIn = $('omega'), phiIn = $('phi');
    var playBtn = $('playBtn');
    var out = { omega: $('omegaOut'), phi: $('phiOut'), T: $('vT'), f: $('vF'), t: $('vt'), th: $('vth') };

    function setText(el, s) { if (el._s !== s) { el.textContent = s; el._s = s; } }

    function resize() {
        var r = cv.getBoundingClientRect();
        if (!r.width) return;
        var wantH = Math.round(r.width / (r.width < 520 ? 1.7 : 2.3));
        if (cv.style.height !== wantH + 'px') {
            cv.style.height = wantH + 'px';
            r = cv.getBoundingClientRect();
        }
        var d = Math.min(window.devicePixelRatio || 1, 3);
        W = r.width; H = r.height;
        cv.width = Math.round(W * d);
        cv.height = Math.round(H * d);
        ctx.setTransform(d, 0, 0, d, 0, 0);
        dirty = true;
    }

    function line(x1, y1, x2, y2) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    function label(txt, x, y, color, align, font) {
        ctx.font = font;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = C.paper;
        ctx.strokeText(txt, x, y);
        ctx.fillStyle = color;
        ctx.fillText(txt, x, y);
    }

    function draw() {
        if (!W) return;
        ctx.clearRect(0, 0, W, H);

        var padL = 12, padR = 14, padT = 18, padB = 40;
        var circleW = W < 520 ? W * 0.37 : W * 0.31;
        var avail = (H - padT - padB) / 2;
        var R = Math.max(28, Math.min((circleW - padL) / 2 - 4, avail - 4));
        var cx = padL + R + 4, cy = padT + avail;
        var x0 = cx + R + 16, pw = W - padR - x0, sx = pw / WINDOW;
        var T = TWO_PI / omega;
        var th = omega * t + phi;
        var px = cx + R * Math.cos(th), py = cy - R * Math.sin(th), tx = x0 + t * sx;
        var by = cy + R + 28;
        var k, x;

        // time grid and amplitude guides
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = C.line;
        for (k = 1; k <= WINDOW; k++) { x = x0 + k * sx; line(x, cy - R - 4, x, cy + R + 4); }
        ctx.setLineDash([3, 4]);
        line(x0, cy - R, x0 + pw, cy - R);
        line(x0, cy + R, x0 + pw, cy + R);
        ctx.setLineDash([]);

        // axes
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 1.25;
        line(x0, cy, x0 + pw, cy);
        line(x0, cy - R - 8, x0, cy + R + 8);
        ctx.fillStyle = C.muted;
        ctx.beginPath();
        ctx.moveTo(x0 + pw, cy); ctx.lineTo(x0 + pw - 6, cy - 3.5); ctx.lineTo(x0 + pw - 6, cy + 3.5);
        ctx.closePath(); ctx.fill();

        // period guide and bracket
        var xT = x0 + T * sx, xe = Math.min(xT, x0 + pw);
        ctx.strokeStyle = C.orange;
        if (T <= WINDOW) {
            ctx.globalAlpha = 0.5; ctx.lineWidth = 1.25; ctx.setLineDash([3, 3]);
            line(xT, cy - R - 4, xT, by - 5);
            ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
        ctx.lineWidth = 1.5;
        line(x0, by, xe, by);
        line(x0, by - 4, x0, by + 4);
        if (T <= WINDOW) line(xT, by - 4, xT, by + 4);

        // labels
        for (k = 0; k <= WINDOW; k++) label(String(k), x0 + k * sx, cy + R + 14, C.muted, 'center', '11px ' + SANS);
        label('t / s', x0 + pw, cy - 10, C.muted, 'right', '11px ' + SANS);
        label('x', x0 + 8, cy - R - 8, C.muted, 'left', 'italic 12px ' + SANS);
        label('A', x0 - 5, cy - R, C.muted, 'right', '11px ' + SANS);
        label('−A', x0 - 5, cy + R, C.muted, 'right', '11px ' + SANS);

        var tFont = '600 12px ' + SANS;
        var tTxt = 'T = ' + T.toFixed(2) + ' s';
        ctx.font = tFont;
        var tw = ctx.measureText(tTxt).width;
        if (xe + 8 + tw <= W - 4) label(tTxt, xe + 8, by, C.orange, 'left', tFont);
        else label(tTxt, (x0 + xe) / 2, by, C.orange, 'center', tFont);
        label('one turn = 2π rad', cx, by, C.orange, 'center', '500 12px ' + SANS);

        // x–t curve: faint full curve, bold traced part
        function curve(tEnd, width, alpha) {
            var n = Math.max(2, Math.ceil(tEnd * sx / 1.5)), i, s;
            ctx.beginPath();
            for (i = 0; i <= n; i++) {
                s = tEnd * i / n;
                var X = x0 + s * sx, Y = cy - R * Math.sin(omega * s + phi);
                if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
            }
            ctx.globalAlpha = alpha; ctx.lineWidth = width; ctx.strokeStyle = C.blue;
            ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            ctx.stroke(); ctx.globalAlpha = 1;
        }
        curve(WINDOW, 2, 0.28);
        if (t > 0) curve(t, 2.75, 1);

        // reference circle: swept sector, outline, axes
        var s0 = (omega * t) % TWO_PI, r1 = R * 0.45;
        if (s0 > 0.002) {
            ctx.beginPath(); ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r1, -phi, -(phi + s0), true);
            ctx.closePath(); ctx.fillStyle = C.wash; ctx.fill();
        }
        ctx.lineWidth = 1.5; ctx.strokeStyle = C.line;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, TWO_PI); ctx.stroke();
        ctx.lineWidth = 1; line(cx - R - 4, cy, cx + R + 4, cy);
        ctx.strokeStyle = C.muted; ctx.lineWidth = 1.25; line(cx, cy - R - 8, cx, cy + R + 8);
        label('x', cx + 8, cy - R - 8, C.muted, 'left', 'italic 12px ' + SANS);
        if (s0 > 0.002) {
            ctx.beginPath(); ctx.arc(cx, cy, r1, -phi, -(phi + s0), true);
            ctx.lineWidth = 1.75; ctx.strokeStyle = C.blue; ctx.stroke();
        }

        // start marker for the initial phase
        var sxm = cx + R * Math.cos(phi), sym = cy - R * Math.sin(phi);
        ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.strokeStyle = C.muted;
        line(cx, cy, sxm, sym); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(sxm, sym, 4, 0, TWO_PI);
        ctx.fillStyle = C.paper; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = C.blue; ctx.stroke();

        // radius and rotating point
        ctx.lineWidth = 2; ctx.strokeStyle = C.blue; line(cx, cy, px, py);
        ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, TWO_PI); ctx.fillStyle = C.muted; ctx.fill();

        // projection line and projected points
        ctx.setLineDash([4, 4]); ctx.lineWidth = 1.25; ctx.strokeStyle = C.orange;
        line(px, py, tx, py); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(cx, py, 4.5, 0, TWO_PI); ctx.fillStyle = C.orange; ctx.fill();
        ctx.beginPath(); ctx.arc(tx, py, 5.5, 0, TWO_PI);
        ctx.fillStyle = C.orange; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = C.paper; ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py, 6.5, 0, TWO_PI);
        ctx.fillStyle = C.blue; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = C.paper; ctx.stroke();
    }

    function updateControls() {
        var T = TWO_PI / omega;
        setText(out.omega, omega.toFixed(2) + ' rad/s');
        setText(out.phi, (phi / Math.PI).toFixed(2) + 'π rad');
        setText(out.T, T.toFixed(2) + ' s');
        setText(out.f, (1 / T).toFixed(2) + ' Hz');
        dirty = true;
    }

    function updateTime() {
        setText(out.t, t.toFixed(2) + ' s');
        setText(out.th, (omega * t + phi).toFixed(2) + ' rad');
    }

    function setPlaying(value) {
        playing = value;
        playBtn.textContent = playing ? 'Pause' : 'Play';
    }

    omegaIn.addEventListener('input', function () { omega = parseFloat(omegaIn.value); updateControls(); });
    phiIn.addEventListener('input', function () { phi = parseFloat(phiIn.value) * Math.PI; updateControls(); });
    playBtn.addEventListener('click', function () { setPlaying(!playing); });
    $('restartBtn').addEventListener('click', function () { t = 0; dirty = true; });
    $('resetBtn').addEventListener('click', function () {
        omega = DEFAULTS.omega; phi = DEFAULTS.phi; t = DEFAULTS.t;
        omegaIn.value = String(omega); phiIn.value = String(phi);
        updateControls();
    });

    function frame(now) {
        var dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
        last = now;
        if (playing) { t += dt; if (t >= WINDOW) t -= WINDOW; dirty = true; }
        if (dirty) { draw(); updateTime(); dirty = false; }
        requestAnimationFrame(frame);
    }

    setPlaying(playing);
    resize();
    updateControls();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
    else window.addEventListener('resize', resize);
    requestAnimationFrame(frame);
})();
