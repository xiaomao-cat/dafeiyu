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

/** npm 近 30 天下载量
 *  注意：不要用 point/last-month —— 那个端点在部分网络链路上会被 CDN 缓存成几个月前的
 *  快照（返回 0 次下载）。自己算日期区间走 point/<起>:<止>，拿到的才是真数。
 */
export async function npmDownloads(pkg) {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 29 * 86400000);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const res = await fetch(
      `https://api.npmjs.org/downloads/point/${fmt(start)}:${fmt(end)}/${encodeURIComponent(pkg)}`
    );
    if (!res.ok) return 0;
    const j = await res.json();
    return j.downloads || 0;
  } catch {
    return 0;
  }
}

/** skills.sh 技能页的累计安装量 */
export async function skillsShInstalls(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return 0;
    const html = await res.text();
    // 页面里 JSON-LD 的 userInteractionCount 就是安装数
    const m = html.match(/"userInteractionCount"\s*:\s*(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  } catch {
    return 0;
  }
}

/** skills.sh 技能页的展示名与作者 */
export async function skillsShMeta(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return {};
    const html = await res.text();
    const out = {};
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (h1) out.title = h1[1].replace(/<[^>]+>/g, "").trim();
    const desc = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/);
    if (desc) out.desc = desc[1];
    return out;
  } catch {
    return {};
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

/** 一次性把一条记录该有的数全抓齐
 *  extras 是这条条目附带的其它链接，skills.sh 的条目靠它找到自己的 GitHub 仓库。
 */
export async function fetchAll(url, extras = []) {
  const host = hostOf(url);
  const out = { url, host, slug: slugOf(url), verifiedAt: new Date().toISOString().slice(0, 10) };

  if (host === "skill-repo") {
    const gh = await githubStats(url);
    if (gh) Object.assign(out, gh);
    out.pkg = pkgOf(url, host);
  } else if (host === "npm") {
    out.pkg = pkgOf(url, host);
    out.downloads = await npmDownloads(out.pkg);
  } else if (host === "skills-sh") {
    out.pkg = pkgOf(url, host);
    out.skillInstalls = await skillsShInstalls(url);
    const meta = await skillsShMeta(url);
    if (meta.title) out.skillTitle = meta.title;
    // 技能本身在 GitHub 上的仓库，星数 / 许可 / 作者从那儿来
    for (const ex of extras) {
      if (/github\.com\//.test(ex)) {
        const gh = await githubStats(ex);
        if (gh) {
          out.stars = gh.stars;
          out.license = gh.license;
          out.author = gh.author;
          out.repo = gh.repo;
        }
        break;
      }
    }
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
