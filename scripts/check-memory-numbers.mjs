#!/usr/bin/env node
// 記憶檔的數量宣稱守門。與 check-doc-numbers.mjs 同一條紅線，但守的是**更危險的地方**。
//
// 🔴 為什麼記憶檔比文件更該守（2026-08-08 建）：
//    `/root/.claude/projects/-root-folk-tw/memory/` 每個 session **自動載入**。
//    寫死在那裡的過期數字不是「查到時發現不對」，是「一開始就以為自己知道」——
//    我會拿它當前提去做判斷，而且不會想到要查證。
//    2026-08-08 實測當時記憶裡的數字沒有一個是對的：
//      神明 76 尊 → 實際 94｜廟宇 7,891 間 → 10,704｜唯一名 4,993 → 6,666｜
//      同名 2,898 → 4,038｜土地公 1,384 → 907｜籤 160 首 → 215｜/trades 12 頁 → 2 個檔。
//    其中「神明 76 尊 100% 對映」還寫在 frontmatter 的 `description`，等於每次開場就先讀到一句錯的。
//
// 🔴 這支**只能跑在本機**：記憶目錄不在 repo 裡，CI 上不存在。
//    所以它掛在 `.githooks/pre-push`，不在 deploy.yml。目錄不存在時直接放行（別的機器）。
//
// 規則與 check-doc-numbers 一致：數字＋量詞／百分比／N 分之 M 都算宣稱；
// 帶日期的那一行視為歷史量測（記憶本來就該記歷史），放行。
//
// 用法：`node scripts/check-memory-numbers.mjs`

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
// 語料涵蓋契約。⚠️ 這支的「目錄不存在就 exit 0」是**刻意的**（記憶目錄只在本機有，
// CI 沒有），所以下限只在目錄存在時才有意義——目錄在卻掃到 0 份，代表副檔名或路徑變了。
import { newCorpus } from './lib/gate-corpus.mjs';

const DIR = '/root/.claude/projects/-root-folk-tw/memory';

if (!existsSync(DIR)) {
  console.log('（找不到記憶目錄，略過——這支只在本機有意義。）');
  process.exit(0);
}

const QUANT = '間|首|頁|條|筆|套|個|尊|張|篇|支|道';
// 🔴 只抓 **≥2 的具體計數**（2026-08-08 調校）。0 與 1 在散文裡幾乎都是修辭或結構
//    （「0 筆寫入」「第 N+1 條」「每一條」），不是會過期的現況宣稱。
//    會叫錯的狼會被忽略——這支的價值全在「它響的時候一定是真的」。
const RATIO = '(\\d[\\d,]*)\\s*/\\s*(\\d[\\d,]{2,})';
const CLAIM = new RegExp(`([2-9]|\\d{2,}|\\d[\\d,]{2,})\\s*(${QUANT})|(\\d[\\d.]*)\\s*%|${RATIO}`, 'g');
// 排除「N+1」「≥2」這類非計數寫法：數字前後有 + 或 ≥ 就不是在報數量。
const NOT_COUNT = /[+＋≥≤<>~～-]\s*\d|\d\s*[+＋]/;

// 允許：帶日期＝歷史量測；外部編號；固定文獻首數；條次。
// ⚠️ 加新的例外前先問自己「這個數字明年還會是對的嗎」——會變的就不是例外，是該改成指令。
const ALLOW = [
  /\d{4}-\d{2}-\d{2}/,
  /\d{4}\s*年/,
  /NMTL\d+|dataset\s*\d+|\b8\d{3}\b/,
  /藥籤\s*330\s*首|六十甲子\s*60|關帝[^\n]{0,6}100\s*首/,
  /版本|條款|第\s*\d+\s*條/,
];

const stripCode = (line) => line.replace(/`[^`]*`/g, ' ');

const violations = [];
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.md'))) {
  const lines = readFileSync(join(DIR, f), 'utf8').split('\n');
  let inFence = false;
  for (const [idx, line] of lines.entries()) {
    if (line.trim().startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (ALLOW.some((re) => re.test(line))) continue;
    const stripped = stripCode(line);
    const hits = [...stripped.matchAll(CLAIM)]
      .filter((m) => !NOT_COUNT.test(stripped.slice(Math.max(0, m.index - 2), m.index + m[0].length + 2)))
      .map((m) => m[0].trim());
    if (hits.length) violations.push({ f, n: idx + 1, hits, text: line.trim().slice(0, 70) });
  }
}

if (!violations.length) {
  const mdCount = readdirSync(DIR).filter((x) => x.endsWith('.md')).length;
  const corpus = newCorpus('check:memory-numbers');
  corpus.track('記憶檔', mdCount, { why: '目錄存在卻掃到 0 份，代表路徑或副檔名變了（目錄不存在是另一回事，上面已 exit 0）' });
  const corpusProblems = corpus.problems();
  if (corpusProblems.length) {
    console.error('✗ check:memory-numbers 的語料涵蓋有問題：');
    for (const c of corpusProblems) console.error(`  ${c}`);
    process.exit(1);
  }
  console.log(`✓ 記憶檔數字檢查通過：掃 ${mdCount} 份，無寫死的數量宣稱`);
  process.exit(0);
}

console.error(`✗ 記憶檔出現寫死的數量宣稱 ${violations.length} 處：\n`);
for (const v of violations.slice(0, 25)) {
  console.error(`  ${v.f}:${v.n}  「${v.hits.join('、')}」`);
  console.error(`    ${v.text}`);
}
if (violations.length > 25) console.error(`  …另有 ${violations.length - 25} 處`);
console.error(`
修法（擇一）：
  ① 改成查法——寫「跑 \`node scripts/intake-status.mjs\`」而不是寫數字
  ② 這是歷史量測 → 同一行補上日期（如「2026-08-06 實測 …」）
  ③ 真的是不會變的常數 → 加進本檔 ALLOW，並在註解說明為什麼不會變

🔴 為什麼記憶檔比文件更嚴：它每個 session 自動載入。過期數字不是「查到時發現不對」，
   是「一開始就以為自己知道」，會被當成前提用下去而不會想到查證。`);
process.exit(1);
