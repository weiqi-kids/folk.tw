// render 不變量的**共享 context**：資料載入、跨條共用的衍生索引、以及 I/O 原語。
//
// 🔴 為什麼集中在這裡（2026-08-19 重構）：原本 check-rendered.mjs 在模組層散著 25 個
//    `let` 計數器與若干衍生索引，而同一份統計被算兩次（鄉鎮廟數：不變量 2 用
//    `${slug}/${town}` 當鍵、不變量 3 用 `縣市名+鄉鎮名` 當鍵，各自全表掃一次），
//    「同一農曆日期的節日歸屬」更是同一條規則的**兩份實作**（5b 的 ownsList 與
//    7③ 的 owner map）——兩份實作就是漂移的起點，改一邊不改另一邊沒有東西會發現。
//    現在一律由這支算一次，adapter 只讀不算。
//
// ⚠️ adapter **不得** import 'node:fs'：檔案存在性與讀檔一律走這裡的 exists/read，
//    否則「每種頁型只走一趟」這件事會在某次「順手加一條」時安靜退化成 25 趟。
//
// ⛔ **這裡沒有 `ctx.lib` 那個袋子了（2026-08-21 收掉）**，別再加回來。
//    它曾裝 21 個名字，其中 9 個從來沒有人用 `ctx.lib.` 取過（templeCounty／templeTownship
//    在 adapter 端使用次數是 0），而 escText／escAttr／num／commonTempleName／fullWidth／
//    SERP_TITLE_MAX_WIDTH／TEMPLE_TITLE_DEITY_MAX_WIDTH 這 7 個 adapter 本來就**直接 import**
//    ——同一個符號兩條到達路徑，讀 adapter 的人得先確認手上這條是哪一條。
//    刪掉它是 pass-through 級的改動：Node 的 module cache 讓直接 import 零成本，
//    「共用同一支 lib」這件事由 import 路徑保證，不需要一個袋子代為轉手。
//    ✅ 真正在賺錢的是 `ctx.derived`（消滅重複計算）與 `ctx.exists/read/readdir/stat`
//       （機械地保住「每種頁型只走一趟」）——那兩個留著，別跟這件事混為一談。
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { FESTIVAL_OG_SLUGS } from '../../src/lib/festival-og.ts';
import { releasedItems } from '../../src/lib/release-schedule.ts';
// 基準日的唯一入口（見該檔檔頭）。這裡要的是「**手上這份 dist** 是用哪一天建的」，
// 所以是 distBuildDate 而不是 buildDate——單獨對著昨天的 dist 跑 gate 時，兩者不同。
import { distBuildDate } from '../../src/lib/build-date.ts';

const require = createRequire(import.meta.url);

/** 本 context 讀哪些資料檔（repo 相對路徑）。預設走 require，測試可整組換掉。 */
const defaultLoad = (path) => require(`../../${path}`);

export const DIST = 'dist';
export const SECTION_MARK = 'class="temple-lingqian"';
// answer-first 摘要（全體廟頁必有，speakable 抓取對象）與 FAQPage 結構化資料（全體廟頁必有，
// 因「在哪裡」一題恆有答＝全站 100% 具 district）。兩者皆為模板層改動、一次生效，逐頁全驗。
export const SUMMARY_MARK = 'class="summary"';
export const FAQ_MARK = '"@type":"FAQPage"';

function normalize(j) {
  if (Array.isArray(j)) return j;
  if (Array.isArray(j.temples)) return j.temples;
  if (Array.isArray(j.deities)) return j.deities;
  return Object.values(j);
}

/**
 * @param {{ load?: (path: string) => unknown }} [options]
 *   `load` 是資料來源的注入點（預設 require 真實的 src/data/*.json）。
 *   🔴 為什麼要能注入（2026-08-21）：在此之前 buildContext 硬讀那 19 支 JSON，
 *      所以 42 條不變量 adapter **沒有一條能在單元層被測**——要驗一條斷言會不會抓到
 *      某種壞資料，唯一方法是把壞資料寫進真的 temples.json 再跑 20 分鐘的 build。
 *      現在餵假資料＋假 HTML 就能直接跑 adapter，見 render-context.test.mjs。
 */
export async function buildContext(options = {}) {
  const load = options.load ?? defaultLoad;
  // 地區解析一律用頁面同一支 lib，不在本檔重寫規則（初版自寫正則，12 處對不上）。
  const { templeCounty, templeTownship } = await import('../../src/lib/temple-region.ts');

  // 🔴 基準日要用「這次 build 當時的台北日期」，不是 gate 執行當下的（2026-08-19 假紅燈：
  //    build 台北 23:45 開始、00:11 跑 gate，兩間廟的 meta description 被判未含祭典句，
  //    因為農曆七月初七的下一次從今年變成明年）。判定收進 src/lib/build-date.ts，
  //    本檔不再自己讀戳記檔、也不再自己算一份 Intl.DateTimeFormat。
  const TODAY = distBuildDate().iso;
  const temples = normalize(load('src/data/temples.json'));
  const deities = normalize(load('src/data/deities.json'));
  const poems = normalize(load('src/data/poems.json'));
  const divinationSystems = normalize(load('src/data/divination-systems.json'));
  const festivals = releasedItems(normalize(load('src/data/festivals.json')), TODAY);
  const imagePriority = load('src/data/image-priority.json');
  // 不變量 5d 用：判斷某套儀式的主場節日是哪一頁（practices.json 的 home_festival）。
  const practices = normalize(load('src/data/practices.json'));
  // 不變量 5e 用：民俗活動的文資登錄明細該印在哪一頁（events.json 的 heritage.home_festival）。
  const events = normalize(load('src/data/events.json'));
  const localCelebrations = load('src/data/local-celebrations.json');
  const artifacts = load('src/data/artifacts.json');
  // 不變量 artifact/entry-page 用：文物辭條獨立頁的台帳（試點清單，非全量）。
  const artifactPages = load('src/data/artifact-pages.json');
  const goodDays = load('src/data/good-days.json');
  const votes = load('src/lib/almanac/rules/votes.json');
  const encourage = load('src/data/qian-encourage.json');
  const personas = load('src/data/poem-personas.json');
  const topical = load('src/data/topical.json');

  const deityById = new Map(deities.map((d) => [d.id, d]));
  const systemHrefById = new Map(divinationSystems.map((s) => [s.id, s.hub ?? `/systems/${s.id}/`]));
  const systemHrefOf = (id) => systemHrefById.get(id) ?? `/systems/${id}/`;

  // ── 不變量 1f 的資料（2026-08-05）：廟宇頁祈福區塊的反查表 ──────────────────────
  // 與 src/pages/temples/[id].astro 同一套反查（scenarios 的 patrons[].deity_ref、
  // concerns 的 deities[]），本檔不自行重寫對映規則。
  // 🔴 必須比照頁面的 publishable() 過濾，否則 gate 與頁面看到的資料集不同＝誤報。
  // 頁面走 getDeities()/getScenarios()＝`publishable(e, true)`：draft 排除，
  // **且 prod 下無 sources 者也排除**（見 src/lib/queries.ts:13-20）。本檔讀的是原始 JSON，
  // 不套這層就會對「頁面根本拿不到的神明」要求渲染。
  // ⚠️ 既有的 expectedSystems()（不變量 1）有同樣的潛在假設，刻意不動它（不在計畫範圍）。
  const publishableEntry = (e) => !e.draft && (e.sources ?? []).length > 0;
  const scenariosData = normalize(load('src/data/scenarios.json')).filter(publishableEntry);
  const concernsData = normalize(load('src/data/concerns.json'));
  const scenariosByDeity = new Map();
  for (const s of scenariosData) {
    for (const p of s.patrons ?? []) {
      (scenariosByDeity.get(p.deity_ref) ?? scenariosByDeity.set(p.deity_ref, []).get(p.deity_ref)).push(s.id);
    }
  }
  const concernsByDeity = new Map();
  for (const c of concernsData) {
    for (const d of c.deities ?? []) {
      (concernsByDeity.get(d) ?? concernsByDeity.set(d, []).get(d)).push(c.id);
    }
  }
  const allScenarioIds = scenariosData.map((s) => s.id);
  const allConcernIds = concernsData.map((c) => c.id);

  // 與 src/pages/temples/[id].astro 同一套判定：main_deity_ref 需對映到真實神明節點、
  // 該神明有 divination_systems 才顯示求籤區塊，連向其每個籤系。
  const expectedSystems = (t) => {
    // 廟宇層 divination_systems 覆寫優先，與 [id].astro 同步（2026-08-14）
    if ((t.divination_systems ?? []).length > 0) return t.divination_systems;
    if (!t.main_deity_ref || !deityById.has(t.main_deity_ref)) return [];
    return deityById.get(t.main_deity_ref).divination_systems ?? [];
  };
  /** 頁面的 refOk：拿得到、且 publishable 的主祀神節點（拿不到回 null）。 */
  const publishableDeityOf = (ref) => {
    const raw = ref ? deityById.get(ref) : null;
    return raw && publishableEntry(raw) ? raw : null;
  };

  // ── 鄉鎮廟數索引：不變量 2（`slug/鄉鎮`）與 3（`縣市名+鄉鎮名`）**同一份統計**，
  //    原本各掃一次全表、各存一份。這裡掃一次、出兩種鍵。
  const townBySlug = new Map();
  const townByName = new Map();
  for (const t of temples) {
    const c = templeCounty(t.district), tw = templeTownship(t.district);
    if (!c || !tw) continue;
    const k1 = `${c.slug}/${tw.name}`;
    townBySlug.set(k1, (townBySlug.get(k1) ?? 0) + 1);
    const k2 = c.name + tw.name;
    townByName.set(k2, (townByName.get(k2) ?? 0) + 1);
  }
  /** 一間廟的鄉鎮歸屬與該鄉鎮廟數；解析不出縣市/鄉鎮回 null（＝正確地不驗）。 */
  const townOf = (t) => {
    const c = templeCounty(t.district), tw = templeTownship(t.district);
    if (!c || !tw) return null;
    return { county: c, township: tw, total: townBySlug.get(`${c.slug}/${tw.name}`) ?? 0 };
  };

  // ── 「同一農曆日期的節日歸屬」：festivals.json 中同一 lunar_date **先出現者**擁有名單。
  //    5b 與 7③ 原本各有一份實作（一個用 festivals.find、一個用 Map），語意相同但會各自漂。
  const festivalOwnerByLunarDate = new Map();
  for (const f of festivals) {
    if (f.lunar_date && !festivalOwnerByLunarDate.has(f.lunar_date)) {
      festivalOwnerByLunarDate.set(f.lunar_date, f.slug);
    }
  }
  const ownsLunarDateList = (f) => festivalOwnerByLunarDate.get(f.lunar_date) === f.slug;

  // 不變量 7②③：地方宗教慶典 → 廟／節日的反查（原本各自在區塊內現算）。
  const localByTemple = new Map();
  for (const x of localCelebrations.items) {
    if (!x.temple_ref) continue;
    if (!localByTemple.has(x.temple_ref)) localByTemple.set(x.temple_ref, []);
    localByTemple.get(x.temple_ref).push(x);
  }
  // ⚠️ 這一段是 src/pages/festivals/[slug].astro 的鏡像，判準要一模一樣，否則 gate 會
  //    拿一份與頁面不同的期望值去驗（過與不過都沒有意義）。
  const disownedLcIds = new Set(
    load('src/data/local-celebration-cases.json').items
      .filter((x) => x.date_disown)
      .map((x) => x.lc_id),
  );
  const localByFestival = new Map();
  for (const x of localCelebrations.items) {
    if (x.calendar !== 'lunar') continue;
    // 月日不屬於這一筆的，不做同日歸屬（判定入口＝src/lib/local-celebration-cycle.ts）。
    if (disownedLcIds.has(x.id)) continue;
    const slug = festivalOwnerByLunarDate.get(x.date);
    if (!slug) continue;
    if (!localByFestival.has(slug)) localByFestival.set(slug, []);
    localByFestival.get(slug).push(x);
  }

  // 代表圖的第三個消費者（1i／4d／10 同一份），一次算好。
  const allEntityImages = [...temples, ...deities].filter((x) => x.image?.src).map((x) => x.image);

  return {
    DIST,
    TODAY,
    data: {
      temples, deities, poems, divinationSystems, festivals, practices, events,
      localCelebrations, artifacts, artifactPages, goodDays, imagePriority, votes, encourage, personas, topical,
      scenariosData, concernsData,
    },
    derived: {
      deityById, systemHrefOf, expectedSystems, publishableEntry, publishableDeityOf,
      // 月日歸屬錯誤、全站不得做日期陳述的地方慶典（判定來源＝local-celebration-cases.json 的 date_disown）。
      disownedLcIds,
      scenariosByDeity, concernsByDeity, allScenarioIds, allConcernIds,
      townBySlug, townByName, townOf,
      festivalOwnerByLunarDate, ownsLunarDateList, localByTemple, localByFestival,
      allEntityImages,
      festivalOgSlugs: new Set(FESTIVAL_OG_SLUGS),
    },
    marks: { SECTION_MARK, SUMMARY_MARK, FAQ_MARK },
    // ── I/O 原語（adapter 只准用這三個，不得自行 import fs）────────────────
    exists: (path) => existsSync(path),
    read: (path) => readFileSync(path, 'utf8'),
    readdir: (path, options) => readdirSync(path, options),
    stat: (path) => statSync(path),
    join,
    /**
     * sharp 的薄包裝：唯一需要 async 的斷言（5i 的 1200×675）走這裡。
     * 🔴 sharp 刻意 lazy require：它是原生模組、載入成本高，而絕大多數 adapter 用不到它。
     *    在模組頂端 require 會讓「不碰圖片的單元測試」也被迫扛一個原生相依。
     */
    imageSize: async (path) => {
      const metadata = await require('sharp')(path).metadata();
      return { width: metadata.width, height: metadata.height };
    },
  };
}
