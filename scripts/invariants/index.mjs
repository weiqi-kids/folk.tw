// ═══════════════════════════════════════════════════════════════════════════
// render 不變量**登錄表**：哪些不變量存在、跑哪一種走訪、各自負責摘要的哪一段。
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 為什麼有這張表（2026-08-19 重構）：check-rendered.mjs 曾是 1,573 行、
//    近 180 個 commit 裡被改 52 次的全 repo 最大改動磁鐵（2.7 倍於第二名）。
//    42 個斷言單元擠在三個 top-level `for` 與 12 個裸 `{ }` 匿名區塊裡，
//    計數靠 11 個 `globalThis.__*` 偷渡，成功訊息是一個內插 40 個運算式的 3,000 字樣板。
//    **新增一條不變量必須同時動迴圈、動 module-level let、動那個樣板**——漏了不會紅燈。
//    現在：新增一條＝在對應的 scripts/invariants/*.mjs 加一個物件、在這裡排一個位置。
//
// ── 排序的意義 ────────────────────────────────────────────────────────────
//  本陣列的順序**就是成功摘要的句子順序**（runner 依序 join('；')），
//  也是同一趟走訪內各 adapter 的執行順序。
//  ⚠️ 排序刻意保留舊 3,000 字樣板的句子順序，讓輸出與重構前逐字相同。
//
// ── 舊編號怎麼安置 ────────────────────────────────────────────────────────
//  舊編號有 3 組真撞號（1h／1i／5g 各被兩個不相干的區塊宣告）、7 段完全無編號的斷言、
//  以及 6 件事塞在同一個編號（19）底下。所以改用**語意 id**，舊編號留在 `legacyIds`：
//  `--only 1b`、`--only 5d` 仍然可用。`--list` 會印出對照表。
import * as temple from './temple.mjs';
import * as town from './town.mjs';
import * as deity from './deity.mjs';
import * as festival from './festival.mjs';
import * as practice from './practice.mjs';
import * as hubs from './hubs.mjs';
import * as almanac from './almanac.mjs';
import * as zodiac from './zodiac.mjs';
import * as share from './share.mjs';
import * as about from './about.mjs';
import * as nearby from './nearby.mjs';
import * as sitewide from './sitewide.mjs';
import * as coverage from './coverage.mjs';
import * as topical from './topical.mjs';

export const REGISTRY = [
  // ── 廟宇頁（一趟走訪，11 條 → 現在 14 條，吸收了原本重複走訪的 2／2b／7②／11）──
  temple.templeLingqian,            // 1
  temple.templeSummaryFaq,          // （原本無編號）
  temple.templeOgCard,              // 1b
  temple.templeTitleHygiene,        // 1d
  temple.templeTownContext,         // 2 + 2b
  // ── 鄉鎮頁 ──
  town.townLeadCount,               // 3
  // ── 神明頁（一趟走訪）──
  deity.deityShengdanTitle,         // 4
  deity.deityIconography,           // 4b
  deity.deityMoiKnowledge,          // 4c
  deity.deityThDict,               // 民俗文物辭典引文（同 4c 的授權條件）
  // ── 節日頁（一趟走訪）──
  festival.festivalSkeleton,        // 5
  festival.festivalOnDateTemples,   // 5b
  // ── 回到廟宇頁那一趟（順序照舊摘要的句序）──
  temple.templeFestivals,           // 1c
  almanac.almanacGoodDays,          // 6
  temple.templeQifu,                // 1f
  temple.templeIntroAndHours,       // 1g
  temple.templeMoiDetail,           // 1h（內政部條目）
  temple.templePhotoCredit,         // 1i（代表圖）＋ 4d 的合併摘要
  hubs.localCelebrationOverview,    // 7①（＋7② 的合併摘要）
  share.poemShareCard,              // 11（＋神明卡／廟頁分享列的合併摘要）
  zodiac.zodiacTaisuiShrine,        // 12
  nearby.nearbyPageSkeleton,        // 13①（＋13② 的合併摘要）
  sitewide.sitewideBodyImages,      // 19①（＋19②⑥ 的合併摘要）

  // ── 以下皆 summary:false（原本就不進成功摘要；顯式宣告，不讓「忘了寫」長得像「刻意不寫」）──
  temple.templeLegalPrefix,         // 1h（法人前綴）
  temple.templeDescriptionPunct,    // 1e
  temple.templeSerpUniqueness,      // 1i（SERP 唯一性；reduce 型）
  temple.templeLocalCelebration,    // 7②
  temple.templeShareRow,            // 11（廟頁分享列）
  deity.deityPhotoCredit,           // 4d
  deity.deityShareCard,             // 11（神明頁）
  festival.festivalFreshness,       // 5g（Discover 新鮮度）
  festival.festivalDiscoverImage,   // 5i
  festival.festivalPracticeHome,    // 5d
  festival.festivalHeritageHome,    // 5e + 5f
  festival.festivalDateLabel,       // （原本無編號）
  festival.festivalTitleIntent,     // （原本無編號）
  festival.festivalOgCard,          // （原本無編號）
  festival.festivalTitleDate,       // 5（日期往返）
  festival.festivalCrossLinks,      // （原本無編號）
  festival.festivalLocalCelebration,// 7③
  practice.practiceThDict,           // 習俗頁的辭典引文（同 deity/th-dict 的授權條件）
  festival.festivalVerbatimSourceLink, // 逐字引用的來源連結必須在頁面上（授權條件）
  hubs.homeSeasonalCampaign,        // 5g（首頁戰役卡）
  hubs.festivalIndexVisuals,        // 5h
  share.shareRowNotOn404,           // 11（404 反向）
  share.shareRowOutsidePagefind,    // 11（pagefind 版位）
  about.aboutImageCredits,          // 10
  nearby.nearbyGridCells,           // 13②
  sitewide.sitewideSystemHubLinks,  // 18
  sitewide.almanacPagefindBody,     // 18（/almanac/ 正文容器）
  coverage.coverageAlmanacDays,     // 19②
  coverage.coverageQiugianHero,     // 19③
  coverage.coverageEncourageCopy,   // 19④
  coverage.coverageZhongyuanChecklist, // 19⑤
  coverage.coverageTopTemples,      // 19⑥

  // ── 獨立的摘要群組（自成一行輸出）──
  topical.topicalFollowupTimeline,
];

export default REGISTRY;
