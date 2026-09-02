# -*- coding: utf-8 -*-
"""A4 一页两份 · 20题 ABCD 方框涂卡答题卡
   学号：最左侧竖排面板，每位一列（左→右即学号顺序），0-9 纵向"""
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
CN, HV, HVB = 'STSong-Light', 'Helvetica', 'Helvetica-Bold'

import os, datetime
_HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(_HERE, '答题卡_20题_%s.pdf' % datetime.date.today().strftime('%-m.%-d'))
W, H = A4
HALF = H / 2.0

# ---- 可调参数 ----------------------------------------------------
CLASSES    = ["103", "208", "210"]
ID_COLS    = 2          # 学号位数（列数）
GROUPS     = 2          # 答题区列数
ROWS       = 10         # 每列题数
FID        = 4.5*mm     # 定位块边长
FID_X      = 7*mm
FID_Y      = 6*mm
QUIET      = 6*mm       # 定位块静默区
GRID_H     = 100*mm     # 主区高度
ROW_PITCH  = 8.8*mm     # 统一行距（学号与答题共用）
BOX_W      = 11*mm      # 选项框宽（横向长方形 2:1）
BOX_H      = 5.5*mm     # 选项框高
PITCH      = 13.5*mm    # 选项水平间距
ID_BOX_W   = 10*mm      # 学号框宽
ID_BOX_H   = 5*mm       # 学号框高
ID_PITCH   = 12*mm      # 学号列间距
PANEL_W    = 37*mm      # 学号面板宽度
HDR_GAP    = 16*mm      # 列头到首行方框的距离
# ------------------------------------------------------------------

ML = MR = FID_X + FID + QUIET
CTOP = CBOT = FID_Y + FID + QUIET


def draw_half(c, y0):
    x0, x1 = ML, W - MR
    cw = x1 - x0
    top = y0 + HALF - CTOP

    # ---- 四角定位块 ----
    c.setFillColorRGB(0, 0, 0)
    for fx in (FID_X, W - FID_X - FID):
        for fy in (y0 + FID_Y, y0 + HALF - FID_Y - FID):
            c.rect(fx, fy, FID, FID, stroke=0, fill=1)

    # ---- 作业标题 ----
    y = top
    c.setFont(CN, 10)
    c.drawString(x0, y, "作业标题：")
    c.setLineWidth(0.8)
    c.line(x0 + c.stringWidth("作业标题：", CN, 10), y - 2, x1, y - 2)

    # ---- 班级 / 姓名 ----
    y -= 8*mm
    c.setFont(CN, 10)
    c.drawString(x0, y, "班级：")
    bx = x0 + c.stringWidth("班级：", CN, 10) + 2
    bs = 4.8*mm
    for lab in CLASSES:
        c.setLineWidth(1.0)
        c.rect(bx, y - 1.3*mm, bs, bs, stroke=1, fill=0)
        c.setFont(HV, 9)
        c.drawString(bx + bs + 2.5, y, lab)
        bx += bs + 2.5 + c.stringWidth(lab, HV, 9) + 7*mm
        c.setFont(CN, 10)

    nx = x0 + 84*mm
    c.drawString(nx, y, "姓名：")
    c.setLineWidth(0.8)
    c.line(nx + c.stringWidth("姓名：", CN, 10), y - 2, x1, y - 2)

    # ================= 主区外框 =================
    gy_top = y - 6*mm
    gy_bot = gy_top - GRID_H
    c.setLineWidth(1.4)
    c.rect(x0, gy_bot, cw, GRID_H, stroke=1, fill=0)

    hy = gy_top - 7*mm                 # 列头基线
    first_row_y = gy_top - HDR_GAP     # 第一行方框底边

    # ---- 学号面板（最左列）----
    c.setFont(CN, 9)
    c.drawString(x0 + 4*mm, hy, "学号")
    c.setLineWidth(0.6)
    c.line(x0 + 2*mm, hy - 3, x0 + PANEL_W - 2*mm, hy - 3)

    id_x = x0 + PANEL_W - 3*mm - (ID_COLS - 1)*ID_PITCH - ID_BOX_W
    for r in range(10):
        by = first_row_y - r*ROW_PITCH
        c.setFont(HVB, 9)
        c.drawRightString(id_x - 2.5*mm, by + 1.1*mm, str(r))
        c.setLineWidth(1.1)
        for d in range(ID_COLS):
            c.rect(id_x + d*ID_PITCH, by, ID_BOX_W, ID_BOX_H, stroke=1, fill=0)

    # 面板分隔线
    c.setLineWidth(0.9)
    c.setStrokeColorRGB(0.45, 0.45, 0.45)
    c.line(x0 + PANEL_W, gy_bot + 3*mm, x0 + PANEL_W, gy_top - 3*mm)
    c.setStrokeColorRGB(0, 0, 0)

    # ---- 答题区 ----
    ax0 = x0 + PANEL_W
    gwidth = (x1 - ax0) / GROUPS
    for g in range(GROUPS):
        gx = ax0 + g * gwidth
        if g > 0:
            c.setLineWidth(0.6)
            c.setStrokeColorRGB(0.6, 0.6, 0.6)
            c.line(gx, gy_bot + 3*mm, gx, gy_top - 3*mm)
            c.setStrokeColorRGB(0, 0, 0)

        boxes_x = gx + 14*mm
        c.setFont(HVB, 9)
        for i, lab in enumerate("ABCD"):
            c.drawCentredString(boxes_x + i*PITCH + BOX_W/2, hy, lab)
        c.setLineWidth(0.6)
        c.line(gx + 3*mm, hy - 3, gx + gwidth - 3*mm, hy - 3)

        for r in range(ROWS):
            qn = g*ROWS + r + 1
            by = first_row_y - r*ROW_PITCH
            c.setFont(HVB, 10)
            c.drawRightString(gx + 9*mm, by + 1.2*mm, str(qn))
            c.setLineWidth(1.1)
            for i in range(4):
                c.rect(boxes_x + i*PITCH, by, BOX_W, BOX_H, stroke=1, fill=0)

    return gy_bot - y0


c = canvas.Canvas(OUT, pagesize=A4)
c.setTitle("答题卡 20题 A4两份")
draw_half(c, HALF)
gb = draw_half(c, 0)

c.setDash(3, 3); c.setLineWidth(0.7); c.setStrokeColorRGB(0.55, 0.55, 0.55)
c.line(6*mm, HALF, W - 6*mm, HALF)
c.setDash(); c.setFont(CN, 7)
tw = c.stringWidth("沿虚线剪开", CN, 7) + 10
c.setFillColorRGB(1, 1, 1); c.rect(W/2 - tw/2, HALF - 3, tw, 10, stroke=0, fill=1)
c.setFillColorRGB(0.55, 0.55, 0.55)
c.drawCentredString(W/2, HALF + 1.5, "沿虚线剪开")
c.showPage(); c.save()

print("静默区 (mm): 水平 %.1f | 顶 %.1f | 底 %.1f"
      % ((ML - FID_X - FID)/mm, (CTOP - FID_Y - FID)/mm, (gb - FID_Y - FID)/mm))
