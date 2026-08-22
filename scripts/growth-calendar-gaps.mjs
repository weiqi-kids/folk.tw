#!/usr/bin/env node
// 檔期倒推：接下來 N 天有哪些節慶檔期、各自的頁在 GSC 上拿到多少、哪些檔期還沒被 Google 看見。
//
// ── 為什麼需要這支（2026-08-22）────────────────────────────────────────────
// 隔壁棚 appi.news 三週內使用者翻倍，事後解剖出的三個引爆點之一是
// 「七夕主題 8/19 準點引爆——8/8 前佈局的季節主題照劇本收割」。本站的素材比它多
// （festivals 與 events 兩份資料集、每筆都掛好源），但**沒有任何機制在盯檔期**：
// `src/lib/seasonal-campaigns.ts` 只管首頁那張主卡要換哪一檔，
// `check:festival-calendar` 只驗日期算得對不對，**沒有人在問「這一檔有沒有頁、排第幾」**。
// 結果就是 2026-08-22 首跑實測到的：中秋（T-34）排第 31.2 名、
// 放水燈（T-4）排第 8.2 名、中元（T-5）排第 9.6 名／1,241 曝光只有 9 點擊，
// 而同一天到期的搶孤有專屬深頁、排第 4.7 名／1,666 曝光 99 點擊。
//
// ── 判準從哪來 ──────────────────────────────────────────────────────────
// 本站唯一被實測證實會贏的查詢形態是 `<地方><活動><年份>`：
//   頭城搶孤2026 pos 4.1／恆春搶孤2026 pos 4.2／青山王祭2026 pos 5.6／2026下元節 pos 3.7。
// 對照組是一句話事實型（放水燈日期 pos 7.4 **0 點擊**、中元節2026 pos 11.1 0 點擊），
// 那類會被 AI Overview 吃掉——判準見自動記憶 `demand-corpus-pivot` 與
// `src/data/artifact-pages.json` 的 `_readme`。
//
// 🔴 本支只報告、不改檔、不當 gate。做成 gate 會逼人為了過關而開頁，
//    而「要不要開頁」是編輯判斷（同 growth-field-exposure.mjs 檔頭刻意不做成 gate 的理由）。
// ⚠️ 運算在 scripts/lib/calendar-gaps.mjs，seo-daily.mjs 的 calendarGaps 段共用同一支。
//
// 用法：
//   node scripts/growth-calendar-gaps.mjs              # 未來 120 天
//   node scripts/growth-calendar-gaps.mjs --days 60
//   node scripts/growth-calendar-gaps.mjs --json
//   node scripts/growth-calendar-gaps.mjs --no-gsc     # 不打 GSC，只看日曆
//   node scripts/growth-calendar-gaps.mjs --write      # 另寫 data/seo-daily/<台灣日期>-calendar-gaps.json
//
// ── --write 是給大腦層用的（2026-08-22）──────────────────────────────────
// 大腦層（seo-ops，台北 16:40）在 2026-08 期間幾乎天天 no-op，翻 actions.md 的理由每天一樣：
// 它拿到的候選（strikingDistance／highImpZeroClick／cannibalization）**清一色是廟名整句查詢**，
// 而站規明文禁止逐廟調整——等於每天餵它一份它依規則只能全部退掉的清單。
// 檔期缺口是它唯一能合法動手、又有時效性的題目，所以掛進 `brain.preCommands`
// （/root/seo-ops/sites/folk.tw.json），並在站規 playbook 指明要讀這個檔。
// ⚠️ **不要改 `scripts/seo-daily.mjs`**：那支是舊的手動工具，真正每天產日 JSON 的是
//    /root/seo-ops/bin/seo-collect.mjs（14 站共用框架）。改錯落點不會紅燈，只會安靜沒資料。
// 檔名沿用同目錄既有的 `<日期>-trend-brief.md`／`<日期>-actions.md` 慣例。

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gscQuery, loadConfig } from './lib/google-data.mjs';
import { computeCalendarGaps } from './lib/calendar-gaps.mjs';

const { festivalNextSolar } = await import('../src/lib/lunar-date.ts');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const noGsc = args.includes('--no-gsc');
const doWrite = args.includes('--write');
const daysArg = args.indexOf('--days');
const HORIZON = daysArg >= 0 ? Number(args[daysArg + 1]) : 120;

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const festivals = read('../src/data/festivals.json');
const events = read('../src/data/events.json');

// 台灣日期：T-minus 是給台灣的編輯排程用的。
const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

let pageRows = [];
if (!noGsc) {
  const { gscSiteUrl } = loadConfig();
  const ymd = (d) => d.toLocaleDateString('en-CA');
  pageRows = (await gscQuery(gscSiteUrl, {
    startDate: ymd(new Date(Date.now() - 29 * 86400000)),
    endDate: ymd(new Date(Date.now() - 86400000)),
    dimensions: ['page'], rowLimit: 25000,
    dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: '/festivals/' }] }],
  })).rows ?? [];
}

const upcoming = computeCalendarGaps({ festivals, festivalNextSolar, pageRows, todayIso, horizon: HORIZON });

// events.json 那半邊：日期是散文（date_note），本支**不推算**它的國曆日——
// 推算散文日期正是杜撰的溫床。要納入排程就到資料層補結構化日期。
const eventNote = events.filter((e) => (e.facts?.length ?? 0) >= 3).map((e) => ({ id: e.id, name: e.name }));

if (doWrite) {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const file = join(repoRoot, 'data', 'seo-daily', `${todayIso}-calendar-gaps.json`);
  const gaps = upcoming.filter((u) => u.verdict !== '正常' && u.verdict !== '—');
  writeFileSync(file, JSON.stringify({
    _readme: '檔期倒推：未來 N 天的節慶檔期與各自的 GSC 表現。判讀欄是編輯提示不是及格線；'
      + '要不要開頁／補強照 folk.tw 的 docs/demand-page-playbook.md §3 三條件判。'
      + '產生器：scripts/growth-calendar-gaps.mjs（唯一運算入口在 scripts/lib/calendar-gaps.mjs）。',
    generatedAt: new Date().toISOString(), todayIso, horizonDays: HORIZON, upcoming, gaps,
  }, null, 2) + '\n', 'utf8');
  console.log(`✓ 已寫 ${file}（${upcoming.length} 檔，其中 ${gaps.length} 檔值得看一眼）`);
} else if (asJson) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), todayIso, horizon: HORIZON, upcoming, eventNote }, null, 2));
} else {
  console.log(`檔期倒推（台灣日期 ${todayIso} 起 ${HORIZON} 天）｜GSC 近 28 天｜共 ${upcoming.length} 檔\n`);
  console.log('T-    國曆        農曆／標籤        曝光   點擊    排名  判讀            頁');
  for (const u of upcoming) {
    console.log(
      `${String(u.tMinus).padStart(3)}  ${u.iso}  ${(u.label || '').padEnd(14)}` +
      `${String(u.impressions).padStart(6)} ${String(u.clicks).padStart(6)} ` +
      `${(u.position === null ? '   -' : u.position.toFixed(1)).padStart(7)}  ${u.verdict.padEnd(14)}  ${u.url}`,
    );
  }
  const gaps = upcoming.filter((u) => u.verdict !== '正常' && u.verdict !== '—');
  console.log(`\n值得看一眼的 ${gaps.length} 檔（依 T-minus）：`);
  for (const u of gaps) console.log(`  T-${u.tMinus}  ${u.name}（${u.verdict}）  ${u.url}`);
  console.log('\n⚠️ 這是提示不是判決。要不要開頁／補強照 docs/demand-page-playbook.md §3 的三條件判。');
  console.log(`\n另有 ${eventNote.length} 筆 events.json 條目掛源 ≥3 條但只有 /events/ 頁（弱頁型，2026-08-22 實測 pos 11.6）；`);
  console.log('   它們的日期是散文，本支刻意不推算——要納入排程請先在資料層補結構化日期。');
}
