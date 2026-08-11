// 哪些節日有分享卡（`/og/festivals/<slug>.png`），以及那張圖的網址怎麼組。
//
// **這份清單是唯一真實來源。** 原本它被抄在兩個地方——scripts/gen-og-festivals.mjs
// 的 CARD_SLUGS（決定產哪幾張）與 src/pages/festivals/[slug].astro 的
// festivalOgSlugs（決定頁面掛不掛 og:image）——兩份各自硬編，漂移了不會報錯：
// 在 festivals.json 加第 11 個節日、卻忘了同步其中一份，症狀是「有的地方有圖、
// 有的地方破圖」，而 build 依然全綠。
//
// bot-index.json 的 festivals[].image 也讀這裡：神酷的 LINE 卡片用它當主視覺，
// 而 bot 端**不自己從 slug 拼網址**——拼的話等於把本站的網址慣例抄到另一個 repo，
// 這裡改路徑那邊不會知道，使用者看到的是破圖（LINE 對取不到的圖不留白）。
//
// ⚠️ 要新增一個節日的分享卡：先把無字背景放進 src/assets/og-festivals/<slug>.webp，
// 再把 slug 加進下面這個陣列。只加陣列不放背景，gen-og-festivals.mjs 會在 build
// 時就丟出「找不到節日資料／背景」而不是安靜略過。

/** 有分享卡的節日 slug。順序不影響行為，照 src/assets/og-festivals/ 的字母序放。 */
export const FESTIVAL_OG_SLUGS = [
  'baitiangong', 'dizang', 'fangshuideng', 'guimenkai', 'jilong-zhongyuan',
  'kinmen-bo-bing', 'kongzi-birthday', 'qianggu', 'qingming', 'qixi',
  'september-solar-terms', 'yimin', 'zhongqiu', 'zhongyuan',
] as const;

const OG_SLUG_SET: ReadonlySet<string> = new Set(FESTIVAL_OG_SLUGS);

/** 這個節日有沒有分享卡。 */
export const hasFestivalOg = (slug: string): boolean => OG_SLUG_SET.has(slug);

/**
 * 分享卡的站內路徑。**沒有卡就回 undefined**，呼叫端一律要處理這個情況：
 * 掛一個不存在的圖比不掛更糟（頁面破圖、LINE 破圖、og:image 抓不到）。
 */
export const festivalOgPath = (slug: string): string | undefined =>
  (hasFestivalOg(slug) ? `/og/festivals/${slug}.png` : undefined);

/** 分享卡的絕對網址（給 og:image 與 bot 契約用；兩者都不能給相對路徑）。 */
export const festivalOgUrl = (slug: string, site = 'https://folk.tw'): string | undefined => {
  const path = festivalOgPath(slug);
  return path ? `${site}${path}` : undefined;
};
