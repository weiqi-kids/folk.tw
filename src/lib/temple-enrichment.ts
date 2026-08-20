// 廟宇「內容豐化」判準 —— **同一句話有兩個意思，這裡刻意拆成兩支函式，不要合併。**
//
// 為什麼要有這支（2026-08-20 架構巡檢）：同一條「這間廟算不算有內容」的規則被獨立
// 重寫過三次，欄位集還互不相同（`temples/[id].astro` 的兩處彼此就不一致）：
//   ① [id].astro 鄰近宮廟排序      history || website || founded
//   ② [id].astro 沿革區塊要不要渲染 founded || history || main_festival
//   ③ region/[county]/[town].astro documented 清單  history || founded || website
// 逐處讀上下文後的判定：**①③ 是同一條規則（選擇），②是另一條（渲染）**，
// 差的那兩個欄位都不是漏寫，是語意使然——見下方兩支的檔頭。
//
// 🔴 **要改判準改這裡，不要在呼叫端就地再寫一份 `x.history || x.founded || …`。**
//    就地寫一份不會紅燈、不會有人發現，只會讓第四種欄位集長出來。

/** 只取本模組會判讀的欄位；實際型別來自 `src/content.config.ts` 的 temples schema
 *  （四個都是 `z.string().optional()`），這裡刻意寫最小集合，讓 collection entry
 *  的 `data` 與 `src/data/temples.json` 的原始物件都能直接餵進來。 */
export interface TempleEnrichmentFields {
  history?: string;
  website?: string;
  founded?: string;
  main_festival?: string;
}

/**
 * **選擇判準**：這間廟有沒有「逐間查證過」的深度資料，因此值得被推薦／單獨帶出。
 *
 * 欄位＝`history`（沿革敘述）／`website`（廟方官網）／`founded`（創建年代），
 * 三者的共同點是**都得逐間查證才會有**（內政部沿革匯入或人工核對），
 * 有其中任何一個就代表那一頁不是只有地址電話的骨架頁。
 *
 * 為什麼**不含** `main_festival`：它是「主要祭典一句」，屬於沿革區塊的顯示內容，
 * 但單有祭典日期不代表這頁值得被優先爬取／被列成「已查證」，加進來會稀釋這條判準。
 *
 * 呼叫端：
 *   - `src/pages/temples/[id].astro` 鄰近宮廟排序（把這些頁排前面，讓爬蟲先看到）
 *   - `src/pages/temples/region/[county]/[town].astro` 的「已查證沿革或官網的宮廟」清單
 */
export function hasEnrichment(t: TempleEnrichmentFields): boolean {
  return !!(t.history || t.website || t.founded);
}

/**
 * **渲染判準**：廟宇頁的「沿革」區塊要不要出現。
 *
 * 🔴 **這支的欄位集必須和沿革區塊實際會渲染的欄位一一對應**，
 *    所以它是 `founded` ／ `history` ／ `main_festival`，**而且不含 `website`**。
 *    這不是漏寫 `website`：沿革區塊裡沒有任何一行顯示官網（官網在頁面另一處），
 *    把 `website` 加進來，只有官網的廟就會拿到一個「只有 `<h2>沿革</h2>` 的空區塊」。
 *    2026-08-20 實測 `src/data/temples.json`：這種廟正好有 4 間
 *    （長和宮／香山天后宮／獅山勸化堂／仙山靈洞宮）。
 *
 * ⚠️ 所以**不可以**把這支併進 `hasEnrichment`。兩者今天的計數只差 4 間，很像同一條，
 *    但它們一個是「值不值得推薦」、一個是「有沒有東西可以印」，改動理由不同。
 *    往後沿革區塊增減顯示欄位時，要跟著改的是這一支，不是 `hasEnrichment`。
 */
export function hasHistorySection(t: TempleEnrichmentFields): boolean {
  return !!(t.founded || t.history || t.main_festival);
}
