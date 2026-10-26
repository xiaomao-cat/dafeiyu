/** 一次性探针：找出窄屏下横向溢出的元素 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const PORT = 9355;
let msgId = 0;
const pending = new Map();
let ws;

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => pending.has(id) && (pending.delete(id), reject(new Error(method + " 超时"))), 10000);
  });
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression: `(function(){ ${expression} })()`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "JS 异常");
  return r.result.value;
}

const proc = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--window-size=1440,1000",
  "--remote-debugging-port=" + PORT,
  "--user-data-dir=/tmp/dfy-probe-" + Date.now(),
  "http://127.0.0.1:8899/index.html",
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
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(1500);

  console.log("innerWidth:", await evaluate("return window.innerWidth"));
  console.log("scrollWidth:", await evaluate("return document.documentElement.scrollWidth"));
  const bad = await evaluate(`
    const vw = window.innerWidth;
    const out = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      if (r.right > vw + 1 || r.left < -1) {
        out.push({
          tag: el.tagName,
          cls: String(el.className || '').slice(0, 60),
          id: el.id || '',
          left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
          txt: (el.textContent || '').trim().slice(0, 30)
        });
      }
    });
    return out.slice(0, 40);
  `);
  console.log("溢出元素:");
  bad.forEach(b => console.log(" ", JSON.stringify(b)));
} catch (e) {
  console.error("探针出错:", e.message);
} finally {
  try { ws?.close(); } catch {}
  proc.kill();
}
