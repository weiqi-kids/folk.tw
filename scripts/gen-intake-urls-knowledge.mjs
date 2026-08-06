#!/usr/bin/env node
// 產生 `docs/intake-urls-knowledge.json`＝台灣端 `url_list` 型 job 吃的清單檔
//（規格：inbox/URLLIST-SPEC.md，台灣端 2026-08-05 實作並自測 67/67）。
//
// 為什麼要這支：內政部「宗教知識+／宗教神祇」的**條目全文**在
// `Knowledge/Content?ci=2&cid=<N>`，而列表頁 `Knowledge/List?ci=2&cid=3` 只有**截斷摘要**
// （每則結尾是「…」）。要拿 iconography 就得逐條抓，而那 96 個 cid 只列在列表頁上。
// 本檔把列表頁解析成清單檔，讓抓取變成機械 job（不需要再開工單給台灣端）。
//
// 🔴 清單檔進 public repo，所以**只准有 key／url**（`_` 開頭的欄位台灣端會忽略，可放人看的註記）。
//    列表頁本身沒有個資，但這條規矩對後續的沿革清單同樣適用，別在那裡破例。
//
// 🔴 `key` 的字元限制是 `[A-Za-z0-9._-]`：不可空白、不可含斜線或 `..`（台灣端會拿它當檔名）。
//    故用 `cid-<N>`，不要拿神明中文名當 key。
//
// ⚠️ **不要把 `_name` 當成資料來源**：它只是給人看的。匯入時神明名稱一律從**抓回來的條目頁**
//    自己讀（每頁 <title> 就有），否則清單檔與實際內容會各自漂移——
//    那正是 CLAUDE.md 反覆講的「同一事實兩個真實來源」。
//
// 用法：
//   node scripts/gen-intake-urls-knowledge.mjs           # 乾跑（預設）：印統計與樣本
//   node scripts/gen-intake-urls-knowledge.mjs --write   # 實際寫 docs/intake-urls-knowledge.json

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const LIST = '/root/.config/folk-tw/intake/inbox/misc/knowledge-deities-list-cid3.html';
const OUT = 'docs/intake-urls-knowledge.json';
const WRITE = process.argv.includes('--write');

if (!existsSync(LIST)) {
  console.error(`✗ 找不到列表頁：${LIST}`);
  console.error('  它由 manifest 的 knowledge-deities-list job 抓取，跑 node scripts/intake-status.mjs 看現況。');
  process.exit(1);
}

const html = readFileSync(LIST, 'utf8');
const unescapeHtml = (s) =>
  s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// 每個條目在列表頁出現兩次（標題連結＋圖說/摘要連結），標題那次才帶羅馬拼音括號。
const byCid = new Map();
// ⚠️ matchAll 的每個 match，[0] 是**整段命中**、[1] 起才是捕獲群組。
// 初版寫成 `for (const [cid, raw] of …)` → cid 拿到整段 HTML，96 筆全成了非法 key。
// （下面的合規檢查因此擋住並拒寫檔——這就是那道閘存在的理由，別把它拿掉。）
for (const m of html.matchAll(/href="\/Knowledge\/Content\?ci=2&amp;cid=(\d+)"[^>]*>\s*([^<]*)</g)) {
  const cid = m[1];
  const text = unescapeHtml(m[2]).replace(/\s+/g, ' ').trim();
  if (!text) continue;
  // 標題連結 vs 圖說連結的分辨：圖說是被截斷的摘要（結尾「…」）且明顯較長。
  // 取「沒有截斷符、且較短」的那個當 _name。⚠️ 只影響給人看的註記，不影響 key／url。
  const prev = byCid.get(cid);
  const score = (s) => (s.endsWith('…') || s.endsWith('...') ? 1000 : 0) + s.length;
  if (!prev || score(text) < score(prev)) byCid.set(cid, text);
}

const items = [...byCid.entries()]
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .map(([cid, name]) => ({
    key: `cid-${cid}`,
    url: `https://religion.moi.gov.tw/Knowledge/Content?ci=2&cid=${cid}`,
    _name: name,
  }));

// 品質閘：清單只要有一處不合規，台灣端會整個 job 停下、一個請求都不發（URLLIST-SPEC）。
// 與其讓它在對面停擺，不如在這裡就擋住。
const bad = [];
const keys = new Set();
for (const it of items) {
  if (!/^[A-Za-z0-9._-]+$/.test(it.key)) bad.push(`key 含非法字元：${it.key}`);
  if (keys.has(it.key)) bad.push(`key 重複：${it.key}`);
  keys.add(it.key);
  if (!/^https?:\/\//.test(it.url)) bad.push(`url 非 http(s)：${it.url}`);
}
if (!items.length) bad.push('解析結果為空（列表頁結構可能變了）');
if (bad.length) {
  console.error(`✗ 清單不合規 ${bad.length} 處，不寫檔：`);
  for (const b of bad.slice(0, 8)) console.error(`   ${b}`);
  process.exit(1);
}

console.log(`\n宗教知識+／宗教神祇條目：${items.length} 筆`);
console.log(`  樣本：`);
for (const it of items.slice(0, 4)) console.log(`    ${it.key}  ${it._name}`);
console.log(`    …`);
for (const it of items.slice(-2)) console.log(`    ${it.key}  ${it._name}`);

if (!WRITE) {
  console.log('\n（乾跑，未寫檔。加 --write 才寫入。）');
  process.exit(0);
}
writeFileSync(OUT, JSON.stringify(items, null, 1) + '\n');
console.log(`\n✓ 已寫入 ${OUT}（${items.length} 筆）`);
console.log('  台灣端取用網址：https://raw.githubusercontent.com/weiqi-kids/folk.tw/main/' + OUT);
