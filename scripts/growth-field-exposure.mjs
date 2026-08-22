#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 站內資料露出盤點：哪些欄位「有資料，但頁面上看不到」。
// ═══════════════════════════════════════════════════════════════════════════
//
// 由來（2026-08-22）：那一週 appi.news 流量翻倍，其中「七夕拜床母／七娘媽供品」那一叢
// 吃到 14,790 曝光，而本站 /festivals/qixi/ 只有 309。事後查證發現兩邊引的是**同一批**
// 內政部與國史館來源——素材我們早就有，輸的是「資料沒被放在使用者搜尋的那個問題底下」。
// 同一天再查習俗頁，20/20 都有 steps 或 offerings，卻全部掛裸名詞 title（「普渡｜神酷」），
// 而 `taboo` 更是**只餵進 JSON-LD、頁面上一個字都看不到**。
//
// 🔴 所以本站找成長題目的第一步不是「去外面找來源」，是**先盤站內**：
//    十萬筆以上的資料已經在 src/data/，缺的通常是版位與標題，不是資料。
//    外部找源是最後手段（成本高、還要授權），不是第一步。
//
// 本工具做兩件事，都是**啟發式**、輸出是「該去看一眼的清單」而不是判決：
//   ① 欄位填充率：每個資料集各欄位有多少筆是非空的。
//   ② 露出檢查：該欄位名有沒有出現在對應的頁面模板裡。沒有＝資料進不了 HTML。
//      ⚠️ 會誤報：欄位可能經由 src/lib/ 的中介函式渲染（本工具一併掃 lib）。
//      ⚠️ 也會漏報：出現在模板裡不代表「渲染成讀者看得到的東西」——
//         `taboo` 就是活例，它出現在 [id].astro 裡，但只是被塞進 faqPage() 的 JSON-LD。
//      所以本工具**只負責把可疑的挑出來**，是不是真的漏了要自己開頁面看。
//
// 用法：
//   node scripts/growth-field-exposure.mjs                # 全部資料集
//   node scripts/growth-field-exposure.mjs practices      # 只看一個
//   node scripts/growth-field-exposure.mjs --min 0.5      # 只列填充率 ≥50% 的欄位
//
// 這支**不是 gate**：它不會 exit 1，也不進 deploy.yml。露出與否是編輯判斷，
// 不是對錯——把它做成 gate 會逼人為了過關而渲染不該渲染的東西。

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// 資料集 → 消費它的頁面模板。⚠️ 新增資料集要在這裡登記，否則不會被盤到。
const TARGETS = [
  { data: 'src/data/practices.json', pages: ['src/pages/practices/[id].astro'] },
  { data: 'src/data/festivals.json', pages: ['src/pages/festivals/[slug].astro', 'src/pages/festivals/index.astro'] },
  { data: 'src/data/deities.json', pages: ['src/pages/deities/[id].astro'] },
  { data: 'src/data/events.json', pages: ['src/pages/events/[id].astro'] },
  { data: 'src/data/poems.json', pages: ['src/pages/poems/[id].astro'] },
  { data: 'src/data/temples.json', pages: ['src/pages/temples/[id].astro'] },
  { data: 'src/data/scenarios.json', pages: ['src/pages/scenarios/[slug].astro'] },
  { data: 'src/data/comparisons.json', pages: ['src/pages/compare/[slug].astro'] },
  { data: 'src/data/trades.json', pages: ['src/pages/trades/[slug].astro'] },
  // ⚠️ 詞彙**沒有逐條頁**，只有一個樞紐 vocabulary.astro——這是刻意的，見 2026-08-20 的
  //    逐條開頁三條件：詞彙定義正是 Google 一句話答得完的那種，開頁會重蹈藥籤覆轍。
  { data: 'src/data/vocabulary.json', pages: ['src/pages/vocabulary.astro'] },
];

const args = process.argv.slice(2);
const minFill = Number(args.includes('--min') ? args[args.indexOf('--min') + 1] : 0.3);
const only = args.filter((a) => !a.startsWith('--') && a !== String(minFill));

/** src/lib 全文（欄位可能經中介函式渲染，不掃會大量誤報）。 */
const libText = readdirSync(join(ROOT, 'src/lib'), { recursive: true })
  .filter((f) => typeof f === 'string' && /\.(ts|mjs|js)$/.test(f))
  .map((f) => { try { return readFileSync(join(ROOT, 'src/lib', f), 'utf8'); } catch { return ''; } })
  .join('\n');

const rows = (raw) => (Array.isArray(raw) ? raw : (Object.values(raw).find(Array.isArray) ?? []));
const filled = (v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)
  && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

let flagged = 0;
for (const t of TARGETS) {
  const name = t.data.split('/').pop().replace('.json', '');
  if (only.length && !only.includes(name)) continue;
  const path = join(ROOT, t.data);
  if (!existsSync(path)) { console.log(`⚠️ 查無 ${t.data}`); continue; }
  const items = rows(JSON.parse(readFileSync(path, 'utf8')));
  if (!items.length) continue;

  const pageText = t.pages.map((p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : '')).join('\n');
  const haystack = pageText + libText;

  const counts = new Map();
  for (const it of items) for (const [k, v] of Object.entries(it ?? {})) {
    if (filled(v)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const missing = [];
  for (const [field, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    const fill = n / items.length;
    if (fill < minFill) continue;
    // 露出判定：欄位名以屬性存取或字串鍵的形式出現在模板或 lib 裡。
    const seen = new RegExp(`[.\\['"\`]${field.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}[\\]'"\`\\s.,)}:]`).test(haystack);
    if (!seen) missing.push({ field, n, fill });
  }

  console.log(`\n── ${name}（${items.length} 筆）→ ${t.pages.join('、')}`);
  if (!missing.length) { console.log('   所有填充率達門檻的欄位都在模板或 lib 裡出現過。'); continue; }
  for (const m of missing) {
    flagged++;
    console.log(`   ❓ ${m.field.padEnd(20)} ${String(m.n).padStart(6)} 筆有值（${(m.fill * 100).toFixed(0)}%）　模板與 lib 都沒出現`);
  }
}

console.log(`\n共標記 ${flagged} 個可疑欄位（門檻填充率 ≥${(minFill * 100).toFixed(0)}%）。`);
console.log('🔴 這是啟發式清單不是判決：出現在模板裡也可能只進 JSON-LD（taboo 就是），');
console.log('   所以真正的驗收是開 https://folk.tw/<該頁> 用 curl 抓 h2 看讀者到底看不看得到。');
