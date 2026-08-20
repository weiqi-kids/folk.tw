#!/usr/bin/env node
// 國史館臺灣文獻館《臺灣民俗文物辭典》辭條 → `deities.json` 的 `th_dict` 欄位。
//
// 🔴 逐字引用、一個字不改寫；授權條件＝**標示資料來源連結**（2026-08-19 站主確認，
//    與內政部 2026-08-06、文化部 2026-08-09 那兩次同一條）。所以本檔一定寫入 `url`，
//    而 gate `deity/th-dict` 會驗那個連結**真的渲染在頁面上**——少了連結就是違反授權，
//    而那是不會有任何錯誤訊息的違反。
//
// ── 對映從哪來（為什麼不是自動比名字）────────────────────────────────────
//   辭典的辭條名稱與本站的神明名稱不一定同字（例：本站「七爺八爺」、辭典可能是
//   「范謝將軍」）。**自動比對只用來產生候選，採用與否是人工判斷**，結果寫在
//   `src/data/th-dict-map.json`，每一筆都要有 `basis`（憑什麼說是同一個）。
//   對不上的一律不填——查無權威源就留空是本 repo 第一紅線。
//
// ── 防 ID 漂移 ───────────────────────────────────────────────────────────
//   抓回來的辭條名稱必須與 map 記的 `dict_name` 相符，不符就整筆拒絕並報錯：
//   辭典是外部系統，編號重排時我們不能安靜地把別人的辭條掛到某尊神明頭上。
//
// 用法：
//   node scripts/import-th-dict.mjs            # 乾跑（預設，不寫檔）
//   node scripts/import-th-dict.mjs --write    # 實際寫入 src/data/deities.json
//   node scripts/import-th-dict.mjs --only baoyi,qixing
//
// ⚠️ 本檔會「就地」改寫 deities.json 的目標欄位，刻意不整檔重新序列化——
//    那個檔是混合縮排（部分陣列寫成單行），整檔 re-dump 會產生數千行假 diff。

import { readFileSync, writeFileSync } from 'node:fs';

const DEITIES = 'src/data/deities.json';
const MAP = 'src/data/th-dict-map.json';
const BASE = 'https://dict.th.gov.tw/detailPage.aspx';

const args = process.argv.slice(2);
const write = args.includes('--write');
const onlyArg = args.find((a) => a.startsWith('--only'));
const only = onlyArg ? new Set((onlyArg.split('=')[1] ?? args[args.indexOf(onlyArg) + 1] ?? '').split(',').filter(Boolean)) : null;

/** 詳情頁 → { name, paragraphs[] }。標籤轉換行以保住段落邊界（辭條簡介常有 2～4 段）。 */
function parseEntry(html) {
  let b = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  b = b.replace(/<[^>]+>/g, '\n');
  b = b
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const lines = b.split('\n').map((s) => s.replace(/[ \t　\r]+/g, ' ').trim()).filter(Boolean);
  const at = (label) => lines.findIndex((s) => s.startsWith(label));
  const iName = at('辭條名稱');
  const iIntro = at('辭條簡介');
  const iEnd = at('相關辭條');
  if (iName < 0 || iIntro < 0) return null;
  // 「辭條名稱：」與值可能同一行、也可能分行（版面在不同辭條間不一致）。
  const nameInline = lines[iName].replace(/^辭條名稱[：:]\s*/, '');
  const name = nameInline || lines[iName + 1] || '';
  const body = lines.slice(iIntro, iEnd > iIntro ? iEnd : undefined);
  body[0] = body[0].replace(/^辭條簡介[：:]\s*/, '');
  // 段落＝有實質內容的行（辭典的段落間本來就以標籤分隔）。
  const paragraphs = body.filter((s) => s.length >= 8);
  return { name: name.trim(), paragraphs };
}

const map = JSON.parse(readFileSync(MAP, 'utf8'));
const rows = map.items.filter((r) => !only || only.has(r.deity_id));
const urlOf = (dictId) => `${BASE}?ID=${dictId}`;
const raw = readFileSync(DEITIES, 'utf8');
const deities = JSON.parse(raw);
const byId = new Map(deities.map((d) => [d.id, d]));

let ok = 0;
const errors = [];
const pending = [];

for (const r of rows) {
  const d = byId.get(r.deity_id);
  if (!d) { errors.push(`${r.deity_id}：deities.json 查無此神明`); continue; }
  const entries = [];
  let bad = false;
  for (const ent of r.entries) {
    const url = urlOf(ent.dict_id);
    let html;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'folk.tw importer (contact lightman.chang@gmail.com)' } });
      if (!res.ok) { errors.push(`${r.deity_id}：HTTP ${res.status} ${url}`); bad = true; break; }
      html = await res.text();
    } catch (e) {
      errors.push(`${r.deity_id}：抓取失敗 ${e.message}`); bad = true; break;
    }
    const parsed = parseEntry(html);
    if (!parsed) { errors.push(`${r.deity_id}：詳情頁解析失敗（版面變了？）${url}`); bad = true; break; }
    // 🔴 ID 漂移防線：名稱對不上就整筆拒絕，不猜。
    if (parsed.name !== ent.dict_name) {
      errors.push(`${r.deity_id}：辭條名稱不符——map 記「${ent.dict_name}」，實際抓到「${parsed.name}」（${url}）`);
      bad = true; break;
    }
    if (!parsed.paragraphs.length) { errors.push(`${r.deity_id}：辭條簡介為空 ${url}`); bad = true; break; }
    entries.push({ url, title: parsed.name, excerpt: parsed.paragraphs });
    await new Promise((r2) => setTimeout(r2, 250)); // 對外站限速
  }
  // 一尊神明只要有一條出錯就整尊不寫——寧可留空，不要寫進半套。
  if (bad || entries.length !== r.entries.length) continue;
  pending.push({ deity: d, entry: entries });
  ok += 1;
}

for (const e of errors) console.log('✗', e);
console.log(`\n可寫入 ${ok} 筆 / 對映表 ${rows.length} 筆${errors.length ? `（${errors.length} 筆被擋下）` : ''}`);
for (const p of pending) {
  console.log(`  ${p.deity.id.padEnd(20)} ${p.entry.map((q) => `${q.title}（${q.excerpt.length} 段 / ${q.excerpt.join('').length} 字）`).join('　')}`);
}

if (!write) {
  console.log('\n（乾跑，未寫檔。要實際寫入加 --write）');
  process.exit(errors.length ? 1 : 0);
}

// 就地插入：把 th_dict 放在該神明物件的頂層 "sources" 之前（沒有就放 "draft" 之前）。
//
// 🔴 一定要「逐行 + 認縮排」，不可以用 indexOf 找 `"sources": [`：
//    神明物件裡有**巢狀的 sources**（`birthday_lunar[].sources`、`image` 之類），
//    純字串搜尋會先撞到那個巢狀的，於是欄位被插進巢狀物件裡——JSON 仍然合法、
//    不會報錯，但那尊神明的頂層就是沒有 th_dict。2026-08-20 實際發生：
//    寫入報告說 17 筆，實際只有 3 筆落到正確位置，其餘 14 筆安靜地插錯地方。
//    頂層 key 的縮排固定是 4 個空白，巢狀的都 6 個以上，用這個分辨。
const TOP = '    '; // 頂層 key 的縮排
const lines = raw.split('\n');
const objStart = (id) => lines.findIndex((l) => l === `${TOP}"id": ${JSON.stringify(id)},`);
for (const p of pending) {
  const start = objStart(p.deity.id);
  if (start < 0) { errors.push(`${p.deity.id}：寫入時找不到頂層物件（"id" 那一行）`); continue; }
  // 物件結束＝下一個頂層 "id" 行（或檔尾）
  let end = lines.findIndex((l, k) => k > start && l.startsWith(`${TOP}"id": `));
  if (end < 0) end = lines.length;
  const topKey = (name) => lines.findIndex((l, k) => k > start && k < end && l.startsWith(`${TOP}"${name}":`));
  const block = JSON.stringify(p.entry, null, 2)
    .split('\n')
    .map((ln, k) => (k ? TOP + ln : ln))
    .join('\n');
  const field = `${TOP}"th_dict": ${block},`;
  const existing = topKey('th_dict');
  if (existing >= 0) {
    // 既有欄位整段換掉（idempotent，可重跑）：從該行到對應的 `    ],` 為止
    let close = existing;
    while (close < end && lines[close] !== `${TOP}],`) close += 1;
    lines.splice(existing, close - existing + 1, field);
  } else {
    const anchor = topKey('sources') >= 0 ? topKey('sources') : topKey('draft');
    if (anchor < 0) { errors.push(`${p.deity.id}：找不到可插入的錨點（sources／draft）`); continue; }
    lines.splice(anchor, 0, field);
  }
}
const out = lines.join('\n');
JSON.parse(out); // 壞了就當場炸，不要寫出壞檔
writeFileSync(DEITIES, out);
console.log(`\n✓ 已寫入 ${pending.length} 筆到 ${DEITIES}`);
if (errors.length) process.exit(1);
