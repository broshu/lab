#!/usr/bin/env python3
"""把 content/**/topics/*.md 编译成前端用的 data.js（每本书一个内容目录，见 BOOKS）。

用法：
    python3 tutor/build.py

只依赖标准库。md 里的 $...$ / $$...$$ 原样保留，交给页面上的 KaTeX 渲染。
"""

import hashlib
import html
import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "data.js"
PAGE = ROOT / "index.html"

# 一本书 = 一个内容目录（里面放 chapters.txt 和 topics/*.md）。
# chat=False 表示这本书的 md 里没有题干，只有解析，页面上不显示「问问 AI」
# —— 没有题目原文，AI 只能瞎猜，不如不给。
BOOKS = [
    {"id": "summer2026", "title": "暑假作业", "dir": "content", "chat": True},
    {"id": "bx3", "title": "必修三作业本", "dir": "content/bx3", "chat": False},
]

# ---------------------------------------------------------------- markdown

MATH_BLOCK = re.compile(r"\$\$.*?\$\$", re.S)
MATH_INLINE = re.compile(r"\$[^$\n]+\$")


def inline(text):
    """行内标记：**粗体**。数学公式里不会出现 ** ，无需保护。"""
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text, flags=re.S)


def render_table(lines):
    rows = []
    for line in lines:
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        rows.append(cells)
    # 第二行是 |---|---| 分隔线
    if len(rows) >= 2 and all(set(c) <= set("-: ") for c in rows[1]):
        head, body = rows[0], rows[2:]
    else:
        head, body = None, rows
    out = ["<table>"]
    if head:
        out.append("<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead>")
    out.append("<tbody>")
    for r in body:
        out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>")
    out.append("</tbody></table>")
    return "".join(out)


def md_to_html(md):
    """支持：段落、**粗体**、无序列表、引用块、管道表格、$$块级公式$$。"""
    # 先整体做 HTML 转义。公式里的 < & 变成实体后，DOM 文本节点里仍是原字符，
    # KaTeX 读取的是文本节点，所以渲染结果正确。
    md = html.escape(md, quote=False)

    out = []
    for block in re.split(r"\n\s*\n", md.strip()):
        block = block.strip("\n")
        if not block.strip():
            continue
        lines = block.split("\n")

        # 块级公式独占一段
        if block.startswith("$$") and block.endswith("$$"):
            out.append(f'<p class="math-block">{block}</p>')
            continue

        # 表格
        if all(l.strip().startswith("|") for l in lines):
            out.append(render_table(lines))
            continue

        # 引用块
        if all(l.startswith("&gt;") for l in lines):
            text = " ".join(l[4:].strip() for l in lines)
            out.append(f"<blockquote>{inline(text)}</blockquote>")
            continue

        # 无序列表
        if all(l.startswith("- ") for l in lines):
            items = "".join(f"<li>{inline(l[2:].strip())}</li>" for l in lines)
            out.append(f"<ul>{items}</ul>")
            continue

        out.append(f"<p>{inline(' '.join(l.strip() for l in lines))}</p>")

    return "".join(out)


# ---------------------------------------------------------------- 解析 md

FRONT = re.compile(r"^---\n(.*?)\n---\n", re.S)
# ## 1. 单选 · 电场中的平衡问题
QHEAD = re.compile(r"^##\s+(\d+)\.\s*([^·\n]*?)(?:\s*·\s*(.*))?\s*$", re.M)
ANSWER = re.compile(r"^\*\*答案：\s*(.+?)\s*\*\*\s*$", re.M)


def parse_topic(path):
    raw = path.read_text(encoding="utf8")

    meta = {}
    m = FRONT.match(raw)
    if m:
        for line in m.group(1).split("\n"):
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
        raw = raw[m.end():]

    heads = list(QHEAD.finditer(raw))
    questions = []
    for i, h in enumerate(heads):
        body = raw[h.end(): heads[i + 1].start() if i + 1 < len(heads) else len(raw)]
        # 去掉分隔线和结尾的答案速查表
        body = re.split(r"\n---\s*\n", body)[0]

        a = ANSWER.search(body)
        if not a:
            raise SystemExit(f"{path.name} 第{h.group(1)}题找不到 **答案：X**")

        after = body[a.end():]
        after = re.sub(r"^\s*\*\*解析\*\*\s*", "", after, count=1)

        questions.append({
            "no": int(h.group(1)),
            "type": (h.group(2) or "").strip(),
            "section": (h.group(3) or "").strip(),
            # 计算题的答案本身含 LaTeX，会以 innerHTML 插入页面，这里先转义
            "answer": html.escape(a.group(1).strip(), quote=False),
            "html": md_to_html(after),
            # 原始 markdown（题干+选项+答案+解析），页面上不显示，
            # 只作为上下文发给 AI —— 学生问问题时它才知道题目是什么。
            "source": body.strip(),
        })

    return meta, questions


def build_book(book):
    """编译一本书：读 chapters.txt 定顺序，再把 topics/*.md 填进去。"""
    root = ROOT / book["dir"]
    order = []
    for line in (root / "chapters.txt").read_text(encoding="utf8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        cid, title = [p.strip() for p in line.split("|", 1)]
        order.append((cid, title))

    ready = {}
    for path in sorted((root / "topics").glob("*.md")):
        meta, questions = parse_topic(path)
        cid = meta.get("id") or path.stem.split("-")[0]
        if not book["chat"]:
            # 没有题干可给 AI，就别把半截资料塞进 data.js
            for q in questions:
                q["source"] = ""
        ready[cid] = (meta, questions)
        print(f"  [{book['id']}] {path.name}: {len(questions)} 题")

    chapters = []
    for cid, title in order:
        if cid in ready:
            meta, questions = ready[cid]
            chapters.append({
                "id": cid,
                "title": meta.get("title") or title,
                "ready": True,
                "questions": questions,
            })
        else:
            chapters.append({"id": cid, "title": title, "ready": False, "questions": []})

    for cid in ready:
        if cid not in dict(order):
            raise SystemExit(f"{book['id']}：{cid} 不在 chapters.txt 里，请先补上章节清单")

    return {"id": book["id"], "title": book["title"], "chapters": chapters}


def main():
    books = [build_book(b) for b in BOOKS]
    chapters = [c for b in books for c in b["chapters"]]

    built = datetime.now().strftime("%Y-%m-%d %H:%M")
    data = {"built": built, "books": books}
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(
        "/* 由 build.py 自动生成，请勿直接编辑；改题目请改 content/**/topics/*.md */\n"
        f"window.TUTOR_DATA = {payload};\n",
        encoding="utf8",
    )

    # 给 data.js 打指纹，并写进 index.html 的 script 标签。
    # 不这么做的话，浏览器会一直用缓存里的旧 data.js，新加的章节死活出不来。
    stamp = hashlib.md5(payload.encode("utf8")).hexdigest()[:8]
    page = PAGE.read_text(encoding="utf8")
    page, n = re.subn(
        r'<script src="data\.js(?:\?v=[0-9a-f]+)?"></script>',
        f'<script src="data.js?v={stamp}"></script>',
        page,
    )
    if n != 1:
        raise SystemExit("index.html 里没找到唯一的 data.js script 标签，缓存指纹没写进去")
    PAGE.write_text(page, encoding="utf8")

    done = sum(1 for c in chapters if c["ready"])
    total = sum(len(c["questions"]) for c in chapters)
    print(f"已写入 {OUT.name}：{done}/{len(chapters)} 个章节，共 {total} 题")
    print(f"index.html 已更新为 data.js?v={stamp}（构建时间 {built}）")


if __name__ == "__main__":
    main()
