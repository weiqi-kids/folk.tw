#!/usr/bin/env node
// Discover 內容卡唯一性 gate。
// 每一個具名詩籤／神明／廟宇頁都應有自己的 raster asset；檔名不同不代表圖片內容不同，
// 因此直接比對產物 bytes，避免新模板意外把不同頁渲染成同一張圖。

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'dist', 'og');
const FAMILIES = ['temples', 'poems', 'deities'];
const seen = new Map();
let files = 0;

for (const family of FAMILIES) {
  const dir = join(ROOT, family);
  if (!statSafe(dir)?.isDirectory()) throw new Error(`找不到 Discover 圖族目錄：${dir}`);
  for (const name of readdirSync(dir).filter((x) => x.endsWith('.png')).sort()) {
    const file = join(dir, name);
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
    const previous = seen.get(digest);
    if (previous) throw new Error(`不同內容共用同一張圖片：${previous} 與 ${join(family, name)}`);
    seen.set(digest, join(family, name));
    files++;
  }
}

console.log(`✓ Discover 內容卡唯一性檢查通過：${files} 張 PNG，${seen.size} 個不同內容指紋`);

function statSafe(file) {
  try { return statSync(file); } catch { return null; }
}
