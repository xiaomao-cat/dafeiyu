/**
 * 整理数据文件格式
 *   node tools/format-data.mjs
 *
 * 把 assets/plugins.data.js 里的数组按统一格式重排一遍，
 * 手改过之后跑一下，文件就跟机器写出来的一样整齐。
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { serializeData, readDataFile } from "./serialize.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "assets", "plugins.data.js");

const { arr, head, tail } = readDataFile(DATA);
writeFileSync(DATA, head + serializeData(arr) + tail, "utf8");
console.log(`✅ 已整理 assets/plugins.data.js（${arr.length} 条）`);
