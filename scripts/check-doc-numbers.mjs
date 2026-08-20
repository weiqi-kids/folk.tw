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
// 用法：`pnpm check:doc-numbers`（已串進 deploy.yml 與 pnpm build:release 前段）
import { readFileSync, existsSync } from 'node:fs';
// 語料涵蓋契約：CURRENT_DOCS 裡的檔案若不存在（改名／搬走），這道 gate 就少守一份文件
// 卻照樣印綠字。2026-08-20 改成違規上報。
import { newCorpus } from './lib/gate-corpus.mjs';

const CURRENT_DOCS = [
  'CLAUDE.md',
  'docs/README.md',
  'docs/taiwan-intake-status.md',
  'docs/TODO-FOR-TAIWAN.md',
  // 2026-08-08 擴大涵蓋：這幾份也是**現況型**（描述系統現在怎麼運作），
  // 之前沒被守，於是「12,419 間」「7,891 張」這類數字一直躺在裡面。
  'docs/taiwan-host-handoff.md',
  'docs/topical-blessing.md',
  'docs/seo-automation.md',
  'docs/festival-data-import.md',
  'docs/yaoqian-physician-spec.md',
  'docs/yaoqian-batch-01.md',
  'docs/nmtl-guanyin-qianpu-request.md',
  // 2026-08-19：待撰寫清單。它天生就是**現況型**（還沒寫的東西有哪些），而我第一版
  // 就在裡面寫死「19 產頁／11 不產／0 卡住」——站主當場指出違反第一鐵則。
  // 數量一律留查法，逐項的表格列不受影響（gate 本來就跳過表格列與引用區塊）。
  'docs/writing-queue.md',
];

// 🔴 `docs/decisions/**` 刻意**不**納入：那些是決策的歷史脈絡、原文一字未改（見 CLAUDE.md §4），
//    數字就是當時的量測，改掉等於竄改紀錄。要判斷一份文件該不該納入，問一句：
//    「讀的人會不會拿它當現在的狀況去行動？」會 → 納入；只是在講當時發生什麼 → 不納入。

// 整份文件就是一則帶日期的歷史紀錄時，在檔案開頭 20 行內放這個標記，全檔跳過。
// 這是給「完成紀錄／一次性申請／規格快照」用的——它們的數字本來就是當時的，
// 逐行補日期只是把同一個日期抄幾十遍。⚠️ 不要拿它來豁免現況型文件。
const HISTORICAL_MARK = /<!--\s*doc-numbers:\s*historical\s+(\d{4}-\d{2}-\d{2})\s*-->/;

// 量詞：出現「數字＋這些字」就是一則數量宣稱。
const QUANT = '間|首|頁|條|筆|套|個|尊|張|篇|支|道';
// 🔴 也要抓「N/M」這種比例寫法（2026-08-08 加）：我自己寫了「覆蓋率——27/10,704」進 CLAUDE.md，
//    它沒有量詞所以整條規則接不到，而那正是最會過期的一種數字。
//    ⚠️ 分母限 3 位數以上，否則會誤傷日期（`8/8 看收錄`、`8/16`）與「1/3」這類分數。
const RATIO = '(\\d[\\d,]*)\\s*/\\s*(\\d[\\d,]{2,})';
const CLAIM = new RegExp(`(\\d[\\d,]*)\\s*(${QUANT})|(\\d[\\d.]*)\\s*%|${RATIO}`, 'g');

// 允許的例外——這些不是「會過期的現況」：
const ALLOW = [
  /\d{4}-\d{2}-\d{2}/,          // 該行有日期＝歷史量測，可接受
  /\d{4}\s*年/,                 // 同上
  /第\s*\d+\s*[-–~]\s*\d+\s*首/, // 藏品著錄原文（「第 1-100 首龍山寺籤詩」）
  /NMTL\d+|dataset\s*\d+|\b8\d{3}\b/, // 外部編號／資料集 ID
  /藥籤\s*330\s*首|六十甲子\s*60|關帝[^\n]{0,6}100\s*首/, // 固定的文獻首數，不會變
  /版本|條款|第\s*\d+\s*條/,     // 「第 3 條」這類條次
];
// 🔴 2026-08-08 拿掉兩條**行層級**豁免，它們把最該檢查的地方整片放行：
//   ① `/^\s*[|>]/`（表格列與引用區塊）——`CLAUDE.md` 的待辦**就是一張表**，
//      等於「現況」最集中的地方完全沒被檢查。
//   ② `` /`[^`]*\d[^`]*`/ ``（行內有含數字的程式碼片段就整行豁免）——待辦表格幾乎每列都有
//      `IndexID=4` 這種 code span，於是整列免驗。
//   實際後果：2026-08-08 我在待辦裡寫下「覆蓋率——27/10,704」，gate 說通過。
//   正解是**只把程式碼片段從比對字串裡拿掉，不豁免整行**（下方 stripCode）——
//   指令與欄位名裡的數字本來就不該被當成數量宣稱，但它們不該替同一行的其他文字擋子彈。
//   拿掉後全量只多出 4 處，全部都是真的該修的（已修）。
const stripCode = (line) => line.replace(/`[^`]*`/g, ' ');

const corpus = newCorpus('check:doc-numbers');
const violations = [];
const historical = [];
for (const f of CURRENT_DOCS) {
  // 🔴 不可靜默跳過：CURRENT_DOCS 是「必須被守住的現況型文件」清單，
  //    檔案不在了代表清單過期，而不是這份文件不必守。
  if (!existsSync(f)) { corpus.missing('現況型文件', f, '檔案改名或搬移後 CURRENT_DOCS 沒跟著改'); continue; }
  const raw = readFileSync(f, 'utf8');
  const mark = raw.split('\n').slice(0, 20).join('\n').match(HISTORICAL_MARK);
  if (mark) { historical.push(`${f}（${mark[1]}）`); continue; }
  const lines = raw.split('\n');
  let inFence = false;
  for (const [idx, line] of lines.entries()) {
    if (line.trim().startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;                       // 指令區塊本來就該有數字
    if (ALLOW.some((re) => re.test(line))) continue;
    const hits = [...stripCode(line).matchAll(CLAIM)].map((m) => m[0].trim());
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
corpus.track('現況型文件', CURRENT_DOCS.length - historical.length,
  { why: 'CURRENT_DOCS 全部被標成歷史紀錄、或清單被清空，都會讓這道 gate 實際上不守任何東西' });
const corpusProblems = corpus.problems();
if (corpusProblems.length) {
  console.error('✗ check:doc-numbers 的語料涵蓋有問題（gate 少守卻通過，比沒有這道 gate 更糟）：');
  for (const c of corpusProblems) console.error(`  ${c}`);
  process.exit(1);
}
console.log(`✓ 文件數字檢查通過：${CURRENT_DOCS.length - historical.length} 份現況型文件無寫死的數量宣稱`);
if (historical.length) {
  console.log(`  （另 ${historical.length} 份標記為歷史紀錄、整份跳過：${historical.join('、')}）`);
}
