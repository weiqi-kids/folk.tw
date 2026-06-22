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
  // 集合單調成長、永不移除，故任何網址永不 404，可安全全數列入 sitemap、被搜尋引擎索引。
  integrations: [sitemap()],
});
