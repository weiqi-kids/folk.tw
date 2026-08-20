// render 不變量的 **runner**：跑一張登錄表（scripts/invariants/index.mjs）。
//
// 🔴 這支存在的理由（2026-08-19 重構）：check-rendered.mjs 曾是 1,573 行、近 180 個
//    commit 裡被改 52 次的全 repo 最大改動磁鐵。42 個斷言單元擠在三個 top-level `for`
//    與 12 個裸 `{ }` 匿名區塊裡；裸區塊不能回傳，所以計數靠 11 個 `globalThis.__*`
//    偷渡；成功訊息是一個內插 40 個運算式的 3,000 字樣板——**新增一條不變量必須同時
//    動迴圈、動 module-level let、動那個樣板**，任一步漏了都不會有紅燈。
//    現在：一條不變量＝登錄表裡的一個物件，斷言與它自己的摘要句寫在一起。
//
// ── runner 負責的事 ──────────────────────────────────────────────────────
//  1. 建 ctx（見 render-context.mjs），共享索引只算一次。
//  2. **依 `source` 分組，每種頁型只走一趟**：讀檔一次 → 建一個 Page → 依登錄表順序
//     呼叫該組所有 adapter。這是保住「11 條斷言 1 次 I/O」的機制，也是把原本
//     重複讀 4~5 次 dist/temples/*/index.html 的四個走訪合併掉的機制。
//  3. Page 的剖析 lazy + 快取（title/description/section）。
//  4. 拓撲排序 dependsOn；--only／--list。
//  5. 把各 adapter 的 summary() join 起來，取代那個 3,000 字樣板。
//
// ── 🔴 靜默失效的機械防線 ────────────────────────────────────────────────
//  `page.section('temple-qifu')` 打錯一個字，那條不變量就**永遠通過而 CI 全綠**。
//  本檔記過兩次同類事故（`class="fdate"` 寫成巢狀選擇器會恆為 0；1f 用全頁 includes
//  會讓雙向的一半恆為真）。所以 runner 統計每個 section 名的命中率：
//  **請求過但一次都沒命中 → 直接違規**。這條擋的不是資料錯，是檢查本身壞掉。
import { buildContext } from './render-context.mjs';

/** 一條不變量的累加器：取代原本的 module-level let 與 globalThis.__*。 */
class Acc {
  constructor(id, sink) {
    this.id = id;
    this._sink = sink;
    this._counts = new Map();
    /** adapter 自用的自由狀態（Map/Set 等；原本散在模組層的那些）。 */
    this.state = {};
  }
  violate(message) { this._sink.push({ id: this.id, message }); }
  count(key, n = 1) { this._counts.set(key, (this._counts.get(key) ?? 0) + n); }
  get(key) { return this._counts.get(key) ?? 0; }
}

const EMPTY_ACC = { get: () => 0, state: {} };

/** runner 交給 adapter 的「一頁」：全文 + lazy 快取的剖析結果。 */
class Page {
  constructor(file, html, sectionStats) {
    this.file = file;
    this.html = html;
    this._sections = new Map();
    this._title = undefined;
    this._description = undefined;
    this._sectionStats = sectionStats;
  }
  /** `dist/temples/x/index.html` → `/temples/x/index.html` */
  get route() { return this.file.slice('dist'.length) || '/'; }
  title() {
    if (this._title === undefined) this._title = this.html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
    return this._title;
  }
  description() {
    if (this._description === undefined) {
      this._description = this.html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
    }
    return this._description;
  }
  /**
   * 切出 `<section class="name" …>…</section>` 的內文；找不到回 undefined。
   * 🔴 有區塊就**不准**退回全頁 includes：nav／頁尾每頁都渲染一堆連結，
   *    全頁比對會讓雙向的「不應出現」那半邊恆為真＝gate 靜默失效。
   */
  section(name) {
    if (this._sections.has(name)) return this._sections.get(name);
    const found = this.html.match(new RegExp(`<section class="${name}"[^>]*>([\\s\\S]*?)</section>`))?.[1];
    this._sections.set(name, found);
    const stat = this._sectionStats.get(name) ?? { hit: 0, miss: 0 };
    if (found === undefined) stat.miss += 1; else stat.hit += 1;
    this._sectionStats.set(name, stat);
    return found;
  }
}

/** 每種走訪：要跑哪些 entity、entity 對應哪個產物、產物不存在時怎麼辦。 */
function sourceSpecs(ctx) {
  const { DIST } = ctx;
  function* townPageFiles(dir) {
    if (!ctx.exists(dir)) return;
    for (const name of ctx.readdir(dir)) {
      const p = ctx.join(dir, name);
      if (ctx.stat(p).isDirectory()) yield* townPageFiles(p);
      else if (name === 'index.html' && p.split('/').length === 6) yield p; // dist/temples/region/<slug>/<town>/index.html
    }
  }
  function walkOutputs(dir, out) {
    for (const entry of ctx.readdir(dir, { withFileTypes: true })) {
      const path = ctx.join(dir, entry.name);
      if (entry.isDirectory()) walkOutputs(path, out);
      else if (entry.name.endsWith('.html') || entry.name === 'llms-full.txt') out.push(path);
    }
    return out;
  }
  return {
    temples: {
      owner: 'temple/lingqian',
      entities: () => ctx.data.temples,
      fileOf: (t) => `${DIST}/temples/${t.id}/index.html`,
      onMissing: (t, acc) => {
        acc.violate(`廟頁未建置：${t.id}（temples.json 有此廟但 dist 無頁）`);
        return true; // 計入頁尾「其中 N 間廟頁未建置」
      },
    },
    deities: {
      owner: 'deity/shengdan-title',
      // draft（如 sheshen：聖誕待查）在 prod 不發佈頁，正確地不驗——與 queries.publishable() 一致。
      entities: () => ctx.data.deities.filter((d) => !d.draft),
      fileOf: (d) => `${DIST}/deities/${d.id}/index.html`,
      onMissing: (d, acc) => { acc.violate(`神明頁未建置：${d.id}`); },
    },
    festivals: {
      owner: 'festival/skeleton',
      entities: () => ctx.data.festivals,
      fileOf: (f) => `${DIST}/festivals/${f.slug}/index.html`,
      onMissing: (f, acc) => { acc.violate(`節日頁未建置：${f.slug}`); },
    },
    // 習俗頁（2026-08-20 加）：辭典引文的逐字與掛源驗收需要走訪這一批產物。
    practices: {
      owner: 'practice/th-dict',
      entities: () => ctx.data.practices.filter((x) => !x.draft),
      fileOf: (x) => `${DIST}/practices/${x.id}/index.html`,
      onMissing: (x, acc) => { acc.violate(`習俗頁未建置：${x.id}`); },
    },
    poems: {
      owner: 'poem/share-card',
      entities: () => ctx.data.poems.filter((p) => !p.draft),
      fileOf: (p) => `${DIST}/poems/${p.id}/index.html`,
      onMissing: (p, acc) => { acc.violate(`籤詩頁未建置：${p.id}`); },
    },
    towns: {
      owner: 'town/lead-count',
      entities: () => [...townPageFiles(ctx.join(DIST, 'temples', 'region'))],
      fileOf: (file) => file,
      onMissing: null,
    },
    zodiac: {
      owner: 'zodiac/taisui-shrine',
      entities: () => (ctx.exists(`${DIST}/zodiac`) ? ctx.readdir(`${DIST}/zodiac`) : []),
      fileOf: (dir) => `${DIST}/zodiac/${dir}/index.html`,
      onMissing: null, // 產物不存在＝正確地不驗（原行為）
    },
    // 時事祈福後續發展（原本是**另一支獨立行程** check-topical-followup-render.mjs，
    // 由 package.json 的 `&&` 串在後面——那個第二段很容易被忽略，且它自己複製了一份
    // Astro 跳脫規則的副本。結構上它本來就是標準 adapter，故併進同一張登錄表。
    topical: {
      owner: 'topical/followup-timeline',
      entities: () => ctx.data.topical.filter((item) => !item.mergedInto),
      fileOf: (item) => ctx.join(DIST, 'qiugian', 'blessing', item.id, 'index.html'),
      onMissing: (item, acc) => { acc.violate(`${item.id}：頁面未建置`); },
    },
    // 全站輸出：**一趟**同時餵不變量 18（籤系 hub 死連結／pagefind 屬性，掃 .html 與
    // llms-full.txt）與 19①（正文圖片覆蓋，只看 index.html）。原本是兩份幾乎相同的
    // walk() 遞迴、共讀 ≈20,100 次；現在一次。
    outputs: {
      owner: 'sitewide/system-hub-links',
      entities: () => walkOutputs(DIST, []),
      fileOf: (file) => file,
      onMissing: null,
    },
  };
}

function resolveSelection(registry, only) {
  const byId = new Map(registry.map((inv) => [inv.id, inv]));
  const byLegacy = new Map();
  for (const inv of registry) for (const legacy of inv.legacyIds ?? []) {
    if (!byLegacy.has(legacy)) byLegacy.set(legacy, []);
    byLegacy.get(legacy).push(inv.id);
  }
  const wanted = new Set();
  const warnings = [];
  for (const token of only) {
    if (byId.has(token)) { wanted.add(token); continue; }
    const mapped = byLegacy.get(token);
    if (mapped) { for (const id of mapped) wanted.add(id); continue; }
    throw new Error(`--only：查無不變量 "${token}"（跑 --list 看清單）`);
  }
  // 拓撲：把 dependsOn 的上游拉進來，並明說「因為誰而被拉進來」。
  // 🔴 這不是方便功能：不變量 11 原本明文靠不變量 4 報「神明頁未建置」（L1198 註解），
  //    單獨跑 11 會讓那件事**靜默消失**——看起來全綠、實際少驗一件事。
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of [...wanted]) {
      for (const dep of byId.get(id)?.dependsOn ?? []) {
        if (!wanted.has(dep)) {
          wanted.add(dep);
          warnings.push(`--only：已自動拉入上游不變量 ${dep}（${byId.get(id).id} 依賴它）`);
          grew = true;
        }
      }
    }
  }
  return { selected: registry.filter((inv) => wanted.has(inv.id)), warnings };
}

export async function runInvariants(registry, argv = []) {
  if (argv.includes('--list')) {
    const width = Math.max(...registry.map((i) => i.id.length));
    for (const inv of registry) {
      const legacy = (inv.legacyIds ?? []).join(',') || '-';
      console.log(`${inv.id.padEnd(width)}  ${String(inv.source).padEnd(10)}  ${legacy.padEnd(8)}  ${inv.title}`);
    }
    return 0;
  }
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? String(argv[onlyIdx + 1] ?? '').split(',').filter(Boolean) : [];
  let selected = registry;
  let warnings = [];
  if (only.length) {
    try { ({ selected, warnings } = resolveSelection(registry, only)); }
    catch (error) { console.error(`✗ ${error.message}`); return 2; }
  }
  const ctx = await buildContext();
  for (const w of warnings) console.warn(`  ⚠️ ${w}`);

  const violations = [];
  const accs = new Map(selected.map((inv) => [inv.id, new Acc(inv.id, violations)]));
  ctx.accOf = (id) => accs.get(id) ?? EMPTY_ACC;
  const sectionStats = new Map();
  const specs = sourceSpecs(ctx);
  const missingCounts = new Map();
  // 「這趟走訪實際比對了幾個產物」——原本是 module-level 的 `checked`，被三條不同的
  // 不變量共用（1、A-1、1c 的 `checked - festTemples`）。由 runner 出，adapter 不各自算。
  const visited = new Map();
  ctx.visitedOf = (source) => visited.get(source) ?? 0;

  for (const inv of selected) inv.initAcc?.(accs.get(inv.id), ctx);

  // ── 走訪型：依 source 分組，每組只讀一趟 ────────────────────────────────
  for (const [name, spec] of Object.entries(specs)) {
    const group = selected.filter((inv) => inv.source === name);
    if (group.length === 0) continue;
    const ownerAcc = accs.get(spec.owner) ?? accs.get(group[0].id);
    let missing = 0;
    for (const entity of spec.entities()) {
      const file = spec.fileOf(entity);
      if (!ctx.exists(file)) {
        if (spec.onMissing && spec.onMissing(entity, ownerAcc)) missing += 1;
        continue;
      }
      const page = new Page(file, ctx.read(file), sectionStats);
      visited.set(name, (visited.get(name) ?? 0) + 1);
      for (const inv of group) await inv.check(entity, page, ctx, accs.get(inv.id));
    }
    missingCounts.set(name, missing);
  }

  // ── singleton／none 型：依登錄表順序執行 ────────────────────────────────
  const singletonPages = new Map();
  for (const inv of selected) {
    const acc = accs.get(inv.id);
    if (inv.source === 'singleton') {
      for (const file of inv.singletons) {
        if (!ctx.exists(file)) { inv.onMissing?.(file, acc, ctx); continue; }
        // 同一個 singleton 可能有多個消費者（/about/ 有兩條），只讀一次。
        let page = singletonPages.get(file);
        if (!page) { page = new Page(file, ctx.read(file), sectionStats); singletonPages.set(file, page); }
        await inv.check(file, page, ctx, acc);
      }
    } else if (inv.source === 'none') {
      await inv.run?.(ctx, acc);
    }
  }
  for (const inv of selected) inv.finalize?.(accs.get(inv.id), ctx);

  // 🔴 檢查本身壞掉的偵測：某個 section 名被問過但一次都沒命中＝多半是打錯字，
  //    而打錯字的後果是那條不變量永遠通過。這裡把它變成看得見的紅燈。
  for (const [name, stat] of sectionStats) {
    if (stat.hit === 0 && stat.miss > 0) {
      // 🔴 排在最前面：這一條說的是「檢查本身壞了」，比後面幾千條「某頁不符」重要，
      //    而失敗輸出只印前 30 條——排在後面等於看不到。
      violations.unshift({
        id: 'runner/section-selector',
        message: `區塊選擇器可疑：class="${name}" 在 ${stat.miss} 個頁面裡一次都沒命中`
          + `（選擇器打錯會讓該條不變量恆為真而 CI 全綠，故直接擋下）`,
      });
    }
  }

  if (violations.length === 0) {
    const lines = buildSummaries(selected, accs, ctx);
    // --only 選到的全是「原本就不進成功摘要」的條時，不能什麼都不印——
    // 「沒輸出」與「沒跑到」對人眼是一樣的，而那正是本次重構要消滅的那類訊號缺失。
    if (lines.length === 0) {
      lines.push(`✓ render 不變量檢查通過：已跑 ${selected.length} 條（${selected.map((i) => i.id).join('、')}），這些條原本就不進成功摘要。`);
    }
    for (const line of lines) console.log(line);
    return 0;
  }
  console.error(`✗ render 不變量檢查失敗：${violations.length} 處與資料不符（廟頁求籤區塊）。`);
  const missingTemples = missingCounts.get('temples') ?? 0;
  if (missingTemples) console.error(`  （其中 ${missingTemples} 間廟頁未建置）`);
  for (const v of violations.slice(0, 30)) console.error(`  ✗ [${v.id}] ${v.message}`);
  if (violations.length > 30) console.error(`  …另有 ${violations.length - 30} 處`);
  return 1;
}

/** 摘要群組：一組 = 一行輸出。prefix/suffix 由群組定義，句子由各條 adapter 自己出。 */
const SUMMARY_GROUPS = {
  rendered: { prefix: '✓ render 不變量檢查通過：', suffix: '。' },
  'topical-followup': { prefix: '✓ 時事祈福後續發展已雙向驗證：', suffix: '' },
};

function buildSummaries(selected, accs, ctx) {
  const lines = [];
  for (const [groupId, group] of Object.entries(SUMMARY_GROUPS)) {
    let text = '';
    for (const inv of selected) {
      if ((inv.summaryGroup ?? 'rendered') !== groupId) continue;
      if (inv.summary === false) continue;
      if (typeof inv.summary !== 'function') {
        // 「忘了寫」與「刻意不寫」不可以長得一樣：沒有摘要必須顯式宣告 summary:false。
        throw new Error(`不變量 ${inv.id} 未宣告 summary（要嘛給函式，要嘛顯式寫 summary: false）`);
      }
      const fragment = inv.summary(accs.get(inv.id), ctx);
      if (fragment == null) continue;
      text = text ? text + (inv.summarySep ?? '；') + fragment : fragment;
    }
    if (text) lines.push(group.prefix + text + group.suffix);
  }
  return lines;
}
