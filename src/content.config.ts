// 民俗信仰解析器 — Content Collections 定義（五模組脊椎）
//
// 設計原則（對應 SPEC）：
//  - 一套資料、兩種視圖：M1 籤詩解碼 ＋ M2 神明圖譜，共用脊椎（§0、§1）。
//  - provenance 鐵律：每個事實型實體掛 `sources[]`；爭議欄（聖誕、關係）多筆並陳、各自掛源（§5、§2.3）。
//  - 無源不發佈：`draft:true` 或缺 `sources` 者，production build 不對外顯示（§5、§9.5）。
//  - 模組硬邊界：模組間只透過 deity.id / temple.id / 農曆日期 連接（§12.0）。
//  - 完整性以「報表」而非「build 失敗」處理 seed 佔位（對應 R5 未匹配報表）；
//    故關係邊的 from/to 用字串 key，由 scripts/check-integrity 檢查，不用 reference()。

import { defineCollection, reference, z } from 'astro:content';
import { file, glob } from 'astro/loaders';

// ── 共用片段 ─────────────────────────────────────────────

/** 來源標註（§5 provenance 鐵律的最小單位） */
const source = z.object({
  type: z.enum(['book', 'temple', 'gov', 'web', 'field', 'paper', 'other']),
  ref: z.string(), // 書名+頁碼 / 廟方官網 / 資料集 ID …
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

const deities = defineCollection({
  loader: file('src/data/deities.json'),
  schema: z.object({
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
    draft: z.boolean().default(false), // 無源不發佈 gate（§5）
  }),
});

const deityRelations = defineCollection({
  loader: file('src/data/deity-relations.json'),
  // from/to 為字串 key（容許尚未成節點的佔位，如「千里眼」）；
  // 由 scripts/check-integrity 產出未匹配報表，不在此用 reference() 硬擋（R5）。
  schema: z.object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    type: z.enum(RELATION_TYPES),
    note: z.string().optional(),
    sources: z.array(source).default([]),
  }),
});

// ── M1 籤詩（資料已備・附錄 A）─────────────────────────

const divinationSystems = defineCollection({
  loader: file('src/data/divination-systems.json'),
  schema: z.object({
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
  }),
});

const allusions = defineCollection({
  // 每篇獨立 md：frontmatter 為節點 metadata，body 為白話故事（公有領域題材自行敘述，§6）。
  // 檔名 stem = 典故 id（poem.allusions[].ref 依此 join）。
  loader: glob({ pattern: '**/*.md', base: 'src/content/allusions' }),
  // 典故去重節點 — 跨籤共用，是跨文本追蹤的價值點（§2.1、A.2）
  schema: z.object({
    name: z.string(),
    source: z.string().optional(), // 故事所本（史記/演義/戲文）
    people: z.array(z.string()).default([]),
    seoDesc: z.string().optional(), // 覆寫 meta description（僅供 SEO 微調，不改事實內容）
    draft: z.boolean().default(false),
  }),
});

const poems = defineCollection({
  loader: file('src/data/poems.json'),
  schema: z.object({
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
  }),
});

// 籤詩白話賞析＋八項分項解（本站原創；§6）。每篇獨立 md，檔名 stem = poem id（依 id join）。
// frontmatter = 八項分項解（次級，可選）；body = 白話賞析（版面主角，§0.5）。
const interpretations = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/interpretations' }),
  schema: z.object({
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
  }),
});

// ── M4 民俗活動／繞境（事件＋GIS・附錄 D）──────────────

const temples = defineCollection({
  loader: file('src/data/temples.json'),
  // 外掛、來自內政部開放資料；v1 先備 schema，seed 後續匯入
  schema: z.object({
    id: z.string(),
    name: z.string(),
    main_deity_raw: z.string().optional(), // 原始自由文字主祀神祇
    main_deity_ref: z.string().optional(), // 對映到 deity.id（R5 對映白名單）
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
  }),
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

const events = defineCollection({
  loader: file('src/data/events.json'),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    host_temple: z.string().optional(), // → temple.id（字串 key，容佔位）
    main_deity: z.string(), // → deity.id（用具名實例，B.3-1）
    destination_temple: z.string().optional(),
    type: z.array(z.enum(EVENT_TYPES)).default([]),
    chen_tou: z.array(z.string()).default([]), // 陣頭（受控詞彙 D.3）
    cycle: z.enum(['annual', 'n_year_ke', 'irregular']),
    ke_rule: z.string().nullable().default(null), // 三年一科：丑辰未戌
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
      .array(z.object({ name: z.string(), schedule: z.string().optional(), lunar: z.string().optional() }))
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
  }),
});

// ── M5 拜拜習俗／科儀（程序知識・附錄 E）──────────────

const practices = defineCollection({
  loader: file('src/data/practices.json'),
  schema: z.object({
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
  }),
});

// ── 行業守護神（A）＋ 農民曆行業視角（B）────────────────
// 行業為第一級實體：守護神對映（每筆各自掛源，§5 最小單位）＋宜忌事項對映
// （存 almanac rules/affairs.json 的 id，由 scripts/check-integrity 驗證存在）。

const trades = defineCollection({
  loader: file('src/data/trades.json'),
  schema: z.object({
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
  }),
});

// ── 情境頁（高意圖：求姻緣／考試／開店／搬家…「拜什麼神」）────────
// 與 trades 同 schema：情境為第一級實體，守護神對映各自掛源（§5），
// 對映之神明「情境↔職司」須可被同筆 sources 支撐；宜忌事項對映 affairs.json id。
const scenarios = defineCollection({
  loader: file('src/data/scenarios.json'),
  schema: z.object({
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
  }),
});

export const collections = {
  deities,
  deityRelations,
  divinationSystems,
  allusions,
  poems,
  interpretations,
  temples,
  events,
  practices,
  trades,
  scenarios,
};
