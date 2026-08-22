// SERP 寬度與長度預算的**唯一入口**。頁面（產生字串）與 gate（驗證字串）共用同一支。
//
// 🔴 為什麼一定要唯一入口：本 repo 已經被「gate 自己重推導一次規則」咬過。
//    最貴的一次是 scripts/check-rendered.mjs 的 ASTRO_ESCAPE（2026-08-08 同一天兩次假紅燈：
//    先漏 `"`、再漏 `'`），結論是「逐字元補是錯的做法」——錯不在資料，錯在有第二份規則。
//    全形寬度是同一個病灶的另一個病例：同一條規則曾同時存在四份
//    （src/lib/sources.ts、src/pages/temples/[id].astro、check-rendered.mjs 兩處），
//    其中 gate 那兩處還把正規式寫成反向（`/[^\x00-\xff]/`）——目前語意等價，
//    但那正是「兩份規則各自演化」的起點。修一份不會讓另一份跟著修，
//    而 gate 與頁面不一致時**不會紅燈，會安靜地放行錯的東西**。
//    ⚠️ 要改寬度規則或任何上限，改這裡；不要在呼叫端就地再寫一份。
//
// 單位注意（三種都在用，刻意不合併，見下）：
//   ① fullWidth（本檔）：半形 0.5、全形 1 —— SERP **標題**寬度用這個。
//   ② 碼點數 `[...s].length` —— src/pages/temples/[id].astro 的 HISTORY_SNIPPET_MAX。
//   ③ UTF-16 `.length` —— src/lib/text.ts 的 excerptAtBoundary（Base.astro 的 160）。
//   ②③ 目前是既成事實，改動會直接改變線上文案，故本檔只負責 ①，不擅自統一。

/**
 * SERP 全形寬度：ASCII（含英數與半形標點）算 0.5，其餘算 1。
 * Google 中文 SERP 的截斷是以「全形字」為單位，故長度預算一律用這個算，不用 `.length`。
 */
export function fullWidth(s: string): number {
  return [...s].reduce((n, c) => n + (/[\x00-\xff]/.test(c) ? 0.5 : 1), 0);
}

/**
 * SERP 標題寬度上限（全形字）。
 * ⚠️ 兩個 cohort 對「算到哪」的定義不同，這是刻意的，別統一：
 *  - 廟宇頁：候選字串**含**站名「｜神酷」一起算（站名由 Base.astro 附加，但要先算進預算才不會爆）；
 *  - 神明生日頁的 gate：站名不列入該 cohort 的內容預算，故先剝掉 `｜神酷` 再算。
 */
export const SERP_TITLE_MAX_WIDTH = 30;

/**
 * 廟宇頁 title 裡「主祀○○」的神名寬度上限（全形字）。
 * `main_deity_raw` 是內政部原始欄位，很髒（有廟登記 7 尊並列、也有超長名稱）：
 * 超過就退到已對映的神明節點短名，再不行整段不加。判準與實測見 src/pages/temples/[id].astro。
 */
export const TEMPLE_TITLE_DEITY_MAX_WIDTH = 8;

/** 來源錨文字寬度上限（全形字）。超過就退到「：」前的機構／條目名，再不行才截字（src/lib/sources.ts）。 */
export const SOURCE_LABEL_MAX_WIDTH = 40;

/**
 * Google 中文摘要的實測截斷位置（全形字）。
 * ⚠️ 這是**觀測值不是強制上限**：description 由 excerptAtBoundary 以 UTF-16 `.length` 160 收斂
 * （src/layouts/Base.astro）。廟宇頁 descTail 的排序理由（求籤句必須排在截斷點之前）
 * 是照這個數字推出來的，數字放這裡以免又散成好幾份。
 *
 * 2026-08-22 起**有執行期消費端**了：`src/pages/temples/[id].astro` 用它逐頁判斷
 * 「可線上求籤，附白話解籤。」放不放得進截斷點之前，放不下就把那句插到沿革之前。
 * 起因是內政部沿革匯入後，沿革首句＋祭典句把求籤句推回截斷點之後——實測 3,672 間
 * 有籤系的廟裡 1,241 間（33.8%）的求籤句 SERP 上根本看不到，而且集中在名廟
 * （大甲鎮瀾宮／白沙屯拱天宮／北港朝天宮…），等於一次資料匯入靜默推翻了 8/03 立的規則。
 * ⚠️ 本行原本寫「本常數沒有任何執行期消費端、是寫成常數的觀測筆記」（2026-08-19 實查為真），
 *    現在不成立了，故當場改掉。
 * 🔴 仍然**不要**把它跟 160 那個數字當成「同一件事的兩種單位」而想統一——兩者量的是不同的東西：
 *    78 是 Google 在哪裡切，160 是我們自己截多長。2026-08-19 站主追認不修，別再列成待辦。
 */
export const SERP_DESC_TRUNCATION_WIDTH = 78;
