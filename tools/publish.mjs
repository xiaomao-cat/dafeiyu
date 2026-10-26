/**
 * 一键发布到公网（GitHub Pages）
 *   node tools/publish.mjs              # 刷新活数据 → 重推 → 等待构建
 *   node tools/publish.mjs --skip-stats # 跳过抓数，只推当前内容
 *
 * 做的事：
 *   1. 跑 sync-stats（星数/下载量/许可）+ sync-icons（图标子集）
 *   2. git add / commit / push 到 origin main
 *   3. 等 GitHub Pages 构建完，打印线上地址
 *
 * 前提：仓库已用 gh 登录（gh auth status 能看到账号），Pages 已开启。
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "xiaomao-cat/dafeiyu";
const SITE_URL = "https://xiaomao-cat.github.io/dafeiyu/";
const SKIP_STATS = process.argv.includes("--skip-stats");

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}
function step(label, fn) {
  process.stdout.write(`\n▶ ${label}\n`);
  try {
    const out = fn();
    if (out && out.trim()) process.stdout.write(out.trim() + "\n");
  } catch (e) {
    // 抓数失败不该拦住发布，提示一声继续
    const msg = (e.stderr || e.message || "").trim().split("\n").slice(-3).join(" | ");
    console.log(`  ⚠️  跳过了：${msg}`);
  }
}

console.log(`发布目标：${REPO} → ${SITE_URL}`);

if (!SKIP_STATS) {
  step("刷新活数据（星数 / 下载量 / 许可）", () => run("node", ["tools/sync-stats.mjs"]));
}
step("重建图标子集", () => run("node", ["tools/sync-icons.mjs"]));
step("整理数据文件格式", () => run("node", ["tools/format-data.mjs"]));

step("提交并推送", () => {
  run("git", ["add", "-A"]);
  const status = run("git", ["status", "--porcelain"]);
  if (!status.trim()) {
    console.log("  没有改动，跳过提交。");
    return "";
  }
  const n = status.trim().split("\n").length;
  const msg = process.argv.find((a) => a.startsWith("--message="))?.slice("--message=".length);
  const note = msg || `更新目录内容（${n} 个文件变动）`;
  run("git", ["commit", "-m", note]);
  const push = run("git", ["push", "origin", "main"], { stdio: ["ignore", "pipe", "pipe"] });
  return `  ${note}\n${push.trim()}`;
});

step("等待 GitHub Pages 构建", () => {
  const deadline = Date.now() + 180000;
  let last = "";
  while (Date.now() < deadline) {
    let status = "";
    try {
      status = run("gh", ["api", `repos/${REPO}/pages/builds/latest`, "--jq", ".status"]).trim();
    } catch {
      status = "unknown";
    }
    if (status !== last) {
      console.log(`  构建状态：${status}`);
      last = status;
    }
    if (status === "built") return `  ✅ 构建完成`;
    if (status === "errored") throw new Error("构建失败，去仓库 Actions 看日志");
    execFileSync("sleep", ["8"]);
  }
  return "  ⚠️  等待超时，构建可能仍在跑，稍后再看";
});

console.log(`\n✅ 已上线：${SITE_URL}`);
console.log(`   加完新插件后，再跑一次：node tools/publish.mjs\n`);
