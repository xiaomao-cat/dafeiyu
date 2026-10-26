/**
 * 一条命令加一个插件/技能
 *   node tools/add-plugin.mjs <url> <名称> <一句话说明> <分类> [安装命令] [可选参数]
 *
 * 可选参数：
 *   --note "说明文字"          卡片下方的备注
 *   --warning "提示文字"       红色的特别提醒
 *   --features "一,二,三"      功能点，逗号分隔
 *   --extra "标签|网址,标签|网址"  额外的链接行
 *   --host dsh|codex|skillhub|skill-repo   手动指定宿主（默认按网址推断）
 *   --kind command|prompt|link 安装方式类型：command=终端命令 prompt=粘给 Agent link=只给链接
 *
 * 做的事：
 *   1. 抓这条链接的活数据（GitHub 星数 / 许可 / npm 或技能市场下载量 / 版本）
 *   2. 写进 assets/plugins.data.js 的数组末尾
 *   3. 刷新 assets/stats.js 和 assets/ph.css
 *
 * 加完刷新页面就能看到。想调整顺序，直接在 plugins.data.js 里挪位置即可。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fetchAll, slugOf } from "./fetch-stats.mjs";
import { serializeData, readDataFile } from "./serialize.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "assets", "plugins.data.js");

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2);
const positional = [];
const flags = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) flags[key] = true;
    else { flags[key] = next; i++; }
  } else {
    positional.push(a);
  }
}

const [url, name, tagline, category, install] = positional;
if (!url || !name || !tagline || !category) {
  console.log(`
用法：
  node tools/add-plugin.mjs <url> <名称> <一句话说明> <分类> [安装命令] [可选参数]

例子：
  node tools/add-plugin.mjs https://github.com/owner/repo "我的技能" "一句话说清它干什么" "效率" "npx skills add owner/repo"

可选参数：
  --note "说明文字"      --warning "提示文字"      --features "一,二,三"
  --extra "标签|网址,标签|网址"                      --host dsh
  --kind command|prompt|link
`);
  process.exit(1);
}

/* ---------- 抓活数据 ---------- */
console.log(`\n🔍 抓取 ${url} …`);
const s = await fetchAll(url);
const bits = [];
if (s.stars != null) bits.push(`${s.stars} Star`);
if (s.license) bits.push(s.license);
if (s.downloads) bits.push(`npm 近 30 天 ${s.downloads.toLocaleString("en-US")}`);
if (s.marketDownloads) bits.push(`技能市场 ${s.marketDownloads.toLocaleString("en-US")}`);
if (s.version) bits.push(`v${s.version}`);
console.log(bits.length ? `   → ${bits.join(" · ")}` : "   → 这条没抓到活数据");

/* ---------- 拼条目 ---------- */
const slug = slugOf(url);
const entry = { url, name, tagline, category };
if (install) entry.install = install;
if (flags.kind) entry.installKind = flags.kind;
if (flags.host) entry.host = flags.host;
if (flags.note) entry.note = flags.note;
if (flags.warning) entry.warning = flags.warning;
if (flags.features) entry.features = String(flags.features).split(/[,，]/).map((x) => x.trim()).filter(Boolean);
if (flags.extra) {
  entry.extra = String(flags.extra).split(/[,，]/).map((x) => x.trim()).filter(Boolean).map((pair) => {
    const [l, u] = pair.split("|").map((x) => (x || "").trim());
    return { label: l, url: u };
  });
}

/* ---------- 读写数据文件 ---------- */
const { arr, head, tail } = readDataFile(DATA);

if (arr.some((e) => e.url === url)) {
  console.error(`❌ 这个链接已经在目录里了：${url}`);
  process.exit(1);
}
arr.push(entry);

writeFileSync(DATA, head + serializeData(arr) + tail, "utf8");
console.log(`✅ 已追加到 assets/plugins.data.js（slug: ${slug}）`);

/* ---------- 刷新 stats 和图标 ---------- */
for (const script of ["sync-stats.mjs", "sync-icons.mjs"]) {
  console.log(`\n🔄 ${script} …`);
  try {
    execFileSync("node", [join(ROOT, "tools", script)], { stdio: "inherit", cwd: ROOT });
  } catch {
    console.log(`⚠️ ${script} 没跑成功，手动跑一次 node tools/${script}`);
  }
}

console.log("\n完成。刷新页面就能看到这条了。");
console.log("提示：想让它排在更前面，去 assets/plugins.data.js 里把这块往数组上面挪。");
