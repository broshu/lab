#!/usr/bin/env python3
"""把 guides/<章节id>.md 里写好的「问答脚本」插进 content 的 topics md（每题解析末尾）。

guides/<id>.md 的格式：每题以「## 题号」开头，后面是脚本正文。
插入后每题多出一个「**问答脚本**」块；答案页不显示它，大屏问答页把它连同完整解析一起交给 AI。
重复运行会替换旧脚本。
用法：python3 tutor/guides/insert_guides.py k09 ks22 ...
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOCK = re.compile(r"\n\*\*问答脚本\*\*\n.*?(?=\n---\s*\n|\Z)", re.S)

for cid in sys.argv[1:]:
    guide = (ROOT / "guides" / f"{cid}.md").read_text(encoding="utf8")
    scripts = {int(m.group(1)): m.group(2).strip()
               for m in re.finditer(r"^##\s*(\d+)\s*\n(.*?)(?=^##\s*\d+\s*$|\Z)", guide, re.S | re.M)}
    md_path = next(p for p in ROOT.glob(f"content/*/topics/{cid}-*.md"))
    md = md_path.read_text(encoding="utf8")
    heads = list(re.finditer(r"^##\s+(\d+)\.", md, re.M))
    out, last = [], 0
    for i, h in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(md)
        part = md[h.start():end]
        sep = re.search(r"\n---\s*\n", part)
        body, tail = (part[:sep.start()], part[sep.start():]) if sep else (part.rstrip("\n"), "\n")
        body = BLOCK.sub("", body).rstrip("\n")
        no = int(h.group(1))
        if no in scripts:
            body += "\n\n**问答脚本**\n\n" + scripts[no]
        out.append(md[last:h.start()] + body + ("\n" + tail if sep else "\n"))
        last = end
    out.append(md[last:])
    md_path.write_text("".join(out), encoding="utf8")
    missing = sorted(set(int(h.group(1)) for h in heads) - set(scripts))
    print(f"{md_path.name}: 写入 {len(scripts)} 题脚本" + (f"，缺 {missing}" if missing else ""))
