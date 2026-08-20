// render-context（不變量 adapter 的共享 context）的 fixture 測試 —— 假資料＋假 HTML，秒級。
//
// 🔴 為何存在（2026-08-21）：在 `buildContext()` 可注入資料來源**之前**，它用 createRequire
//    硬讀 19 支 `src/data/*.json`——所以那 42 條不變量 adapter **沒有一條能在單元層被驗**。
//    想知道「某條斷言真的抓得到這種壞資料嗎」，唯一辦法是把壞資料寫進真的 temples.json、
//    跑 20 分鐘的 build:release、再看 check:rendered 紅不紅。代價太高，於是沒有人做，
//    於是「gate 自己壞掉」只能靠 runner 那條 section 命中率去猜（見 invariant-runner 檔頭）。
//    現在餵一份三間廟的假資料就能直接跑 adapter，**雙向都驗得到**。
//
// 🔴 這支驗的是「不變量真的會抓／真的不會誤抓」，不是「adapter 的實作長怎樣」：
//    每一條都同時給**該紅的輸入**與**該綠的輸入**。只驗該綠的那半邊等於沒驗——
//    一條永遠回 true 的斷言可以通過任何「只驗正例」的測試（那正是 runner 檔頭記的兩次事故）。
//
// 跑法：node --experimental-strip-types scripts/lib/render-context.test.mjs
//   （--experimental-strip-types 是因為 render-context 會 import src/lib/*.ts）
import { buildContext } from './render-context.mjs';
import { Page } from './page.mjs';
import { templeLingqian, templeTownContext } from '../invariants/temple.mjs';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${name}`); };

// ── 假資料 ────────────────────────────────────────────────────────────────
// 每一支 buildContext 會讀的 JSON 都要在這裡有個形狀（空的也要），否則衍生索引那幾圈
// 會在 `.items` 上炸開。新增資料集時這裡會紅——那是特意的：它逼人來看一眼新資料的形狀。
const EMPTY = {
  'src/data/temples.json': [],
  'src/data/deities.json': [],
  'src/data/poems.json': [],
  'src/data/divination-systems.json': [],
  'src/data/festivals.json': [],
  'src/data/image-priority.json': { temples: [] },
  'src/data/practices.json': [],
  'src/data/events.json': [],
  'src/data/local-celebrations.json': { items: [] },
  'src/data/artifacts.json': { categories: [] },
  'src/data/artifact-pages.json': { entries: [] },
  'src/data/good-days.json': { items: [] },
  'src/lib/almanac/rules/votes.json': {},
  'src/data/qian-encourage.json': {},
  'src/data/poem-personas.json': {},
  'src/data/topical.json': [],
  'src/data/scenarios.json': [],
  'src/data/concerns.json': [],
  'src/data/local-celebration-cases.json': { items: [] },
};

const ctxOf = (overrides = {}) => {
  const data = { ...EMPTY, ...overrides };
  return buildContext({
    load: (path) => {
      if (!(path in data)) throw new Error(`fixture 沒有 ${path}：新資料集要在 EMPTY 裡補一個形狀`);
      return data[path];
    },
  });
};

/** runner 的 Acc 契約（violate／count／get／state），這裡只留測試要看的部分。 */
const accOf = () => {
  const violations = [];
  const counts = new Map();
  return {
    violations,
    violate: (m) => violations.push(m),
    count: (k, n = 1) => counts.set(k, (counts.get(k) ?? 0) + n),
    get: (k) => counts.get(k) ?? 0,
    state: {},
  };
};

const run = (inv, entity, html, ctx) => {
  const acc = accOf();
  inv.check(entity, new Page('dist/temples/x/index.html', html), ctx, acc);
  return acc;
};

// ── 0) context 本身的契約 ────────────────────────────────────────────────
{
  const ctx = await ctxOf();
  t('TODAY 是 ISO 日（基準日由 src/lib/build-date.ts 出）', /^\d{4}-\d{2}-\d{2}$/.test(ctx.TODAY));
  // 🔴 `ctx.lib` 那個 21 個名字的袋子已於 2026-08-21 收掉（見 render-context.mjs 檔頭）。
  //    adapter 一律直接 import。這一條擋的是「順手又加回來」。
  t('ctx 沒有 lib 袋子（符號一律直接 import）', ctx.lib === undefined);
  t('ctx.derived／I/O 原語仍在（真正在賺錢的那兩個）',
    typeof ctx.derived?.townOf === 'function' && typeof ctx.exists === 'function');
}

// ── 1) 基準日真的被拿去過濾未發佈內容（Task A 的接線） ────────────────────
{
  const ctx = await ctxOf({
    'src/data/festivals.json': [
      { slug: 'past', name: '已發佈', publish_at: '2000-01-01' },
      { slug: 'future', name: '未發佈', publish_at: '2999-01-01' },
      { slug: 'always', name: '無排程' },
    ],
  });
  const slugs = ctx.data.festivals.map((f) => f.slug);
  t('未到 publish_at 的節日不進 ctx（releasedItems 吃的是 TODAY）', !slugs.includes('future'));
  t('已過 publish_at 與無排程的節日都在', slugs.includes('past') && slugs.includes('always'));
}

// ── 2) 不變量 temple/lingqian（原編號 1）：求籤區塊**雙向** ────────────────
// 主祀神有籤系 → 必須渲染區塊且連向每個籤系 hub；沒有籤系 → 必須不渲染。
const LINGQIAN_FIXTURE = {
  'src/data/deities.json': [
    { id: 'mazu', name: '媽祖', sources: [{ url: 'x' }], divination_systems: ['liushi', 'guandi'] },
    { id: 'tudigong', name: '土地公', sources: [{ url: 'x' }], divination_systems: [] },
  ],
  'src/data/divination-systems.json': [
    { id: 'liushi', hub: '/systems/liushi/' },
    { id: 'guandi' }, // 無 hub → systemHrefOf 應退回 /systems/guandi/
  ],
};
const SECTION = '<section class="temple-lingqian">';
{
  const ctx = await ctxOf(LINGQIAN_FIXTURE);
  const mazuTemple = { id: 'a', name: 'A宮', main_deity_ref: 'mazu' };
  const tudiTemple = { id: 'b', name: 'B祠', main_deity_ref: 'tudigong' };

  const ok = run(templeLingqian, mazuTemple,
    `${SECTION}<a href="/systems/liushi/">六十甲子</a><a href="/systems/guandi/">關帝</a></section>`, ctx);
  t('lingqian｜有籤系且區塊與兩個 hub 連結都在 → 不違規', ok.violations.length === 0);

  const missing = run(templeLingqian, mazuTemple, '<main>沒有求籤區塊</main>', ctx);
  t('lingqian｜有籤系卻沒渲染區塊 → 違規',
    missing.violations.length === 1 && missing.violations[0].includes('應顯示求籤區塊'));

  const halfLinked = run(templeLingqian, mazuTemple,
    `${SECTION}<a href="/systems/liushi/">六十甲子</a></section>`, ctx);
  t('lingqian｜區塊在但少連一個籤系 hub → 違規（不是只看區塊有沒有）',
    halfLinked.violations.length === 1 && halfLinked.violations[0].includes('/systems/guandi/'));

  const spurious = run(templeLingqian, tudiTemple, `${SECTION}</section>`, ctx);
  t('lingqian｜無籤系卻渲染了區塊 → 違規（反方向也驗）',
    spurious.violations.length === 1 && spurious.violations[0].includes('不應顯示求籤區塊'));

  const quiet = run(templeLingqian, tudiTemple, '<main>只有本文</main>', ctx);
  t('lingqian｜無籤系且正確不渲染 → 不違規', quiet.violations.length === 0);

  // 廟宇層覆寫優先於主祀神（2026-08-14 與 [id].astro 同步的那條）。
  const override = run(templeLingqian, { ...tudiTemple, divination_systems: ['liushi'] },
    `${SECTION}<a href="/systems/liushi/">六十甲子</a></section>`, ctx);
  t('lingqian｜廟宇層 divination_systems 覆寫主祀神', override.violations.length === 0);
}

// ── 3) 不變量 temple/town-context（原編號 2＋2b）：鎮內廟數脈絡句 ──────────
// 這一條吃的是 ctx.derived 的鄉鎮索引（跨全表統計），正是注入資料才驗得動的東西。
const TAINAN = '台南市中西區忠義路二段84巷';
const TOWN_FIXTURE = {
  'src/data/temples.json': [
    { id: 't1', name: '甲宮', district: TAINAN },
    { id: 't2', name: '乙宮', district: TAINAN },
    { id: 't3', name: '丙宮', district: TAINAN },
    { id: 'lonely', name: '丁宮', district: '澎湖縣七美鄉某路1號' },
    { id: 'nowhere', name: '戊宮', district: '火星' },
  ],
};
const NEARBY_OK = '<section class="nearby">中西區登記在案的宮廟共 3 間</section>';
const DESC = (text) => `<meta name="description" content="${text}">`;
{
  const ctx = await ctxOf(TOWN_FIXTURE);
  const t1 = { id: 't1', name: '甲宮', district: TAINAN };

  t('town｜索引跨全表數對（中西區 3 間）', ctx.derived.townOf(t1).total === 3);

  const ok = run(templeTownContext, t1, DESC('甲宮位於台南市中西區，主祀…') + NEARBY_OK, ctx);
  t('town｜區塊在、間數對、description 非樣板 → 不違規', ok.violations.length === 0);
  t('town｜有鄰居的廟會被計入 checked', ok.get('checked') === 1);

  const noSection = run(templeTownContext, t1, DESC('甲宮位於台南市中西區。'), ctx);
  t('town｜有鄰居卻沒有同鄉鎮區塊 → 違規',
    noSection.violations.length === 1 && noSection.violations[0].includes('應有「同鄉鎮其他宮廟」區塊'));

  const wrongCount = run(templeTownContext, t1,
    DESC('甲宮位於台南市中西區。') + '<section class="nearby">中西區登記在案的宮廟共 2 間</section>', ctx);
  t('town｜脈絡句的間數與資料不符 → 違規（頁面數字漂掉抓得到）',
    wrongCount.violations.length === 1 && wrongCount.violations[0].includes('鄉鎮廟數與資料不符'));

  const boilerplate = run(templeTownContext, t1,
    DESC('甲宮。資料源自內政部全國宗教資訊網。') + NEARBY_OK, ctx);
  t('town｜description 落回通用樣板 → 違規',
    boilerplate.violations.length === 1 && boilerplate.violations[0].includes('落回通用樣板'));

  const noDesc = run(templeTownContext, t1, NEARBY_OK, ctx);
  t('town｜缺 meta description → 違規', noDesc.violations.length === 1);

  // 全鎮只有這一間 → 本來就不該有鄰近區塊，**正確地不驗**（不是「驗過而通過」）。
  const lonely = run(templeTownContext, { id: 'lonely', name: '丁宮', district: '澎湖縣七美鄉某路1號' }, '', ctx);
  t('town｜全鎮只有一間 → 不違規且不計入 checked',
    lonely.violations.length === 0 && lonely.get('checked') === 0);

  // 地址解析不出縣市/鄉鎮 → 同樣正確地不驗（原行為，勿改成「查無就報錯」）。
  const unresolved = run(templeTownContext, { id: 'nowhere', name: '戊宮', district: '火星' }, '', ctx);
  t('town｜地址解析不出鄉鎮 → 不違規', unresolved.violations.length === 0);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 通過 ${pass}／失敗 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
