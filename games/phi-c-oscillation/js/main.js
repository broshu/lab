(function () {
    'use strict';

    var TWO_PI = Math.PI * 2;
    var DEFAULTS = { phi: 90, b: 150, T: 1.6 };
    var PRESETS = {
        same: { phi: 0 },
        lead: { phi: 90 },
        lag: { phi: -90 },
        opposite: { phi: 180 }
    };

    // Fixed figure palette (colour-blind safe), drawn on a light surface in both site themes.
    var COLORS = ['#0072B2', '#D55E00', '#009E73'];
    var INK = '#1a1a1a', MUTED = '#5f6b73', GUIDE = '#9aa5ad';
    var SANS = 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif';
    var SERIF = '"Times New Roman","STIX Two Text",Times,serif';

    // Geometry, in canvas pixels (1280 x 690). Upward is positive.
    var A = 65, Y0 = 430, OSC_X = [130, 270, 410], SUPPORT_Y = 200, BALL_R = 22, LABEL_Y = 655;
    var G = { x0: 620, x1: 1180, top: 180, bottom: 620 };

    var cv = document.getElementById('stage');
    var ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height;

    // Oscillator 1: y = A sin(wt).  2: y = A sin(wt + phi).  3: y = A sin(wt) + b.
    var shown = [true, false, false];
    var T = DEFAULTS.T, phi = DEFAULTS.phi * Math.PI / 180, b = DEFAULTS.b;
    var w = TWO_PI / T, windowSec = 5, pxPerSec = (G.x1 - G.x0) / windowSec;
    var t = 5, last = 0, dirty = true;
    var reduceMotion = false;
    try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    var playing = !reduceMotion;

    function $(id) { return document.getElementById(id); }
    var playBtn = $('playBtn');

    // ---- drawing helpers ----
    // Text between asterisks is set in italic serif (variables).
    function richText(str, x, y, size, align, family, color) {
        family = family || SANS; color = color || INK; align = align || 'left';
        var segs = str.split('*').map(function (s, k) { return { s: s, it: k % 2 === 1 }; });
        function fontOf(sg) { return sg.it ? 'italic ' + size + 'px ' + SERIF : size + 'px ' + family; }
        var total = 0;
        segs.forEach(function (sg) { ctx.font = fontOf(sg); total += ctx.measureText(sg.s).width; });
        var cx = align === 'center' ? x - total / 2 : x;
        ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        segs.forEach(function (sg) { ctx.font = fontOf(sg); ctx.fillText(sg.s, cx, y); cx += ctx.measureText(sg.s).width; });
    }

    function arrow(x1, y1, x2, y2, both) {
        ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1.6; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        function head(xa, ya, xb, yb) {
            var a = Math.atan2(yb - ya, xb - xa), L = 10;
            ctx.beginPath(); ctx.moveTo(xb, yb);
            ctx.lineTo(xb - L * Math.cos(a - 0.4), yb - L * Math.sin(a - 0.4));
            ctx.lineTo(xb - L * Math.cos(a + 0.4), yb - L * Math.sin(a + 0.4));
            ctx.closePath(); ctx.fill();
        }
        head(x1, y1, x2, y2);
        if (both) head(x2, y2, x1, y1);
    }

    function dotted(x1, y1, x2, y2) {
        ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = GUIDE; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
    }

    function shade(hex, f) {
        var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, bl = n & 255;
        function m(v) { return Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f); }
        return 'rgb(' + m(r) + ',' + m(g) + ',' + m(bl) + ')';
    }

    function drawSupport(x, y) {
        ctx.fillStyle = '#555'; ctx.fillRect(x - 45, y - 10, 90, 10);
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.setLineDash([]);
        for (var k = -45; k < 45; k += 9) { ctx.beginPath(); ctx.moveTo(x + k, y - 10); ctx.lineTo(x + k + 7, y - 18); ctx.stroke(); }
    }

    function drawSpring(x, yTop, yBot) {
        var n = 18, half = 11, lead = 8;
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.beginPath();
        ctx.moveTo(x, yTop); ctx.lineTo(x, yTop + lead);
        var span = (yBot - lead) - (yTop + lead);
        for (var k = 0; k <= 2 * n; k++) {
            var yy = yTop + lead + span * k / (2 * n);
            var xx = (k === 0 || k === 2 * n) ? x : x + (k % 2 ? half : -half);
            ctx.lineTo(xx, yy);
        }
        ctx.lineTo(x, yBot); ctx.stroke();
    }

    function drawBall(x, y, r, color) {
        var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, color); g.addColorStop(1, shade(color, -0.35));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TWO_PI); ctx.fill();
        ctx.strokeStyle = shade(color, -0.5); ctx.lineWidth = 1; ctx.stroke();
    }

    // ---- model ----
    function disp(i, s) { return A * Math.sin(w * s + (i === 1 ? phi : 0)); }
    function eqY(i) { return Y0 - (i === 2 ? b : 0); }
    function supY(i) { return SUPPORT_Y - (i === 2 ? b : 0); }

    function draw() {
        var now = t, i, k;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);

        // left: oscillators
        dotted(40, Y0, 520, Y0);
        richText('*y* = 0', 30, Y0 - 16, 20, 'left', SANS, MUTED);
        for (i = 0; i < 3; i++) {
            if (!shown[i]) continue;
            var x = OSC_X[i], yb = eqY(i) - disp(i, now);
            drawSupport(x, supY(i));
            drawSpring(x, supY(i), yb - BALL_R);
            drawBall(x, yb, BALL_R, COLORS[i]);
            if (i === 2) dotted(x - 60, eqY(2), x + 60, eqY(2));
            richText(String(i + 1), x, LABEL_Y, 28, 'center', SANS, COLORS[i]);
        }

        // right: position–time graph
        var lo = Math.max(0, now - windowSec);
        function X(tt) { return G.x0 + (tt - lo) * pxPerSec; }
        var gx1 = G.x1 + 60;
        ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.setLineDash([]);
        ctx.strokeRect(G.x0, G.top, gx1 - G.x0, G.bottom - G.top);
        dotted(G.x0, Y0, gx1, Y0);
        if (shown[2]) dotted(G.x0, Y0 - b, gx1, Y0 - b);
        richText('0', G.x0 - 14, Y0, 22, 'center', SERIF);
        richText('*y*', G.x0 - 12, G.top - 18, 26, 'center');
        richText('time *t* / s  →', (G.x0 + gx1) / 2, G.bottom + 26, 22, 'center');
        for (var tick = Math.ceil(lo); tick <= now && tick <= lo + windowSec; tick++) {
            richText(String(tick), X(tick), G.bottom - 14, 16, 'center', SANS, MUTED);
        }

        ctx.save(); ctx.beginPath(); ctx.rect(G.x0, G.top, gx1 - G.x0, G.bottom - G.top); ctx.clip();
        for (i = 0; i < 3; i++) {
            if (!shown[i]) continue;
            var n = Math.max(2, Math.ceil((now - lo) * 80));
            ctx.strokeStyle = COLORS[i]; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.setLineDash([]);
            ctx.beginPath();
            for (k = 0; k <= n; k++) {
                var tt = lo + (now - lo) * k / n, yy = eqY(i) - disp(i, tt);
                if (k) ctx.lineTo(X(tt), yy); else ctx.moveTo(X(tt), yy);
            }
            ctx.stroke();
            ctx.fillStyle = COLORS[i]; ctx.beginPath(); ctx.arc(X(now), eqY(i) - disp(i, now), 6, 0, TWO_PI); ctx.fill();
        }
        ctx.restore();

        // trace labels, nudged apart when two traces are close
        var tags = [0, 1, 2].filter(function (j) { return shown[j]; })
            .map(function (j) { return { i: j, y: eqY(j) - disp(j, now) }; })
            .sort(function (p, q) { return p.y - q.y; });
        for (k = 1; k < tags.length; k++) tags[k].y = Math.max(tags[k].y, tags[k - 1].y + 24);
        tags.forEach(function (tg) { richText(String(tg.i + 1), X(now) + 14, tg.y, 22, 'left', SANS, COLORS[tg.i]); });

        // formulas for the oscillators that are on screen
        var formulas = [
            '1   *y*₁ = *A* sin *ωt*',
            '2   *y*₂ = *A* sin(*ωt* + *φ*)',
            '3   *y*₃ = *A* sin *ωt* + *b*'
        ];
        var row = 0;
        for (i = 0; i < 3; i++) {
            if (!shown[i]) continue;
            ctx.fillStyle = COLORS[i]; ctx.fillRect(G.x0, 42 + row * 40, 18, 18);
            richText(formulas[i], G.x0 + 30, 51 + row * 40, 28, 'left', SERIF);
            row++;
        }

        // marks: time shift between corresponding troughs of 1 and 2, and the offset b
        if (shown[1] && Math.abs(phi) > 0.001) {
            var d = phi / w;
            var m = Math.floor((now + Math.min(0, d) - 3 * T / 4) / T);
            var t1 = 3 * T / 4 + m * T, t2 = t1 - d;
            if (Math.min(t1, t2) >= lo && t2 >= 0) {
                var yBot = Y0 + A, ya = yBot + 20;
                ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.setLineDash([]);
                [t1, t2].forEach(function (q) { ctx.beginPath(); ctx.moveTo(X(q), yBot); ctx.lineTo(X(q), ya + 4); ctx.stroke(); });
                arrow(X(t1), ya, X(t2), ya, false);
                richText('*φ*/*ω*', (X(t1) + X(t2)) / 2, ya + 21, 24, 'center');
            }
        }
        if (shown[2] && Math.abs(b) > 0.001) {
            var xa = G.x0 - 34;
            arrow(xa, Y0, xa, Y0 - b, true);
            richText('*b*', xa - 20, Y0 - b / 2, 28, 'center');
            var xl = OSC_X[2] + 70;
            arrow(xl, Y0, xl, Y0 - b, true);
            richText('*b*', xl + 10, Y0 - b / 2, 28);
        }
    }

    // ---- controls ----
    function setText(el, s) { if (el._s !== s) { el.textContent = s; el._s = s; } }

    function sync() {
        w = TWO_PI / T;
        windowSec = Math.max(5, T * 2);
        pxPerSec = (G.x1 - G.x0) / windowSec;
        var deg = Math.round(phi * 180 / Math.PI), delta = phi / w;
        setText($('phiOut'), deg + '° (' + (phi / Math.PI).toFixed(2) + 'π)');
        setText($('bOut'), String(b));
        setText($('TOut'), T.toFixed(1) + ' s');
        setText($('vw'), w.toFixed(2) + ' rad/s');
        setText($('vd'), shown[1] ? delta.toFixed(2) + ' s' : '–');

        var parts = [];
        if (shown[1]) {
            if (Math.abs(deg) === 180) parts.push('2 is in antiphase with 1, half a period apart.');
            else if (deg === 0) parts.push('2 is in phase with 1.');
            else parts.push('2 ' + (deg > 0 ? 'leads' : 'lags') + ' 1 by ' + Math.abs(delta).toFixed(2) + ' s (' + Math.abs(deg) + '°).');
        }
        if (shown[2]) {
            if (b === 0) parts.push('3 coincides with 1.');
            else parts.push('3 moves like 1 about an equilibrium ' + Math.abs(b) + (b > 0 ? ' above' : ' below') + ' it.');
        }
        if (!parts.length) parts.push('Oscillator 1 is the reference. Add 2 to change the phase, or 3 to change the offset b.');
        setText($('relation'), parts.join(' '));

        $('phi').disabled = !shown[1];
        $('b').disabled = !shown[2];
        $('phiRow').classList.toggle('is-off', !shown[1]);
        $('bRow').classList.toggle('is-off', !shown[2]);
        dirty = true;
    }

    function setShown(i, value) {
        shown[i] = value;
        var btn = $('add' + (i + 1));
        btn.setAttribute('aria-pressed', value ? 'true' : 'false');
        btn.textContent = value ? 'Remove ' + (i + 1) : (i === 1 ? 'Add 2: phase φ' : 'Add 3: offset b');
        sync();
    }

    function setParams(p) {
        ['phi', 'b', 'T'].forEach(function (key) {
            if (p[key] === undefined) return;
            $(key).value = p[key];
            if (key === 'phi') phi = p[key] * Math.PI / 180;
            else if (key === 'b') b = p[key];
            else T = p[key];
        });
        sync();
    }

    ['phi', 'b', 'T'].forEach(function (key) {
        $(key).addEventListener('input', function () {
            var o = {}; o[key] = parseFloat($(key).value); setParams(o);
        });
    });
    $('add2').addEventListener('click', function () { setShown(1, !shown[1]); });
    $('add3').addEventListener('click', function () { setShown(2, !shown[2]); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (btn) {
        btn.addEventListener('click', function () {
            if (!shown[1]) setShown(1, true);
            setParams(PRESETS[btn.getAttribute('data-preset')]);
        });
    });
    $('resetBtn').addEventListener('click', function () {
        setParams(DEFAULTS);
        setShown(1, false); setShown(2, false);
        t = 5; dirty = true;
    });
    $('restartBtn').addEventListener('click', function () { t = 0; dirty = true; });
    playBtn.addEventListener('click', function () { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; });

    function frame(ts) {
        var dt = last ? Math.min((ts - last) / 1000, 0.1) : 0;
        last = ts;
        if (playing) { t += dt; dirty = true; }
        if (dirty) { draw(); dirty = false; }
        requestAnimationFrame(frame);
    }

    playBtn.textContent = playing ? 'Pause' : 'Play';
    sync();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { dirty = true; });
    requestAnimationFrame(frame);
})();
