/**
 * 图标子集同步：扫全站用到的 ph-* 类名，重新生成 assets/ph.css
 *   node tools/sync-icons.mjs
 *
 * 以前加图标要手工查码位，漏了就渲染成空白。这个脚本让它自动到位。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FULL = join(ROOT, "tools", "phosphor-full.css");
const OUT = join(ROOT, "assets", "ph.css");

const SOURCES = [
  "index.html", "privacy.html", "terms.html", "404.html",
  "assets/plugins.js", "assets/site.js", "assets/site.css", "assets/derive.js",
];

// 扫描源码里的 ph-* 类名（排除 ph.css 自身与数据里的示例）
const used = new Set();
for (const rel of SOURCES) {
  let raw;
  try { raw = readFileSync(join(ROOT, rel), "utf8"); } catch { continue; }
  // 只认 class="..." 里的 ph-xxx 和 CSS 选择器里的 .ph-xxx
  for (const m of raw.matchAll(/["'\s](ph-[a-z0-9-]+)["'\s]/g)) used.add(m[1]);
  for (const m of raw.matchAll(/\.(ph-[a-z0-9-]+)\b/g)) used.add(m[1]);
}
// 插件数据里的图标字段（CATEGORY_ICON 之类）
for (const m of readFileSync(join(ROOT, "assets", "plugins.js"), "utf8")
  .matchAll(/["'](ph-[a-z0-9-]+)["']/g)) used.add(m[1]);

// 从完整表里查码位
const full = readFileSync(FULL, "utf8");
const codeOf = new Map();
for (const m of full.matchAll(/\.ph\.(ph-[a-z0-9-]+):before\s*\{\s*content:\s*"\\([0-9a-fA-F]+)"/g)) {
  codeOf.set(m[1], m[2]);
}

const missing = [...used].filter((n) => !codeOf.has(n)).sort();
if (missing.length) {
  console.error("❌ 这些图标在 Phosphor 里不存在：", missing.join(", "));
  process.exit(1);
}

const BASE = `@font-face{font-family:"Phosphor";src:url("./Phosphor.woff2") format("woff2");font-weight:normal;font-style:normal;font-display:block;}
.ph {
  /* use !important to prevent issues with browser extensions that change fonts */
  font-family: "Phosphor" !important;
  speak: never;
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-transform: none;
  line-height: 1;

  /* Enable Ligatures ================ */
  letter-spacing: 0;
  -webkit-font-feature-settings: "liga";
  -moz-font-feature-settings: "liga=1";
  -moz-font-feature-settings: "liga";
  -ms-font-feature-settings: "liga" 1;
  font-feature-settings: "liga";
  -webkit-font-variant-ligatures: discretionary-ligatures;
  font-variant-ligatures: common-ligatures;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`;

const rules = [...used].sort()
  .map((n) => `.${n}:before {\n  content: "\\${codeOf.get(n)}";\n}`)
  .join("\n");

writeFileSync(OUT, BASE + rules + "\n", "utf8");
console.log(`✅ 图标子集已更新：${used.size} 个图标 → assets/ph.css`);
