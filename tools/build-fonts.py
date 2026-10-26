#!/usr/bin/env python3
"""把 MiSans 子集化成页面真正用到的字形，输出 woff2。

用法：python3 tools/build-fonts.py
重新编辑文案后重跑一次即可。页面里出现但字体里没有的汉字，
浏览器会自动回退到 PingFang SC / 微软雅黑，不会显示成方框。
"""
import html as htmllib
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_FONTS = "/Users/joe/Documents/ChatGPT/文案/dsh100/public/fonts"
PAGES = ["index.html", "privacy.html", "terms.html", "404.html"]

# 常用字安全垫：让后续改文案时大概率不必重新生成字体
COMMON = (
    "的一是不了人我在有他这为之大来以个中上们到说国和地也子时道出而要于就下得可你年生"
    "自会那后能对着事其里所去行过家十用发天如然作方成者多日都三小军二无同么经法当起与"
    "好看学进种将还分此心前面又定见只主没公从"
    "想把好开发布项目功能插件安装命令版本用户数据界面窗口动画余额消耗内容时候问题价格免费"
    "开源许可作者仓库提交测试部署配置运行异常修复更新迭代维护社区交流教程案例上手实战"
    "整套拿走复制粘贴终端重启生效设置权限安全隐私条款备注来源核验整理收录合集系列推荐"
)

EXTRA = (
    "，。、；：？！“”‘’（）《》〈〉【】〔〕…—～·「」『』％＋－×÷≈≤≥≠"
    "←→↑↓✓✕●○◆■▲▼★☆©®™§¶€$¥￥°±≈∞"
)


def collect_text() -> set:
    chars = set()
    for page in PAGES:
        path = os.path.join(ROOT, page)
        if not os.path.exists(path):
            continue
        raw = open(path, encoding="utf-8").read()
        raw = re.sub(r"<script[\s\S]*?</script>", " ", raw)
        raw = re.sub(r"<style[\s\S]*?</style>", " ", raw)
        raw = re.sub(r"<[^>]+>", " ", raw)
        raw = htmllib.unescape(raw)
        chars.update(raw)
    for name in ("assets/site.css", "assets/site.js", "assets/plugins.js"):
        path = os.path.join(ROOT, name)
        if os.path.exists(path):
            chars.update(open(path, encoding="utf-8").read())
    chars.update(chr(c) for c in range(0x20, 0x7F))
    chars.update(COMMON)
    chars.update(EXTRA)
    chars.discard("\n")
    chars.discard("\r")
    chars.discard("\t")
    return chars


def build(src: str, out: str, chars: set) -> None:
    fd, txt = tempfile.mkstemp(prefix="dfy-charset-", suffix=".txt")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write("".join(sorted(chars)))
    cmd = [
        sys.executable, "-m", "fontTools.subset", src,
        "--text-file=" + txt,
        "--output-file=" + out,
        "--flavor=woff2",
        "--layout-features=",
        "--notdef-outline",
        "--name-IDs=*",
        "--drop-tables+=DSIG",
        "--recalc-bounds",
        "--canonical-order",
    ]
    subprocess.run(cmd, check=True)
    os.unlink(txt)
    print(f"  {os.path.basename(out)}  {os.path.getsize(out) // 1024} KB")


def main() -> None:
    chars = collect_text()
    print(f"收集到 {len(chars)} 个字符")
    build(os.path.join(SRC_FONTS, "MiSans-Medium.otf"),
          os.path.join(ROOT, "assets", "misans-medium.woff2"), chars)
    build(os.path.join(SRC_FONTS, "MiSans-Heavy.otf"),
          os.path.join(ROOT, "assets", "misans-heavy.woff2"), chars)


if __name__ == "__main__":
    main()
