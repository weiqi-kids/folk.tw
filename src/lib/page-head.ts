// head 參數的**唯一推導入口**：頁型 → ogType／speakable，圖族 → 路徑＋尺寸，視覺檔名 ↔ OG 檔名。
//
// 為什麼要有這一層（2026-08-19 重構前的實況，每一條都是「配錯不會有任何東西擋」）：
//   ① `ogImage` 與 `ogImageWidth/Height` 是三個各自獨立的字串／數字 prop，
//      而**尺寸其實由圖族決定**：站內 5 張通用 SVG 轉出的 `/og/discover/<stem>.webp`
//      是 1200×675（見 scripts/gen-og-discover.mjs），廟宇／神明／籤詩 Discover 卡
//      也一律輸出 1200×675（gen-og-temples / gen-og-content）；節日社群分享卡仍保留 1200×630。
//      重構前 16 個頁面各自手抄「圖 ＋ 1200 ＋ 675」三行，`deities/[id]` 甚至把
//      內容卡與通用圖的尺寸分支手寫在 head 裡——挑錯族配錯尺寸沒有任何 gate 會紅。
//      現在圖族是一個 discriminated union，**尺寸由 union 帶著走，呼叫端寫不出來**。
//   ② 正文主視覺 `/visuals/<stem>.svg` 與分享圖 `/og/discover/<stem>.webp` 必須同源
//      （同一張圖的兩種輸出），重構前是兩個毫無關聯的字串字面值。現在兩邊都吃
//      `VisualStem`，頁面只宣告一次 stem，打錯字是編譯錯誤。
//   ③ `ogType` 與 `speakable` 都是**頁型的函數**，不是每頁的自由選擇：
//      重構前 `ogType="article"` 手抄 24 次、`speakable` 手抄 31 次。
//
// 🔴 這裡的 `VISUAL_STEMS` 必須與 `scripts/gen-og-discover.mjs` 的 `visuals` 對照表
//    同名同數；那支腳本是 `/og/discover/*.webp` 的唯一產生者，也是 `/public/visuals/*.svg`
//    的唯一消費者。新增一張通用視覺＝三件事一起做：放 SVG、加進那支腳本、加進這裡。

/** 站內通用視覺的檔名主幹。`/visuals/<stem>.svg`（正文）與 `/og/discover/<stem>.webp`（分享）同源。 */
export const VISUAL_STEMS = [
  'qian-slips',
  'prayer-light',
  'calendar-compass',
  'medicine-manuscript',
  'zodiac-wheel',
  'pulse-orbit',
] as const;

export type VisualStem = (typeof VISUAL_STEMS)[number];

/** 正文主視覺（LeadVisual）用的 SVG 路徑。 */
export const visualSvgPath = (stem: VisualStem): string => `/visuals/${stem}.svg`;

/** 分享／Discover 用的 WebP 路徑。與 `visualSvgPath` 同一個 stem，不可能指到別張圖。 */
export const visualOgPath = (stem: VisualStem): string => `/og/discover/${stem}.webp`;

/**
 * og:image 的來源。**族別決定路徑與尺寸**，兩者一起被帶出來，呼叫端無從拆開。
 *
 * - `site`     全站品牌卡 `/og.png`
 * - `visual`   站內通用視覺 `/og/discover/<stem>.webp`（1200×675，Discover 建議的 16:9）
 * - `temple` / `deity` / `poem`  build 產生的 Discover 卡 PNG（1200×675）
 * - `festival` 節日分享卡（1200×630）；**沒有卡的節日 path 為 undefined**，退回站徽
 * - `custom`   🔴 逃生口：只有當圖不屬於任何 build 產生的圖族時才用。
 *              用它就等於自己保證尺寸——所以它強制你把 width/height 一起寫出來，
 *              而不是像重構前那樣「挑了 A 族、卻能默默配 B 族的尺寸」。目前全站 0 處使用。
 */
export type OgImageSpec =
  | { family: 'site' }
  | { family: 'visual'; stem: VisualStem }
  | { family: 'temple'; id: string }
  | { family: 'deity'; id: string }
  | { family: 'poem'; id: string }
  | { family: 'festival'; path: string | undefined }
  | { family: 'custom'; path: string; width: number; height: number };

export interface ResolvedOgImage {
  /** 站內絕對路徑；undefined ＝ 用全站預設 `/og.png`。 */
  path: string | undefined;
  width: number;
  height: number;
}

/** 一般分享卡（Facebook/LINE/Twitter summary_large_image）的實際輸出尺寸。 */
const CARD = { width: 1200, height: 630 } as const;
const CONTENT_CARD = { width: 1200, height: 675 } as const;
/** Discover／Article 主視覺的實際輸出尺寸（16:9，無字）。 */
const DISCOVER = { width: 1200, height: 675 } as const;

export function resolveOgImage(spec?: OgImageSpec): ResolvedOgImage {
  if (!spec) return { path: undefined, ...CARD };
  switch (spec.family) {
    case 'site':
      return { path: undefined, ...CARD };
    case 'visual':
      return { path: visualOgPath(spec.stem), ...DISCOVER };
    case 'temple':
      return { path: `/og/temples/${encodeURIComponent(spec.id)}.png`, ...CONTENT_CARD };
    case 'deity':
      return { path: `/og/deities/${spec.id}.png`, ...CONTENT_CARD };
    case 'poem':
      return { path: `/og/poems/${spec.id}.png`, ...CONTENT_CARD };
    // 節日分享卡的有無由 lib/festival-og.ts 判定（那裡是 slug ↔ 檔案的唯一真實來源），
    // 這裡只負責「它是 630 那一族」。沒有卡時 path 為 undefined → Base 退回站徽，仍是 630。
    case 'festival':
      return { path: spec.path, ...CARD };
    case 'custom':
      return { path: spec.path, width: spec.width, height: spec.height };
  }
}

/**
 * speakable（AEO）用的「答案區塊」。
 *
 * 這 8 種**不是漂移可以無腦統一的**——選擇器必須指到該模板實際存在的元素，
 * 指不到就是一段無效宣告。2026-08-19 逐頁核對 markup 後的判定：
 *
 *  - `lead`（18 頁）站台主流導言段慣例。
 *  - `summary`（5 頁：deities/[id]、events/[id]、practices/[id]、systems/[id]、temples/[id]）
 *    這五個實體卡片式模板的直答段 class 就叫 `.summary`，**沒有** `.lead`。刻意的頁型差異。
 *  - `hero-answer`（3 頁：almanac/chongsha、zodiac/index、zodiac/[slug]）干支曆算頁的直答框。刻意。
 *  - `almanacDay`（almanac/[date]）唯一的三選擇器：日頁的答案分「當日摘要」與「宜忌」兩塊。刻意。
 *  - `story`（allusions/[id]）典故頁的答案是故事本文 `.story`，該頁沒有 `.lead`。刻意。
 *  - `bdAnswer`（deities/birthdays）該頁有兩個 `.lead`，`<p class="lead bd-answer">` 是**刻意窄化**
 *    到真正回答「某某神明生日是哪天」的那一段。刻意。
 *  - `articleSummary`（guides/[slug]）⚠️ **判定為漂移**：元素是 `<p class="article-summary lead">`，
 *    兩個 class 指到同一個節點，寫 `lead` 完全等價。但收斂會改變線上 JSON-LD 輸出
 *    （本輪是純重構，紅線禁止），故保留為明確選項並在此註記。
 *  - `lineLead`（line/index）⚠️ **判定為漂移**：`.line-lead` 就是該頁的 lead，只是換了名字
 *    （dist 實測該頁沒有 `.lead`）。同上凍結；哪天要動 markup 再一起收。
 *
 * 🅤 **2026-08-19 站主追認：這兩個維持不收斂，不要再列成待辦。** 各只有 1 個檔用到，
 *    是各自頁面的直答段落、不是複製貼上的漂移；收斂會改渲染輸出而沒有實益。
 *    真的要收，時機是那兩頁的 markup 本來就要改的時候，順手一起做。
 */
export const ANSWER_BLOCKS = {
  lead: ['h1', '.lead'],
  summary: ['h1', '.summary'],
  heroAnswer: ['h1', '.hero-answer'],
  story: ['h1', '.story'],
  bdAnswer: ['h1', '.bd-answer'],
  articleSummary: ['h1', '.article-summary'],
  lineLead: ['h1', '.line-lead'],
  almanacDay: ['h1', '.day-summary', '.yiji-section'],
} as const satisfies Record<string, readonly string[]>;

export type AnswerBlock = keyof typeof ANSWER_BLOCKS;

/**
 * 頁型。**這是呼叫端唯一要描述的事**，`og:type` 與 speakable 預設都由它推導。
 *
 * - `hub`    樞紐／列表／工具頁 → `og:type=website`，預設不宣告 speakable
 *            （多數樞紐沒有直答段；有的樞紐另外指定 `answer`）。
 * - `detail` 內容詳情頁 → `og:type=article`，預設 speakable ＝ `['h1', '.lead']`。
 *
 * 2026-08-19 實查：站上 `og:type=article` 的 24 頁**全部**有 speakable，
 * 而沒有 speakable 的頁**全部**是 website——兩者確實是同一個頁型事實的兩面，
 * 所以合併成一個 `kind`，而不是繼續讓呼叫端各寫各的。
 */
export type PageKind = 'hub' | 'detail';

interface KindDefaults {
  ogType: string;
  answer?: AnswerBlock;
}

const PAGE_KIND: Record<PageKind, KindDefaults> = {
  hub: { ogType: 'website' },
  detail: { ogType: 'article', answer: 'lead' },
};

export const ogTypeFor = (kind: PageKind): string => PAGE_KIND[kind].ogType;

/**
 * 該頁的 speakable 選擇器。`answer` 是覆寫（頁型預設不對時用），
 * `none` 是明確的「這一頁不宣告 speakable」（給 hub 以外的例外用）。
 */
export function speakableFor(kind: PageKind, answer?: AnswerBlock | 'none'): string[] | undefined {
  if (answer === 'none') return undefined;
  const block = answer ?? PAGE_KIND[kind].answer;
  return block ? [...ANSWER_BLOCKS[block]] : undefined;
}
