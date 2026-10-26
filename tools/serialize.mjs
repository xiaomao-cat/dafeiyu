/**
 * 数据文件序列化：把对象数组写回可读的手写风格
 *   被 add-plugin.mjs 和 format-data.mjs 共用
 */
import { readFileSync } from "node:fs";

/** 字符串安全地加引号 */
function q(v) {
  return JSON.stringify(v);
}

/**
 * 序列化数组。字段顺序按输入顺序，不排序，保留手写的样子。
 */
export function serializeData(list) {
  const items = list.map((e) => {
    const lines = Object.entries(e).map(([k, v]) => {
      if (Array.isArray(v) && v.length && typeof v[0] === "object") {
        return (
          `    ${k}: [\n` +
          v.map((o) => `      { label: ${q(o.label)}, url: ${q(o.url)} },`).join("\n") +
          `\n    ],`
        );
      }
      if (Array.isArray(v)) {
        return `    ${k}: [\n` + v.map((x) => `      ${q(x)},`).join("\n") + `\n    ],`;
      }
      return `    ${k}: ${q(v)},`;
    });
    return `  {\n` + lines.join("\n") + `\n  },`;
  });
  return "[\n" + items.join("\n") + "\n]";
}

/**
 * 读数据文件：返回 { arr, head, tail }，head 是数组前的内容，tail 是数组后的内容
 */
export function readDataFile(path) {
  const src = readFileSync(path, "utf8");
  const a = src.indexOf("window.DAFEIYU_PLUGINS");
  if (a < 0) throw new Error("数据文件里找不到 window.DAFEIYU_PLUGINS");
  const b = src.indexOf("[", a);
  let depth = 0, end = -1;
  for (let i = b; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error("数据文件的数组没闭合");
  const arr = new Function("return " + src.slice(b, end + 1))();
  return { arr, head: src.slice(0, b), tail: src.slice(end + 1) };
}
