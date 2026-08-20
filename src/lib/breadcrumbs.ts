// 麵包屑（頁面層級 ancestry）的**唯一入口**。
//
// 為什麼要有這個檔（2026-08-19 重構）：
//   在此之前每頁把自己的層級寫**兩次**——一次是畫面上手寫的 <nav class="crumb"> markup，
//   一次是 seo.ts `breadcrumb()` 的字面值——兩份各自維護、互不知情。實測 45 處 `breadcrumb()`
//   呼叫、37 段手寫畫面麵包屑、35 頁兩者都有，而且**已經漂掉**：
//     - `temples/[id].astro` 畫面是「廟宇 › 縣市 › 鄉鎮」三層，送出的 BreadcrumbList 只有
//       「廟宇 › 廟名」兩層——縣市與鄉鎮的連結給了使用者、沒給 Google，而廟宇頁佔全站曝光 91%。
//     - `poems/[id]`（LD 有籤系層、畫面沒有）、`deities/[id]`／`practices/[id]`（LD 用名稱、
//       畫面用分類）、`events/[id]`（畫面沒有末層）、`allusions/index`（畫面有籤詩層、LD 沒有）、
//       `qiugian/*`（畫面有首頁層、LD 沒有且末層不同）……都是同一種病。
//     - 畫面 markup 還分岔成兩種 class（`crumb` ×26／`crumbs` ×11）與兩套重複的 scoped CSS。
//
// 現在的機制：**每頁只描述一次 ancestry**（一個 `Crumb[]`），交給 `Base.astro` 的 `crumbs` prop；
//   畫面 `<nav>` 與 BreadcrumbList 都由 Base 從同一個陣列產生，兩者不可能再不一致。
//   頁面**不再自己寫 `<nav class="crumb">`，也不再自己呼叫 `breadcrumb()`**。
//
// 🔴 不可破壞的約定：
//   1. `path` 是站內路徑，且**必須指向真的存在的頁**——BreadcrumbList 的 item 若 404，
//      Google 會整組丟掉，比沒有更糟。新增層級前先確認該路由產得出那一頁。
//   2. 尾斜線是全站鐵則（`check:canonical` 把關，見 Base.astro nav 段註解）。這裡統一由
//      `crumbHref()` 補，呼叫端寫不寫尾斜線都一樣——畫面 href 與 JSON-LD item 走同一支函式，
//      不會再出現「JSON-LD 補了、畫面手寫忘了」。
//   3. **最後一項 ＝ 當頁本身**：畫面上不加連結（自連沒有導覽意義，標 `aria-current="page"`），
//      但 BreadcrumbList 仍要有它的 item（Google 需要完整路徑）。
//   4. 樞紐的名稱與路徑寫在下面的 `HUB`，**不要在頁面裡再寫一次字面值**——那正是上面那批
//      漂移的成因（同一個 `/deities/` 曾同時叫「神明圖譜」與「神明」）。
//   5. **麵包屑不含首頁。** 全站 95% 的頁本來就沒有，首頁已由每頁的站徽與 nav 連過去；
//      只有 `/qiugian/*` 與 `/line/` 那幾頁畫面上多一層「神酷」而 JSON-LD 沒有——
//      那本身就是漂移的一種，統一成「不含」。
import { breadcrumb } from './seo.ts';

export type Crumb = { name: string; path: string };

/** 站內路徑正規化：一律補尾斜線（與 build `format:'directory'` 的 canonical／sitemap 對齊）。 */
export function crumbHref(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

/** 樞紐（各頁型的父層）。名稱以「重構前多數頁面實際在用的字」為準，避免動到既有內鏈錨文字。 */
export const HUB = {
  temples: { name: '廟宇', path: '/temples/' },
  templesNearby: { name: '附近的廟', path: '/temples/nearby/' },
  poems: { name: '籤詩', path: '/poems/' },
  systems: { name: '籤系', path: '/systems/' },
  allusions: { name: '典故', path: '/allusions/' },
  medicineSlips: { name: '保生大帝藥籤', path: '/medicine-slips/' },
  qiugian: { name: '求籤', path: '/qiugian/' },
  jiaobei: { name: '擲筊判讀', path: '/jiaobei/' },
  deities: { name: '神明圖譜', path: '/deities/' },
  scenarios: { name: '拜什麼神', path: '/scenarios/' },
  trades: { name: '行業守護神', path: '/trades/' },
  compare: { name: '神明比較', path: '/compare/' },
  festivals: { name: '節日', path: '/festivals/' },
  festivalsLocal: { name: '地方宗教慶典', path: '/festivals/local/' },
  practices: { name: '拜拜習俗', path: '/practices/' },
  events: { name: '民俗活動', path: '/events/' },
  guides: { name: '主題文章', path: '/guides/' },
  artifacts: { name: '民俗文物', path: '/artifacts/' },
  almanac: { name: '農民曆', path: '/almanac/' },
  yiji: { name: '宜忌事項', path: '/almanac/yiji/' },
  zodiac: { name: '生肖', path: '/zodiac/' },
  goodDays: { name: '看日子', path: '/good-days/' },
  line: { name: 'LINE 官方帳號', path: '/line/' },
  about: { name: '關於與勘誤', path: '/about/' },
} as const satisfies Record<string, Crumb>;

/**
 * BreadcrumbList JSON-LD。刻意**只在這裡**呼叫 `seo.ts` 的 `breadcrumb()`——
 * 頁面一律走 `Base.astro` 的 `crumbs` prop，不直接接觸 JSON-LD 產生器。
 */
export function crumbLd(trail: Crumb[]) {
  return breadcrumb(trail.map((c) => ({ name: c.name, path: crumbHref(c.path) })));
}

/**
 * 廟宇頁 ancestry：廟宇 › 縣市 › 鄉鎮市區 › 廟名。
 * 🔴 縣市／鄉鎮兩層**只有在該區域頁真的產得出來時才加**——`/temples/region/[county]/[town]`
 *    的 getStaticPaths 用的正是同一組 `templeCounty()`／`templeTownship()` 推導，
 *    所以「這間廟推得出縣市／鄉鎮」⇔「那一頁存在」，不會產生 404 的 item。
 */
export function templeCrumbs(
  county: { name: string; slug: string } | null | undefined,
  township: { name: string } | null | undefined,
  temple: { id: string; name: string },
): Crumb[] {
  const trail: Crumb[] = [HUB.temples];
  if (county) trail.push({ name: county.name, path: `/temples/region/${county.slug}/` });
  if (county && township) trail.push({ name: township.name, path: `/temples/region/${county.slug}/${township.name}/` });
  trail.push({ name: temple.name, path: `/temples/${temple.id}/` });
  return trail;
}

/**
 * 農民曆日期頁 ancestry。
 * ⚠️ 今天的日期頁 `canonical` 指回 `/almanac/`（見 `almanac/[date].astro`），
 *    所以它與 `/almanac/` 共用同一條「只有農民曆」的 trail——否則 BreadcrumbList 的末層
 *    會指向一個被 canonical 掉的網址（重構前 `/almanac/` 正是這樣，末層寫的是當日日期頁）。
 */
export function almanacCrumbs(date: string, isToday: boolean): Crumb[] {
  return isToday ? [HUB.almanac] : [HUB.almanac, { name: date, path: `/almanac/${date}/` }];
}
