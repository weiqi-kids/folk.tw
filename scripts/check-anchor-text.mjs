#!/usr/bin/env node
// 部署 gate：掃 build 產物 dist/**/*.html，確認**沒有任何 <a> 的可見文字是裸露網址**。
//
// 背景（2026-08-04，用戶指出）：來源標註渲染成
//   「來源：https://www.th.gov.tw/Epaper_Content/238/5723/；https://zh.wikipedia.org/zh-tw/…」
// 而不是來源單位名稱。根因在 src/lib/sources.ts 的 `label || url` 退路——`ref` 是純網址
// （名稱寫在 `note`）時就退回網址本身。實測影響 131 頁：/poems 100、/practices 12、
// /festivals 10、/deities 5、/events 3、/vocabulary 1。
//
// 為什麼要做成 gate 而不是修完就算：來源渲染散在 16 個呼叫點、資料則來自 5 個 JSON
// 與兩個 content collection，任何一邊新增「只有網址、名稱在 note」的來源都會再犯，
// 而且**畫面不會壞、build 不會錯**，只有人眼看得出來——正是最容易長期漏掉的那類。
//
// 判準（用戶原話）：`<a>` 的內容不能包含 http 字串。
// 用法：pnpm build:release 後 `node scripts/check-anchor-text.mjs`（＝ pnpm check:anchor-text）。
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
// `<a>` 的切法與可見文字的取法走 scripts/lib/page.mjs（吃 dist 的 gate 家族共用的讀解層）。
// 🔴 **判準留在本檔**：什麼叫「裸露網址」、括號認哪幾種，都是這支自己的事——
//    page.anchors() 只負責把可見文字取出來（刻意不 decode entity，理由見 page.mjs）。
import { Page } from './lib/page.mjs';

const DIST = 'dist';
const MAX_REPORT = 25;

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith('.html')) yield p;
  }
}

const violations = [];
let scanned = 0;
let anchors = 0;

for (const file of htmlFiles(DIST)) {
  scanned++;
  // 只看可見文字（Page 已去掉巢狀標籤 <img>／<span> 並收斂空白）。
  // 屬性裡的網址本來就該有，不算違規。
  for (const { text } of Page.load(file).anchors()) {
    anchors++;
    const short = text.length > 90 ? `${text.slice(0, 90)}…` : text;
    if (/https?:\/\//i.test(text) || /\bhttp/i.test(text)) {
      violations.push({ file, text: short, why: '裸露網址' });
      continue;
    }
    // 同一類錯的另一半：從 ref 抽掉網址後，殘留的括號沒配對（「文化部國家文化資產網（」）。
    // 2026-08-04 修裸網址時，我自己一度用 TRAIL_PUNCT 削掉合法的收括號而製造出這種標籤，
    // 是人眼掃過去也很容易放過的形狀，所以一起做成硬 gate。
    const opens = (text.match(/[（(]/g) ?? []).length;
    const closes = (text.match(/[）)]/g) ?? []).length;
    if (opens !== closes) violations.push({ file, text: short, why: '括號不成對' });
  }
}

if (violations.length === 0) {
  console.log(
    `\n✓ 錨文字檢查通過：掃 ${scanned} 頁、${anchors} 個 <a>，可見文字皆無裸露網址、括號皆成對。\n`,
  );
  process.exit(0);
}

// 依「文字內容」聚合——同一筆來源資料通常散在數十頁，逐頁列出會淹沒真正的種類數。
const byText = new Map();
for (const v of violations) {
  const e = byText.get(v.text) ?? { n: 0, first: v.file, why: v.why };
  e.n++;
  byText.set(v.text, e);
}
console.error(`\n✗ 錨文字檢查失敗：${violations.length} 處 <a> 的可見文字有問題（${byText.size} 種）。\n`);
for (const [text, { n, first, why }] of [...byText].sort((a, b) => b[1].n - a[1].n).slice(0, MAX_REPORT)) {
  console.error(`  ✗ ${String(n).padStart(4)} 處  [${why}] ${text}`);
  console.error(`          首見於 ${first}`);
}
if (byText.size > MAX_REPORT) console.error(`  …另有 ${byText.size - MAX_REPORT} 種未列出。`);
console.error(
  '\n修法：錨文字要放**來源單位名稱**，不是網址。',
  '\n  · 來源標註走 src/lib/sources.ts 的 parseSourceRef——`ref` 只有網址時，名稱要寫在同筆的 `note`。',
  '\n  · note 若是「同上」這類相對指涉，當不了錨文字，請補成實際單位名稱。',
  '\n  · 若確有必須顯示網址原文的場合，先在本檔加白名單並寫明理由，不要移除檢查。\n',
);
process.exit(1);
