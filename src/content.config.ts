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
    fortune: z.string().optional(), // 吉凶（六十甲子籤非原生；關帝籤有原生定級）
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
    sources: z.array(source).default([]),
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
      })
      .optional(),
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
};
