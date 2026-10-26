/**
 * 用 CDP 在指定视口下截图（无头 Edge 的 --window-size 有最小宽度限制，窄屏必须走这里）
 *   node tools/shot.mjs <url> <out.png> [width] [height] [full]
 *
 * 说明：页面里的插件卡是 JS 渲染的，卡片图又是 loading="lazy"，
 * 所以必须先等卡片渲染出来，再等图片，否则拍到的是半成品。
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { writeFileSync } from "node:fs";

const URL_ = process.argv[2] || "http://127.0.0.1:8899/index.html";
const OUT = process.argv[3] || "/tmp/shot.png";
const W = parseInt(process.argv[4] || "390", 10);
const H = parseInt(process.argv[5] || "844", 10);
const FULL = process.argv[6] === "full";

const EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const PORT = 9366;
let msgId = 0;
const pending = new Map();
let ws;

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => pending.has(id) && (pending.delete(id), reject(new Error(method + " 超时"))), 60000);
  });
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression: `(function(){ ${expression} })()`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "JS 异常");
  return r.result.value;
}

const proc = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--force-prefers-reduced-motion",
  "--window-size=1440,1000",
  "--remote-debugging-port=" + PORT,
  "--user-data-dir=/tmp/dfy-shot-" + Date.now(),
  "about:blank",
], { stdio: "ignore" });

try {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(300);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    } catch {}
  }
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
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL_ });
  await sleep(1500);

  // 等字体、卡片渲染出来，再等视口内的图解码完
  await evaluate(`
    (async () => {
      try { await document.fonts.ready; } catch (e) {}
      const t0 = Date.now();
      while (Date.now() - t0 < 30000) {
        if (document.querySelectorAll('#plugin-grid .product').length > 0) break;
        await new Promise(r => setTimeout(r, 200));
      }
      await new Promise(r => setTimeout(r, 600));
      await Promise.all([...document.images].map(img => img.complete && img.naturalWidth
        ? Promise.resolve()
        : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 8000); })));
    })()
  `);
  await sleep(500);

  console.log("innerWidth:", await evaluate("return window.innerWidth"));
  console.log("scrollWidth:", await evaluate("return document.documentElement.scrollWidth"));
  console.log("卡片数:", await evaluate("return document.querySelectorAll('#plugin-grid .product').length"));
  console.log("未加载的图:", await evaluate(`
    return [...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.getAttribute('src'));
  `));

  let clip;
  if (FULL) {
    const size = await evaluate("return {w: document.documentElement.scrollWidth, h: document.body.scrollHeight}");
    clip = { x: 0, y: 0, width: size.w, height: Math.min(size.h, 16000), scale: 1 };
    // 整页会带出视口外的懒加载图，等它们解码完
    await evaluate(`
      (async () => {
        const h = document.body.scrollHeight;
        for (let y = 0; y < h; y += window.innerHeight) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 150));
        }
        window.scrollTo(0, 0);
        await Promise.all([...document.images].map(img => img.complete && img.naturalWidth
          ? Promise.resolve()
          : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 8000); })));
      })()
    `);
    await sleep(400);
  }
  const shot = await send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: !!FULL, ...(clip ? { clip } : {}),
  });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("已保存", OUT);
} catch (e) {
  console.error("截图失败:", e.message);
} finally {
  try { ws?.close(); } catch {}
  proc.kill();
}
