#!/usr/bin/env node
// P2 新聞掃描的**歷史歸因**：把整份 log 的複驗結果分類統計，回答「我們為什麼吃不下某類事件」。
//
// ── 為什麼要有這支（2026-08-22）────────────────────────────────────────────
// 站主指出「這次人為災害沒有入選，這是重大錯誤」。當天第一輪的歸因把矛頭指向**類型表漏了**，
// 事後稽核打回——那段時間掃描器整支掛掉，任何類型都是零，不能拿來當證據
// （見 docs/topical-blessing.md §0 的更正）。同一天第二輪才把整份 log 全量歸因，
// 發現真正的兇手是**複驗**：丟棄佔複驗次數六成，而且人為類的通過率只有天災類的一半多一點。
//
// 🔴 教訓不是「那次判斷錯了」，是**憑最近幾行 log 做歸因一定會錯**。所以把它做成可重跑的工具：
//    下次再問「這類事件為什麼沒進來」，跑這支，不要翻 tail。
// ⚠️ 本支**只讀 log、不改任何東西**，也不是 gate——它回答的是「為什麼」，不是「合不合格」。
//
// 用法：
//   node scripts/topical-scan-audit.mjs                 # 預設讀 seo-ops 的 P2 log
//   node scripts/topical-scan-audit.mjs --log <path>
//   node scripts/topical-scan-audit.mjs --manmade       # 只列人為類的逐筆丟棄
//   node scripts/topical-scan-audit.mjs --json

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const logArg = args.indexOf('--log');
const LOG = logArg >= 0 ? args[logArg + 1] : '/root/seo-ops/logs/folk.tw-topical-news.log';
const asJson = args.includes('--json');
const onlyManmade = args.includes('--manmade');

// 人為意外族。⚠️ 與 lib/topical-text.mjs 的 TYPE_LABEL 不是同一份：那份是「顯示標籤」，
// 這份是「歸因分族」，兩者的變動理由不同，刻意不共用（合併會讓改標籤時意外改動統計口徑）。
const MANMADE = new Set(['fire', 'gas-explosion', 'aviation', 'rail', 'maritime',
  'building-collapse', 'crowd-crush', 'industrial', 'explosion', 'bridge-collapse']);

let text;
try { text = readFileSync(LOG, 'utf8'); }
catch (e) { console.error(`讀不到 log：${LOG}（${e.message}）`); process.exit(1); }

const records = [];
let scanFailures = 0;
let cand = null;
for (const ln of text.split('\n')) {
  if (/掃描失敗/.test(ln)) scanFailures++;
  const m = ln.match(/複驗候選：([a-z-]+)@(.+?)（time=/);
  if (m) { cand = { type: m[1], place: m[2] }; continue; }
  if (!cand) continue;
  if (ln.includes('丟棄：')) {
    records.push({ ...cand, outcome: ln.split('丟棄：')[1].split('（')[0].trim() });
    cand = null;
  } else if (ln.includes('通過複驗')) {
    records.push({ ...cand, outcome: '通過' });
    cand = null;
  }
}

const passed = records.filter((r) => r.outcome === '通過');
const dropped = records.filter((r) => r.outcome !== '通過');
const tally = (rows, key) => {
  const m = new Map();
  for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const split = (pred) => {
  const rows = records.filter(pred);
  return { total: rows.length, passed: rows.filter((r) => r.outcome === '通過').length, rows };
};
const manmade = split((r) => MANMADE.has(r.type));
const natural = split((r) => !MANMADE.has(r.type));
const rate = (o) => (o.total ? `${(o.passed / o.total * 100).toFixed(0)}%` : '—');

if (asJson) {
  console.log(JSON.stringify({
    log: LOG, scanFailures,
    total: records.length, passed: passed.length, dropped: dropped.length,
    dropReasons: Object.fromEntries(tally(dropped, 'outcome')),
    manmade: { total: manmade.total, passed: manmade.passed },
    natural: { total: natural.total, passed: natural.passed },
    droppedRows: dropped,
  }, null, 2));
} else if (onlyManmade) {
  console.log(`人為類被丟棄的逐筆（${manmade.rows.filter((r) => r.outcome !== '通過').length} 筆）：`);
  for (const r of manmade.rows.filter((x) => x.outcome !== '通過')) {
    console.log(`  ${r.type.padEnd(18)} ${r.place.slice(0, 30).padEnd(32)} ${r.outcome}`);
  }
} else {
  console.log(`P2 掃描歷史歸因　log=${LOG}\n`);
  console.log(`複驗 ${records.length} 次｜通過 ${passed.length}｜丟棄 ${dropped.length}` +
    `（${records.length ? (dropped.length / records.length * 100).toFixed(0) : 0}%）`);
  console.log(`另有「claude 掃描失敗」${scanFailures} 次——⚠️ 那段期間任何類型都是零，`);
  console.log(`  **不可拿來證明某個類型漏了**（2026-08-22 就是這樣把 VN34 歸錯因的）。\n`);
  console.log('丟棄原因：');
  for (const [r, n] of tally(dropped, 'outcome')) console.log(`  ${String(n).padStart(4)}  ${r}`);
  console.log(`\n分族通過率：人為類 ${manmade.passed}/${manmade.total}（${rate(manmade)}）` +
    `｜天災類 ${natural.passed}/${natural.total}（${rate(natural)}）`);
  console.log('\n被丟棄最多的事件類型：');
  for (const [t, n] of tally(dropped, 'type').slice(0, 8)) console.log(`  ${String(n).padStart(4)}  ${t}`);
  console.log('\n逐筆看人為類：--manmade｜機器可讀：--json');
}
