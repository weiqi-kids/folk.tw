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
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
// 千分位與頁面共用同一支（src/lib/format.ts）：頁面上的「收錄 10,704 間廟宇」與這裡的
// 期望字串必須永遠一致，複製一份規則過來的話遲早會漂。本檔跑在 --experimental-strip-types
// 底下，讀得動 .ts。
import { num } from '../../src/lib/format.ts';
import { commonTempleName } from '../../src/lib/temple-name.ts';
import { seasonalCampaigns } from '../../src/lib/seasonal-campaigns.ts';
import { FESTIVAL_OG_SLUGS, festivalDiscoverImagePath } from '../../src/lib/festival-og.ts';
import { releasedItems } from '../../src/lib/release-schedule.ts';
// 全形寬度與 title 上限：與 src/pages/temples/[id].astro 共用同一支，gate 不重寫規則。
import { fullWidth, SERP_TITLE_MAX_WIDTH, TEMPLE_TITLE_DEITY_MAX_WIDTH } from '../../src/lib/text-width.ts';
// 「Astro 會輸出什麼」一律問 Astro 自己（見該檔檔頭：兩次假紅燈的教訓）。
import { escText, escAttr } from './astro-escape.mjs';

const require = createRequire(import.meta.url);

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

/** 台北當日（單一來源；禁止各條自己再算一次 Intl.DateTimeFormat）。 */
const taipeiToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export async function buildContext() {
  const sharp = require('sharp');
  const { Solar } = require('lunar-javascript');
  // 地區解析一律用頁面同一支 lib，不在本檔重寫規則（初版自寫正則，12 處對不上）。
  const { templeCounty, templeTownship } = await import('../../src/lib/temple-region.ts');
  // 農曆換算同理：用頁面用的同一支 lib（src/lib/lunar-date.ts 刻意零專案內 import）。
  const { lunarDateLabel, isLunarMonthEnd, lunarToNextOccurrence, festivalNextSolar } =
    await import('../../src/lib/lunar-date.ts');
  // 廟宇年度祭典的代表筆挑選與句子生成同理：頁面、OG 卡、本 gate 走同一支 lib。
  const { pickMainFestival, festivalSentence } = await import('../../src/lib/temple-festival.ts');
  const { buildCells, cellKey } = await import('../../src/lib/nearby-grid.ts');

  // 🔴 基準日要用「這次 build 當時的台北日期」，不是 gate 執行當下的。
  //    完整 build 要 20 分鐘，只要跨過台北午夜，頁面用昨天算、gate 用今天重算，
  //    所有「下一次國曆日期」的比對會整批對不上——2026-08-19 就這樣假紅燈擋住部署
  //    （build 台北 23:45 開始、00:11 跑 gate，兩間廟的 meta description 被判未含祭典句，
  //    因為農曆七月初七的下一次從今年變成明年）。
  //    dist/.build-date 由 postbuild 的 gen-build-stamp.mjs 寫入；讀不到才退回當下日期
  //    （例如有人直接跑 gate 而沒 build，那時本來就沒有「build 當時」可言）。
  let TODAY = taipeiToday();
  try {
    const stamped = readFileSync('dist/.build-date', 'utf8').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(stamped)) TODAY = stamped;
  } catch {
    /* 沒有 dist 或沒有戳記就用當下日期 */
  }
  const temples = normalize(require('../../src/data/temples.json'));
  const deities = normalize(require('../../src/data/deities.json'));
  const poems = normalize(require('../../src/data/poems.json'));
  const divinationSystems = normalize(require('../../src/data/divination-systems.json'));
  const festivals = releasedItems(normalize(require('../../src/data/festivals.json')), TODAY);
  const imagePriority = require('../../src/data/image-priority.json');
  // 不變量 5d 用：判斷某套儀式的主場節日是哪一頁（practices.json 的 home_festival）。
  const practices = normalize(require('../../src/data/practices.json'));
  // 不變量 5e 用：民俗活動的文資登錄明細該印在哪一頁（events.json 的 heritage.home_festival）。
  const events = normalize(require('../../src/data/events.json'));
  const localCelebrations = require('../../src/data/local-celebrations.json');
  const goodDays = require('../../src/data/good-days.json');
  const votes = require('../../src/lib/almanac/rules/votes.json');
  const encourage = require('../../src/data/qian-encourage.json');
  const personas = require('../../src/data/poem-personas.json');
  const topical = require('../../src/data/topical.json');

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
  const scenariosData = normalize(require('../../src/data/scenarios.json')).filter(publishableEntry);
  const concernsData = normalize(require('../../src/data/concerns.json'));
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
    require('../../src/data/local-celebration-cases.json').items
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
      localCelebrations, goodDays, imagePriority, votes, encourage, personas, topical,
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
    lib: {
      num, commonTempleName, seasonalCampaigns, FESTIVAL_OG_SLUGS, festivalDiscoverImagePath,
      fullWidth, SERP_TITLE_MAX_WIDTH, TEMPLE_TITLE_DEITY_MAX_WIDTH,
      escText, escAttr, templeCounty, templeTownship,
      lunarDateLabel, isLunarMonthEnd, lunarToNextOccurrence, festivalNextSolar,
      pickMainFestival, festivalSentence, buildCells, cellKey, Solar,
    },
    marks: { SECTION_MARK, SUMMARY_MARK, FAQ_MARK },
    // ── I/O 原語（adapter 只准用這三個，不得自行 import fs）────────────────
    exists: (path) => existsSync(path),
    read: (path) => readFileSync(path, 'utf8'),
    readdir: (path, options) => readdirSync(path, options),
    stat: (path) => statSync(path),
    join,
    /** sharp 的薄包裝：唯一需要 async 的斷言（5i 的 1200×675）走這裡。 */
    imageSize: async (path) => {
      const metadata = await sharp(path).metadata();
      return { width: metadata.width, height: metadata.height };
    },
  };
}
