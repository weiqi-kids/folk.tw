// 民俗信仰解析器 — Content Collections 定義（五模組脊椎）
//
// 設計原則（對應 SPEC）：
//  - 一套資料、兩種視圖：M1 籤詩解碼 ＋ M2 神明圖譜，共用脊椎（§0、§1）。
//  - provenance 鐵律：每個事實型實體掛 `sources[]`；爭議欄（聖誕、關係）多筆並陳、各自掛源（§5、§2.3）。
//  - 無源不發佈：`draft:true` 或缺 `sources` 者，production build 不對外顯示（§5、§9.5）。
//  - 模組硬邊界：模組間只透過 deity.id / temple.id / 農曆日期 連接（§12.0）。
//  - 完整性以「報表」而非「build 失敗」處理 seed 佔位（對應 R5 未匹配報表）；
//    故關係邊的 from/to 用字串 key，由 scripts/check-integrity 檢查，不用 reference()。
//
//  - 🔴 **Zod schema 不在本檔**（2026-08-20 抽出到 `src/content-schemas.ts`）：
//    本檔 import `astro:content`＝Vite 虛擬模組，bare node 載不動，於是六支
//    `scripts/import-*.mjs` 過去無法在寫檔當下驗 schema。抽出後讀端（本檔）與
//    寫端（`scripts/lib/dataset-commit.mjs`）共用同一份定義。**要改欄位改那支。**
//    本檔只負責把 schema 接上 loader，以及維持 collections 的對外名稱。

import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import {
  deitiesSchema,
  deityRelationsSchema,
  divinationSystemsSchema,
  allusionsSchema,
  seoArticlesSchema,
  poemsSchema,
  interpretationsSchema,
  templesSchema,
  eventsSchema,
  practicesSchema,
  tradesSchema,
  scenariosSchema,
} from './content-schemas';

// 受控詞彙常數的對外名稱維持在本檔（`src/pages/deities/index.astro` 等消費端已 import）。
export { DEITY_CATEGORIES, EVENT_TYPES, RELATION_TYPES } from './content-schemas';

const deities = defineCollection({
  loader: file('src/data/deities.json'),
  schema: deitiesSchema,
});

const deityRelations = defineCollection({
  loader: file('src/data/deity-relations.json'),
  schema: deityRelationsSchema,
});

const divinationSystems = defineCollection({
  loader: file('src/data/divination-systems.json'),
  schema: divinationSystemsSchema,
});

const allusions = defineCollection({
  // 每篇獨立 md：frontmatter 為節點 metadata，body 為白話故事（公有領域題材自行敘述，§6）。
  // 檔名 stem = 典故 id（poem.allusions[].ref 依此 join）。
  loader: glob({ pattern: '**/*.md', base: 'src/content/allusions' }),
  schema: allusionsSchema,
});

const seoArticles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/seo-articles' }),
  schema: seoArticlesSchema,
});

const poems = defineCollection({
  loader: file('src/data/poems.json'),
  schema: poemsSchema,
});

const interpretations = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/interpretations' }),
  schema: interpretationsSchema,
});

const temples = defineCollection({
  loader: file('src/data/temples.json'),
  schema: templesSchema,
});

const events = defineCollection({
  loader: file('src/data/events.json'),
  schema: eventsSchema,
});

const practices = defineCollection({
  loader: file('src/data/practices.json'),
  schema: practicesSchema,
});

const trades = defineCollection({
  loader: file('src/data/trades.json'),
  schema: tradesSchema,
});

const scenarios = defineCollection({
  loader: file('src/data/scenarios.json'),
  schema: scenariosSchema,
});

export const collections = {
  deities,
  deityRelations,
  divinationSystems,
  allusions,
  seoArticles,
  poems,
  interpretations,
  temples,
  events,
  practices,
  trades,
  scenarios,
};
