#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 產生／更新 `src/data/nchdb-folklore-index.json`：國家文化資產網「民俗」類
// 登錄個案的 **caseId 白名錄快照**。乾跑預設，加 `--write` 才寫檔。
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 為什麼要有這份快照（2026-08-19 事故換來的）：
//    `src/data/festivals.json` 有三頁掛了**不存在的 caseId**（鹽水蜂炮、寒單、
//    東山碧軒寺迎佛祖、艋舺青山宮四筆），從 2026-04 前後一直到 8/19 才被發現。
//    為什麼沒被任何東西擋下：
//      ① nchdb 前台 `assets/overview/folklore/<caseId>` 是 Next.js SPA，
//         **不同 caseId 回傳的 HTML 位元組數完全相同**（實測三個不同 id 皆 39,690），
//         而且 robots.txt 404 → HTTP 層拿不到「這個 id 不存在」的訊號。
//      ② 同一個 repo 對同一場民俗掛了兩組不同 id（`temples.json`／`events.json`／
//         `docs/topic-articles/week-06.md`／`week-16.md`／`annual-release-evidence/`
//         全都是對的，只有對外的頁面資料錯），**但沒有東西比對這兩組**。
//    → 這種錯只有「拿官方名錄比對」抓得到。所以名錄要進 repo，比對做成 gate
//      （`scripts/check-source-refs.mjs` 規則 ①）。
//
// **為什麼是快照進 repo，而不是 gate 當場上網抓**：
//    gate 一旦依賴外部站，對方掛掉或改網址就等於這個站沒有法部署——把別人的可用性
//    綁進自己的發佈路徑。快照的代價是會過期，但過期只影響「新登錄的個案還不能引用」，
//    那是可以等的；而 gate 紅燈擋的是所有部署。新鮮度由本檔的 `fetched_on` 記錄，
//    gate 只 WARN 不擋（見 check-source-refs.mjs 規則 ④）。
//
// **為什麼只留六個欄位**：白名錄要回答的只有兩件事——「這個 id 存不存在、是哪一件」
//    （case_id／name／classify／authority），以及「它是不是每年舉辦」
//    （hold_period／hold_calendar，2026-08-19 加，理由見下方那兩欄的行內註解）。
//    完整 33 欄的原始 JSON 有 2.7 MB，全部進 repo 只會讓每次刷新產生巨大 diff，
//    而 `registerReason`／`historyDevelopment` 這些**逐字引用素材要用時現抓**
//    （文化部 2026-08-09 授權的條件是逐字引用＋掛個案網址，不是把整份敘述存進 repo）。
//
// ── 用法 ────────────────────────────────────────────────────────────────
//   node scripts/refresh-nchdb-index.mjs            # 乾跑，只印差異
//   node scripts/refresh-nchdb-index.mjs --write    # 實際寫檔
//
// ⚠️ 寫檔一律走 `lib/dataset-commit.mjs`（原子寫入＋內容相同不重寫），
//    不要在這裡自己 writeFileSync——理由見那支的檔頭。

import { existsSync, readFileSync } from 'node:fs';
import { cliFlags, commitDataset } from './lib/dataset-commit.mjs';

const SOURCE = 'https://data.boch.gov.tw/opendata/v2/assetsCase/5.1.json';
const OUT = 'src/data/nchdb-folklore-index.json';

const flags = cliFlags();

async function main() {
  console.log(`抓取 ${SOURCE} …`);
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`來源回應 ${res.status} ${res.statusText}`);
  const raw = await res.json();
  const rows = Array.isArray(raw) ? raw : (raw.data ?? raw.items ?? []);
  if (!rows.length) throw new Error('來源回傳 0 筆——不要拿空名錄覆蓋既有快照');

  const items = rows
    .map((r) => ({
      case_id: String(r.caseId ?? ''),
      name: String(r.caseName ?? ''),
      // 「民俗」與「重要民俗」是兩種不同的登錄身分，且同一場活動可能兩者都有
      // （東山碧軒寺迎佛祖暨遶境＝臺南市登錄民俗 20090115000004 ＋ 文化部重要民俗
      //  20110825000009）。掛源時選哪一個會影響 note 的寫法，所以要留這欄。
      classify: String(r.assetsClassifyName ?? ''),
      authority: String(r.govInstitutionName ?? ''),
      // 🔴 `hold_period` 是「這個慶典是不是每年辦」的唯一權威依據，2026-08-19 加。
      //    起因：/festivals/local/ 拿內政部那份只有月日的資料算「下一次國曆日期」，
      //    對數年一科的慶典就會算出一個**根本不會發生的日期**（線上實測蕭壟香、
      //    土城香、西港香三筆全錯，蕭壟香 2027 年根本不辦）。來源原文照抄不改寫
      //    （「每逢(隔)3年舉行一次」「其他」「不定期 平均約每十年舉行一科王船醮典」…），
      //    判定邏輯放 src/lib/local-celebration-cycle.ts，不在這裡預先分類。
      hold_period: String(r.holdPeriod ?? ''),
      hold_calendar: String(r.holdCalendarType ?? ''),
    }))
    .filter((x) => /^\d{14}$/.test(x.case_id))
    .sort((a, b) => a.case_id.localeCompare(b.case_id));

  if (items.length !== rows.length) {
    console.log(`  ⚠️ ${rows.length - items.length} 筆的 caseId 不是 14 位數字，已略過`);
  }

  const prevIds = new Set(
    existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')).items ?? []).map((x) => x.case_id) : [],
  );
  const nextIds = new Set(items.map((x) => x.case_id));
  const added = [...nextIds].filter((id) => !prevIds.has(id));
  const removed = [...prevIds].filter((id) => !nextIds.has(id));

  console.log(`  民俗類共 ${items.length} 筆（新增 ${added.length}｜消失 ${removed.length}）`);
  for (const id of added) console.log(`    ＋ ${id} ${items.find((x) => x.case_id === id).name}`);
  // 🔴 消失要當異常看：官方撤銷登錄是罕事，更常見的是來源當天資料不全。
  //    真的撤銷了，引用它的頁面就得處理，不能靜默把 id 從白名錄拿掉。
  for (const id of removed) console.log(`    － ${id}（已引用它的頁面必須一併處理，不要只更新名錄）`);

  const data = {
    _readme:
      '國家文化資產網「民俗」類登錄個案的 caseId 白名錄快照。用途＝讓 check:source-refs 能判斷 repo 引用的 caseId 是否真的存在'
      + '（nchdb 前台是 SPA、不同 id 回傳相同位元組數，HTTP 層驗不出來）。'
      + '刷新：node scripts/refresh-nchdb-index.mjs --write。逐字引用素材要用時現抓，不存進本檔。',
    source: SOURCE,
    fetched_on: new Date().toISOString().slice(0, 10),
    items,
  };

  commitDataset({
    path: OUT,
    data,
    write: flags.write,
    doneNote: `✓ 已寫入 ${OUT}`,
  });
}

main().catch((err) => {
  console.error(`✗ 刷新失敗：${err.message}`);
  process.exit(1);
});
