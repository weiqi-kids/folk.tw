// 哪些節日有分享卡（`/og/festivals/<slug>.png`），以及那張圖的網址怎麼組。
//
// `festivals.json` 是節日資料的來源；下面是同步給 Astro 與 bare Node postbuild
// 使用的純 TS slug mirror。它不再分散抄在頁面與產圖腳本裡，check:festival-calendar
// 會比對兩邊的數量與 slug，避免新增節日後只生成了頁面、卻漏掉 OG／Discover 圖。
//
// bot-index.json 的 festivals[].image 也讀這裡：神酷的 LINE 卡片用它當主視覺，
// 而 bot 端**不自己從 slug 拼網址**——拼的話等於把站上的網址慣例抄到另一個 repo，
// 這裡改路徑那邊不會知道，使用者看到的是破圖（LINE 對取不到的圖不留白）。
//
// ⚠️ 要新增公開節日：先在 festivals.json 完成資料，再把 slug 加進下面陣列；
// gen-og-festivals.mjs 可透過 image_key 重用既有授權背景，但找不到背景時會在 build
// 時直接失敗，不會安靜略過。

/** 所有公開節日資料的分享卡 slug。由 festivals.json 產生後同步到此純 TS 清單，
 * 讓 Astro 與 bare Node 的 postbuild／gate 都能載入，不依賴 JSON import assertion。 */
export const FESTIVAL_OG_SLUGS = [
  'guimenkai', 'qixi', 'fangshuideng', 'zhongyuan', 'jilong-zhongyuan', 'qianggu', 'yimin', 'dizang',
  'september-solar-terms', 'zhongqiu', 'kinmen-bo-bing', 'kongzi-birthday', 'baitiangong', 'qingming',
  'chongyang', 'duanwu', 'haoxiongdi-dijizhu-zuxian', 'zhongyuan-jinzhi', 'gongpu-sipu',
  'draft-week-01-september-solar-terms', 'draft-week-02-zhongqiu-guide', 'draft-week-03-kinmen-bo-bing-guide',
  'draft-week-04-kongzi-teachers-day', 'draft-week-05-chongyang-guide', 'draft-week-06-qingshan-king-festival',
  'draft-week-07-xiayuan', 'draft-week-08-wangjiao-differences', 'draft-week-09-dongshan-yingfozu',
  'draft-week-10-dongzhi-guide', 'draft-week-11-songshen-xietaisui', 'draft-week-12-chuxi-ancestors',
  'draft-week-13-antaisui-deng', 'draft-week-14-baitiangong-guide', 'draft-week-15-yuanxiao-guide',
  'draft-week-16-yanshui-handan', 'draft-week-17-dajia-baishatun-pilgrimage',
  'draft-week-18-beigang-mazu-pilgrimage', 'draft-week-19-neimen-songjiang',
  'draft-week-20-qingming-guide', 'draft-week-21-qingming-tomb-practice', 'draft-week-22-baosheng-birthday',
  'draft-week-23-sanxia-qingshui', 'draft-week-24-dadaocheng-chenghuang', 'draft-week-25-xuejia-shangbaijiao',
  'draft-week-26-mazu-pilgrimage-differences', 'draft-week-27-duanwu-guide', 'draft-week-28-daxi-guangong',
  'draft-week-29-kouhu-qianshuizang', 'draft-week-30-donggang-xigang', 'draft-week-31-nanguanxian-wangjiao',
  'draft-week-32-mingjian-xuantian-pilgrimage', 'draft-week-33-qiu-pingan-shoujing-buyun',
  'draft-week-34-qiu-yinyuan-qiuzi', 'draft-week-35-banjia-ruzhai-anshen', 'draft-week-36-shoujing-buyun',
  'draft-week-37-qixi-zuo16', 'draft-week-38-guimenkai-guide', 'draft-week-39-fangshuideng-guide',
  'draft-week-40-zhongyuan-guide', 'draft-week-41-zhongyuan-local-rituals', 'draft-week-42-dizang-ghost-gate',
  'draft-week-43-deity-birthday-variants', 'draft-week-44-deity-comparison', 'draft-week-45-prayer-scenarios',
  'draft-week-46-almanac-yiji-guide', 'draft-week-47-temple-selection-guide',
  'draft-week-48-local-heritage-guide', 'draft-week-49-blessing-followup-guide',
  'draft-week-50-poem-reading-guide', 'draft-week-51-ritual-vocabulary-guide',
  'draft-week-52-taiwan-festivals-year',
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

/**
 * Discover／Article 結構化資料用的乾淨主視覺路徑。
 *
 * 分享卡刻意疊了節名、日期與提問，方便社群分享；Google Discover 的主圖則另用
 * 同一張無字背景，避免把文字卡當成內容縮圖。檔案由 gen-og-festivals.mjs 在
 * postbuild 產生，與分享卡共用同一個來源背景，輸出為 Discover 建議的 1200×675（16:9）。
 */
export const festivalDiscoverImagePath = (slug: string): string | undefined =>
  (hasFestivalOg(slug) ? `/og/festivals/${slug}-clean.webp` : undefined);

/** Discover／Article 主視覺的絕對網址。 */
export const festivalDiscoverImageUrl = (slug: string, site = 'https://folk.tw'): string | undefined => {
  const path = festivalDiscoverImagePath(slug);
  return path ? `${site}${path}` : undefined;
};
