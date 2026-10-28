'use strict';
// 排版小工具：公式 SVG 填充，以及 SVG 文字里的斜体变量与上下标。
// 写法：*B*_0 → 斜体 B 加下标 0；*v*_{max} → 下标 max；^2 → 上标；^{-1} → 上标 -1。
(function () {
    const SUB = 'dy="0.3em" font-size="72%"', SUP = 'dy="-0.45em" font-size="72%"';
    function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    function mk(src) {
        const re = /\*([^*]+)\*|_\{([^}]*)\}|_([0-9A-Za-zα-ωΑ-Ω+\-′]+)|\^\{([^}]*)\}|\^([0-9+\-]+)/g;
        let out = '', last = 0, m, pending = null;
        const flush = text => {
            if (!text) return;
            if (pending) { out += '<tspan dy="' + pending + '">' + esc(text) + '</tspan>'; pending = null; }
            else out += esc(text);
        };
        while ((m = re.exec(src))) {
            flush(src.slice(last, m.index));
            if (m[1] !== undefined) {
                if (pending) { out += '<tspan font-style="italic" dy="' + pending + '">' + esc(m[1]) + '</tspan>'; pending = null; }
                else out += '<tspan font-style="italic">' + esc(m[1]) + '</tspan>';
            } else {
                const isSub = m[2] !== undefined || m[3] !== undefined;
                const body = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5];
                if (pending) { out += '<tspan dy="' + pending + '">'; out += ''; out += '</tspan>'; pending = null; }
                out += '<tspan ' + (isSub ? SUB : SUP) + '>' + esc(body) + '</tspan>';
                pending = isSub ? '-0.216em' : '0.324em';
            }
            last = re.lastIndex;
        }
        flush(src.slice(last));
        return out;
    }
    function typesetSvg(root) {
        (root || document).querySelectorAll('text.mk').forEach(t => {
            if (t.dataset.done) return;
            t.innerHTML = mk(t.textContent); t.dataset.done = '1';
        });
    }
    function fillFormulas(root) {
        const F = window.FORMULAS || {};
        (root || document).querySelectorAll('[data-f]').forEach(el => { el.innerHTML = F[el.dataset.f] || ''; });
    }

    // 画布上的同样写法：drawRich(ctx, '*E* = *B*_0 *L* *v*', x, y, {size, color, align, weight, base})
    function drawRich(ctx, src, x, y, o) {
        o = o || {};
        const size = o.size || 14, fam = o.family || '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif', serif = '"Times New Roman","Songti SC",serif';
        const re = /\*([^*]+)\*|_\{([^}]*)\}|_([0-9A-Za-zα-ωΑ-Ω+\-′]+)|\^\{([^}]*)\}|\^([0-9+\-]+)/g;
        const runs = []; let last = 0, m;
        while ((m = re.exec(src))) {
            if (m.index > last) runs.push({ t: src.slice(last, m.index), k: 'n' });
            if (m[1] !== undefined) runs.push({ t: m[1], k: 'i' });
            else if (m[2] !== undefined || m[3] !== undefined) runs.push({ t: m[2] !== undefined ? m[2] : m[3], k: 'sub' });
            else runs.push({ t: m[4] !== undefined ? m[4] : m[5], k: 'sup' });
            last = re.lastIndex;
        }
        if (last < src.length) runs.push({ t: src.slice(last), k: 'n' });
        const font = r => r.k === 'i' ? 'italic ' + (o.weight || '') + ' ' + size + 'px ' + serif
            : r.k === 'n' ? (o.weight || '') + ' ' + size + 'px ' + fam
            : (o.weight || '') + ' ' + (size * 0.7) + 'px ' + (/^[0-9+\-]+$/.test(r.t) ? fam : serif);
        ctx.save(); ctx.textBaseline = o.base || 'alphabetic'; ctx.textAlign = 'left';
        let w = 0; runs.forEach(r => { ctx.font = font(r); r.w = ctx.measureText(r.t).width; w += r.w; });
        let cx = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
        ctx.fillStyle = o.color || '#222';
        runs.forEach(r => {
            ctx.font = font(r);
            const dy = r.k === 'sub' ? size * 0.28 : r.k === 'sup' ? -size * 0.4 : 0;
            ctx.fillText(r.t, cx, y + dy); cx += r.w;
        });
        ctx.restore();
        return w;
    }
    window.drawRich = drawRich;
    window.mk = mk; window.typesetSvg = typesetSvg; window.fillFormulas = fillFormulas;
})();
