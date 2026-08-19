// 原不變量 11（2026-08-08 加）的其餘三段：籤詩頁分享卡、404 反向、分享列的版位。
//
// 🔴 為什麼要驗「檔案存在」而不只驗 meta 標籤：og:image 指到一個 404 的網址，
//    頁面不會壞、build 不會紅、瀏覽器不會抱怨——只有分享出去的人看到空白預覽，
//    而那正好是我們看不到的地方。廟宇卡（temple/og-card，舊編號 1b；⚠️ 舊註解把它
//    寫成「不變量 1e」是**指錯了**，1e 是連續標點）就是為此驗檔案，這裡照同一條規則。
//    卡片是 postbuild 產的，所以本檢查必須跑在 postbuild 之後（CI 的 build job 順序已如此）。
// ⚠️ 分享列只驗「在」與「不該在的頁不在」，不驗按鈕行為——那是 JS，本 gate 讀的是靜態 HTML。
import { escAttr } from '../lib/astro-escape.mjs';

export const poemShareCard = {
  id: 'poem/share-card',
  legacyIds: ['11'],
  title: '籤詩頁 og:image 是自己的卡且檔案存在、description 無重複標點、且有分享列',
  source: 'poems',
  check(p, page, ctx, acc) {
    const description = page.description();
    if (/（（|，，|。。/.test(description)) {
      acc.violate(`籤詩頁 ${p.id} description 含重複括號或標點：${description}`);
    }
    const want = `/og/poems/${p.id}.png`;
    if (!page.html.includes(escAttr(want))) {
      acc.violate(`籤詩頁 ${p.id} 的 og:image 不是自己的分享卡（應為 ${want}）`);
    } else if (!ctx.exists(`${ctx.DIST}${want}`)) {
      acc.violate(`籤詩頁 ${p.id} 的分享卡檔不存在：dist${want}`);
    } else acc.count('cards');
    if (!page.html.includes('aria-label="分享這一頁"')) acc.violate(`籤詩頁 ${p.id} 缺分享列`);
    else acc.count('rows');
  },
  // 分享列的總數原本是「籤詩＋神明＋廟宇」三個頁型累加到同一個變數、摘要只印一個總數，
  // 故在這裡把三邊的計數組回同一句（與原輸出逐字相同）。
  summary: (acc, ctx) =>
    `另籤詩頁 ${acc.get('cards')} 張與神明頁 ${ctx.accOf('deity/share-card').get('cards')} 張專屬分享卡皆為該頁自己的卡且**檔案存在**，`
    + `全站分享列逐頁驗過 ${acc.get('rows') + ctx.accOf('deity/share-card').get('rows') + ctx.accOf('temple/share-row').get('rows')} 頁、`
    + `404 正確不帶、且確認分享列在 pagefind 索引區外`,
};

/** 反向：404 明確傳 share={false}，不該有分享列。 */
export const shareRowNotOn404 = {
  id: 'share-row/not-on-404',
  legacyIds: ['11'],
  title: '404 頁不該有分享列',
  source: 'singleton',
  singletons: ['dist/404.html'],
  onMissing: () => {}, // 原行為：404.html 不存在時不驗
  check(_file, page, _ctx, acc) {
    if (page.html.includes('aria-label="分享這一頁"')) {
      acc.violate('404 頁不該有分享列（Base 的 share={false} 沒生效）');
    }
  },
  summary: false,
};

/**
 * 🔴 分享列必須在 <main data-pagefind-body> **外面**：放進去的話
 *    「分享／Facebook／Threads」會被 Pagefind 索引進全站每一頁，站內搜尋打「分享」命中 15,000 頁。
 */
export const shareRowOutsidePagefind = {
  id: 'share-row/outside-pagefind',
  legacyIds: ['11'],
  title: '分享列必須在 <main data-pagefind-body> 之外（以 /about/ 為樣本）',
  source: 'singleton',
  singletons: ['dist/about/index.html'],
  onMissing: () => {},
  check(_file, page, _ctx, acc) {
    const mainEnd = page.html.indexOf('</main>');
    const shareAt = page.html.indexOf('aria-label="分享這一頁"');
    if (shareAt >= 0 && mainEnd >= 0 && shareAt < mainEnd) {
      acc.violate('分享列被放進了 <main data-pagefind-body> 內，會被站內搜尋索引進每一頁');
    }
  },
  summary: false,
};
