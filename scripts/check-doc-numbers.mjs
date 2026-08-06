#!/usr/bin/env node
// 文件數字守門：**「現況型」文件不得寫死會過期的數量。**
//
// 為什麼要這道 gate（2026-08-06 建）：
//   用戶從一開始就交代「數值不要寫死在檔案中，留下指令讓人隨時查最新的」。
//   但實作上只有 `intake-status.mjs` 那條線做到，其餘文件仍到處是硬編數字。
//   三輪獨立稽核共抓出十幾條過期數字（2,500→2,498、229→219、籤解 160→215、
//   候選池 501→998、nav 34→44、籤系「2 套」實際 5 套…），而每一條都是「當時對、後來爛掉」。
//   逐條修是治症狀——**沒有 gate，明天照樣爛**。這支就是那個機器層。
//
// 掃描範圍刻意只有「現況型」文件（見 CURRENT_DOCS）：
//   它們描述的是「現在的狀態」，讀者會照著行動，所以不能過期。
//   `docs/decisions/*.md` 是**歷史脈絡**（檔頭已聲明「本檔是決策歷史、不是現況規格」），
//   裡面的數字是「當時的量測」，只要**帶年份**就是正確的事實陳述，不在本 gate 範圍。
//
// 用法：`pnpm check:doc-numbers`（已串進 deploy.yml 與 pnpm build 前段）
import { readFileSync, existsSync } from 'node:fs';

const CURRENT_DOCS = [
  'CLAUDE.md',
  'docs/README.md',
  'docs/taiwan-intake-status.md',
  'docs/TODO-FOR-TAIWAN.md',
];

// 量詞：出現「數字＋這些字」就是一則數量宣稱。
const QUANT = '間|首|頁|條|筆|套|個|尊|張|篇|支|道';
const CLAIM = new RegExp(`(\\d[\\d,]*)\\s*(${QUANT})|(\\d[\\d.]*)\\s*%`, 'g');

// 允許的例外——這些不是「會過期的現況」：
const ALLOW = [
  /\d{4}-\d{2}-\d{2}/,          // 該行有日期＝歷史量測，可接受
  /\d{4}\s*年/,                 // 同上
  /第\s*\d+\s*[-–~]\s*\d+\s*首/, // 藏品著錄原文（「第 1-100 首龍山寺籤詩」）
  /NMTL\d+|dataset\s*\d+|\b8\d{3}\b/, // 外部編號／資料集 ID
  /藥籤\s*330\s*首|六十甲子\s*60|關帝[^\n]{0,6}100\s*首/, // 固定的文獻首數，不會變
  /^\s*[|>]/,                   // 表格列與引用區塊（多為歷史對照）
  /`[^`]*\d[^`]*`/,             // 出現在程式碼片段裡（指令、路徑、欄位）
  /版本|條款|第\s*\d+\s*條/,     // 「第 3 條」這類條次
];

const violations = [];
for (const f of CURRENT_DOCS) {
  if (!existsSync(f)) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  let inFence = false;
  for (const [idx, line] of lines.entries()) {
    if (line.trim().startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;                       // 指令區塊本來就該有數字
    if (ALLOW.some((re) => re.test(line))) continue;
    const hits = [...line.matchAll(CLAIM)].map((m) => m[0].trim());
    if (hits.length) {
      violations.push({ f, n: idx + 1, hits, text: line.trim().slice(0, 76) });
    }
  }
}

if (violations.length) {
  console.error(`✗ 現況型文件出現寫死的數量宣稱 ${violations.length} 處：\n`);
  for (const v of violations) {
    console.error(`  ${v.f}:${v.n}  「${v.hits.join('、')}」`);
    console.error(`    ${v.text}`);
  }
  console.error(`
修法（擇一）：
  ① 改成指令——例如「跑 \`node scripts/intake-status.mjs\` 看現況」
  ② 這是歷史量測 → 在同一行補上日期（如「2026-08-06 實測 …」），gate 就會放行
  ③ 這是不會變的常數 → 在 scripts/check-doc-numbers.mjs 的 ALLOW 補一條，並說明為什麼不會變

🔴 為什麼擋這個：三輪獨立稽核抓出十幾條過期數字，每一條都是「當時對、後來爛掉」，
   而讀者會照著行動。逐條修是治症狀，這道 gate 才是治本。`);
  process.exit(1);
}
console.log(`✓ 文件數字檢查通過：${CURRENT_DOCS.length} 份現況型文件無寫死的數量宣稱`);
