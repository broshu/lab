# -*- coding: utf-8 -*-
"""特供答题卡 · 1页A4 · 4份作业 · 仅选择题涂卡"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
CN, HV, HVB = 'STSong-Light', 'Helvetica', 'Helvetica-Bold'
_HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(_HERE, '答题卡_物理12-13章_4份作业.pdf')

W, H = A4

# ---- 作业清单：(标题, 选择题题号列表, 多选题号集合) ----------------
TASKS = [
    ("①  专题强化6　闭合电路的功率、效率及动态分析",
     list(range(1, 12)), {8, 11}),
    ("②  专题强化7　含电容电路的分析与计算　电路故障分析",
     list(range(1, 11)), {7, 9, 10}),
    ("③  第十二章 4.能源与可持续发展",
     list(range(1, 10)), {3}),
    ("④  第十三章 1.磁场　磁感线",
     list(range(1, 12)) + [13], {8, 11}),
]
CLASSES  = ["103", "208", "210"]
ID_COLS  = 2          # 学号位数

# ---- 版式参数 ------------------------------------------------------
FID, FID_X, FID_Y, QUIET = 4.5*mm, 7*mm, 6*mm, 6*mm
COLS       = 3          # 每份作业分几列
BOX_W, BOX_H = 9.2*mm, 4.6*mm
PITCH      = 10.7*mm
ROW_PITCH  = 8.0*mm
NUM_W      = 14*mm      # 题号栏宽
ID_BOX_W, ID_BOX_H = 9*mm, 4.4*mm
ID_PITCH   = 10.5*mm
ID_ROW     = 5.4*mm
PANEL_W    = 33*mm
TITLE_H    = 6.0*mm     # 块内标题带高
HDR_H      = 6.0*mm     # ABCD 列头高
BLOCK_GAP  = 4.0*mm
# --------------------------------------------------------------------

ML = MR = FID_X + FID + QUIET
CTOP = CBOT = FID_Y + FID + QUIET
x0, x1 = ML, W - MR
cw = x1 - x0

c = canvas.Canvas(OUT, pagesize=A4)
c.setTitle("答题卡 物理第12-13章 4份作业")

# ---- 四角定位块 ----
c.setFillColorRGB(0, 0, 0)
for fx in (FID_X, W - FID_X - FID):
    for fy in (FID_Y, H - FID_Y - FID):
        c.rect(fx, fy, FID, FID, stroke=0, fill=1)

top = H - CTOP

# ================= 学号面板（左上）=================
c.setFont(CN, 9.5)
c.drawString(x0 + 3*mm, top, "学号")
c.setLineWidth(0.6)
c.line(x0, top - 3, x0 + PANEL_W, top - 3)

id_x = x0 + PANEL_W - 2*mm - (ID_COLS - 1)*ID_PITCH - ID_BOX_W
id_first = top - 9*mm
for r in range(10):
    by = id_first - r*ID_ROW
    c.setFont(HVB, 8.5)
    c.drawRightString(id_x - 2.2*mm, by + 1.1*mm, str(r))
    c.setLineWidth(1.0)
    for d in range(ID_COLS):
        c.rect(id_x + d*ID_PITCH, by, ID_BOX_W, ID_BOX_H, stroke=1, fill=0)
panel_bot = id_first - 9*ID_ROW - 3*mm
c.setLineWidth(0.8)
c.rect(x0, panel_bot, PANEL_W, top + 4*mm - panel_bot, stroke=1, fill=0)

# ================= 班级 / 姓名 / 日期（右上）=================
hx = x0 + PANEL_W + 8*mm
hy = top - 2*mm
c.setFont(CN, 11)
c.drawString(hx, hy, "班级：")
bx = hx + c.stringWidth("班级：", CN, 11) + 3
bs = 5.2*mm
for lab in CLASSES:
    c.setLineWidth(1.1)
    c.rect(bx, hy - 1.4*mm, bs, bs, stroke=1, fill=0)
    c.setFont(HV, 10)
    c.drawString(bx + bs + 3, hy, lab)
    bx += bs + 3 + c.stringWidth(lab, HV, 10) + 9*mm
    c.setFont(CN, 11)

hy -= 15*mm
c.drawString(hx, hy, "姓名：")
c.setLineWidth(0.9)
c.line(hx + c.stringWidth("姓名：", CN, 11), hy - 2, hx + 62*mm, hy - 2)
c.drawString(hx + 72*mm, hy, "日期：")
c.line(hx + 72*mm + c.stringWidth("日期：", CN, 11), hy - 2, x1, hy - 2)

# ---- 我的疑问 ----
q_top = hy - 9*mm
q_bot = panel_bot
c.setLineWidth(1.0)
c.rect(hx, q_bot, x1 - hx, q_top - q_bot, stroke=1, fill=0)
c.setFont(CN, 9.5)
c.drawString(hx + 3*mm, q_top - 6*mm, "我的疑问：")
c.setLineWidth(0.4)
c.setStrokeColorRGB(0.75, 0.75, 0.75)
gl = q_top - 6*mm
while gl - 9*mm > q_bot + 3*mm:
    gl -= 9*mm
    c.line(hx + 3*mm, gl - 1.5*mm, x1 - 3*mm, gl - 1.5*mm)
c.setStrokeColorRGB(0, 0, 0)

# ================= 四个作业块 =================
y = panel_bot - BLOCK_GAP - 2*mm
gwidth = cw / COLS

for title, qnums, multi in TASKS:
    n = len(qnums)
    rows = -(-n // COLS)
    bh = TITLE_H + HDR_H + rows*ROW_PITCH + 3*mm
    by_top = y
    by_bot = y - bh

    c.setLineWidth(1.3)
    c.rect(x0, by_bot, cw, bh, stroke=1, fill=0)

    # 标题带
    ty = by_top - TITLE_H + 2*mm
    c.setFont(CN, 9.5)
    c.drawString(x0 + 3*mm, ty, title)
    c.setLineWidth(0.7)
    c.line(x0, by_top - TITLE_H, x1, by_top - TITLE_H)

    hdr_y = by_top - TITLE_H - HDR_H + 2*mm
    first_y = by_top - TITLE_H - HDR_H - BOX_H

    for col in range(COLS):
        gx = x0 + col*gwidth
        if col:
            c.setLineWidth(0.5)
            c.setStrokeColorRGB(0.62, 0.62, 0.62)
            c.line(gx, by_bot + 2*mm, gx, by_top - TITLE_H - 1*mm)
            c.setStrokeColorRGB(0, 0, 0)

        bx0 = gx + NUM_W
        c.setFont(HVB, 8.5)
        for i, lab in enumerate("ABCD"):
            c.drawCentredString(bx0 + i*PITCH + BOX_W/2, hdr_y, lab)

        for r in range(rows):
            k = col*rows + r
            if k >= n:
                break
            qn = qnums[k]
            yy = first_y - r*ROW_PITCH
            c.setFont(HVB, 9.5)
            c.drawRightString(gx + 8*mm, yy + 1.2*mm, str(qn))
            if qn in multi:
                c.setFont(CN, 6)
                c.setFillColorRGB(0.35, 0.35, 0.35)
                c.drawString(gx + 8.8*mm, yy + 1.2*mm, "多")
                c.setFillColorRGB(0, 0, 0)
            c.setLineWidth(1.1)
            for i in range(4):
                c.rect(bx0 + i*PITCH, yy, BOX_W, BOX_H, stroke=1, fill=0)

    y = by_bot - BLOCK_GAP

c.showPage()
c.save()
print("底部余量 %.1f mm（需 > %.1f）" % ((y + BLOCK_GAP - CBOT)/mm, 0))
print("题量：", [len(t[1]) for t in TASKS], "共", sum(len(t[1]) for t in TASKS))
