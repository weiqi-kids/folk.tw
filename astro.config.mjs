// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

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
    }),
  ],
});
