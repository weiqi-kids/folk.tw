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
  // 農民曆日期頁為「以今日為中心 ±1 年」之滾動視窗：每日 cron 推進，尾端日期會掉出視窗變 404。
  // 故排除出 sitemap、並於頁面標 noindex（見 [date].astro），避免 GSC「已提交但 404」與薄內容稀釋；
  // 今日 /almanac 仍正常索引（穩定網址＋每日新鮮內容）。使用者仍可自由翻閱日期頁（noindex 不影響 UX）。
  integrations: [sitemap({ filter: (page) => !/\/almanac\/\d{4}-\d{2}-\d{2}\/?$/.test(page) })],
});
