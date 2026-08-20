// Content Collections 的 **Zod schema 單一真實來源**。
//
// 為什麼 schema 不留在 `src/content.config.ts`（2026-08-20 抽出）：
// 那支檔案 import 的是 `astro:content`——**Vite 虛擬模組**，只在 astro build／dev 的
// 模組圖裡存在。實測 `node -e "import('./src/content.config.ts')"` 直接爆
// 「Only URLs with a scheme in: file, data, and node are supported by the default ESM
// loader. Received protocol 'astro:'」，所以 `scripts/import-*.mjs` **沒有辦法**
// 在寫檔當下驗證自己產出的資料合不合 schema，只能等 20 分鐘的 `astro build` 才紅燈。
// 本 repo 記過的失敗模式正是這一類：「落點錯不會紅燈，會安靜成功、隔天才發現沒資料」。
//
// 🔴 **本檔只准 import 非虛擬的實體入口**（`astro/zod`、`astro/content/runtime`），
//    一旦有人在這裡寫 `from 'astro:content'`，寫端（匯入器）就再也載不動這份 schema，
//    驗證會安靜地退回「只有 build 才擋」。
//
// 這兩個入口拿到的**就是 `astro:content` 對外給的同一個東西**，不是相容實作——
// `node_modules/astro/templates/content/module.mjs`（`astro:content` 虛擬模組的樣板）
// 逐字寫著 `export { z } from 'astro/zod'` 與 `export const reference = createReference()`，
// 其中 `createReference` 來自 `astro/content/runtime`。所以本次抽出**沒有改變任何一條
// 驗證規則**，只是換了一個載得動的門。
//
// 讀端＝`src/content.config.ts`（包成 defineCollection）；
// 寫端＝`scripts/lib/dataset-commit.mjs` 的 `schema` 參數（寫檔前 safeParse，違規就丟錯）。
// 加新 collection 時 schema 寫這裡、loader 寫那裡，別走回頭路把 schema 搬回去。

import { createReference } from 'astro/content/runtime';
import { z } from 'astro/zod';

/**
 * `astro:content` 的 `reference` **在執行期就是這個**（見本檔頭的樣板引文）。
 *
 * ⚠️ 型別要另外對齊：`astro:content` 的 `reference` 有一份**產生出來的**宣告
 *    （`.astro/content.d.ts`），會把輸出窄化成 `{ collection: C; id: string }`；
 *    而 `createReference()` 自己的 `.d.ts` 是未窄化的寬聯集
 *    （`{id,collection} | {slug,collection}`）。不接這一刀，所有讀 `sys.id`
 *    的頁面都會多出 `Property 'id' does not exist on ...` 這類假錯誤
 *    （2026-08-20 實測 128 個）。**執行期行為完全沒變，只補型別。**
 *    這行 `as` 在 node 的型別剝離下會被整個移除，不影響匯入器載入本檔。
 */
const reference = createReference() as unknown as typeof import('astro:content').reference;

// ── 共用片段 ─────────────────────────────────────────────

/**
 * 來源標註（§5 provenance 鐵律的最小單位）
 *
 * 🔴 `site` 是 2026-08-20 收進來的，**不是**「一般網站」的意思——
 *    它專指**指向本站自己的交叉引用**（`https://folk.tw/...`），用途是導覽入口而非舉證。
 *    收進共用 enum 的理由：festivals.json 原本自己用了這個值 46 筆，而共用片段沒有它，
 *    等於同一個概念有兩套詞彙、且沒有任何東西在比對（那份資料集當時連 schema 都沒有）。
 *    ⚠️ **不可以把它併進 `web`**：自我引用被標成外部網站來源，就是替事實製造假的溯源，
 *    違反「逐筆掛源、來源要能被機器複驗」（CLAUDE.md 紅線 1）。
 *    ⚠️ 渲染端要據此分辨：同源連結不加 `nofollow`／`target="_blank"`
 *    （見 src/components/Sources.astro，2026-08-20 之前它對自家連結也加 nofollow）。
 */
const source = z.object({
  type: z.enum(['book', 'temple', 'gov', 'web', 'field', 'paper', 'other', 'site']),
  ref: z.string(), // 書名+頁碼 / 廟方官網 / 資料集 ID …
  note: z.string().optional(),
});

/** 自動主題文章的可點擊來源（文章正文以此為事實查證邊界）。 */
const articleSource = z.object({
  type: z.enum(['book', 'temple', 'gov', 'web', 'field', 'paper', 'other']),
  ref: z.string().min(1),
  url: z.string().url(),
  note: z.string().optional(),
});

/** 神明七大類（§4，可引用之既有分類學，不自創） */
export const DEITY_CATEGORIES = [
  '海神信仰',
  '開拓神信仰',
  '族群神信仰',
  '行業神信仰',
  '愛情婦幼守護神',
  '動物神崇拜',
  '自然神信仰',
] as const;

/** 神明關係型別（§2.1 列舉值 ＋ B.2 seed 用到的 同系/同列/系統） */
export const RELATION_TYPES = [
  '配祀',
  '從神', // 部將（關平/周倉、七爺八爺）
  '分靈母子廟',
  '同神異名', // 通常已收進 aliases，邊僅備用
  '眷屬',
  '師承',
  '對立收伏',
  '系統', // 王爺五府千歲為一系
  '同系', // 三奶夫人
  '同列', // 五文昌等橫向群組（亦可用 deity.groups）
] as const;

// ── M2 神明（脊椎・最先）────────────────────────────────

export const deitiesSchema = z.object({
  id: z.string(),
  name: z.string(), // canonical 正名
  aliases: z.array(z.string()).default([]), // 別名/封號全指向此節點（§2.3-2）
  category: z.enum(DEITY_CATEGORIES),
  // B.3-1「類別非單神」：王爺/城隍/王母 是信仰類別，底下有具名實例
  is_category: z.boolean().default(false),
  instances: z.array(z.string()).default([]), // is_category 時，具名實例 deity id
  office: z.array(z.string()).default([]), // 職司（摘）
  // 聖誕多筆並陳：本誕＋飛昇/得道/成道，各廟有出入（B.3-3）
  birthday_lunar: z
    .array(
      z.object({
        date: z.string(), // "MM-DD"（農曆），或 "無定" / "待查"
        kind: z.enum(['聖誕', '飛昇', '得道', '成道', '其他']).default('聖誕'),
        note: z.string().optional(),
        sources: z.array(source).default([]),
      }),
    )
    .default([]),
  iconography: z.array(z.string()).default([]), // 造型法器
  system: z.string().optional(), // 所屬神系（如「媽祖系統」）
  // 該神常用之籤詩系統（橋接 M1）
  divination_systems: z.array(reference('divinationSystems')).default([]),
  // 橫向群組標籤（五文昌/八仙/三奶夫人/五府千歲），利 UI 聚合（B.3-5）
  groups: z.array(z.string()).default([]),
  summary: z.string().optional(), // 來歷摘要，自行改寫不得逐字抄（§6）
  // 實體錨定：Wikidata／Wikipedia 等權威 URI（GEO 實體消歧，P2-6）
  sameAs: z.array(z.string()).default([]),
  sources: z.array(source).default([]),
  // 代表圖（Wikimedia Commons，CC／公有領域）：神像／畫像／主祀廟；無合授權圖者留空、絕不杜撰。
  image: z
    .object({
      src: z.string(),
      alt: z.string(),
      author: z.string(),
      license: z.string(),
      license_url: z.string().optional(),
      source: z.string(),
    })
    .optional(),
  // 內政部「宗教知識+」條目引文（2026-08-06 起）。
  // 🔴 與上面的 `summary` 是**相反的規則**：summary 必須自行改寫不得逐字抄（§6），
  //    而本欄位是**逐字引用**——因為 2026-08-06 已取得內政部同意使用，
  //    條件是「標示資料來源連結」，而**逐字引用 + 掛源**才是最誠實的做法：
  //    我們沒有立場替官方的敘述做摘要，改寫反而引入杜撰風險。
  //    由 scripts/import-knowledge-deities.mjs 產生，**不要手改**。
  moi_knowledge: z
    .object({
      url: z.string(), // 條目公開網址＝授權條件要求標示的那個連結
      title: z.string(),
      excerpt: z.array(z.string()).min(1), // 逐字段落，段落邊界截斷（不切句）
    })
    .optional(),
  // 國史館臺灣文獻館《臺灣民俗文物辭典》辭條引文（2026-08-20 起）。
  // 規則與上面的 `moi_knowledge` **完全相同**：逐字引用、不改寫、必須標示資料來源連結
  //（2026-08-19 站主確認該館授權，條件與內政部那次一致）。兩者分開存放是因為出處不同，
  // 有些神明兩邊都有、有些只有一邊。由 scripts/import-th-dict.mjs 產生，**不要手改**。
  // ⚠️ 是**陣列**（moi_knowledge 是單一物件，兩者刻意不同）：辭典把同一尊神明拆成
  //    數個辭條的情況很常見（七爺／八爺各一條、另有「造型與執器」自成一條），
  //    只留一條等於自己丟掉一半有授權的內容。
  th_dict: z
    .array(
      z.object({
        url: z.string(), // 辭條公開網址＝授權條件要求標示的那個連結
        title: z.string(), // 辭條名稱（與辭典上的字面一致，供 gate 複驗）
        excerpt: z.array(z.string()).min(1), // 逐字段落
      }),
    )
    .min(1)
    .optional(),
  draft: z.boolean().default(false), // 無源不發佈 gate（§5）
});

// from/to 為字串 key（容許尚未成節點的佔位，如「千里眼」）；
// 由 scripts/check-integrity 產出未匹配報表，不在此用 reference() 硬擋（R5）。
export const deityRelationsSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.enum(RELATION_TYPES),
  note: z.string().optional(),
  sources: z.array(source).default([]),
});

// ── M1 籤詩（資料已備・附錄 A）─────────────────────────

export const divinationSystemsSchema = z.object({
  id: z.string(),
  name: z.string(),
  count: z.number(), // 首數（六十甲子＝60）
  summary: z.string().optional(),
  // hub：該籤系自有樞紐頁時填其網址（如藥籤＝/medicine-slips/）。
  // 有值代表**籤文不在 poems collection**（另有資料來源與版型），因此：
  //   ① /systems/[id] 不為它生成頁面（避免與自有樞紐重複內容）
  //   ② /systems/ 與神明頁的連結一律改指這裡
  // 取得連結請一律用 queries.ts 的 systemHref()，勿在頁面自己拼 `/systems/${id}/`。
  hub: z.string().optional(),
  // 採用之神明/廟由 build-time 反向索引從 deities 推導，不在此重複維護（§2.2）
  sources: z.array(source).default([]),
});

// 典故去重節點 — 跨籤共用，是跨文本追蹤的價值點（§2.1、A.2）
export const allusionsSchema = z.object({
  name: z.string(),
  source: z.string().optional(), // 故事所本（史記/演義/戲文）
  people: z.array(z.string()).default([]),
  seoDesc: z.string().optional(), // 覆寫 meta description（僅供 SEO 微調，不改事實內容）
  draft: z.boolean().default(false),
});

// 外部搜尋趨勢驅動的主題文章。這是獨立內容邊界：
// 文章可自動新增，但必須帶趨勢證據、至少兩筆可回查來源與站內關聯，
// 不直接改寫籤詩、神明、廟宇等事實資料。
export const seoArticlesSchema = z.object({
  title: z.string().min(2).max(100),
  description: z.string().min(20).max(180),
  datePublished: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateModified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  query: z.string().min(2).max(120),
  trendSources: z.array(z.string().url()).min(1),
  sources: z.array(articleSource).min(2),
  faq: z
    .array(z.object({ q: z.string().min(2), a: z.string().min(2) }))
    .default([]),
  related: z.array(z.string().regex(/^\/[a-z0-9][a-z0-9/_-]*\/?$/)).default([]),
  draft: z.boolean().default(false),
});

export const poemsSchema = z.object({
  id: z.string(), // `${system}-${no}`，如 liushi_jiazi-1
  system: reference('divinationSystems'),
  no: z.number(),
  ganzhi: z.string().optional(), // 籤名干支（六十甲子籤專屬；他系統可無）
  title: z.string().optional(), // 籤題／古人（關帝籤等以歷史人物命題）
  wuxing: z
    .object({
      element: z.string(), // 五行
      season: z.string(), // 利季
      direction: z.string(), // 方位
    })
    .optional(),
  gua: z.string().optional(), // 易經卦名（六十甲子籤專屬）
  fortune: z.string().optional(), // 吉凶（六十甲子籤非原生；關帝籤與月老籤有原生定級）
  // 擲筊組合（月老籤專屬）：大天后宮月老籤不抽籤支，而是連擲三次筊，
  // 以三次杯象（聖/陽/陰）的排列對應一首，3³＝27 首。這是該籤版取籤的唯一方式，
  // 不是附註——沒有它使用者無法從現場的筊象找到自己那一首。
  jiaobei: z.string().optional(),
  // 籤版本身所印的分項解（如「功名至」「婚姻好」）。**逐條照抄籤版、不改寫、不重新歸類**：
  // 各籤版的項目名稱與數量都不同（月老籤有福祿/生意/風水，六十甲子籤沒有），
  // 硬套 interpretations 的九項會變成我們的詮釋而非籤版原文。
  // 本站自撰的白話賞析與九項分項解仍走 interpretations collection，兩者並存不混。
  official_interpretation: z.array(z.string()).default([]),
  lines: z.array(z.string()).min(4).max(4), // 四句本文（公有領域）
  // 典故連結可多筆並陳、各掛源（A.0 各廟版本不一）
  allusions: z
    .array(
      z.object({
        ref: reference('allusions'),
        sources: z.array(source).default([]),
        note: z.string().optional(),
      }),
    )
    .default([]),
  // 分項解與白話賞析移至 interpretations collection（依 id join），poems.json 僅存公有領域本文。
  version_source: z.string().default('籤詩本文：公有領域'),
  notes: z.string().optional(), // 校訂註記（A.3 內部不一致等）
  draft: z.boolean().default(false),
});

// 籤詩白話賞析＋八項分項解（本站原創；§6）。每篇獨立 md，檔名 stem = poem id（依 id join）。
// frontmatter = 八項分項解（次級，可選）；body = 白話賞析（版面主角，§0.5）。
export const interpretationsSchema = z.object({
  運勢: z.string().optional(),
  求財: z.string().optional(),
  姻緣: z.string().optional(),
  六甲: z.string().optional(), // 求子／胎孕（民俗問事類別，依傳統六十甲子籤六甲/求兒解，本站語氣撰寫）
  功名: z.string().optional(),
  訴訟: z.string().optional(),
  疾病: z.string().optional(),
  行人: z.string().optional(),
  失物: z.string().optional(),
  draft: z.boolean().default(false),
});

// ── M4 民俗活動／繞境（事件＋GIS・附錄 D）──────────────

// 外掛、來自內政部開放資料；v1 先備 schema，seed 後續匯入
export const templesSchema = z.object({
  id: z.string(),
  name: z.string(),
  main_deity_raw: z.string().optional(), // 原始自由文字主祀神祇
  main_deity_ref: z.string().optional(), // 對映到 deity.id（R5 對映白名單）
  // 廟宇層籤系覆寫（2026-08-14，首例 moi_10478_碧雲宮：主祀天上聖母、實際採用關帝靈籤）。
  // 「廟用哪套籤」是廟自己的事實，不是主祀神的推論；有此欄位者，求籤區塊以此為準、
  // 不再從 main_deity_ref 推（消費點：temples/[id].astro、systems/index.astro、check-rendered.mjs）。
  divination_systems: z.array(reference('divinationSystems')).optional(),
  district: z.string().optional(),
  lng: z.number().optional(),
  lat: z.number().optional(),
  website: z.string().optional(), // 廟方官方網站（驗證後填，無源不發佈）
  // 名廟內容豐化（僅可查證者填，無源留空，§5）：創建年代、沿革、主要祭典
  founded: z.string().optional(), // 創建年代（史料原話，含「相傳/約」如實標註）
  history: z.string().optional(), // 沿革 2–4 句（客觀事實）
  // 觀光署景點介紹與開放時間（政府資料開放平臺 7777，OGDL 1.0，2026-08-05 匯入）。
  // ⚠️ `intro` 與 `history` 是**兩種東西**：history 是逐間查證的敘述句（22 間），
  //    intro 是官方觀光文字（115 間，已過濾行銷／旅遊指南腔）。
  //    **顯示層永遠讓 history 優先**，匯入器對有 history 者不寫 intro。
  //    採用規則的唯一入口＝scripts/lib/tourism-intro.mjs（匯入器與 check:integrity 共用）。
  intro: z.string().optional(),
  open_time: z.string().optional(), // 開放時間原文（如「每日開放」「08:00-17:00」）
  // 內政部 GetUploadFile 的另外兩種內容（2026-08-06 取得同意後開放匯入）。
  // 🔴 與 `history` 一樣是**逐字**內容，一個字都不改寫；授權條件＝每筆掛回自己的
  //    `GetUploadFile?UploadFileID=…&IndexID=…` 連結（見 docs/taiwan-intake-status.md §2026-08-06）。
  // ⚠️ `architecture`（IndexID=3）**佔位值很多**——來源有不少筆的內容就是廟名本身，
  //    匯入器 scripts/import-temple-history.mjs 會擋掉，別繞過它手動塞。
  architecture: z.string().optional(), // 建築特色
  worship_flow: z.string().optional(), // 參拜流程
  main_festival: z.string().optional(), // 主要祭典／聖誕慶典一句（21 間逐間查證的敘述句）
  // 年度慶(祭)典（內政部全國宗教資訊網「慶(祭)典查詢」，2,498 間）。
  // ⚠️ 曆別必須逐筆帶：來源 6,644 筆中農曆 6,365、國曆 279，官方 ODS 匯出**沒有這個標記**，
  //    只用 ODS 會把農曆當國曆（媽祖聖誕農曆三月廿三 → 錯成國曆 3/23）。見 docs/festival-data-import.md。
  // 顯示一律走 src/lib/temple-festival.ts，**勿在頁面自行挑代表筆或自行換算農曆**。
  festivals: z
    .array(
      z.object({
        name: z.string().min(1),
        calendar: z.enum(['lunar', 'solar']),
        date: z.string().regex(/^\d{2}-\d{2}$/), // MM-DD
        desc: z.string().optional(),
      }),
    )
    .optional(),
  sources: z.array(source).default([]),
  // 代表圖（Wikimedia Commons，CC／公有領域）：廟宇建築照；無合授權圖者留空、絕不杜撰。
  image: z
    .object({
      src: z.string(),
      alt: z.string(),
      author: z.string(),
      license: z.string(),
      license_url: z.string().optional(),
      source: z.string(),
    })
    .optional(),
});

export const EVENT_TYPES = [
  '遶境',
  '進香',
  '遶境進香',
  '刈香',
  '刈火', // 進火
  '迎王',
  '燒王船',
  '中元普渡',
  '放水燈',
  '搶孤',
  '夜巡', // 暗訪
  '過火',
  '炮城', // 蜂炮/炸轎/炸寒單
  '神豬祭',
  '安座',
  '建醮',
  '陣頭競演',
] as const;

export const eventsSchema = z.object({
  id: z.string(),
  name: z.string(),
  host_temple: z.string().optional(), // → temple.id（字串 key，容佔位）
  // → deity.id（用具名實例，B.3-1）。
  // 🔴 2026-08-19 改為選填：**不是每個登錄民俗的主神都在台灣民間信仰的神明譜系裡**。
  //    實例：「天主教萬金聖母遊行」（屏東縣登錄民俗，nchdb 20120426000004）的主神是
  //    聖母瑪利亞，站上沒有、也不該硬塞——`DEITY_CATEGORIES` 的註解明寫那七類是
  //    「可引用之既有分類學，不自創」，為了塞一個節點去新增一個分類等於自創分類；
  //    而把天主教聖母歸進「族群神信仰」則是錯的陳述。兩條都比留空糟。
  //    ⚠️ 留空的頁面仍要在正文說明主神是誰並掛源，不是把這件事略過不提。
  main_deity: z.string().optional(),
  destination_temple: z.string().optional(),
  type: z.array(z.enum(EVENT_TYPES)).default([]),
  chen_tou: z.array(z.string()).default([]), // 陣頭（受控詞彙 D.3）
  cycle: z.enum(['annual', 'n_year_ke', 'irregular']),
  // 🔴 2026-08-20 拆欄位：原本是一個 `ke_rule: z.string()`，註解寫「三年一科：丑辰未戌」，
  //    意思是它只該放地支——但 10 筆有值的資料裡 8 筆塞了自由文字，而 z.string() 攔不住，
  //    頁面樣板 `${ke_rule}年一科` 因此在線上輸出「三年一科年一科」這類病句。
  //    拆成三個各自單一語意的欄位後，造句由 src/lib/event-cycle.ts 生成，結構上不可能再串壞。
  ke_branches: z.array(z.enum(['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'])).default([]), // 逢這些地支年舉行
  ke_period_text: z.string().nullable().default(null), // 週期怎麼講，如「三年一科」。⚠️ 來源沒說就留 null，不由地支數量推算
  ke_note: z.string().nullable().default(null), // 其他補充（如「首科 1967 年」），不參與造句
  date_resolution: z.enum(['fixed_lunar', 'divined', 'undetermined']),
  date_note: z.string().optional(),
  route_mode: z.enum(['fixed', 'yearly_versioned', 'undetermined']),
  heritage: z
    .object({
      level: z.enum(['national_important', 'municipal', 'county', 'none']),
      authority_ref: z.string().optional(), // 文資網個案 ID（待填）
      verified: z.boolean().default(false), // 未核者標 false（D.5 待核）
      // ── 以下 2026-08-09 加：文化部國家文化資產網個案的**事實欄位** ──────────────
      // 🔴 **只收事實，不收敘述**。授權查證過程與結論（2026-08-09）：
      //    文資網（nchdb.boch.gov.tw）的個案資料由 data.boch.gov.tw 的 API 供應，
      //    但那份**不在 data.gov.tw 的開放資料集裡**（`data.gov.tw/dataset/7723`
      //    是「國家文化資料庫」nrch 的、已下架，且欄位只有標題/年代/主題，沒有長文），
      //    依 docs/taiwan-intake-status.md 的判準＝**網站語文著作**，與內政部取得同意前的
      //    `GetUploadFile` 同一類。所以 `registerReason`／`historyDevelopment`／
      //    `ceremony[].description` 那些**整段敘述一律不取**。
      //    這裡收的是登錄基準（法條文字）、法令依據、主管機關、保存者、地點、公告文號——
      //    事實與法條不受著作權保護，且正是各節日**彼此不同**的東西。
      //    要用敘述文字得比照內政部那次去函取得同意（用戶 2026-08-06 的做法）。
      case_id: z.string().optional(), // 文資網個案編號，可組出人看得到的驗證網址
      criteria: z.array(z.string()).default([]), // 登錄／指定基準（引自審查辦法條文）
      laws: z.string().optional(), // 法令依據
      authority: z.string().optional(), // 主管機關
      preservers: z.array(z.object({ name: z.string(), type: z.string().optional() })).default([]),
      venue: z.string().optional(), // 舉辦地點（文資網 addresses）
      announcements: z
        .array(z.object({ date: z.string(), doc: z.string(), note: z.string().optional() }))
        .default([]),
      // ── 2026-08-09（同日稍晚）：用戶回報**已取得文化部授權**，敘述文字改為可用 ──────
      // 🔴 與上面那段「只收事實不收敘述」是**相反的規則，但不是推翻**：先前不收，是因為當時
      //    查證的結論是「不在 data.gov.tw 開放資料集裡＝網站語文著作」，那個查證仍然成立；
      //    改變的是**授權狀態**，不是資料性質。沿用內政部 2026-08-06 那次的做法：
      //    **逐字引用、不改寫、每筆掛回個案公開網址**——我們沒有立場替官方敘述做摘要，
      //    改寫反而引入杜撰風險（同 deities 的 `moi_knowledge` 欄位註解）。
      // ✅ 條件＝**標示資料來源連結**，與內政部那次相同（2026-08-09 用戶明確確認，不是推測）。
      //    落實方式＝每筆掛回 `nchdb.boch.gov.tw/assets/overview/folklore/<caseId>`，
      //    並由 `check:rendered` 不變量 5f 硬驗「逐字內容與來源連結必須同頁」。**不必再去問一次。**
      register_reason: z.string().optional(), // 登錄／指定理由（逐字）
      history: z.string().optional(), // 歷史沿革（逐字）
      notices: z.array(z.string()).default([]), // 參觀注意事項（逐字）
      // 這筆登錄明細要在哪個節日頁攤開（同 practices 的 home_festival，理由一模一樣）。
      // ⚠️ 一個 event 常被多個節日 event_refs 指到：`jilong` 同時被中元節與雞籠中元祭指到、
      //    `hengchun_qianggu` 同時被中元節與搶孤指到。不設這個欄位就會**兩頁各印一份完整登錄明細**
      //    ——那正是本次要消滅的重複，2026-08-09 加這批欄位時當場又製造了一次（實測 guimenkai
      //    的重疊率反而從 46.8% 升到 61.6%），所以規則必須跟資料同時進來。
      home_festival: z.string().optional(),
    })
    .optional(),
  // 儀式順序（名稱＋時程）。同樣**只收名稱與時間，不收敘述**（理由同上）。
  // 這是雞籠中元祭那頁最需要的東西——它自己的提問就是「在哪幾天？儀式順序是什麼？」。
  ceremony_stages: z
    .array(
      z.object({
        name: z.string(),
        schedule: z.string().optional(),
        lunar: z.string().optional(),
        // 2026-08-09 取得文化部授權後加：各段的說明（逐字，未改寫）。
        description: z.string().optional(),
      }),
    )
    .default([]),
  // 逐句掛源的活動特色；用來補足事件本身的獨有事實，不把節日頁的通用儀式整段複製過來。
  facts: z
    .array(
      z.object({
        text: z.string(),
        sources: z.array(source).default([]),
      }),
    )
    .default([]),
  region: z.array(z.string()).default([]),
  // 路線（D.4）：停駕/駐駕節點（geo-node）；GPS polyline 多為即時源（§12.4 發佈範圍外）故僅存節點＋來源指標
  route: z
    .object({
      stops: z
        .array(
          z.object({
            name: z.string(),
            district: z.string().optional(),
            role: z.string().optional(), // 起駕/駐駕/停駕/目的地
            lat: z.number().optional(),
            lng: z.number().optional(),
            coord_source: z.string().optional(),
          }),
        )
        .default([]),
      polyline_source: z.string().nullable().default(null), // 公開 GPS 軌跡來源（如有）
      note: z.string().optional(),
      sources: z.array(source).default([]),
    })
    .optional(),
  sources: z.array(source).default([]),
  // 代表圖（來自 Wikimedia Commons，皆 CC/公有領域）：無合授權圖者留空、絕不杜撰。
  // 授權標示：卡片 hover 顯示 author·license，/about「圖片來源」彙整全部出處連結。
  image: z
    .object({
      src: z.string(), // /events/<id>.webp（自存縮圖，非熱連）
      alt: z.string(),
      author: z.string(),
      license: z.string(), // 如 "CC BY-SA 4.0"
      license_url: z.string().optional(),
      source: z.string(), // Commons 檔案頁 URL
    })
    .optional(),
  draft: z.boolean().default(false),
});

// ── M5 拜拜習俗／科儀（程序知識・附錄 E）──────────────

export const practicesSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(), // 年度祈福/解厄/居家/歲時/生命禮俗/求子…
  deities: z.array(z.string()).default([]), // → deity.id
  occasion: z.string().optional(),
  festival_ref: z.array(z.string()).default([]), // 接 M3 節日
  // 🔴 這套儀式的「主場節日」slug（2026-08-09 加）。
  // 一套儀式常被多個節日 practice_refs 指到（`pudu` 被中元節／搶孤／雞籠中元祭／鬼門開四頁指到），
  // 而節日頁原本一律把完整步驟／供品／金紙／禁忌／地區差異整組渲染出來
  // → **同一站內四頁互相高度重複**（實測 8 字片段重疊：搶孤 84.4%、雞籠中元祭 71.6%、鬼門開 70.3%），
  // 而那兩個最重複的頁正好是 Google 不收錄的（`Discovered - currently not indexed`／`unknown to Google`）。
  // 設了本欄後：只有主場節日渲染完整內容，其餘節日頁改成一句摘要＋連到 /practices/<id>/ 與主場節日。
  // ⚠️ 沒設本欄＝維持舊行為（每個指到它的節日頁都渲染），所以只需要替「被多頁共用」的儀式設。
  home_festival: z.string().optional(),
  // 步驟五要素同構（E.4）：順序/誰做/用什麼/對誰/禁忌
  steps: z
    .array(
      z.object({
        order: z.number(),
        action: z.string(),
        actor: z.string().optional(),
        items: z.array(z.string()).default([]), // 引 E.3 受控詞彙
        target: z.string().optional(),
        note: z.string().optional(),
        taboo: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  offerings: z.array(z.string()).default([]), // 受控詞彙 E.3
  joss_paper: z.array(z.string()).default([]), // 受控詞彙 E.3
  taboo: z.array(z.string()).default([]),
  // 諸說並陳（E.6）：地區差異各自掛源
  regional: z
    .array(
      z.object({
        area: z.string(),
        note: z.string(),
        sources: z.array(source).default([]),
      }),
    )
    .default([]),
  summary: z.string().optional(),
  sources: z.array(source).default([]),
  // 國史館臺灣文獻館《臺灣民俗文物辭典》辭條引文（2026-08-20 起）。
  // 規則與 deities 的同名欄位一模一樣：逐字引用、不改寫、必須標示資料來源連結；
  // 是陣列，因為辭典常把同一套儀式拆成數條（安太歲與謝太歲、補運與祭解）。
  // 由 scripts/import-th-dict.mjs 產生，**不要手改**。
  th_dict: z
    .array(
      z.object({
        url: z.string(),
        title: z.string(),
        excerpt: z.array(z.string()).min(1),
      }),
    )
    .min(1)
    .optional(),
  // 代表圖（Wikimedia Commons，CC／公有領域）：儀俗照；無合授權圖者留空、絕不杜撰。
  image: z
    .object({
      src: z.string(),
      alt: z.string(),
      author: z.string(),
      license: z.string(),
      license_url: z.string().optional(),
      source: z.string(),
    })
    .optional(),
  draft: z.boolean().default(false),
});

// ── 行業守護神（A）＋ 農民曆行業視角（B）────────────────
// 行業為第一級實體：守護神對映（每筆各自掛源，§5 最小單位）＋宜忌事項對映
// （存 almanac rules/affairs.json 的 id，由 scripts/check-integrity 驗證存在）。

export const tradesSchema = z.object({
  id: z.string(), // = URL slug（/trades/[id]，發佈後永不改）
  name: z.string(),
  // 使用者實際會打的職業詞（如「護士」「木工」），供 title/description 命中查詢用。
  // ⚠️ 這是**搜尋詞變體，不是新增事實**——守護神對映（patrons）與其來源一字未動。
  // 依據：GSC 實測 29 天內命中的查詢全部是「○○拜什麼神」句型，且排第 9–11 名卡在第一頁邊緣，
  // 而 title 寫的是行業統稱（「醫療與護理」對不上「護士」、「營造與工匠」對不上「木工」）。
  occupations: z.array(z.string()).default([]),
  modern: z.boolean().default(false), // 現代延伸行業（頁面明確標示）
  description: z.string(),
  patrons: z
    .array(
      z.object({
        deity_ref: z.string(), // → deity.id（字串 key，由 check-integrity 硬驗）
        role: z.string(),
        why: z.string(), // 須可被同筆 sources 支撐（§5）
        sources: z.array(source).min(1), // 每筆對映各自掛源，schema 層強制
      }),
    )
    .min(1),
  affairs_yi: z.array(z.string()).default([]), // → affairs.json id（宜側）
  affairs_ji: z.array(z.string()).default([]), // → affairs.json id（忌側）
  sources: z.array(source).default([]),
  draft: z.boolean().default(false),
});

// ── 情境頁（高意圖：求姻緣／考試／開店／搬家…「拜什麼神」）────────
// 與 trades 同 schema：情境為第一級實體，守護神對映各自掛源（§5），
// 對映之神明「情境↔職司」須可被同筆 sources 支撐；宜忌事項對映 affairs.json id。
export const scenariosSchema = z.object({
  id: z.string(), // = URL slug（/scenarios/[id]，發佈後永不改）
  name: z.string(),
  description: z.string(),
  patrons: z
    .array(
      z.object({
        deity_ref: z.string(), // → deity.id（由 check-integrity 硬驗）
        role: z.string(),
        why: z.string(), // 須可被同筆 sources 支撐（§5）
        sources: z.array(source).min(1),
      }),
    )
    .min(1),
  affairs_yi: z.array(z.string()).default([]), // → affairs.json id（宜側）
  affairs_ji: z.array(z.string()).default([]), // → affairs.json id（忌側）
  sources: z.array(source).default([]),
  draft: z.boolean().default(false),
});
// ── 地方宗教慶典（**不是 content collection**，是 raw JSON 資料集）──────────
//
// 🔴 為什麼它住在這裡：本檔已經是「寫端載得動的 zod schema」唯一的門
// （`src/content.config.ts` import `astro:content`，匯入器載不動——見檔頭）。
// `local-celebrations.json` 沒有走 content collection（頁面是 `import lc from
// '../../../data/local-celebrations.json'`），所以**讀端一個字都沒驗**，
// 寫端也沒驗——`calendar` 這個欄位在型別上只是 `string`。
//
// 2026-08-20 實測母體：lunar 57／solar 6／hijri 2，日期全部是 `MM-DD`。
// 但那是**現在**的事實，不是被保證的事實。曆別多出一個沒人認得的值時，
// 改動前的頁面會把它**當成回曆印出去**（`: 回曆 M 月 D 日` 是最後一個 else 分支），
// 也就是替主辦方宣稱一個錯的曆別。enum 讓它在寫檔當下就炸。
//
// ⚠️ 這裡的 enum 是**來源實際會出現的曆別**，比 `CalendarDate` 的四種少一個 `solar_term`
//    ——內政部這份清單不給節氣。`src/lib/calendar-date.test.ts` 會驗
//    「enum 的每一個值都是 CalendarDate 認得的曆別」，兩邊不會各自漂走。
// ⚠️ 日期的 regex 與 `parseCalendarDate()` 的 `^\d{2}-\d{2}$` 一致；同樣由那支測試釘住。
export const LOCAL_CELEBRATION_CALENDARS = ['lunar', 'solar', 'hijri'] as const;
export const localCelebrationsSchema = z.object({
  id: z.string(), // `lc_<cid>`，cid 來自內政部詳情頁網址
  name: z.string(),
  county: z.string(),
  calendar: z.enum(LOCAL_CELEBRATION_CALENDARS),
  date: z.string().regex(/^\d{2}-\d{2}$/, '日期必須是 MM-DD（曆別由 calendar 欄位決定）'),
  // 規則消歧失敗一律 null（寧缺勿假），**不是漏填**——見 import-local-celebrations.mjs 檔頭。
  temple_ref: z.string().nullable(),
});

// ── festivals.json ───────────────────────────────────────────────────────
//
// 🔴 **festivals.json 不是 content collection**（全站十餘處直接 `import` 原始 json），
//    所以 `astro build` 從來不驗它。2026-08-20 之前它是**唯一一份完全沒有把關的資料集**：
//    `scripts/import-th-dict.mjs` 對它做逐行文字插入，寫錯欄位不會拋例外，
//    只會安靜產出壞資料。這份 schema 補的就是那個洞。
//
// ⚠️ 這裡**沒有**把它變成 collection——那要改十餘個 import 點，是另一件事。
//    現階段用途是「寫入端驗證」與「gate 全量驗證」，讀取端維持原樣。
//
// ── 必填欄位怎麼決定的（避免把偶然的形狀寫成法律）────────────────────
//   判準是「2026-08-20 實測 68 筆全部有」**且**語意上真的不可缺。只有 11 個欄位過關；
//   其餘一律 optional，即使出現率很高（如 date_note 59/68）也不標必填。
//
// ── 三個受限欄位的值域是從哪來的（都不是我用樣本自創的）──────────────
//   • `date_status`：沿用 `scripts/check-annual-release.mjs:91` 已宣告的四值詞彙。
//     ⚠️ festivals.json 目前只出現 `source_required` 一種——**用 n=1 訂枚舉會把偶然
//     寫成法律**，所以取 repo 自己已經宣告過的那組，不是取樣本。
//   • `source_status`：2026-08-20 實測只有兩種，且語意互斥（有錨定日期／待補來源）。
//   • `solar_term`：**刻意不列 24 節氣枚舉**。repo 裡沒有正規的節氣清單
//     （`almanac/provider.ts` 只有 5 個簡繁對照），在這裡列一份等於新增第二個真實來源，
//     而節氣的權威在農民曆引擎那邊。要收緊的話應該先在 almanac 立清單再引用。
//
// ⚠️ 三個日期欄位（lunar_date／solar_date／solar_term）**型別上互斥不了**。
//    2026-08-20 實測 0 筆同時有值，該不變量由 `src/lib/calendar-date.test.ts` 全量斷言；
//    zod 的 refine 只能擋單筆，擋不住「兩邊各自漂走」，所以留在測試那邊。
//
// ✅ 2026-08-20 已標準化：原本 festivals 自己多出 `site`（46 筆）與 `gov_heritage`（24 筆）
//    兩種值，是這份 schema 補上去才發現的分岔。處理方式**兩種不同**：
//    • `gov_heritage` → 併入 `gov`（全部 24 筆都是 nchdb.boch.gov.tw，就是政府來源，
//      多一個值沒有承載任何額外資訊）。
//    • `site` → **收進共用 enum，不併入 `web`**（它承載「本站自我引用」這個真實區別，
//      併掉就是製造假的溯源）。定義見上面 `source` 片段的檔頭。
//    所以這裡直接用共用的 `source`，不再有 festivals 專屬片段。
export const FESTIVAL_DATE_STATUSES = ['source_required', 'verified', 'blocked', 'not_applicable'] as const;
export const FESTIVAL_SOURCE_STATUSES = ['calendar_anchored', 'source_required'] as const;

export const festivalsSchema = z.object({
  // ── 11 個必填（實測 68/68 且語意不可缺）──
  slug: z.string().regex(/^[a-z0-9-]+$/, 'slug 只能是小寫英數與連字號（它是永久網址承諾，見 CLAUDE.md 紅線 4）'),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  season: z.string().min(1), // 自由文字（「農曆七月」「九月節氣」…），不可枚舉
  question: z.string().min(1),
  intent: z.string().min(1), // 自由文字，長句
  lead: z.string().min(1),
  sources: z.array(source),
  facts: z.array(z.object({ text: z.string().min(1), sources: z.array(source) })),
  published: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  // ── 選填 ──
  date_note: z.string().optional(),
  source_status: z.enum(FESTIVAL_SOURCE_STATUSES).optional(),
  date_status: z.enum(FESTIVAL_DATE_STATUSES).optional(),
  image_key: z.string().optional(),
  draft_week: z.number().int().optional(),
  multi_day: z.boolean().optional(),
  lunar_date: z.string().regex(/^\d{2}-\d{2}$/).optional(),
  solar_date: z.string().regex(/^\d{2}-\d{2}$/).optional(),
  solar_term: z.string().min(1).optional(),
  practice_refs: z.array(z.string()).optional(),
  event_refs: z.array(z.string()).optional(),
  deity_refs: z.array(z.string()).optional(),
  vocab_refs: z.array(z.string()).optional(),
  temple_refs: z.array(z.string()).optional(),
  // 🔴 import-th-dict.mjs 寫的就是這個欄位；excerpt 是逐字引用，空陣列代表引了個寂寞。
  th_dict: z.array(z.object({
    url: z.string().url(),
    title: z.string().min(1),
    excerpt: z.array(z.string().min(1)).min(1),
  })).optional(),
  // ⚠️ 全站只有 1 筆有 checklist。**不照那一筆的形狀逐欄寫死**（n=1 訂規格＝過度擬合），
  //    只驗真正被 PuduChecklist.astro 依賴的兩個欄位，其餘 passthrough。
  checklist: z.object({ title: z.string().min(1), groups: z.array(z.unknown()) }).passthrough().optional(),
});
