#!/usr/bin/env python3
"""把三维设计教师用书的 docx 转成 content/<书>/topics/<id>.md 草稿：题目、答案、原书解析、配图。

用法：
    python3 tutor/tools/docx_to_topics.py xx2 k11=教师用书/1.楞次定律第1课时.docx k12=... [--title k11=标题]

- 普通课时：取文末“课时作业”（从最后一个“1.”开始）；
- 文件名含“章末整合”：取文中【例 N】；含“章末综合检测”：整份试卷。
- 自动去掉“能力提升练/素养培优练”和章标题横幅图；jpg 转成 png 存进 assets/<书>/。
生成的是草稿：每题标题写着 TODO，需要人工补小标题、核对解析，再写 guides/<书>/<id>.md 问答脚本，
用 guides/insert_guides.py 插入，最后运行 build.py。注意：重新运行会覆盖同名 md。
"""
from pathlib import Path

import sys, re, zipfile, subprocess, json
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import extract_stems as es
from xml.etree import ElementTree as ET
W = es.W
TUTOR = Path(__file__).resolve().parents[1]
HEADING = re.compile(r"^(知识点[一二三四五六七八九十]+|[一二三四五六七八九十]+、|.{0,8}(能力|素养)提升|（时间：)")

def fixmath(l):
    # $\dfrac{a}{b}B．\dfrac{c}{d}$ —— 选项字母被并进了公式
    def f(m):
        s = m.group(1)
        s = re.sub(r"([A-H])．", r"$　\1．$", s)
        return "$" + s + "$"
    l = re.sub(r"(?<=\d)•(?=[\u4e00-\u9fff])", "·", l)
    l = l.replace("•", r"$\cdot $")
    l = re.sub(r"\$([^$]+)\$", f, l)
    l = l.replace("$$", "")
    l = re.sub(r"\$([^$]*?)[　 ]+\$", r"$\1$　", l)
    l = re.sub(r"\$[　 ]*\$", "", l)
    return l

def fixans(a):
    a = fixmath(a)
    def f(m):
        return "$" + re.sub(r"\(([1-4])\)", r"$　（\1）$", m.group(1)) + "$"
    a = re.sub(r"\$([^$]+)\$", f, a)
    a = re.sub(r"\$[　 ]*\$", "", a).replace("$$", "")
    a = re.sub(r"\s*(（[2-9]）)", r"　\1", a)
    return a.strip()

def lines_of(docx):
    z = zipfile.ZipFile(docx)
    doc = ET.fromstring(z.read("word/document.xml"))
    rels = ET.fromstring(z.read("word/_rels/document.xml.rels"))
    target = {r.get("Id"): r.get("Target") for r in rels}
    images = []
    out = []
    for p in doc.iter(W + "p"):
        l = es.to_markdown(es.paragraph(p, images))
        if l:
            for part in re.split(r"(@@IMG\d+@@)", l):
                part = part.strip()
                if not part: continue
                m = re.fullmatch(r"@@IMG(\d+)@@", part)
                out.append(("img", "word/" + target[images[int(m.group(1))]]) if m else ("text", part))
    return z, out

QN = re.compile(r"^(\d+)\s*[.．]\s*")
EX = re.compile(r"^【例\s*(\d+)】\s*")

def split_questions(items, mode):
    if mode == "hw":
        starts = [i for i,(k,t) in enumerate(items) if k=="text" and re.match(r"^1\s*[.．]\s*\S", t)]
        items = items[starts[-1]:]
    elif mode == "jc":
        starts = [i for i,(k,t) in enumerate(items) if k=="text" and re.match(r"^1\s*[.．]", t)]
        items = items[starts[0]:]
    qs = {}; cur = None
    for k, t in items:
        if k == "text":
            if HEADING.match(t): continue
            m = EX.match(t) if mode == "zm" else QN.match(t)
            if m and int(m.group(1)) == (cur or 0) + 1:
                cur = int(m.group(1)); qs[cur] = []
                t = t[m.end():].strip()
                if not t: continue
            if mode == "zm" and cur is None: continue
        if cur is not None:
            qs[cur].append((k, t))
    return qs

def parse_q(items):
    stem, ans, sol = [], [], []
    state = "stem"
    for k, t in items:
        if k == "text":
            m = re.match(r"^答案[：:]\s*(.*)", t)
            if m and state != "sol":
                state = "ans"; ans.append(m.group(1)); continue
            m = re.match(r"^解析[：:]\s*(.*)", t)
            if m and state != "sol":
                state = "sol"; rest = m.group(1)
                mm = re.match(r"^([A-H]{1,4})(?:[　\s]+|$)(.*)", rest)
                if mm and not ans:
                    ans.append(mm.group(1)); rest = mm.group(2)
                if rest: sol.append(("text", rest))
                continue
        if state == "stem": stem.append((k, t))
        elif state == "ans":
            if k == "text": ans.append(t)
        else: sol.append((k, t))
    return stem, " ".join(a.strip() for a in ans if a.strip()), sol

END = "。？！）)：:；;”」.？?"
def merge_text(items, stem=False):
    """被图片打断的半句话接回去；返回 [(kind, text)]"""
    items = [(k, t) for k, t in items if not (k == "img" and is_banner(ZIP, t))]
    out = []
    for k, t in items:
        if k == "text":
            t = fixmath(t)
            prev = next((i for i in range(len(out)-1, -1, -1) if out[i][0]=="text"), None)
            if not stem and not (out and out[-1][0] == "img"): prev = None
            is_opt = re.match(r"^[A-H]\s*[.．]", t) or re.match(r"^[（(]\d+[)）]", t)
            if prev is not None and not is_opt and out[prev][1] and out[prev][1][-1] not in END \
               and not re.match(r"^[A-H]\s*[.．]", out[prev][1]) and not t.startswith("$"):
                out[prev] = ("text", out[prev][1] + t); continue
        out.append((k, t))
    return out

def is_banner(z, member):
    from PIL import Image
    import io
    w, h = Image.open(io.BytesIO(z.read(member))).size
    return (h <= 170 and w / h > 3.5) or w / h > 8

def save_img(z, member, rel):
    dst = TUTOR / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    data = z.read(member)
    tmp = dst.with_suffix(Path(member).suffix.lower())
    tmp.write_bytes(data)
    if tmp != dst:
        subprocess.run(["convert", str(tmp), str(dst)], check=True); tmp.unlink()

def options(lines):
    """沿用 extract_stems 的拆选项逻辑"""
    return es.stem_block(0, lines, [])

def main():
    global BOOK
    args = sys.argv[1:]
    BOOK = args[0]
    for spec in args[1:]:
        cid, path = spec.split("=", 1)
        path = Path(path)
        fname = path.name
        title = re.sub(r"\.docx$", "", fname)
        mode = "zm" if "章末整合" in fname else "jc" if "章末综合检测" in fname else "hw"
        z, items = lines_of(path)
        global ZIP; ZIP = z
        qs = split_questions(items, mode)
        md = [f"---\nid: {cid}\nbook: 选择性必修二作业本（三维设计）\ntitle: {title}\ncount: {len(qs)}\n"
              f"source: {path.parent.name}/{fname}；" + ("章末例题" if mode=="zm" else "章末检测" if mode=="jc" else f"课时作业第1—{len(qs)}题") + "\n---\n"]
        info = []
        for no, qitems in qs.items():
            stem, ans, sol = parse_q(qitems)
            letters = re.fullmatch(r"[A-H]+", ans)
            multi = any("多选" in t for k,t in stem if k=="text")
            qtype = ("多选" if (multi or len(ans)>1) else "单选") if letters else "计算"
            # 题干
            stem = merge_text(stem, True)
            body, figs, k_img = [], [], 0
            for k, t in stem:
                if k == "img":
                    k_img += 1; rel = f"assets/{BOOK}/{cid}-q{no:02d}-stem{k_img}.png"
                    save_img(z, t, rel); figs.append(rel)
                else: body.append(t)
            block = es.stem_block(no, body, figs)
            # 解析
            sol = merge_text(sol)
            sl, s_img = [], 0
            for k, t in sol:
                if k == "img":
                    s_img += 1; rel = f"assets/{BOOK}/{cid}-q{no:02d}-{s_img}.png"
                    save_img(z, t, rel); sl.append(f"![第 {no} 题解析配图。]({rel})")
                else: sl.append(t)
            md.append(f"\n## {no}. {qtype} · TODO\n\n{block}**答案：{fixans(ans)}**\n\n**解析**\n\n" + "\n\n".join(sl) + "\n\n---\n")
            info.append((no, qtype, ans, len(figs), s_img))
        path = TUTOR / f"content/{BOOK}/topics/{cid}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("".join(md).replace("\n\n\n", "\n\n"), encoding="utf8")
        print(cid, title, len(qs), "题", info)

main()
