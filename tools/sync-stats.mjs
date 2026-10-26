/**
 * 刷新所有条目的活数据，写进 assets/stats.js
 *   node tools/sync-stats.mjs
 *
 * 数据从 assets/plugins.js 里读（不用改这个文件），结果写到 assets/stats.js。
 * 页面加载时把 stats.js 合并进卡片。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchAll, slugOf, npmDownloads } from "./fetch-stats.mjs";
import { readDataFile } from "./serialize.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "assets", "plugins.data.js");
const OUT = join(ROOT, "assets", "stats.js");

// 直接读纯数据文件，不用正则猜括号
function readEntries() {
  const { arr } = readDataFile(DATA);
  return arr.map((e) => ({ url: e.url, extras: (e.extra || []).map((x) => x.url) }));
}

const entries = readEntries();
console.log(`准备刷新 ${entries.length} 条记录…\n`);

const stats = {};
for (const ent of entries) {
  const url = ent.url;
  const slug = slugOf(url);
  try {
    const s = await fetchAll(url);
    const entry = { verifiedAt: s.verifiedAt };
    if (s.stars != null) entry.stars = s.stars;
    if (s.license) entry.license = s.license;
    if (s.author) entry.author = s.author;
    if (s.downloads != null) entry.downloads = s.downloads;
    if (s.marketDownloads != null) entry.marketDownloads = s.marketDownloads;
    if (s.version) entry.version = s.version;

    // 附带链接里的 npm 包也要抓下载量
    if (!entry.downloads) {
      for (const ex of ent.extras) {
        if (/npmjs\.com\/package\//.test(ex)) {
          const pkg = decodeURIComponent(ex.split("/package/")[1].split(/[/?#]/)[0]);
          const dl = await npmDownloads(pkg);
          if (dl) { entry.downloads = dl; break; }
        }
      }
    }
    stats[slug] = entry;

    const bits = [];
    if (entry.stars != null) bits.push(`${entry.stars} Star`);
    if (entry.license) bits.push(entry.license);
    if (entry.downloads) bits.push(`npm ${entry.downloads.toLocaleString("en-US")}`);
    if (entry.marketDownloads) bits.push(`市场 ${entry.marketDownloads.toLocaleString("en-US")}`);
    if (entry.version) bits.push(`v${entry.version}`);
    console.log(`  ✅ ${slug}${bits.length ? "  — " + bits.join(" · ") : "  — 没抓到数"}`);
  } catch (e) {
    console.log(`  ⚠️  ${slug}  抓取失败：${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 250));
}

const body = `/* ============================================================
   大肥鱼合集 · 活数据（机器生成，别手改）
   ------------------------------------------------------------
   由 tools/sync-stats.mjs 写入：GitHub 星数、许可、作者、
   npm 近 30 天下载量、技能市场累计下载量、版本号、核验日期。

   页面会把这里的数字盖在卡片上。想刷新就重跑那个脚本。
   ============================================================ */

window.DAFEIYU_STATS = ${JSON.stringify(stats, null, 2)};
`;

writeFileSync(OUT, body, "utf8");
console.log(`\n✅ 已写入 assets/stats.js（${Object.keys(stats).length} 条）`);

/* ---------- 顺手把 index.html 里的静态数字也刷一遍 ---------- */
const sum = (k) => Object.values(stats).reduce((a, b) => a + (b[k] || 0), 0);
const htmlPath = join(ROOT, "index.html");
let html = readFileSync(htmlPath, "utf8");
const patch = {
  "data-stat-count": String(Object.keys(stats).length),
  "data-stat-stars": sum("stars").toLocaleString("en-US"),
  "data-stat-downloads": sum("downloads").toLocaleString("en-US"),
  "data-stat-market": sum("marketDownloads").toLocaleString("en-US"),
  "data-count-plugins": String(Object.keys(stats).length),
};
let touched = 0;
for (const [attr, val] of Object.entries(patch)) {
  // 结尾要卡死，否则 data-count-plugins 会误伤 data-count-plugins-text
  const re = new RegExp(`(<[^>]*${attr}(?![-\\w])[^>]*>)([^<]*)(<)`, "g");
  html = html.replace(re, (_, a, __, c) => { touched++; return a + val + c; });
}
// 目录标题里的数字
html = html.replace(
  /(这一页收录的 )\d+( 款插件与技能)/,
  (_, a, b) => { touched++; return a + Object.keys(stats).length + b; }
);
if (touched) {
  writeFileSync(htmlPath, html, "utf8");
  console.log(`✅ index.html 的静态数字也同步了（${touched} 处）`);
}
