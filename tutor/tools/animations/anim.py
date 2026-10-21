#!/usr/bin/env python3
"""生成解析里的动画演示（SVG + SMIL，放在 assets 里当普通插图用，<img> 里也会自动播放）。

用法：python3 tutor/tools/animations/anim.py
每个动画是一个函数，坐标用题目里的“物理坐标”（y 向上），Fig 负责换算成屏幕坐标。
轨迹由若干段直线 / 圆弧 / 抛物线组成，小球沿轨迹运动、身后留下轨迹线，播放完停一会儿再重播。
"""
import math
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "assets" / "xx2"
INK = "#1f2933"
SOFT = "#9aa5b1"
ACC = "#d9480f"
FIELD = "#7b8794"
BLUE = "#1c7ed6"


class Fig:
    def __init__(self, xmin, xmax, ymin, ymax, scale=80, pad=28):
        self.xmin, self.ymax, self.s, self.pad = xmin, ymax, scale, pad
        self.w = (xmax - xmin) * scale + 2 * pad
        self.h = (ymax - ymin) * scale + 2 * pad
        self.items = []
        self.segs = []

    def P(self, x, y):
        return (self.pad + (x - self.xmin) * self.s, self.pad + (self.ymax - y) * self.s)

    def f(self, v):
        return f"{v:.1f}"

    # ---------- 静态元素
    def line(self, a, b, color=INK, width=1.6, dash=None, arrow=False):
        (x1, y1), (x2, y2) = self.P(*a), self.P(*b)
        d = f' stroke-dasharray="{dash}"' if dash else ""
        m = ' marker-end="url(#arr)"' if arrow else ""
        self.items.append(f'<line x1="{self.f(x1)}" y1="{self.f(y1)}" x2="{self.f(x2)}" y2="{self.f(y2)}" stroke="{color}" stroke-width="{width}"{d}{m}/>')

    def text(self, p, s, size=17, italic=True, color=INK, anchor="middle"):
        x, y = self.P(*p)
        st = ' font-style="italic"' if italic else ""
        self.items.append(f'<text x="{self.f(x)}" y="{self.f(y + size * 0.35)}" font-size="{size}"{st} fill="{color}" text-anchor="{anchor}" font-family="Times New Roman, serif">{s}</text>')

    def dot(self, p, r=3.2, color=INK):
        x, y = self.P(*p)
        self.items.append(f'<circle cx="{self.f(x)}" cy="{self.f(y)}" r="{r}" fill="{color}"/>')

    def circle(self, c, r, color=SOFT, dash="5 5", width=1.2):
        x, y = self.P(*c)
        self.items.append(f'<circle cx="{self.f(x)}" cy="{self.f(y)}" r="{self.f(r * self.s)}" fill="none" stroke="{color}" stroke-width="{width}" stroke-dasharray="{dash}"/>')

    def field(self, x0, x1, y0, y1, kind, step=0.5, inside=None):
        """磁场符号：kind='out' 画点，'in' 画叉；inside(x, y) 可限定区域。"""
        nx, ny = int(round((x1 - x0) / step)), int(round((y1 - y0) / step))
        for i in range(nx + 1):
            for j in range(ny + 1):
                x, y = x0 + i * step, y0 + j * step
                if inside and not inside(x, y):
                    continue
                px, py = self.P(x, y)
                if kind == "out":
                    self.items.append(f'<circle cx="{self.f(px)}" cy="{self.f(py)}" r="2.2" fill="{FIELD}"/>')
                else:
                    k = 4
                    self.items.append(f'<path d="M{self.f(px-k)} {self.f(py-k)}L{self.f(px+k)} {self.f(py+k)}M{self.f(px+k)} {self.f(py-k)}L{self.f(px-k)} {self.f(py+k)}" stroke="{FIELD}" stroke-width="1.2"/>')

    # ---------- 轨迹
    def move(self, p):
        self.segs.append(("M", p))
        self.cur = p

    def to(self, p):
        self.segs.append(("L", p))
        self.cur = p

    def arc(self, c, r, a0, a1):
        """以 c 为圆心、半径 r，从角 a0 转到 a1（度，逆时针为正）。"""
        end = (c[0] + r * math.cos(math.radians(a1)), c[1] + r * math.sin(math.radians(a1)))
        large = 1 if abs(a1 - a0) > 180 else 0
        sweep = 0 if a1 > a0 else 1  # 物理坐标逆时针 = 屏幕上的负角方向
        self.segs.append(("A", (r, large, sweep, end)))
        self.cur = end

    def quad(self, ctrl, end):
        self.segs.append(("Q", (ctrl, end)))
        self.cur = end

    def path_d(self):
        out = []
        for kind, v in self.segs:
            if kind in "ML":
                x, y = self.P(*v)
                out.append(f"{kind}{self.f(x)} {self.f(y)}")
            elif kind == "A":
                r, large, sweep, end = v
                x, y = self.P(*end)
                out.append(f"A{self.f(r * self.s)} {self.f(r * self.s)} 0 {large} {sweep} {self.f(x)} {self.f(y)}")
            else:
                (cx, cy), (ex, ey) = self.P(*v[0]), self.P(*v[1])
                out.append(f"Q{self.f(cx)} {self.f(cy)} {self.f(ex)} {self.f(ey)}")
        return " ".join(out)

    def svg(self, title, dur=6, hold=0.18, extra=""):
        d = self.path_d()
        kt = f"0;{1 - hold:.2f};1"
        anim = (
            f'<path d="{d}" fill="none" stroke="{ACC}" stroke-opacity=".18" stroke-width="2" stroke-dasharray="4 5"/>'
            f'<path d="{d}" fill="none" stroke="{ACC}" stroke-width="2.6" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1">'
            f'<animate attributeName="stroke-dashoffset" values="1;0;0" keyTimes="{kt}" dur="{dur}s" repeatCount="indefinite"/></path>'
            f'<circle r="6" fill="{ACC}" stroke="#fff" stroke-width="1.5">'
            f'<animateMotion path="{d}" keyPoints="0;1;1" keyTimes="{kt}" calcMode="linear" dur="{dur}s" repeatCount="indefinite"/></circle>'
        )
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.f(self.w)} {self.f(self.h)}" width="{self.f(self.w)}" height="{self.f(self.h)}" role="img" aria-label="{title}">'
            f'<title>{title}</title>'
            f'<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{INK}"/></marker></defs>'
            f'<rect width="100%" height="100%" fill="#fff"/>'
            + "".join(self.items) + extra + anim + "</svg>"
        )


def save(name, text):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(text, encoding="utf8")
    print("写入", name)


# ======================================================================
def k05_q12():
    """第一象限磁场：圆弧 120° 后离开磁场，竖直向下匀速到 B。"""
    L = 1
    f = Fig(-0.35, 2.0, -1.25, 1.25, scale=150)
    f.field(0.15, 1.95, 0.15, 1.15, "out", step=0.3)
    f.line((-0.3, 0), (1.95, 0), arrow=True); f.text((1.92, -0.1), "x")
    f.line((0, -1.2), (0, 1.22), arrow=True); f.text((-0.1, 1.18), "y")
    f.text((-0.1, -0.1), "O")
    A, C, X, B = (0, math.sqrt(3) / 2), (0.5, 0), (1.5, 0), (1.5, -1)
    f.dot(A); f.text((-0.12, A[1]), "A")
    f.dot(B); f.text((1.62, -1.0), "B")
    f.dot(C, color=SOFT); f.line(C, A, color=SOFT, dash="4 4", width=1); f.line(C, X, color=SOFT, dash="4 4", width=1)
    f.text((0.62, 0.22), "120°", size=14, italic=False, color=SOFT)
    f.text((0.5, -0.12), "圆心", size=12, italic=False, color=SOFT)
    f.move(A); f.arc(C, L, 120, 0); f.to(B)
    save("k05-q12-anim.svg", f.svg("粒子在磁场中转过 120° 后离开第一象限，再匀速直线运动到 B 点", dur=5))


def k06_q11():
    """旋转圆：半径为 a 的轨迹圆绕 O 转动，找打中挡板的临界轨迹。"""
    a = 1
    s3 = math.sqrt(3)
    f = Fig(-1.3, 2.35, -2.25, 2.25, scale=110)
    f.field(-1.2, 2.2, -2.1, 2.1, "in", step=0.42)
    O, N, M = (0, 0), (s3, 0), (s3, 1)
    f.line(N, M, width=6, color=INK)
    f.text((s3 + 0.15, 1.0), "M"); f.text((s3 + 0.15, -0.05), "N")
    f.dot(O); f.text((-0.15, 0.05), "O")
    f.line(O, N, color=SOFT, dash="4 4", width=1)
    # 动画：轨迹圆绕 O 旋转一周（半透明虚线），突出“所有轨迹圆都过 O 点”
    cx, cy = f.P(0, 0)
    r = a * f.s
    rot = (f'<g><circle cx="{f.f(cx + r)}" cy="{f.f(cy)}" r="{f.f(r)}" fill="none" stroke="{BLUE}" stroke-opacity=".55" stroke-width="1.6" stroke-dasharray="6 5"/>'
           f'<animateTransform attributeName="transform" type="rotate" from="0 {f.f(cx)} {f.f(cy)}" to="-360 {f.f(cx)} {f.f(cy)}" dur="9s" repeatCount="indefinite"/></g>')
    # 小球走恰好经过 N 点的轨迹（与 ON 成 60° 射出，逆时针转 120° 到 N）
    c1 = (s3 / 2, 0.5)
    f.circle(c1, a, color=SOFT, dash="2 4", width=1)
    f.move(O); f.arc(c1, a, 210, 330)
    f.text((0.85, -0.65), "过 N 点的轨迹", size=13, italic=False, color=ACC)
    save("k06-q11-anim.svg", f.svg("半径为 a 的轨迹圆绕 O 旋转；橙色是恰好经过 N 点的轨迹", dur=4, extra=rot))


def k07_q7():
    """回旋加速器：每过一次缝隙被加速一次，半径按 √n 增大。"""
    f = Fig(-2.35, 2.35, -2.35, 2.35, scale=100)
    R, gap = 2.2, 0.07
    for side in (1, -1):
        x0 = side * gap
        p1, p2 = f.P(x0, R), f.P(x0, -R)
        sweep = 1 if side == 1 else 0
        f.items.append(f'<path d="M{f.f(p1[0])} {f.f(p1[1])} A{f.f(R*f.s)} {f.f(R*f.s)} 0 0 {sweep} {f.f(p2[0])} {f.f(p2[1])} Z" fill="#f4f5f7" stroke="{INK}" stroke-width="1.6"/>')
    f.field(-2.0, 2.0, -2.0, 2.0, "in", step=0.5, inside=lambda x, y: x * x + y * y < 2.05 ** 2 and abs(x) > 0.25)
    f.text((1.55, 1.75), "D₂", italic=False); f.text((-1.55, 1.75), "D₁", italic=False)
    r1 = 0.5
    y, n, right = 0.0, 1, True
    f.dot((0, 0)); f.text((-0.2, 0.15), "A")
    f.move((0, 0))
    while True:
        r = r1 * math.sqrt(n)
        c = (0, y - r) if right else (0, y + r)
        if abs(c[1]) + r > R - 0.12:
            break
        if right:
            f.arc(c, r, 90, -90); y -= 2 * r
        else:
            f.arc(c, r, -90, -270); y += 2 * r
        right = not right
        n += 1
    save("k07-q07-anim.svg", f.svg("回旋加速器：质子每经过一次缝隙被加速一次，在 D 形盒中的半圆半径逐次增大，最后从边缘射出", dur=9))


def k08_q7():
    """交变磁场：一个周期内 四分之一圆 + 半圆 + 四分之一圆，前进 4R；n=2 时 d=8R。"""
    R = 0.45
    d = 8 * R
    f = Fig(-0.4, d + 0.6, -0.5, 1.4, scale=120)
    f.line((0, -0.45), (0, -0.06), width=2.2); f.line((0, 0.06), (0, 1.35), width=2.2)
    f.line((d, -0.45), (d, -0.06), width=2.2); f.line((d, 0.06), (d, 1.35), width=2.2)
    f.text((-0.15, 1.25), "M", italic=False); f.text((d + 0.18, 1.25), "N", italic=False)
    f.text((-0.18, 0), "O"); f.text((d + 0.2, -0.17), "O′")
    f.line((0, 0), (d, 0), color=SOFT, dash="4 4", width=1)
    f.text((d / 2, -0.35), "磁场每半个周期反向一次（此图为 n = 2）", size=13, italic=False, color=SOFT)
    f.move((0, 0))
    for k in range(2):
        x0 = 4 * R * k
        f.arc((x0, R), R, -90, 0)
        f.arc((x0 + 2 * R, R), R, 180, 0)
        f.arc((x0 + 4 * R, R), R, 180, 270)
    f.to((d + 0.5, 0))
    save("k08-q07-anim.svg", f.svg("交变磁场中离子的轨迹：每个周期前进 4R，两个周期后从 O′ 垂直 N 板射出", dur=7))


def k08_q9():
    """电场中类平抛到 Q，进入磁场后转过 120°，轨迹恰好与下边界相切。"""
    h, d = 1.0, 1.2
    xQ = 2 / math.sqrt(3) * h
    R = 2 * d / 3
    f = Fig(-0.3, 2.2, -1.45, 1.3, scale=150)
    f.field(0.15, 2.1, -1.1, -0.15, "out", step=0.3)
    for i in range(1, 7):
        x = 0.3 * i
        f.line((x, 1.15), (x, 0.06), color=BLUE, width=1, arrow=True)
    f.text((2.0, 0.9), "E")
    f.line((-0.25, 0), (2.15, 0), arrow=True); f.text((2.12, -0.1), "x")
    f.line((0, -1.4), (0, 1.25), arrow=True); f.text((-0.1, 1.2), "y")
    f.line((0, -d), (2.1, -d), color=INK, dash="6 4", width=1.2)
    f.text((-0.15, -d), "−d", italic=False, size=14)
    f.text((-0.1, -0.1), "O")
    P, Q = (0, h), (xQ, 0)
    f.dot(P); f.text((-0.12, h), "P")
    f.dot(Q); f.text((xQ + 0.1, 0.12), "Q")
    c = (xQ - R * math.sqrt(3) / 2, -R / 2)
    f.dot(c, color=SOFT); f.circle(c, R, dash="2 4", width=1)
    f.move(P); f.quad((xQ / 2, h), Q); f.arc(c, R, 30, -90)
    save("k08-q09-anim.svg", f.svg("粒子在电场中做类平抛运动到 Q 点，进入磁场后转过 120°，轨迹恰好与下边界相切", dur=5))


def k09_q2():
    """上下两个反向磁场：粒子从 O 出发、在上方磁场中绕一大段后对称地回到 O。"""
    l = 1.0
    f = Fig(-1.25, 1.25, -0.3, 1.95, scale=170)
    f.field(-1.15, 1.15, 0.12, 0.88, "out", step=0.25)
    f.field(-1.15, 1.15, 1.12, 1.87, "in", step=0.25)
    f.line((-1.2, 0), (1.2, 0), dash="6 4", width=1.2); f.text((1.2, 0.08), "a")
    f.line((-1.2, l), (1.2, l), dash="6 4", width=1.2); f.text((1.2, l + 0.08), "b")
    f.dot((0, 0)); f.text((0, -0.12), "O")
    t = math.degrees(math.atan2(3, 4))  # 36.87°
    rd, ru = 5 / 3 * l, 5 / 12 * l
    f.move((0, 0))
    f.arc((rd, 0), rd, 180, 180 - t)
    f.arc((0, 1.25 * l), ru, -t, 180 + t)
    f.arc((-rd, 0), rd, t, 0)
    save("k09-q02-anim.svg", f.svg("粒子在两磁场中运动：穿过边界时两段圆弧相切，整个轨迹左右对称，最后回到 O 点", dur=6))


def k10_q12():
    """磁场 1/4 圆 → 电场中减速再返回 → 磁场 3/4 圆 → 电场中类平抛回到 P。"""
    R = 1.0
    f = Fig(-3.15, 0.55, -2.8, 0.5, scale=115)
    f.field(-2.6, 0.4, -2.6, 0.4, "in", step=0.4, inside=lambda x, y: y > x + 0.12)
    for i in range(8):
        x = -2.6 + 0.4 * i
        f.line((x, -2.75), (x, x - 0.05), color=BLUE, width=1, arrow=True)
    f.line((-2.75, -2.75), (0.4, 0.4), dash="6 4", width=1.2)
    f.text((0.3, -2.4), "E"); f.text((-2.3, 0.2), "B₀", italic=False)
    P = (0, 0)
    f.dot(P); f.text((0.15, 0.12), "P")
    f.dot((-2, -2)); f.text((-2.15, -2.15), "S")
    f.move(P)
    f.arc((0, -R), R, 90, 180)
    f.to((-R, -R - R / 2)); f.to((-R, -R))
    f.arc((-2 * R, -R), R, 0, 270)
    f.quad((-R, -2 * R), P)
    save("k10-q12-anim.svg", f.svg("粒子先在磁场中转 1/4 圈，进入电场减速、返回，再转 3/4 圈，最后在电场中做类平抛回到 P 点", dur=8))


if __name__ == "__main__":
    k05_q12()
    k06_q11()
    k07_q7()
    k08_q7()
    k08_q9()
    k09_q2()
    k10_q12()
