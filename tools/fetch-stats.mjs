/**
 * 抓取活数据：GitHub 星数 / 许可 / npm 下载量 / 技能市场下载量
 *   被 sync-stats.mjs 和 add-plugin.mjs 共用
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// 推导规则直接读页面的 assets/derive.js，保证两边算出来一模一样
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const deriveSrc = readFileSync(join(ROOT, "assets", "derive.js"), "utf8");
const fakeWindow = {};
new Function("window", deriveSrc)(fakeWindow);
const D = fakeWindow.DFY_DERIVE;

export function hostOf(url) { return D.hostOf(url); }
export function slugOf(url) { return D.slugOf(url); }
export function pkgOf(url, host) { return D.pkgOf(url, host || D.hostOf(url)); }

/** GitHub 仓库：星数、许可、作者。优先用 gh CLI（有认证不受限流），否则走 API */
export async function githubStats(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (!m) return null;
  const repo = `${m[1]}/${m[2].replace(/\.git$/, "")}`;

  let raw = null;
  try {
    const { stdout } = await exec("gh", ["api", `repos/${repo}`], { maxBuffer: 4 << 20 });
    raw = JSON.parse(stdout);
  } catch {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { "user-agent": UA, accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    raw = await res.json();
  }
  if (!raw || raw.message) return null;

  return {
    stars: raw.stargazers_count || 0,
    license: (raw.license && raw.license.spdx_id) || "",
    author: (raw.owner && raw.owner.login) || m[1],
    repo,
  };
}

/** npm 近 30 天下载量 */
export async function npmDownloads(pkg) {
  try {
    const res = await fetch(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(pkg)}`);
    if (!res.ok) return 0;
    const j = await res.json();
    return j.downloads || 0;
  } catch {
    return 0;
  }
}

/** 技能市场累计下载量 */
export async function marketDownloads(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return 0;
    const html = await res.text();
    const m = html.match(/"downloads"\s*:\s*(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  } catch {
    return 0;
  }
}

/** 技能市场的版本号 */
export async function marketVersion(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return "";
    const html = await res.text();
    const m = html.match(/"version"\s*:\s*"([^"]+)"/);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

/** 技能市场页面的展示名与作者名 */
export async function marketMeta(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return {};
    const html = await res.text();
    const names = [...html.matchAll(/"displayName"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
    const out = {};
    if (names.length >= 2) {
      out.title = names[names.length - 1];
      out.author = names[0];
    }
    const desc = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/);
    if (desc) out.desc = desc[1].replace(/&#34;/g, '"').replace(/&quot;/g, '"');
    return out;
  } catch {
    return {};
  }
}

/** 一次性把一条记录该有的数全抓齐 */
export async function fetchAll(url) {
  const host = hostOf(url);
  const out = { url, host, slug: slugOf(url), verifiedAt: new Date().toISOString().slice(0, 10) };

  if (host === "skill-repo") {
    const gh = await githubStats(url);
    if (gh) Object.assign(out, gh);
    out.pkg = pkgOf(url, host);
  } else if (host === "npm") {
    out.pkg = pkgOf(url, host);
    out.downloads = await npmDownloads(out.pkg);
  } else {
    out.pkg = pkgOf(url, host);
    out.marketDownloads = await marketDownloads(url);
    out.version = await marketVersion(url);
    const meta = await marketMeta(url);
    if (meta.author) out.author = meta.author;
    if (meta.desc) out.desc = meta.desc;
  }
  return out;
}
