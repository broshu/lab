#!/usr/bin/env python3
"""从作业本 docx 里提取题干，写进 topics/*.md（每题「**答案：**」上方的「**题目**」块）。

用法：
    python3 tutor/extract_stems.py 作业本.docx content/bx3/topics/ks22-xxx.md [--write] [--teacher]

--teacher：来源是教师用书（课时作业在文末，题后紧跟解析），只取文末课时作业的题干。

不加 --write 只打印结果供核对；加了才写回 md，并把题干配图存进 assets。
已经有「**题目**」块的题会被跳过，所以手工改过的题干不会被覆盖。

docx 里的公式有两种写法，这里都转成 LaTeX：
- Word 公式编辑器（OMML）：分数、上下标、根号等；
- 普通文字里的斜体字母、上下标（例如 I²r 实际是「I」+上标「2」+「r」）。
只依赖标准库。
"""

import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
M = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
V = "{urn:schemas-microsoft-com:vml}"

ROOT = Path(__file__).resolve().parent

SYMBOLS = {
    "－": "-", "−": "-", "＋": "+", "＝": "=", "×": "\\times ", "÷": "\\div ",
    "≈": "\\approx ", "≠": "\\neq ", "≤": "\\le ", "≥": "\\ge ", "＜": "<", "＞": ">",
    "Δ": "\\Delta ", "Ω": "\\Omega ", "π": "\\pi ", "θ": "\\theta ", "α": "\\alpha ",
    "β": "\\beta ", "φ": "\\varphi ", "ε": "\\varepsilon ", "η": "\\eta ", "ρ": "\\rho ",
    "μ": "\\mu ", "λ": "\\lambda ", "ω": "\\omega ", "（": "(", "）": ")", "′": "'",
    "∶": ":", "：": ":", "·": "\\cdot ", "%": "\\%", "％": "\\%",
}


def tex(s):
    out = "".join(SYMBOLS.get(c, c) for c in s)
    # 公式里的汉字（如 r_测）要包进 \text{}
    return re.sub(r"[\u4e00-\u9fff]+", lambda m: f"\\text{{{m.group(0)}}}", out)


# ---------------------------------------------------------------- OMML → LaTeX

def omml(node):
    tag = node.tag.replace(M, "")
    kids = list(node)

    def sub(name):
        el = node.find(M + name)
        return omml_children(el) if el is not None else ""

    if tag == "r":
        return tex("".join(t.text or "" for t in node.iter(M + "t")))
    if tag == "f":
        return f"\\dfrac{{{sub('num')}}}{{{sub('den')}}}"
    if tag == "sSup":
        return f"{{{sub('e')}}}^{{{sub('sup')}}}"
    if tag == "sSub":
        return f"{{{sub('e')}}}_{{{sub('sub')}}}"
    if tag == "sSubSup":
        return f"{{{sub('e')}}}_{{{sub('sub')}}}^{{{sub('sup')}}}"
    if tag == "rad":
        deg = sub("deg")
        return f"\\sqrt[{deg}]{{{sub('e')}}}" if deg else f"\\sqrt{{{sub('e')}}}"
    if tag == "d":
        pr = node.find(M + "dPr")
        beg, end = "(", ")"
        if pr is not None:
            b, e = pr.find(M + "begChr"), pr.find(M + "endChr")
            if b is not None:
                beg = b.get(M + "val", "")
            if e is not None:
                end = e.get(M + "val", "")
        inner = ",".join(omml_children(e) for e in node.findall(M + "e"))
        return f"\\left{tex(beg) or '.'}{inner}\\right{tex(end) or '.'}"
    if tag == "bar" or tag == "acc":
        return f"\\overline{{{sub('e')}}}"
    if tag in ("fPr", "rPr", "ctrlPr", "sSupPr", "sSubPr", "radPr", "dPr", "accPr", "barPr"):
        return ""
    return "".join(omml(k) for k in kids)


def omml_children(el):
    return "".join(omml(k) for k in el)


# ---------------------------------------------------------------- 段落 → 片段

def run_pieces(run):
    """一个 w:r → [(kind, text)]，kind 为 text / math / sub / sup。"""
    rpr = run.find(W + "rPr")
    italic = rpr is not None and rpr.find(W + "i") is not None and rpr.find(W + "i").get(W + "val") not in ("0", "false")
    va = rpr.find(W + "vertAlign").get(W + "val") if rpr is not None and rpr.find(W + "vertAlign") is not None else None
    text = "".join(t.text or "" for t in run.iter(W + "t"))
    if not text:
        return []
    if va == "subscript":
        return [("sub", text)]
    if va == "superscript":
        return [("sup", text)]
    if italic and re.fullmatch(r"[A-Za-z0-9α-ωΑ-Ω′' ]+", text):
        return [("math", text)]
    return [("text", text)]


def paragraph(p, images):
    pieces = []
    for el in p.iter():
        if el.tag == W + "r" and el.find(".//" + M + "t") is None:
            if el.find(".//" + W + "drawing") is not None or el.find(".//" + V + "imagedata") is not None:
                for blip in el.iter(A + "blip"):
                    images.append(blip.get(R + "embed"))
                for img in el.iter(V + "imagedata"):
                    images.append(img.get(R + "id"))
                pieces.append(("img", str(len(images) - 1)))
            pieces.extend(run_pieces(el))
        elif el.tag == M + "oMath":
            pieces.append(("math", None, omml(el)))
    return pieces


OPERATORS = re.compile(r"^[\s0-9.,＋＝－−+=×÷()（）′'∶:<>＜＞≈≤≥Δ]*$")


def to_markdown(pieces):
    """把 math/sub/sup 合成 $...$，夹在两段公式之间的纯运算符一并并入。"""
    # 相邻的上标片段合并：10 + 上标「-」+ 上标「34」→ 10^{-34}
    joined = []
    for piece in pieces:
        if joined and piece[0] in ("sub", "sup") and joined[-1][0] == piece[0]:
            joined[-1] = (piece[0], joined[-1][1] + piece[1])
        else:
            joined.append(piece)
    pieces = joined

    out = []  # [kind, text]
    for piece in pieces:
        kind, text = piece[0], piece[-1]
        if kind == "math":
            out.append(["math", piece[2] if len(piece) == 3 else tex(text)])
        elif kind in ("sub", "sup"):
            mark = "_" if kind == "sub" else "^"
            if out and out[-1][0] == "math":
                out[-1][1] += f"{mark}{{{tex(text)}}}"
            elif out and out[-1][0] == "text" and re.search(r"[A-Za-z0-9)α-ωΔ]$", out[-1][1]):
                # 正体字母的上下标，例如单位 m/s²
                base = re.search(r"[A-Za-z0-9)α-ωΔ]+$", out[-1][1]).group(0)
                out[-1][1] = out[-1][1][: -len(base)]
                body = tex(base) if re.fullmatch(r"[α-ωΔ]", base) else f"\\mathrm{{{base}}}"
                out.append(["math", f"{body}{mark}{{{tex(text)}}}"])
            else:
                out.append(["math", f"{mark}{{{tex(text)}}}"])
        elif kind == "img":
            out.append(["img", text])
        else:
            out.append(["text", text])

    merged = []
    for kind, text in out:
        if kind == "math" and merged and merged[-1][0] == "math":
            merged[-1][1] += text
        elif (kind == "math" and len(merged) >= 2 and merged[-1][0] == "text"
              and merged[-2][0] == "math" and OPERATORS.match(merged[-1][1])
              and merged[-1][1].strip()):
            op = merged.pop()[1]
            merged[-1][1] += tex(op.strip()) + text
        elif kind == "text" and merged and merged[-1][0] == "text":
            merged[-1][1] += text
        else:
            merged.append([kind, text])

    md = ""
    for kind, text in merged:
        if kind == "math":
            md += f"${text.strip()}$"
        elif kind == "img":
            md += f"\n\n@@IMG{text}@@\n\n"
        else:
            md += text
    return tidy_math(md.strip())


def tidy_math(md):
    """把紧挨着公式的运算符和数字并进公式：$R_2$＝0 → $R_2=0$，Δ$U$ → $\\Delta U$。"""
    ops = {"＝": "=", "=": "=", "＋": "+", "+": "+", "－": "-", "−": "-", "×": "\\times "}
    md = re.sub(r"\$([^$]+)\$ ?([＝=＋+－−]) ?([0-9]+(?:\.[0-9]+)?)?",
                lambda m: f"${m.group(1)}{ops[m.group(2)]}{m.group(3) or ''}$", md)
    md = re.sub(r"Δ ?\$", r"$\\Delta ", md)
    md = re.sub(r"(?<![0-9A-Za-z.])([0-9]+(?:\.[0-9]+)?) ?([＋－−×]) ?\$",
                lambda m: f"${m.group(1)}{ops[m.group(2)]}", md)
    # 前面几步可能让两段公式首尾相接：$a$$b$ → $ab$
    md = re.sub(r"\$\$(?=[^$])", "", md)
    return md


QSTART = re.compile(r"^(\d+)\s*[.．、]\s*")


def extract(docx, teacher=False):
    z = zipfile.ZipFile(docx)
    doc = ET.fromstring(z.read("word/document.xml"))
    rels = ET.fromstring(z.read("word/_rels/document.xml.rels"))
    target = {r.get("Id"): r.get("Target") for r in rels}

    questions, current, images = {}, None, []
    lines = [to_markdown(paragraph(p, images)) for p in doc.iter(W + "p")]
    lines = [l for l in lines if l]
    if teacher:
        # 教师用书：课时作业在文末，从最后一个「1.」开始；每题的「解析：」「答案：」之后都不是题干
        starts = [i for i, l in enumerate(lines) if re.match(r"^1\s*[.．]\s*\S", l)]
        lines = lines[starts[-1]:] if starts else lines
    skipping = False
    for line in lines:
        m = QSTART.match(line)
        if teacher and m and int(m.group(1)) == (current or 0) + 1:
            skipping = False
        if teacher and re.match(r"^(解析|答案)[：:]", line):
            skipping = True
        if skipping:
            continue
        if m and int(m.group(1)) == (current or 0) + 1:
            current = int(m.group(1))
            questions[current] = [line[m.end():]]
        elif current is not None:
            questions[current].append(line)

    result = {}
    for no, lines in questions.items():
        body, figures = [], []
        for line in lines:
            for i, part in enumerate(re.split(r"@@IMG(\d+)@@", line)):
                if i % 2:
                    figures.append("word/" + target[images[int(part)]])
                elif part.strip():
                    body.append(part.strip())
        result[no] = (body, figures, z)
    return result


def stem_block(no, body, figure_paths):
    lines = ["**题目**", ""]
    # 选项 A. B. C. D. 各占一行，变成列表
    split = []
    for line in body:
        # 一行里挤了几个选项：「A.4.5 WB.45 W」「A.1 s　　B.2 s」——按 B、C、D… 的顺序依次切开
        m = re.match(r"^([A-H])\s*[.．]", line)
        while m:
            nxt = chr(ord(m.group(1)) + 1)
            cut = re.search(rf"[　 ]*(?={nxt}\s*[.．])", line[2:])
            if not cut:
                break
            split.append(line[: cut.start() + 2].strip())
            line = line[cut.start() + 2:].strip()
            m = re.match(r"^([A-H])\s*[.．]", line)
        split.append(line)
    for line in split:
        if re.match(r"^[A-H]\s*[.．]", line):
            lines.append("- " + re.sub(r"^([A-H])\s*[.．]\s*", r"\1．", line))
        else:
            if lines[-1].startswith("- "):
                lines.append("")
            lines += [line, ""]
    if lines[-1].startswith("- "):
        lines.append("")
    for src in figure_paths:
        lines += [f"![第 {no} 题原题图。]({src})", ""]
    return "\n".join(lines).rstrip() + "\n\n"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    write = "--write" in sys.argv
    docx, md_path = Path(args[0]), Path(args[1])
    stems = extract(docx, teacher="--teacher" in sys.argv)
    md = md_path.read_text(encoding="utf8")
    topic = re.search(r"^id:\s*(\S+)", md, re.M).group(1)
    book = md_path.parent.parent.name

    heads = list(re.finditer(r"^##\s+(\d+)\.[^\n]*\n", md, re.M))
    if len(heads) != len(stems):
        print(f"!! 题数不一致：md {len(heads)} 题，docx {len(stems)} 题", file=sys.stderr)

    out, last = [], 0
    for h in heads:
        no = int(h.group(1))
        out.append(md[last:h.end()])
        last = h.end()
        nxt = md[h.end():]
        if re.match(r"\s*\*\*题目\*\*", nxt) or no not in stems:
            continue
        body, figures, z = stems[no]
        paths = []
        for k, member in enumerate(figures, 1):
            ext = Path(member).suffix.lower().replace(".jpeg", ".png")
            rel = f"assets/{book}/{topic}-q{no:02d}-stem{k}{ext}"
            paths.append(rel)
            if write:
                data = z.read(member)
                if member.lower().endswith((".jpg", ".jpeg")):
                    tmp = ROOT / rel
                    tmp.with_suffix(".jpg").write_bytes(data)
                    import subprocess
                    subprocess.run(["convert", str(tmp.with_suffix(".jpg")), str(tmp)], check=True)
                    tmp.with_suffix(".jpg").unlink()
                else:
                    (ROOT / rel).write_bytes(data)
        out.append("\n" + stem_block(no, body, paths))
    out.append(md[last:])
    new = "".join(out).replace("\n\n\n\n", "\n\n").replace("\n\n\n", "\n\n")
    if write:
        md_path.write_text(new, encoding="utf8")
        print(f"已写入 {md_path.name}")
    else:
        for no in sorted(stems):
            print(f"===== {no}\n" + stem_block(no, stems[no][0], stems[no][1]))


if __name__ == "__main__":
    main()
