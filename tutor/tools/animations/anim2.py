#!/usr/bin/env python3
"""选修二第二章（电磁感应）解析里的动画演示：物体运动 + 同步画出的图像。

用法：python3 tutor/tools/animations/anim2.py
和 anim.py 一样输出 SVG + SMIL（放进 assets，<img> 里自动循环播放）。
第二章的题多是“导体怎样动、电流/速度怎样变”，所以每个动画由两部分组成：
- 左边：导体（线框、导体棒、圆盘……）按真实的物理过程运动（数值积分得到逐帧位置）；
- 右边：对应的 v-t / i-t 图像随时间一点点画出来，并有一个点标出“现在”。
所有动画都按同一组采样时刻生成关键帧，两边严格同步。
"""
import math
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "assets" / "xx2"
INK = "#1f2933"
SOFT = "#9aa5b1"
ACC = "#d9480f"
FIELD = "#7b8794"
BLUE = "#1c7ed6"
GREEN = "#2b8a3e"
FONT = "Times New Roman, serif"
CN = "PingFang SC, Microsoft YaHei, sans-serif"


def f1(v):
    return f"{v:.1f}"


class Anim:
    """一张动画：静态元素 + 若干按采样时刻变化的属性。"""

    def __init__(self, w, h, title, times, dur, hold=0.16):
        self.w, self.h, self.title = w, h, title
        self.T = times[-1]
        self.times = times
        self.dur = dur
        self.hold = hold
        self.items = []

    # ---- 关键帧
    def keys(self):
        ks = [t / self.T * (1 - self.hold) for t in self.times] + [1.0]
        return ";".join(f"{k:.4f}" for k in ks)

    def anim(self, attr, vals, extra=""):
        vals = list(vals) + [vals[-1]]
        return (f'<animate attributeName="{attr}" values="{";".join(vals)}" keyTimes="{self.keys()}" '
                f'dur="{self.dur}s" repeatCount="indefinite" calcMode="linear"{extra}/>')

    def anim_tf(self, kind, vals):
        vals = list(vals) + [vals[-1]]
        return (f'<animateTransform attributeName="transform" type="{kind}" values="{";".join(vals)}" '
                f'keyTimes="{self.keys()}" dur="{self.dur}s" repeatCount="indefinite" calcMode="linear"/>')

    def moving(self, inner, xs=None, ys=None, rot=None, center=(0, 0), clip=False):
        """一组元素整体平移（xs, ys 为每帧的屏幕位移）或绕 center 旋转（rot 为每帧角度，屏幕上顺时针为正）。"""
        if rot is not None:
            cx, cy = center
            a = self.anim_tf("rotate", [f"{r:.2f} {f1(cx)} {f1(cy)}" for r in rot])
        else:
            xs = xs or [0] * len(self.times)
            ys = ys or [0] * len(self.times)
            a = self.anim_tf("translate", [f"{f1(x)} {f1(y)}" for x, y in zip(xs, ys)])
        g = f"<g>{inner}{a}</g>"
        self.items.append(f'<g clip-path="url(#stage)">{g}</g>' if clip else g)

    def add(self, s):
        self.items.append(s)

    def clip(self, x, y, w, h):
        """之后用 moving(..., clip=True) 的元素只在这个矩形里显示（不跑到右边的图像上）。"""
        self.items.append(f'<defs><clipPath id="stage"><rect x="{f1(x)}" y="{f1(y)}" width="{f1(w)}" height="{f1(h)}"/></clipPath></defs>')

    def svg(self):
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f1(self.w)} {f1(self.h)}" width="{f1(self.w)}" height="{f1(self.h)}" role="img" aria-label="{self.title}">'
            f"<title>{self.title}</title>"
            f'<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{INK}"/></marker>'
            f'<marker id="arrA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{ACC}"/></marker></defs>'
            f'<rect width="100%" height="100%" fill="#fff"/>' + "".join(self.items) + "</svg>"
        )


# ---------------------------------------------------------------- 绘图小工具

def line(x1, y1, x2, y2, color=INK, w=1.6, dash=None, arrow=False, marker="arr"):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    m = f' marker-end="url(#{marker})"' if arrow else ""
    return f'<line x1="{f1(x1)}" y1="{f1(y1)}" x2="{f1(x2)}" y2="{f1(y2)}" stroke="{color}" stroke-width="{w}"{d}{m}/>'


def text(x, y, s, size=16, italic=True, color=INK, anchor="middle", cn=False):
    st = ' font-style="italic"' if italic else ""
    fam = CN if cn else FONT
    return f'<text x="{f1(x)}" y="{f1(y + size * 0.35)}" font-size="{size}"{st} fill="{color}" text-anchor="{anchor}" font-family="{fam}">{s}</text>'


def poly(pts, color=INK, w=2, fill="none", close=False):
    d = "M" + " L".join(f"{f1(x)} {f1(y)}" for x, y in pts) + (" Z" if close else "")
    return f'<path d="{d}" fill="{fill}" stroke="{color}" stroke-width="{w}" stroke-linejoin="round"/>'


def crosses(x0, x1, y0, y1, step=28, kind="in", color=FIELD, inside=None):
    out = []
    nx, ny = int(round((x1 - x0) / step)), int(round((y1 - y0) / step))
    for i in range(nx + 1):
        for j in range(ny + 1):
            x, y = x0 + i * step, y0 + j * step
            if inside and not inside(x, y):
                continue
            if kind == "out":
                out.append(f'<circle cx="{f1(x)}" cy="{f1(y)}" r="2.2" fill="{color}"/>')
            else:
                k = 4
                out.append(f'<path d="M{f1(x-k)} {f1(y-k)}L{f1(x+k)} {f1(y+k)}M{f1(x+k)} {f1(y-k)}L{f1(x-k)} {f1(y+k)}" stroke="{color}" stroke-width="1.2"/>')
    return "".join(out)


class Graph:
    """右侧的小坐标图：把 (t, y) 换成屏幕坐标，并生成“边画边走”的曲线。"""

    def __init__(self, x0, y0, w, h, tmax, ymin, ymax, xlabel="t", ylabel="v"):
        self.x0, self.y0, self.w, self.h = x0, y0, w, h
        self.tmax, self.ymin, self.ymax = tmax, ymin, ymax
        self.xlabel, self.ylabel = xlabel, ylabel

    def P(self, t, y):
        return (self.x0 + t / self.tmax * self.w, self.y0 + self.h - (y - self.ymin) / (self.ymax - self.ymin) * self.h)

    def axes(self, ticks=()):
        ox, oy = self.P(0, 0)
        s = line(self.x0, oy, self.x0 + self.w + 14, oy, arrow=True, w=1.3)
        s += line(ox, self.y0 + self.h + 4, ox, self.y0 - 12, arrow=True, w=1.3)
        s += text(self.x0 + self.w + 12, oy + 14, self.xlabel, size=15)
        s += text(ox - 12, self.y0 - 8, self.ylabel, size=15)
        s += text(ox - 9, oy + 11, "O", size=13)
        for y, lab in ticks:
            px, py = self.P(0, y)
            s += line(px, py, self.x0 + self.w, py, color=SOFT, w=0.8, dash="3 4")
            s += text(px - 6, py, lab, size=13, anchor="end")
        return s

    def trace(self, an, series, color=ACC, w=2.4):
        """series 与 an.times 一一对应的纵坐标；返回逐帧画出的曲线和移动的点。"""
        pts = [self.P(t, y) for t, y in zip(an.times, series)]
        d = "M" + " L".join(f"{f1(x)} {f1(y)}" for x, y in pts)
        cum = [0.0]
        for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
            cum.append(cum[-1] + math.hypot(xb - xa, yb - ya))
        L = cum[-1] or 1
        frac = [c / L for c in cum]
        s = f'<path d="{d}" fill="none" stroke="{color}" stroke-opacity=".15" stroke-width="{w}" stroke-dasharray="3 4"/>'
        s += (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1">'
              + an.anim("stroke-dashoffset", [f"{1 - fr:.4f}" for fr in frac]) + "</path>")
        cx = an.anim("cx", [f1(x) for x, _ in pts])
        cy = an.anim("cy", [f1(y) for _, y in pts])
        s += f'<circle r="5" fill="{color}" stroke="#fff" stroke-width="1.5">{cx}{cy}</circle>'
        return s


def samples(T, n=240):
    return [T * i / n for i in range(n + 1)]


def save(name, an):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(an.svg(), encoding="utf8")
    print("写入", name)


# ======================================================================
def k14_q6():
    """45° 扇形线框绕 O 顺时针转一周：进入、离开磁场各用 T/8，电流一负一正。"""
    T = 8.0
    ts = samples(T, 320)
    an = Anim(760, 330, "扇形线框绕 O 顺时针匀速转动：进入磁场的 T/8 内电流为负（逆时针），离开磁场的 T/8 内电流为正（顺时针），其余时间无电流", ts, dur=9)
    O = (190, 170)
    R = 130
    # 上半平面有磁场（边界为过 O 的水平线）
    an.add(crosses(70, 320, 40, 150, step=30))
    an.add(line(40, O[1], 345, O[1], w=1.4, dash="6 4"))
    an.add(text(O[0] + 6, O[1] + 16, "O", size=15))
    # 扇形：初始在边界下方，一条边在 O 左侧水平、另一条边向左下 45°（与原图一致）
    def sector_path():
        a0, a1 = 180, 225  # 屏幕角（y 向下，顺时针为正）：180° 指向左，225° 指向左下……这里用数学角
        p0 = (O[0] + R * math.cos(math.radians(180)), O[1])
        p1 = (O[0] + R * math.cos(math.radians(225)), O[1] - R * math.sin(math.radians(225)))
        return f'M{f1(O[0])} {f1(O[1])} L{f1(p0[0])} {f1(p0[1])} A{R} {R} 0 0 0 {f1(p1[0])} {f1(p1[1])} Z'
    sec = f'<path d="{sector_path()}" fill="{ACC}" fill-opacity=".12" stroke="{ACC}" stroke-width="2.4" stroke-linejoin="round"/>'
    # 顺时针转动：屏幕上 rotate 正角为顺时针
    an.moving(sec, rot=[360 * t / T for t in ts], center=O)
    an.add(text(O[0], 315, "线框绕 O 顺时针匀速转动（上方为磁场）", size=13, italic=False, color=SOFT, cn=True))
    # 电流：扇形在 t 时刻的两条边（数学角）为 180-θ 与 225-θ；磁场在数学角 0~180
    I0 = 1.0

    def cur(t):
        th = 360 * t / T
        lead = (180 - th) % 360   # 先转到的那条边（初始水平向左）
        trail = (225 - th) % 360
        inside = lambda a: 0 < a < 180
        # 进入：领先边在磁场里、落后边还没进 → 磁通量增大
        if inside(lead) and not inside(trail):   # 正在进入：磁通量增大，逆时针（负）
            return -I0
        if inside(trail) and not inside(lead):   # 正在离开：磁通量减小，顺时针（正）
            return I0
        return 0.0
    series = [cur(t) for t in ts]
    g = Graph(430, 70, 290, 190, T, -1.4, 1.4, xlabel="t", ylabel="i")
    an.add(g.axes(ticks=()))
    for k, lab in ((4, "T/2"), (8, "T")):
        x, y = g.P(k, 0)
        an.add(line(x, y - 4, x, y + 4, w=1.2)); an.add(text(x, y + 16, lab, size=13, italic=True))
    an.add(text(575, 300, "规定顺时针为正", size=13, italic=False, color=SOFT, cn=True))
    an.add(g.trace(an, series))
    save("k14-q06-anim.svg", an)


def k14_q10():
    """等腰梯形线框匀速穿过宽 L 的磁场：I 由 3→2，跳到 −1，再 −2→−1（单位 BLv/R）。"""
    L = 60.0
    v = 1.0
    T = 4.2  # 从右边进入到左边离开共 3L，再多走一点
    ts = samples(T, 300)
    an = Anim(800, 340, "梯形线框匀速通过磁场：进入时电流逆时针、由 3 减小到 2；右边出磁场后有效长度为 L，电流顺时针；左边进入后由 2 减小到 1", ts, dur=9)
    fx0, fx1 = 250, 250 + L  # 磁场区域
    an.add(f'<rect x="{fx0}" y="40" width="{L}" height="230" fill="#f4f5f7"/>')
    an.add(crosses(fx0 + 15, fx1 - 15, 55, 255, step=30))
    an.add(line(fx0, 30, fx0, 280, dash="6 4", w=1.2)); an.add(line(fx1, 30, fx1, 280, dash="6 4", w=1.2))
    an.add(text((fx0 + fx1) / 2, 296, "L", size=15))
    cy = 155
    # 梯形：右边长 3L（在 x=0），左边长 L（在 x=-2L）
    trap = poly([(0, cy - 1.5 * L), (0, cy + 1.5 * L), (-2 * L, cy + 0.5 * L), (-2 * L, cy - 0.5 * L)], color=ACC, w=2.4, fill="rgba(217,72,15,.08)", close=True)
    x_start = fx0 - 0.2 * L
    xs = [x_start + v * L * t for t in ts]
    an.clip(0, 0, 462, 340)
    an.moving(trap, xs=xs, clip=True)
    an.add(text(110, 300, "线框向右匀速运动", size=13, italic=False, color=SOFT, cn=True))

    def h(s):  # 距右边 s 处线框的高度（单位 L）
        return 3 - s if 0 <= s <= 2 else 0

    def I(t):
        xr = xs[ts.index(t)] if t in ts else x_start + v * L * t
        # 线框右边在 xr；磁场 [fx0, fx1]
        s_in = (xr - fx0) / L     # 右边进入磁场的深度（单位 L）
        if s_in <= 0:
            return 0.0
        a = max(0.0, s_in - 1)     # 磁场右边界处距线框右边的距离
        b = min(s_in, 2.0)         # 磁场左边界处
        if a >= 2:
            return 0.0
        # 磁通量 ∝ ∫_a^b h；dΦ/dt ∝ h(b)·[b 在动] − h(a)·[a 在动]
        val = (h(b) if s_in < 2 else 0) - (h(a) if s_in > 1 else 0)
        return val
    series = [I(t) for t in ts]
    g = Graph(470, 60, 280, 210, T, -3.4, 3.4, xlabel="t", ylabel="I")
    an.add(g.axes(ticks=((3, "3"), (2, "2"), (1, "1"), (-1, "−1"), (-2, "−2"))))
    an.add(text(610, 312, "单位：BLv/R，逆时针为正", size=13, italic=False, color=SOFT, cn=True))
    an.add(g.trace(an, series))
    save("k14-q10-anim.svg", an)


def k15_q3():
    """正方形线框以初速度穿过宽 d 的磁场（d > L）：进出时 v 随位移线性减小，在磁场中匀速。"""
    L, d = 1.0, 1.8
    v0, k = 1.0, 0.3       # 进出磁场时 a = −k·v（k = B²L²/mR），每进出一次速度减小 kL
    dt = 0.01
    t, x, v = 0.0, 0.0, v0   # x：线框右边越过磁场左边界的距离
    rec = []
    while x < d + L + 0.6 and t < 12:
        rec.append((t, x, v))
        part = (0 < x < L) or (d < x < d + L)
        if part:
            v -= k * v * dt
        x += v * dt
        t += dt
    T = rec[-1][0]
    ts = samples(T, 300)
    def at(tt):
        i = min(int(tt / dt), len(rec) - 1)
        return rec[i]
    an = Anim(800, 320, "线框进入磁场时做加速度减小的减速运动，完全在磁场中时匀速，离开磁场时再次做加速度减小的减速运动", ts, dur=8)
    s = 90.0
    fx0 = 230
    an.add(f'<rect x="{fx0}" y="50" width="{d*s}" height="200" fill="#f4f5f7"/>')
    an.add(crosses(fx0 + 18, fx0 + d * s - 18, 70, 235, step=30))
    an.add(line(fx0, 40, fx0, 260, dash="6 4", w=1.2)); an.add(line(fx0 + d * s, 40, fx0 + d * s, 260, dash="6 4", w=1.2))
    an.add(line(fx0, 276, fx0 + d * s, 276, w=1.1, arrow=True)); an.add(line(fx0 + d * s, 276, fx0, 276, w=1.1, arrow=True))
    an.add(text(fx0 + d * s / 2, 292, "d", size=15))
    sq = f'<rect x="{f1(-L*s)}" y="{f1(150 - L*s/2)}" width="{f1(L*s)}" height="{f1(L*s)}" fill="rgba(217,72,15,.08)" stroke="{ACC}" stroke-width="2.4"/>'
    xs = [fx0 + at(tt)[1] * s for tt in ts]
    an.clip(0, 0, 575, 320)
    an.moving(sq, xs=xs, clip=True)
    g = Graph(600, 60, 170, 200, T, 0, 1.15, xlabel="t", ylabel="v")
    an.add(g.axes(ticks=((v0, "v₀"),)))
    an.add(g.trace(an, [at(tt)[2] for tt in ts]))
    save("k15-q03-anim.svg", an)


def k15_q9():
    """导体棒自由下落 0.8 m 进入磁场（4 m/s），减速趋于 3 m/s 后匀速离开。"""
    m, B, Lr, Rt, g0 = 0.02, 0.5, 0.4, 0.6, 10.0
    d0, d = 0.8, 0.7
    dt = 0.0005
    t, y, v = 0.0, 0.0, 0.0
    rec = []
    while y < d0 + d + 0.25:
        rec.append((t, y, v))
        F = B * B * Lr * Lr * v / Rt if d0 <= y <= d0 + d else 0.0
        v += (g0 - F / m) * dt
        y += v * dt
        t += dt
    T = rec[-1][0]
    ts = samples(T, 300)
    def at(tt):
        return rec[min(int(tt / dt), len(rec) - 1)]
    an = Anim(760, 400, "导体棒先自由下落，进入磁场时速度 4 m/s 大于收尾速度 3 m/s，安培力大于重力，做加速度减小的减速运动，最后以 3 m/s 匀速离开磁场", ts, dur=7)
    s = 180.0
    top = 40
    x0, x1 = 120, 280
    an.add(line(x0, top - 10, x0, top + (d0 + d + 0.3) * s, w=2)); an.add(line(x1, top - 10, x1, top + (d0 + d + 0.3) * s, w=2))
    an.add(f'<rect x="{x0+3}" y="{f1(top + d0*s)}" width="{x1-x0-6}" height="{f1(d*s)}" fill="#f4f5f7"/>')
    an.add(crosses(x0 + 22, x1 - 22, top + d0 * s + 16, top + (d0 + d) * s - 14, step=28))
    an.add(line(x0 - 10, top + d0 * s, x1 + 10, top + d0 * s, dash="6 4", w=1.1))
    an.add(line(x0 - 10, top + (d0 + d) * s, x1 + 10, top + (d0 + d) * s, dash="6 4", w=1.1))
    an.add(text(x1 + 26, top + d0 * s / 2, "d₀", size=15)); an.add(text(x1 + 26, top + (d0 + d / 2) * s, "d", size=15))
    rod = f'<rect x="{x0-8}" y="{top-4}" width="{x1-x0+16}" height="8" rx="3" fill="{ACC}"/>'
    an.moving(rod, ys=[at(tt)[1] * s for tt in ts])
    gr = Graph(430, 60, 270, 260, T, 0, 4.6, xlabel="t", ylabel="v")
    an.add(gr.axes(ticks=((4, "4"), (3, "3"))))
    an.add(text(565, 360, "v 的单位：m/s", size=13, italic=False, color=SOFT, cn=True))
    an.add(gr.trace(an, [at(tt)[2] for tt in ts]))
    save("k15-q09-anim.svg", an)


def k16_q3():
    """双棒：ab 以 v₀ 出发减速，cd 从静止加速，二者趋于 v₀/2，电流趋于 0。"""
    v0, k = 1.0, 1.6     # dv/dt = ∓k(v1−v2)
    T = 3.2
    ts = samples(T, 280)
    rel = [v0 * math.exp(-2 * k * t) for t in ts]
    v1 = [v0 / 2 + r / 2 for r in rel]
    v2 = [v0 / 2 - r / 2 for r in rel]
    # 位置：积分
    x1, x2 = [0.0], [0.0]
    for i in range(1, len(ts)):
        h = ts[i] - ts[i - 1]
        x1.append(x1[-1] + (v1[i] + v1[i - 1]) / 2 * h)
        x2.append(x2[-1] + (v2[i] + v2[i - 1]) / 2 * h)
    an = Anim(820, 330, "无外力的双棒：ab 做加速度减小的减速运动，cd 做加速度减小的加速运动，最终都以 v₀/2 匀速，回路电流减为零", ts, dur=8)
    s = 120.0
    an.add(f'<rect x="30" y="80" width="430" height="150" fill="#f4f5f7"/>')
    an.add(crosses(45, 450, 95, 215, step=30, kind="in"))
    an.add(line(20, 80, 470, 80, w=2)); an.add(line(20, 230, 470, 230, w=2))
    an.add(text(245, 258, "磁场竖直向下，导轨光滑", size=13, italic=False, color=SOFT, cn=True))
    cd0, ab0 = 70, 150
    rodcd = f'<rect x="{cd0-4}" y="70" width="8" height="170" rx="3" fill="{BLUE}"/>' + text(cd0, 56, "cd", size=15, color=BLUE)
    rodab = f'<rect x="{ab0-4}" y="70" width="8" height="170" rx="3" fill="{ACC}"/>' + text(ab0, 56, "ab", size=15, color=ACC)
    an.moving(rodcd, xs=[x * s for x in x2])
    an.moving(rodab, xs=[x * s for x in x1])
    g = Graph(540, 60, 230, 200, T, 0, 1.15, xlabel="t", ylabel="v")
    an.add(g.axes(ticks=((v0, "v₀"), (v0 / 2, "v₀/2"))))
    an.add(g.trace(an, v1, color=ACC))
    an.add(g.trace(an, v2, color=BLUE))
    an.add(text(655, 298, "橙：ab 的 v₁　蓝：cd 的 v₂", size=13, italic=False, color=SOFT, cn=True))
    save("k16-q03-anim.svg", an)


def k17_q7():
    """磁铁顺时针转动，铝盘被带着同向转（总比磁铁慢）；磁铁停下后铝盘逐渐停下。"""
    w_m, k = 2 * math.pi * 0.5, 0.9   # 磁铁角速度（rad/s），耦合系数
    t_stop = 6.0
    T = 10.0
    dt = 0.005
    t, am, ad, wd = 0.0, 0.0, 0.0, 0.0
    rec = []
    while t <= T + 1e-9:
        wm = w_m if t < t_stop else 0.0
        rec.append((t, am, ad, wm, wd))
        wd += k * (wm - wd) * dt
        am += wm * dt
        ad += wd * dt
        t += dt
    ts = samples(T, 300)
    def at(tt):
        return rec[min(int(round(tt / dt)), len(rec) - 1)]
    an = Anim(800, 330, "从上往下看：磁铁顺时针转动，铝盘被带着顺时针转动但总比磁铁慢；磁铁停下后，铝盘在电磁阻尼作用下逐渐停下", ts, dur=11)
    C = (180, 165)
    an.add(f'<circle cx="{C[0]}" cy="{C[1]}" r="120" fill="#eef0f3" stroke="{INK}" stroke-width="1.6"/>')
    disk = (f'<line x1="{C[0]}" y1="{C[1]}" x2="{C[0]}" y2="{C[1]-118}" stroke="{SOFT}" stroke-width="3"/>'
            f'<circle cx="{C[0]}" cy="{C[1]-100}" r="7" fill="{SOFT}"/>')
    an.moving(disk, rot=[math.degrees(at(tt)[2]) for tt in ts], center=C)
    mag = (f'<rect x="{C[0]-95}" y="{C[1]-13}" width="95" height="26" fill="#c92a2a" fill-opacity=".85"/>'
           f'<rect x="{C[0]}" y="{C[1]-13}" width="95" height="26" fill="{BLUE}" fill-opacity=".85"/>'
           + text(C[0] - 70, C[1], "N", size=16, italic=False, color="#fff") + text(C[0] + 70, C[1], "S", size=16, italic=False, color="#fff"))
    an.moving(mag, rot=[math.degrees(at(tt)[1]) for tt in ts], center=C)
    an.add(text(C[0], 312, "俯视图：灰色标记随铝盘转动", size=13, italic=False, color=SOFT, cn=True))
    g = Graph(450, 60, 290, 200, T, 0, w_m * 1.2, xlabel="t", ylabel="ω")
    an.add(g.axes(ticks=((w_m, "ω₀"),)))
    an.add(g.trace(an, [at(tt)[3] for tt in ts], color="#c92a2a"))
    an.add(g.trace(an, [at(tt)[4] for tt in ts], color=SOFT))
    x, y = g.P(t_stop, 0)
    an.add(line(x, y, x, g.P(0, w_m * 1.1)[1], color=SOFT, w=0.8, dash="3 4"))
    an.add(text(x, y + 16, "磁铁停", size=12, italic=False, color=SOFT, cn=True))
    an.add(text(595, 302, "红：磁铁（角速度 ω₀）　灰：铝盘", size=13, italic=False, color=SOFT, cn=True))
    save("k17-q07-anim.svg", an)


def k18_q12():
    """通电时灯泡支路电流从大到小；断电后线圈电流 I_L 反向流过灯泡，从较小的值逐渐减为零。"""
    tau = 0.55
    t1 = 3.0
    T = 5.0
    ts = samples(T, 300)
    I_D, I_L = 1.0, 0.55   # 稳定时灯泡支路、线圈支路电流（R > R_D，所以 I_L < I_D）
    I_D0 = 1.45             # 闭合瞬间线圈支路相当于断路，灯泡支路电流较大

    def i_s(t):
        if t < t1:
            return I_D + (I_D0 - I_D) * math.exp(-t / tau)
        return -I_L * math.exp(-(t - t1) / tau)
    series = [i_s(t) for t in ts]
    an = Anim(820, 340, "闭合开关：灯泡支路电流从较大值逐渐减小到 I_D；断开开关：线圈中的电流 I_L 反向流过灯泡和传感器，从比 I_D 小的值逐渐减为零", ts, dur=9)
    # 电路
    x0, x1 = 50, 400
    yT, yM, yB = 70, 165, 265
    an.add(poly([(x0, yT), (x1, yT), (x1, yB), (x0, yB), (x0, yT)], w=1.8))
    an.add(line(x0, yM, x1, yM, w=1.8))
    an.add(f'<rect x="85" y="{yT-11}" width="62" height="22" fill="#fff" stroke="{INK}" stroke-width="1.8"/>' + text(116, yT - 24, "R", size=16))
    coil = "".join(f'<path d="M{200+i*22} {yT} a11 11 0 0 1 22 0" fill="none" stroke="{INK}" stroke-width="1.8"/>' for i in range(5))
    an.add(f'<rect x="196" y="{yT-14}" width="118" height="16" fill="#fff"/>' + coil + text(255, yT - 26, "L", size=16))
    an.add(f'<rect x="80" y="{yM-16}" width="120" height="32" fill="#fff" stroke="{INK}" stroke-width="1.8"/>' + text(140, yM, "电流传感器", size=14, italic=False, cn=True))
    # 灯泡（亮度随 |i| 变化）
    lx, ly = 310, yM
    glow = an.anim("fill-opacity", [f"{min(1, abs(i) / 1.45) * 0.85:.3f}" for i in series])
    an.add(f'<circle cx="{lx}" cy="{ly}" r="17" fill="#fab005" fill-opacity="0">{glow}</circle>')
    an.add(f'<circle cx="{lx}" cy="{ly}" r="17" fill="none" stroke="{INK}" stroke-width="1.8"/>'
           f'<path d="M{lx-12} {ly-12}L{lx+12} {ly+12}M{lx+12} {ly-12}L{lx-12} {ly+12}" stroke="{INK}" stroke-width="1.4"/>' + text(lx, ly + 32, "D", size=15))
    an.add(f'<rect x="150" y="{yB-14}" width="14" height="28" fill="#fff"/>' + line(150, yB - 13, 150, yB + 13, w=2) + line(160, yB - 7, 160, yB + 7, w=3))
    # 开关：t < t1 闭合，之后断开
    sw_x = 300
    an.add(f'<rect x="{sw_x-2}" y="{yB-6}" width="44" height="12" fill="#fff"/>' + f'<circle cx="{sw_x}" cy="{yB}" r="3" fill="{INK}"/><circle cx="{sw_x+40}" cy="{yB}" r="3" fill="{INK}"/>')
    ang = ["0" if t < t1 else "-28" for t in ts]
    an.add(f'<line x1="{sw_x}" y1="{yB}" x2="{sw_x+40}" y2="{yB}" stroke="{INK}" stroke-width="2">'
           + an.anim_tf("rotate", [f"{a} {sw_x} {yB}" for a in ang]) + "</line>")
    an.add(text(sw_x + 20, yB + 24, "S", size=15))
    g = Graph(500, 60, 270, 220, T, -0.8, 1.6, xlabel="t", ylabel="i")
    an.add(g.axes(ticks=((I_D, "I_D"), (-I_L, "−I_L"))))
    x, y = g.P(t1, 0)
    an.add(line(x, g.P(0, 1.5)[1], x, g.P(0, -0.75)[1], color=SOFT, w=0.8, dash="3 4"))
    an.add(text(x + 4, g.P(0, -0.75)[1] + 14, "t₁ 断开", size=12, italic=False, color=SOFT, cn=True, anchor="start"))
    an.add(text(635, 318, "电流向左经过传感器为正", size=13, italic=False, color=SOFT, cn=True))
    an.add(g.trace(an, series))
    save("k18-q12-anim.svg", an)


def k20_q12():
    """磁悬浮驱动：交替反向的磁场以 v 向右移动，线框被带着向右加速，速度趋于 v（总比 v 小）。"""
    v, k = 1.0, 0.9
    T = 6.0
    ts = samples(T, 300)
    vf = [v * (1 - math.exp(-k * t)) for t in ts]
    xf = [v * t - v * (1 - math.exp(-k * t)) / k for t in ts]
    xm = [v * t for t in ts]
    an = Anim(820, 300, "磁场以速度 v 向右移动，线框相对磁场向左运动而受到向右的安培力，被带着向右加速；速度越接近 v，电流越小，最终速度总小于 v（有阻力时）", ts, dur=9)
    L = 70.0
    y0 = 80
    # 移动的磁场：每格 L，点、叉交替；做成很长的一条带，整体向右平移
    cells = []
    for i in range(-14, 12):
        x = i * L
        bg = "#f4f5f7" if i % 2 == 0 else "#e9ecef"
        cells.append(f'<rect x="{f1(x)}" y="{y0}" width="{L}" height="{L*1.6}" fill="{bg}"/>')
        kind = "out" if i % 2 == 0 else "in"
        cells.append(crosses(x + 14, x + L - 14, y0 + 16, y0 + L * 1.6 - 14, step=21, kind=kind))
    band = "".join(cells)
    clip = f'<clipPath id="win"><rect x="20" y="{y0}" width="440" height="{L*1.6}"/></clipPath>'
    an.add(f"<defs>{clip}</defs>")
    an.items.append(f'<g clip-path="url(#win)"><g>{band}' + an.anim_tf("translate", [f"{f1(x * L)} 0" for x in xm]) + "</g></g>")
    an.add(f'<rect x="20" y="{y0}" width="440" height="{L*1.6}" fill="none" stroke="{SOFT}" stroke-width="1"/>')
    an.add(line(360, y0 - 20, 440, y0 - 20, color=FIELD, w=1.6, arrow=True)); an.add(text(400, y0 - 34, "磁场移动 v", size=13, italic=False, color=FIELD, cn=True))
    frame = f'<rect x="30" y="{y0+12}" width="{L}" height="{L*1.6-24}" fill="none" stroke="{ACC}" stroke-width="3"/>'
    an.moving(frame, xs=[x * L for x in xf])
    an.add(text(240, 252, "线框（列车底部）被磁场带着向右运动", size=13, italic=False, color=SOFT, cn=True))
    g = Graph(530, 50, 240, 190, T, 0, 1.2, xlabel="t", ylabel="v′")
    an.add(g.axes(ticks=((v, "v"),)))
    an.add(g.trace(an, vf))
    save("k20-q12-anim.svg", an)


if __name__ == "__main__":
    k14_q6()
    k14_q10()
    k15_q3()
    k15_q9()
    k16_q3()
    k17_q7()
    k18_q12()
    k20_q12()
