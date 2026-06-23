// @ts-check
import { defineConfig } from 'astro/config';
import sitemap, { ChangeFreqEnum } from '@astrojs/sitemap';

// 部署：GitHub Pages + 自訂網域 folk.tw（CNAME）→ 根路徑供應，site 設正式網域、無 base 前綴。
// 輸出：純靜態（static），跨文本追蹤與農民曆於 build 期預生（§1）。
// 全文檢索：Pagefind 於 postbuild 對 dist 建索引（見 package.json）。
export default defineConfig({
  site: 'https://folk.tw',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
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
        // 今日（Asia/Taipei, UTC+8）ISO 日期，與站內 today 定義一致。
        const TODAY = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
        // 僅比對「日期頁」/almanac/YYYY-MM-DD/（不含 /almanac/month/YYYY-MM/ 樞紐）。
        const m = page.match(/\/almanac\/(\d{4}-\d{2}-\d{2})\/?$/);
        if (!m) return true; // 非日期頁（首頁、模組頁、month 樞紐、archive…）一律保留
        return m[1] <= TODAY; // 過去與今日保留；未來（嚴格大於今日）排除
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
        // 廟宇詳情頁：內政部開放資料大量匯入（約 7.9k），多為樣板化小廟，
        // 比照封存日期頁以最低優先降稀釋（保護新域爬取預算）；仍可被索引與內連。
        if (/^\/temples\/[^/]+$/.test(path)) return { ...item, priority: 0.3, changefreq: ChangeFreqEnum.YEARLY };
        // 模組樞紐／靜態頁。
        const hubs = ['/poems', '/deities', '/events', '/practices', '/temples',
          '/almanac/archive', '/jiaobei', '/vocabulary', '/about', '/search'];
        if (hubs.includes(path)) return { ...item, priority: 0.8, changefreq: ChangeFreqEnum.WEEKLY };
        // 其餘為獨特內容詳情頁（神明／籤詩／典故／活動／習俗／籤系）。
        return { ...item, priority: 0.7, changefreq: ChangeFreqEnum.MONTHLY };
      },
    }),
  ],
});
