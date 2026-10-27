/**
 * 大肥鱼合集 · 全功能验收
 * 用 CDP 直接驱动本机 Edge，逐项检查页面上每个交互功能是否真的能用。
 *   node tools/verify.mjs [baseUrl]
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { slugOf } from "./fetch-stats.mjs";
import { readDataFile } from "./serialize.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:8899/index.html";
const EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const PORT = 9333;

/* 期望值从数据文件读，加插件不用再改这个脚本 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRIES = readDataFile(join(ROOT, "assets", "plugins.data.js")).arr;
const N = ENTRIES.length;
const IDS = ENTRIES.map((e) => "plugin-" + slugOf(e.url)).sort();

let msgId = 0;
const pending = new Map();
let ws;

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`${method} 超时`));
      }
    }, 30000);
  });
}

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", {
    expression: `(function(){ ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "JS 异常");
  return r.result.value;
}

/** 真实鼠标点击（能触发剪贴板等用户手势相关 API）
 *  进场动画会让元素持续位移，必须等它停稳再落点，否则点空 */
async function realClick(selector) {
  const sel = JSON.stringify(selector);
  await evaluate(`
    const el = document.querySelector(${sel});
    if (el) el.scrollIntoView({block:'center'});
  `);

  let box = null;
  for (let i = 0; i < 14; i++) {
    await sleep(90);
    const b = await evaluate(`
      const el = document.querySelector(${sel});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {x: r.left + r.width/2, y: r.top + r.height/2};
    `);
    if (!b) return false;
    if (box && Math.abs(box.x - b.x) < 0.6 && Math.abs(box.y - b.y) < 0.6) { box = b; break; }
    box = b;
  }
  if (!box) return false;

  // 落点必须真的命中这个元素（或它的子元素）
  const hit = await evaluate(`
    const el = document.querySelector(${sel});
    const t = document.elementFromPoint(${box.x}, ${box.y});
    return !!(t && el && (t === el || el.contains(t) || t.contains(el)));
  `);
  if (!hit) return false;

  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", {
      type, x: box.x, y: box.y, button: "left", clickCount: 1,
    });
  }
  await sleep(300);
  return true;
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "  ✅" : "  ❌"} ${name}${detail ? "  → " + detail : ""}`);
}

async function main() {
  // 每次用全新 profile，避免上一轮把旧文件缓存住
  const profile = `/tmp/dfy-verify-${Date.now()}`;
  const proc = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    "--window-size=1440,1000",
    "--remote-debugging-port=" + PORT,
    "--user-data-dir=" + profile,
    BASE,
  ], { stdio: "ignore" });

  try {
    let target = null;
    for (let i = 0; i < 40 && !target; i++) {
      await sleep(300);
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      } catch { /* 还没起来 */ }
    }
    if (!target) throw new Error("Edge 调试端口没起来");

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      }
    };
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Page.reload", { ignoreCache: true });

    // 等卡片真的渲染出来再开测。
    // 本地秒开，但走 CDN（GitHub Pages）冷缓存时要好几秒，固定 sleep 会误判。
    let rendered = 0;
    for (let i = 0; i < 120; i++) {
      await sleep(250);
      try {
        rendered = await evaluate("return document.querySelectorAll('#plugin-grid .product').length");
      } catch {
        rendered = 0; // reload 期间执行上下文还没建好
      }
      if (rendered >= N) break;
    }
    await sleep(400); // 让活数据（星数 / 下载量）覆盖完

    console.log("\n▸ 页面加载与数据渲染");
    check("页面标题正确", (await evaluate("return document.title")).includes("大肥鱼合集"));
    check("插件数量写进标题", (await evaluate("return document.querySelector('[data-catalog-heading]').textContent")).includes(`${N} 款`));
    check(`渲染出 ${N} 张插件卡`, (await evaluate("return document.querySelectorAll('#plugin-grid .product').length")) === N);
    check("卡片 id 齐全", await evaluate(`
      const ids = [...document.querySelectorAll('#plugin-grid .product')].map(e=>e.id).sort().join(',');
      const want = ${JSON.stringify(IDS)};
      return ids === want.slice().sort().join(',');
    `), `共 ${N} 个 id`);
    check("合集命令块已整块移除", (await evaluate("return !document.getElementById('claim-shell')")) === true);
    check("领取面板区块已移除", (await evaluate("return !document.getElementById('get')")) === true);
    check("GitHub Star 合计与卡片上的数一致", await evaluate(`
      const cards = [...document.querySelectorAll('#plugin-grid .product')];
      const total = cards.reduce((a,c)=>{
        const t = [...c.querySelectorAll('.tag')].map(x=>x.textContent).find(x=>/GitHub .*Star/.test(x));
        return a + (t ? parseInt(t.replace(/[^0-9]/g,''),10) : 0);
      },0);
      return String(total) === document.querySelector('[data-stat-stars]').textContent.replace(/,/g,'');
    `));
    check("技能市场下载合计与卡片上的数一致", await evaluate(`
      const cards = [...document.querySelectorAll('#plugin-grid .product')];
      const total = cards.reduce((a,c)=>{
        const t = [...c.querySelectorAll('.tag')].map(x=>x.textContent).find(x=>/技能市场/.test(x));
        return a + (t ? parseInt(t.replace(/[^0-9]/g,''),10) : 0);
      },0);
      return String(total) === document.querySelector('[data-stat-market]').textContent.replace(/,/g,'');
    `));
    check("导航计数徽标", (await evaluate("return document.querySelector('.nav__badge').textContent")) === String(N));
    check("页脚收录列表自动生成", (await evaluate("return document.querySelectorAll('#footer-plugins li').length")) === N);

    console.log("\n▸ 搜索");
    await evaluate(`
      const i = document.querySelector('[data-search]');
      i.value = '余额';
      i.dispatchEvent(new Event('input', {bubbles:true}));
    `);
    await sleep(400);
    check("搜「余额」筛出 2 款", (await evaluate("return document.querySelectorAll('#plugin-grid .product').length")) === 2);
    check("计数同步更新", (await evaluate("return document.getElementById('catalog-count').textContent")) === `显示 2 / ${N} 款`);
    await evaluate(`
      const i = document.querySelector('[data-search]');
      i.value = 'zzz不存在';
      i.dispatchEvent(new Event('input', {bubbles:true}));
    `);
    await sleep(400);
    check("搜不到时出空状态", await evaluate("return !document.getElementById('catalog-empty').hidden"));
    check("空状态有引导文案", (await evaluate("return document.querySelector('[data-empty-text]').textContent")).length > 10);
    await evaluate(`
      const i = document.querySelector('[data-search]');
      i.value = '';
      i.dispatchEvent(new Event('input', {bubbles:true}));
    `);
    await sleep(400);
    check(`清空搜索恢复 ${N} 款`, (await evaluate("return document.querySelectorAll('#plugin-grid .product').length")) === N);

    console.log("\n▸ 分类与宿主筛选");
    await evaluate(`document.querySelector('[data-cat="挂件"]').click()`);
    await sleep(250);
    check("类型筛「挂件」得 2 款", (await evaluate("return document.querySelectorAll('#plugin-grid .product').length")) === 2);
    check("被选中的 chip 标记 pressed", (await evaluate("return document.querySelector('[data-cat=\"挂件\"]').getAttribute('aria-pressed')")) === "true");
    await evaluate(`document.querySelector('[data-cat="全部"]').click()`);
    await sleep(250);
    await evaluate(`document.querySelector('[data-host="codex"]').click()`);
    await sleep(250);
    check("宿主筛「Codex」得 1 款", (await evaluate("return document.querySelectorAll('#plugin-grid .product').length")) === 1);
    check("剩下的是 GPT娘", (await evaluate("return document.querySelector('#plugin-grid .product').id")) === "plugin-t7moris-gpt-niang");
    await evaluate(`document.querySelector('[data-host="全部"]').click()`);
    await sleep(250);

    console.log("\n▸ 排序");
    await evaluate(`
      const s = document.querySelector('[data-sort]');
      s.value = 'stars';
      s.dispatchEvent(new Event('change', {bubbles:true}));
    `);
    await sleep(250);
    check("按 Star 排序第一名是 Superpowers", (await evaluate("return document.querySelector('#plugin-grid .product').id")) === "plugin-obra-superpowers");
    await evaluate(`
      const s = document.querySelector('[data-sort]');
      s.value = 'downloads';
      s.dispatchEvent(new Event('change', {bubbles:true}));
    `);
    await sleep(250);
    check("按下载量排序第一名是多引擎搜索", (await evaluate("return document.querySelector('#plugin-grid .product').id")) === "plugin-zcwl-multi-search-engine");
    await evaluate(`
      const s = document.querySelector('[data-sort]');
      s.value = 'newest';
      s.dispatchEvent(new Event('change', {bubbles:true}));
    `);
    await sleep(250);
    check("最近收录第一条是最后加进来的", (await evaluate("return document.querySelector('#plugin-grid .product').id")) === `plugin-${slugOf(ENTRIES[ENTRIES.length - 1].url)}`);
    await evaluate(`
      const s = document.querySelector('[data-sort]');
      s.value = 'catalog';
      s.dispatchEvent(new Event('change', {bubbles:true}));
    `);
    await sleep(250);
    check("目录顺序第一张是大肥鱼桌宠", (await evaluate("return document.querySelector('#plugin-grid .product').id")) === "plugin-pc2005-cloud-dsh-pet");

    console.log("\n▸ 插件链接（访客找链接的主路径）");
    check("每张卡都有链接区", (await evaluate("return document.querySelectorAll('#plugin-grid .product__links').length")) === N);
    check("每张卡至少一个可点链接", await evaluate(`
      return [...document.querySelectorAll('#plugin-grid .product')].every(c => c.querySelectorAll('.plink__a').length >= 1);
    `));
    check("没配图的卡片用图标占位而不是留空", await evaluate(`
      return [...document.querySelectorAll('#plugin-grid .product')].every(c => {
        const hasImg = !!c.querySelector('.product__media img');
        const hasIcon = !!c.querySelector('.product__icon .ph');
        return hasImg !== hasIcon; // 恰好有一个
      });
    `));
    check("标签行没有多余分隔符", await evaluate(`
      // 标签之间不该有游离的文本节点（数组直接拼字符串会留下逗号）
      return [...document.querySelectorAll('#plugin-grid .product__tags')]
        .every(row => [...row.childNodes].every(n => n.nodeType === 1));
    `));
    check("链接地址完整不被省略号截断", await evaluate(`
      const rows = [...document.querySelectorAll('#plugin-grid .plink__url')];
      return rows.length > 0 && rows.every(el => !el.textContent.includes('…') && !el.textContent.includes('...'));
    `));
    check("链接文字是真实仓库地址", (await evaluate("return document.querySelector('#plugin-pc2005-cloud-dsh-pet .plink__url').textContent")) === "github.com/PC2005-cloud/dsh-pet");
    check("链接文字实际可见", await evaluate(`
      const r = document.querySelector('#plugin-pc2005-cloud-dsh-pet .plink__url').getBoundingClientRect();
      return r.width > 40 && r.height > 8;
    `));
    check("链接区排在安装命令前面", await evaluate(`
      const card = document.querySelector('#plugin-pc2005-cloud-dsh-pet');
      const l = card.querySelector('.product__links');
      const c = card.querySelector('.product__cmd');
      return !!(l && c && (l.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING));
    `));
    check("标题可直接点进仓库", await evaluate(`
      const a = document.querySelector('#plugin-pc2005-cloud-dsh-pet .product__name a');
      return !!a && a.href.startsWith('https://github.com/PC2005-cloud/dsh-pet');
    `));
    check("外链新窗口打开且带 noopener", await evaluate(`
      return [...document.querySelectorAll('#plugin-grid .plink__a')].every(a => a.target === '_blank' && a.rel.includes('noopener'));
    `));

    console.log("\n▸ 复制（真实鼠标手势）");
    await realClick("#plugin-pc2005-cloud-dsh-pet .plink__copy");
    check("点链接旁的复制按钮写进剪贴板", (await evaluate("return document.querySelector('#plugin-pc2005-cloud-dsh-pet .plink__copy').getAttribute('data-copied')")) === "1");
    check("链接复制按钮有成功态", (await evaluate("return document.querySelector('#plugin-pc2005-cloud-dsh-pet .plink__copy').getAttribute('data-state')")) === "success");
    check("屏幕阅读器收到播报", (await evaluate("return document.getElementById('dfy-live')?.textContent||''")).includes("剪贴板"));
    await realClick("#plugin-pc2005-cloud-dsh-pet .cmd__copy");
    check("安装命令也能复制", (await evaluate("return document.querySelector('[data-copy=\"cmd-pc2005-cloud-dsh-pet\"]').getAttribute('data-copied')")) === "1");

    console.log("\n▸ FAQ 折叠");
    await evaluate("document.querySelector('.faq__q[aria-controls=\"faq-1\"]').scrollIntoView({block:'center'})");
    await sleep(200);
    await realClick('.faq__q[aria-controls="faq-1"]');
    check("FAQ 展开 aria-expanded", (await evaluate("return document.querySelector('.faq__q[aria-controls=\"faq-1\"]').getAttribute('aria-expanded')")) === "true");
    check("FAQ 内容有高度", (await evaluate("return document.getElementById('faq-1').getBoundingClientRect().height")) > 20);
    await realClick('.faq__q[aria-controls="faq-1"]');
    await sleep(500);
    check("再点一次收起", (await evaluate("return document.querySelector('.faq__q[aria-controls=\"faq-1\"]').getAttribute('aria-expanded')")) === "false");

    console.log("\n▸ 锚点跳转");
    await evaluate("window.scrollTo(0,0)");
    await sleep(300);
    await realClick('.nav__link[href="#catalog"]');
    await sleep(900);
    const catTop = await evaluate("return document.getElementById('catalog').getBoundingClientRect().top");
    check("点「插件目录」滚到该区块", Math.abs(catTop) < 160, `区块顶部距视口 ${Math.round(catTop)}px`);

    console.log("\n▸ Hero 速览面板跳转");
    await evaluate("window.scrollTo(0,0)");
    await sleep(400);
    await realClick('.peek__row[data-plugin-id="t7moris-gpt-niang"]');
    await sleep(1100);
    const cardTop = await evaluate("return document.getElementById('plugin-t7moris-gpt-niang').getBoundingClientRect().top");
    check("点速览行跳到对应卡片", Math.abs(cardTop) < 220, `卡片顶部距视口 ${Math.round(cardTop)}px`);

    console.log("\n▸ 复杂度体检（用户要求：别搞复杂）");
    const bodyText = await evaluate("return document.body.innerText");
    check("页面没有邮箱输入框", (await evaluate("return document.querySelectorAll('input[type=email]').length")) === 0);
    check("页面没有订阅表单", (await evaluate("return document.querySelectorAll('form').length")) === 0);
    check("没有「免费领取」字样", !bodyText.includes("免费领取"));
    check("没有「合集安装」「合集包」字样", !bodyText.includes("合集安装") && !bodyText.includes("合集包"));
    check("没有「复制全部命令」字样", !bodyText.includes("全部命令") && !bodyText.includes("合集命令"));
    check("没有订阅插件提醒那一套", await evaluate(`
      const t = document.body.innerText;
      return !t.includes('订阅插件提醒') && !t.includes('留个邮箱') && !t.includes('邮箱地址')
        && document.querySelectorAll('input[type=email]').length === 0;
    `));
    check("按钮里没有「安装包」字样", await evaluate(`
      return [...document.querySelectorAll('button, a.btn')].every(b => !b.textContent.includes('安装包'));
    `));
    check("导航里没有指向已删区块的链接", await evaluate(`
      return [...document.querySelectorAll('a[href^="#"]')].every(a => {
        const id = a.getAttribute('href').slice(1);
        return !id || !!document.getElementById(id);
      });
    `));
    check("所有主 CTA 都指向插件目录", await evaluate(`
      const primary = [...document.querySelectorAll('a.btn--primary')];
      return primary.length > 0 && primary.every(a => a.getAttribute('href') === '#catalog');
    `));

    console.log("\n▸ Cookie 说明条");
    await realClick(".cookie button");
    check("点「知道了」隐藏说明条", (await evaluate("return document.querySelector('.cookie').hidden")) === true);
    check("写入本地存储", (await evaluate("return localStorage.getItem('dafeiyu-cookie-note')")) === "1");

    console.log("\n▸ 键盘与无障碍");
    check("有跳到主要内容链接", await evaluate("return !!document.querySelector('.skip-link')"));
    check("所有图标按钮都有 aria-label", await evaluate(`
      return [...document.querySelectorAll('button')].every(b => (b.textContent||'').trim() || b.getAttribute('aria-label'));
    `));
    check("FAQ 用 button 而非 div", await evaluate("return document.querySelectorAll('.faq__q').length") === 10);
    check("所有卡片安装命令可见", await evaluate(`
      return [...document.querySelectorAll('.product__cmd code')].every(c => c.getBoundingClientRect().height > 0);
    `));
    check("图标全部真的渲染出来了", await evaluate(`
      const icons = [...document.querySelectorAll('i[class*="ph-"]')];
      const bad = icons.filter(el => {
        const c = getComputedStyle(el, '::before').content;
        return !c || c === 'none' || c === 'normal' || c === '""';
      });
      return icons.length > 0 && bad.length === 0;
    `), "图标子集里缺字形会渲染成空白");
    check("图标都套上了 Phosphor 字体", await evaluate(`
      const icons = [...document.querySelectorAll('i[class*="ph-"]')];
      return icons.length > 0 && icons.every(el =>
        /Phosphor/.test(getComputedStyle(el).fontFamily));
    `), "漏掉 ph 基础类会掉回正文字体变成豆腐块");

    console.log("\n▸ 品牌素材");
    check("导航用了鲸鱼 LOGO", await evaluate("return !!document.querySelector('.nav__mark')"));
    check("Hero 有场景背景图", (await evaluate("return getComputedStyle(document.querySelector('.hero')).backgroundImage")).includes("scene-moon"));
    check("品牌带有场景图", await evaluate("return !!document.querySelector('.band__photo img')"));
    check("尾部场景卡有图", (await evaluate("return !!document.querySelector('.scenecard__fig img')")));
    check("大标题有鲸鱼水印", (await evaluate("return getComputedStyle(document.querySelector('.tagline'),'::before').backgroundImage")).includes("whale-watermark"));
    check("favicon 是鲸鱼 PNG", (await evaluate("return document.querySelector('link[rel=icon]').getAttribute('href')")).startsWith("data:image/png"));

    console.log("\n▸ 外链可达性");
    const ext = await evaluate(`
      return [...new Set([...document.querySelectorAll('a[href^="http"]')].map(a=>a.href))];
    `);
    const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
    let bad = [];
    for (const u of ext) {
      // npm 官网有 Cloudflare 爬虫拦截，改用 registry 接口验证包是否真的存在。
      // scoped 包名带斜杠（@snowluma/sdk），要整个取下来再把斜杠编码成 %2F，
      // 否则 registry 会返回 405。
      const m = u.match(/npmjs\.com\/package\/([^?#]+)/);
      const pkgName = m ? m[1].replace(/\/+$/, "") : "";
      const probe = pkgName ? `https://registry.npmjs.org/${pkgName.replace("/", "%2F")}` : u;
      let ok = false;
      let lastErr = "";
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          const r = await fetch(probe, { headers: { "user-agent": UA }, redirect: "follow" });
          if (r.ok) ok = true;
          else lastErr = `→ ${r.status}`;
        } catch (e) {
          lastErr = `→ ${e.message}`;
          await sleep(800);
        }
      }
      if (!ok) bad.push(`${u} ${lastErr}`);
    }
    check(`${ext.length} 个外部链接全部可达`, bad.length === 0, bad.join("; "));

    console.log("\n▸ 移动端（390×844）");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: false,
    });
    await evaluate("window.scrollTo(0,0)");
    await sleep(900);
    check("视口宽度切到窄屏", (await evaluate("return window.innerWidth")) === 390, `innerWidth=${await evaluate("return window.innerWidth")}`);
    check("窄屏收起导航文字链接", await evaluate(`
      const links = document.querySelector('.nav__links');
      const toggle = document.querySelector('.nav__toggle');
      return getComputedStyle(links).display === 'none' && getComputedStyle(toggle).display !== 'none';
    `));
    await realClick(".nav__toggle");
    check("点汉堡打开全屏菜单", (await evaluate("return document.getElementById('nav-panel').getAttribute('data-open')")) === "true");
    check("菜单里有插件目录入口", await evaluate(`
      return [...document.querySelectorAll('#nav-panel a')].some(a => a.getAttribute('href') === '#catalog');
    `));
    check("菜单里没有已删的领取入口", await evaluate(`
      return ![...document.querySelectorAll('#nav-panel a')].some(a => a.textContent.includes('领取'));
    `));
    await realClick(".nav__toggle");
    await sleep(400);
    check("再点一次收起菜单", (await evaluate("return document.getElementById('nav-panel').getAttribute('data-open')")) === "false");
    const sw = await evaluate("return document.documentElement.scrollWidth");
    const iw = await evaluate("return window.innerWidth");
    check("窄屏没有横向滚动", sw <= iw + 1, `内容宽 ${sw} / 视口 ${iw}`);
    check("窄屏下插件链接依然可见", await evaluate(`
      const r = document.querySelector('#plugin-pc2005-cloud-dsh-pet .plink__url').getBoundingClientRect();
      return r.width > 40 && r.height > 8;
    `));

    console.log("\n▸ 子页面");
    for (const p of ["privacy.html", "terms.html", "404.html"]) {
      const r = await fetch(new URL(p, BASE)).then((r) => r.status).catch(() => 0);
      check(`${p} 可访问`, r === 200, `HTTP ${r}`);
    }

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${"=".repeat(52)}`);
    console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
    if (failed.length) {
      console.log("\n失败项：");
      failed.forEach((f) => console.log(`  ❌ ${f.name} ${f.detail}`));
    }
    console.log("=".repeat(52));
    process.exitCode = failed.length ? 1 : 0;
  } catch (e) {
    console.error("验收中断：", e.message);
    process.exitCode = 2;
  } finally {
    try { ws?.close(); } catch {}
    proc.kill();
  }
}

main();
