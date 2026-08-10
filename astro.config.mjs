// @ts-check
import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap, { ChangeFreqEnum } from '@astrojs/sitemap';

// ── 退場開關（稀釋止血）──────────────────────────────────
// 若 GSC 顯示大批同質土地公廟（1384 間）稀釋了獨特頁（神明/籤詩）的索引，
// 把此旗標設 true 後 commit + push，即把所有土地公廟「移出 sitemap」（頁面仍在、
// 仍可由神明頁內連被爬，只是不再主動提交）。改一個布林即可，不需動其他邏輯。
// 監控依據見 scripts/seo-daily.mjs 的 TRACK_URLS（分子/分母）。
//
// 2026-06-23 設 true（稀釋止血）→ 2026-07-02 判讀「稀釋疑慮未成真」已關閉該議題，
// 但開關忘了關 → **2026-07-31 設回 false**，理由是實測數據：
//   被排除的 1,384 頁中，有 329 頁光靠內鏈被爬到就產出 3,967 曝光／61 點擊，
//   CTR 1.54%＝與其餘廟宇頁（1.74%）同級，**完全沒有拖累獨特頁**；另外 1,055 頁是零。
//   而廟宇頁已佔全站曝光 91%，是唯一被驗證的成長引擎。
// 若未來獨特頁收錄倒退且曝光停滯，才重新考慮設回 true。
const EXCLUDE_TUDIGONG_FROM_SITEMAP = false;
const TUDIGONG_TEMPLE_PATHS = EXCLUDE_TUDIGONG_FROM_SITEMAP
  ? new Set(
      JSON.parse(readFileSync(new URL('./src/data/temples.json', import.meta.url), 'utf8'))
        .filter((/** @type {{ main_deity_ref?: string }} */ t) => t.main_deity_ref === 'tudigong')
        .map((/** @type {{ id: string }} */ t) => `/temples/${t.id}`),
    )
  : new Set();

// ── 時事祈福頁三態一致性（P3）：noindex 的祈福頁不得留在 sitemap ──────────
// 頁內 index 政策（見 src/pages/qiugian/blessing/[slug].astro 的 isIndexable）：
//   active 恆收；memorial 需「非範例且有 updates」才收；archived／memorial 無 updates／example 一律 noindex。
// sitemap 必須與之一致：把「不可 index 的祈福頁路徑」算出來從 sitemap 排除，避免「noindex 卻仍在 sitemap」。
const TOPICAL = JSON.parse(readFileSync(new URL('./src/data/topical.json', import.meta.url), 'utf8'));
const topicalIndexable = (/** @type {{ status?: string, example?: boolean, updates?: unknown[] }} */ t) =>
  t.status === 'active' ||
  (t.status === 'memorial' && !t.example && Array.isArray(t.updates) && t.updates.length > 0);
const TOPICAL_NOINDEX_PATHS = new Set(
  TOPICAL.filter((/** @type {{ status?: string, example?: boolean, updates?: unknown[], mergedInto?: string }} */ t) =>
    t.mergedInto || !topicalIndexable(t))
    .map((/** @type {{ id: string }} */ t) => `/qiugian/blessing/${t.id}`),
);

// ── 同一事件重複開頁的併頁（2026-07-25）────────────────────────────────────
// P2 新聞掃描曾因「來源原文地名寫法不同」（重慶市彭水縣／彭水苗族土家族自治縣／彭水县汉葭街道）
// 對同一起事件開了三頁。合併留一頁（canonical），其餘標 `mergedInto` → 這裡轉成靜態 redirect：
// 靜態輸出會產出 meta-refresh ＋ canonical 指向正本，**網址仍活著**（紅線 4「slug 永久承諾、不可 404」）。
// 併頁條目仍留在 topical.json，讓 P2 去重能繼續用它們的地名字串擋住同事件再開頁。
const TOPICAL_MERGED_REDIRECTS = Object.fromEntries(
  TOPICAL.filter((/** @type {{ mergedInto?: string }} */ t) => t.mergedInto)
    .map((/** @type {{ id: string, mergedInto: string }} */ t) =>
      [`/qiugian/blessing/${t.id}`, `/qiugian/blessing/${t.mergedInto}/`]),
);
// ── 同一間廟被開兩頁的併頁（2026-08-07）──────────────────────────────────
// 站上有 28 間手工策展廟，其中 3 間在 MOI 開放資料裡以法人全名又出現一次
// （「財團法人北港朝天宮」「臺灣府城隍廟」「財團法人南鯤鯓代天府」），變成同廟兩頁。
// 保留手工版（有沿革／官網／代表圖），MOI 版轉址過去。
// 🔴 舊網址不可 404（slug 永久承諾），所以是 redirect 不是刪頁；併掉那筆已從 temples.json
//    移除（連同其獨有的 festivals 與 8203 來源標註先搬進正本），理由見 temple-redirects.json。
const TEMPLE_REDIRECTS = JSON.parse(readFileSync('./src/data/temple-redirects.json', 'utf8')).redirects;
const TEMPLE_MERGED_REDIRECTS = Object.fromEntries(
  TEMPLE_REDIRECTS.map((/** @type {{ from: string, to: string }} */ r) =>
    [`/temples/${r.from}`, `/temples/${r.to}/`]),
);
// 轉址頁不得留在 sitemap（否則等於主動提交一個只會把爬蟲送走的網址）。
const TEMPLE_REDIRECT_PATHS = new Set(
  TEMPLE_REDIRECTS.map((/** @type {{ from: string }} */ r) => `/temples/${r.from}`),
);

// serialize 只會看到「留在 sitemap」的祈福頁（不可 index 者已被 filter 排除）：
// active 給較高權重（時效性、weekly）、有 updates 的 memorial 給穩定封存權重（monthly）。
const TOPICAL_ACTIVE_PATHS = new Set(
  TOPICAL.filter((/** @type {{ status?: string }} */ t) => t.status === 'active')
    .map((/** @type {{ id: string }} */ t) => `/qiugian/blessing/${t.id}`),
);

// 部署：GitHub Pages + 自訂網域 folk.tw（CNAME）→ 根路徑供應，site 設正式網域、無 base 前綴。
// 輸出：純靜態（static），跨文本追蹤與農民曆於 build 期預生（§1）。
// 全文檢索：Pagefind 於 postbuild 對 dist 建索引（見 package.json）。
export default defineConfig({
  site: 'https://folk.tw',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  redirects: { ...TOPICAL_MERGED_REDIRECTS, ...TEMPLE_MERGED_REDIRECTS },
  // 農民曆日期頁為「固定過去錨點＋向前展望」之穩定封存（見 src/lib/almanac/dates.ts）：
  // 集合單調成長、永不移除，故任何網址永不 404。
  //
  // P0-2 降稀釋：未來日期頁（today 之後）逾 3000 篇、皆為樣板化預測、無搜尋需求，
  // 新域低權重時若全數塞進 sitemap 會耗盡爬取預算（Google「已發現／尚未索引」），
  // 反而淹沒約 370 篇真正獨特頁（神明／籤詩／典故）。故 sitemap 排除「未來」日期頁。
  // 保留：首頁、各模組頁、/almanac、/almanac/archive、所有 /almanac/month/* 樞紐，
  // 以及所有「過去」（嚴格早於今日）封存日期頁——過去錨點為穩定永久內容、本有搜尋需求。
  // 未來日期頁仍可被索引：Google 由 month 樞紐連結爬到（而非靠 sitemap），故樞紐務必保留。
  integrations: [
    sitemap({
      filter: (page) => {
        // 退場開關啟用時，把土地公廟移出 sitemap（頁面仍在、仍可被內連爬到）。
        // 注意：filter 收到的路徑為 percent-encoded（廟 id 含中文），須 decode 才能對上 Set。
        if (TUDIGONG_TEMPLE_PATHS.size) {
          let p = page.replace('https://folk.tw', '').replace(/\/$/, '');
          try { p = decodeURIComponent(p); } catch { /* 維持原值 */ }
          if (TUDIGONG_TEMPLE_PATHS.has(p)) return false;
        }
        // 時事祈福頁：不可 index 者（archived／memorial 無 updates／example）移出 sitemap，
        // 與頁內 noindex 保持一致；active 與有 updates 的 memorial 保留。
        if (TOPICAL_NOINDEX_PATHS.size) {
          let p = page.replace('https://folk.tw', '').replace(/\/$/, '');
          try { p = decodeURIComponent(p); } catch { /* 維持原值 */ }
          if (TOPICAL_NOINDEX_PATHS.has(p)) return false;
        }
        // 併頁後的舊廟宇網址：只剩 redirect，不進 sitemap。
        if (TEMPLE_REDIRECT_PATHS.size) {
          let p = page.replace('https://folk.tw', '').replace(/\/$/, '');
          try { p = decodeURIComponent(p); } catch { /* 維持原值 */ }
          if (TEMPLE_REDIRECT_PATHS.has(p)) return false;
        }
        // 站內搜尋結果頁移出 sitemap（2026-07-28，與頁內 noindex 一致）：它沒有自己的內容，
        // 且 Google 會把首頁 SearchAction 的 urlTemplate 當真網址去抓——實測 `/search?q={search_term_string}`
        // 就出現在 GSC「已檢索－目前尚未建立索引」清單裡。見 src/pages/search.astro 註解。
        if (/\/search\/?$/.test(page.replace('https://folk.tw', ''))) return false;
        // 「附近的廟」的格檔（/temples/nearby/cells/<格>.json）：是給前端算距離的資料檔，
        // 不是頁面。提交給搜尋引擎只會拿抓取預算去換一堆 JSON。頁面本身（/temples/nearby/）保留。
        if (/\/temples\/nearby\/cells\//.test(page)) return false;
        // bot-index.json：跨 repo 資料饋，餵給 LINE 官方帳號「神酷」（見 contracts/bot-index.schema.json），
        // 不是給人看的頁面，契約明文「不進 sitemap、不需要被連結掃描工具當來源掃」。
        if (/\/bot-index\.json$/.test(page)) return false;
        // 今日（Asia/Taipei, UTC+8）ISO 日期，與站內 today 定義一致。
        const TODAY = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
        // 僅比對「日期頁」/almanac/YYYY-MM-DD/（不含 /almanac/month/YYYY-MM/ 樞紐）。
        const m = page.match(/\/almanac\/(\d{4}-\d{2}-\d{2})\/?$/);
        if (!m) return true; // 非日期頁（首頁、模組頁、month 樞紐、archive…）一律保留
        // 🔴 2026-08-03 用戶裁示：**農民曆封存頁（過去日期）一律不進 sitemap，未來也不要進。**
        // 原本保留過去日期頁、僅以 priority 0.3 降權，但實測顯示那不夠：
        //   · sitemap 共 11,693 個網址，其中 2,536 個是農民曆日期頁（22%）
        //   · 而它們近 29 天只帶來 1,258 曝光（全站 175,735 的 0.7%），過去日期頁每頁僅 1.5 次
        //   · 同時鬼門開 8/13／七夕 8/19／中元 8/27 三頁是「Discovered — 從未被爬取」，
        //     卡的正是抓取預算，且尖峰在窗口內、過了沒有第二次
        // 頁面**不會消失**，仍可從 /almanac/month/ 月份樞紐與 /almanac/archive/ 被爬到，
        // 只是不再主動提交、不再跟重要頁搶預算。
        // ⚠️ 別再「順手」把它們加回來——這是有數據依據的裁示，不是疏漏。
        //    （對照：2026-07-02 曾以「稀釋收錄」為由評估過並判定不做；這次的理由是
        //      「稀釋抓取預算」，證據與情境都不同。）
        return false;
      },
      // 優先級分層（降稀釋的正解：不砍過去封存頁，改以 priority 標示價值高低，
      // 引導爬取預算流向獨特內容）；changefreq 標示更新頻率。
      // lastmod 僅掛「真實每日更新」之頁（首頁今日選讀、/almanac 今日曆）——
      // 全站每日 cron 重建，若一律掛 build 時間會對 Google 誤報「全站每日變動」、浪費爬取，故其餘不掛。
      /**
       * @param {import('@astrojs/sitemap').SitemapItem} item
       * @returns {import('@astrojs/sitemap').SitemapItem}
       */
      serialize(item) {
        const path = item.url.replace('https://folk.tw', '').replace(/\/$/, '') || '/';
        // 過去封存日期頁：穩定永久內容、量大，最低優先、年度更新、不掛 lastmod。
        if (/^\/almanac\/\d{4}-\d{2}-\d{2}$/.test(path)) {
          return { ...item, priority: 0.3, changefreq: ChangeFreqEnum.YEARLY };
        }
        // 月份樞紐：日期頁的爬取入口。
        if (/^\/almanac\/month\/\d{4}-\d{2}$/.test(path)) {
          return { ...item, priority: 0.5, changefreq: ChangeFreqEnum.MONTHLY };
        }
        // 真實每日更新頁 → 掛 lastmod。
        if (path === '/' || path === '/almanac') {
          return {
            ...item,
            priority: path === '/' ? 1.0 : 0.8,
            changefreq: ChangeFreqEnum.DAILY,
            lastmod: new Date().toISOString(),
          };
        }
        // 時事祈福頁（留在 sitemap 者）：active 時效性高（weekly），memorial 為穩定事件記錄（monthly）。
        if (/^\/qiugian\/blessing\/[^/]+$/.test(path)) {
          return TOPICAL_ACTIVE_PATHS.has(path)
            ? { ...item, priority: 0.6, changefreq: ChangeFreqEnum.WEEKLY }
            : { ...item, priority: 0.5, changefreq: ChangeFreqEnum.MONTHLY };
        }
        // 廟宇詳情頁：內政部開放資料大量匯入（約 7.9k），多為樣板化小廟，
        // 比照封存日期頁以最低優先降稀釋（保護新域爬取預算）；仍可被索引與內連。
        // ⚠️ `/temples/nearby` 長得像廟宇詳情頁但不是——它是工具頁，不可落進這個 0.3 分支
        //    （2026-08-08 上線時發現：本判斷排在下面的 hubs 之前，不排除就被當成一間廟降權）。
        if (/^\/temples\/[^/]+$/.test(path) && path !== '/temples/nearby')
          return { ...item, priority: 0.3, changefreq: ChangeFreqEnum.YEARLY };
        // 模組樞紐／靜態頁。
        // 樞紐頁 priority 0.8 / weekly。2026-07-30 補進 /festivals（新節日模組）與
        // /qiugian、/scenarios、/compare——這三個原本漏列而落到 0.7/monthly 的一般分支，
        // 其中 /qiugian/ 在 GSC 長期為「Discovered - currently not indexed」＝已發現未抓取。
        // （它並非孤兒：nav 使全站 12,010/12,012 頁都連向它；比它更短的 /scenarios/、/compare/
        //   反而已收錄 → 病灶是抓取優先序，不是內鏈或內容量。）
        const hubs = ['/poems', '/deities', '/events', '/practices', '/temples', '/trades',
          '/festivals', '/qiugian', '/scenarios', '/compare',
          '/almanac/archive', '/jiaobei', '/vocabulary', '/about', '/search'];
        if (hubs.includes(path)) return { ...item, priority: 0.8, changefreq: ChangeFreqEnum.WEEKLY };
        // 節日詳情頁：日期錨定且逐年變動（渲染的國曆日期每年不同、倒數每日不同）。
        // 2026-08-03 從 0.8/WEEKLY 提到 **0.9/DAILY**：實測農曆七月四頁（鬼門開 8/13、
        // 七夕 8/19、放水燈 8/26、中元 8/27）在 GSC 仍是「已發現／已檢索－未建立索引」、曝光 0，
        // 而它們的搜尋尖峰就在那幾天，過了就沒有第二次。
        // DAILY 對全部 10 頁都是**真的**（倒數由前端每日重算、國曆日期逐年變動），不是為了灌水；
        // 只有 10 頁，全給 0.9 也不會稀釋掉別的東西。
        // ⚠️ 刻意**不**在這裡依日期動態計算「近期節日」——農曆換算只能有一個入口
        //    （src/lib/lunar-date.ts），在 config 裡自己算一份就是新的漂移源。
        if (/^\/festivals\/[^/]+$/.test(path)) return { ...item, priority: 0.9, changefreq: ChangeFreqEnum.DAILY };
        // 其餘為獨特內容詳情頁（神明／籤詩／典故／活動／習俗／籤系）。
        return { ...item, priority: 0.7, changefreq: ChangeFreqEnum.MONTHLY };
      },
    }),
  ],
});
