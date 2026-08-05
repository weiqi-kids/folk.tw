#!/usr/bin/env node
// 完整性檢查與對映率報表（R5、§9.6）
//
// 不讓 build 因 seed 佔位而失敗，改以「報表」呈現未匹配——這是考據紀律工具：
//  - 硬錯誤（exit 1）：會讓頁面壞掉的 dangling ref（籤→典故、籤→籤系、神明→籤系）。
//  - 軟報表（exit 0）：尚未成節點的關係邊 to、活動主神/廟、習俗神明 之對映率（R5）。
//
// 執行：pnpm check:integrity

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (name: string): any[] => JSON.parse(readFileSync(join(root, 'src/data', name), 'utf8'));
// 典故已遷至每篇 md（glob collection）；id = 檔名 stem
const allusionIdsFromDir = (): string[] =>
  readdirSync(join(root, 'src/content/allusions'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));

const poems = load('poems.json');
const allusionIdList = allusionIdsFromDir();
const systems = load('divination-systems.json');
const deities = load('deities.json');
const relations = load('deity-relations.json');
const events = load('events.json');
const practices = load('practices.json');
const temples = load('temples.json');
const trades = load('trades.json');
const scenarios = load('scenarios.json');
const comparisons = load('comparisons.json');
const festivals = load('festivals.json');
const vocabulary: Record<string, { term: string }[]> = JSON.parse(
  readFileSync(join(root, 'src/data/vocabulary.json'), 'utf8'),
);
const affairs: any[] = JSON.parse(
  readFileSync(join(root, 'src/lib/almanac/rules/affairs.json'), 'utf8'),
).affairs;
const votes: any[] = JSON.parse(
  readFileSync(join(root, 'src/lib/almanac/rules/votes.json'), 'utf8'),
).votes;
const yijiTerms: Record<string, unknown> = JSON.parse(
  readFileSync(join(root, 'src/data/yiji-terms.json'), 'utf8'),
).terms;

const allusionIds = new Set(allusionIdList);
const systemIds = new Set(systems.map((s) => s.id));
const deityIds = new Set(deities.map((d) => d.id));

let hardErrors = 0;
const softReport: string[] = [];

function hard(msg: string) {
  hardErrors++;
  console.error(`  ✗ ${msg}`);
}

console.log('\n=== 硬性參照完整性（dangling ref → 會壞頁面）===');

// 籤 → 典故 / 籤系
for (const p of poems) {
  if (!systemIds.has(p.system)) hard(`poem ${p.id}: system「${p.system}」不存在`);
  for (const a of p.allusions ?? []) {
    if (!allusionIds.has(a.ref)) hard(`poem ${p.id}: allusion ref「${a.ref}」不存在`);
  }
}
// 神明 → 籤系
for (const d of deities) {
  for (const s of d.divination_systems ?? []) {
    if (!systemIds.has(s)) hard(`deity ${d.id}: divination_system「${s}」不存在`);
  }
}
// 行業 → 守護神 / 宜忌事項（手工小表，比照 deity→籤系 硬擋）
const affairIds = new Set(affairs.map((a) => a.id));
for (const t of trades) {
  for (const p of t.patrons ?? []) {
    if (!deityIds.has(p.deity_ref)) hard(`trade ${t.id}: patron deity_ref「${p.deity_ref}」不存在`);
  }
  for (const a of [...(t.affairs_yi ?? []), ...(t.affairs_ji ?? [])]) {
    if (!affairIds.has(a)) hard(`trade ${t.id}: affair「${a}」不在 rules/affairs.json`);
  }
}
// 情境 → 守護神 / 宜忌事項（同 trades 硬擋）
for (const s of scenarios) {
  for (const p of s.patrons ?? []) {
    if (!deityIds.has(p.deity_ref)) hard(`scenario ${s.id}: patron deity_ref「${p.deity_ref}」不存在`);
  }
  for (const a of [...(s.affairs_yi ?? []), ...(s.affairs_ji ?? [])]) {
    if (!affairIds.has(a)) hard(`scenario ${s.id}: affair「${a}」不在 rules/affairs.json`);
  }
}
// 比較頁 → 兩造神明節點（dangling → 會壞頁面）
for (const c of comparisons) {
  for (const ref of [c.a, c.b]) {
    if (!deityIds.has(ref)) hard(`comparison ${c.slug}: deity「${ref}」不存在`);
  }
  for (const sc of c.related_scenarios ?? []) {
    if (!scenarios.some((s) => s.id === sc)) hard(`comparison ${c.slug}: related_scenario「${sc}」不存在`);
  }
}
// 宜忌詞義頁 → affair 節點（dangling → /almanac/yiji/[affair] 會壞頁面）
for (const id of Object.keys(yijiTerms)) {
  if (!affairIds.has(id)) hard(`yiji-terms: 事項「${id}」不在 rules/affairs.json`);
}
// 節日頁 → practice/event/deity/temple/vocabulary 節點（dangling → /festivals/[slug] 會壞頁面或漏區塊）
{
  // 二十四節氣（solar_term 只准用這些；清明等節日不是農曆固定日，須走節氣表）
  const JIEQI = new Set(
    ('立春 雨水 驚蟄 春分 清明 穀雨 立夏 小滿 芒種 夏至 小暑 大暑 ' +
      '立秋 處暑 白露 秋分 寒露 霜降 立冬 小雪 大雪 冬至 小寒 大寒').split(/\s+/),
  );
  const practiceIds = new Set(practices.map((p) => p.id));
  const eventIds = new Set(events.map((e) => e.id));
  const templeIds = new Set(temples.map((t) => t.id));
  const vocabTerms = new Set(Object.values(vocabulary).flat().map((t) => t.term));
  const seenSlugs = new Set<string>();
  for (const f of festivals) {
    // slug 是永久承諾（發佈後不可改、不可 404），重複即為錯誤
    if (seenSlugs.has(f.slug)) hard(`festival: slug「${f.slug}」重複`);
    seenSlugs.add(f.slug);
    // 節日的日期來源恰須二選一：農曆月日（lunar_date）或節氣（solar_term，如清明——它不是農曆固定日）。
    const hasLunar = typeof f.lunar_date === 'string' && f.lunar_date.length > 0;
    const hasTerm = typeof f.solar_term === 'string' && f.solar_term.length > 0;
    if (hasLunar === hasTerm) {
      hard(`festival ${f.slug}: 須且僅須其一 lunar_date 或 solar_term（現 lunar_date=${f.lunar_date ?? '無'}、solar_term=${f.solar_term ?? '無'}）`);
    } else if (hasLunar && !/^\d{2}-\d{2}$/.test(f.lunar_date)) {
      hard(`festival ${f.slug}: lunar_date「${f.lunar_date}」須為農曆 MM-DD`);
    } else if (hasTerm && !JIEQI.has(f.solar_term)) {
      hard(`festival ${f.slug}: solar_term「${f.solar_term}」不是二十四節氣之一`);
    }
    // 事實型頁面必須掛源（與 deities/events/practices 同一鐵則：絕不杜撰）
    if (!(f.sources ?? []).length) hard(`festival ${f.slug}: 無 sources（事實型頁面必須掛源）`);
    for (const r of f.practice_refs ?? []) {
      if (!practiceIds.has(r)) hard(`festival ${f.slug}: practice_ref「${r}」不存在`);
    }
    for (const r of f.event_refs ?? []) {
      if (!eventIds.has(r)) hard(`festival ${f.slug}: event_ref「${r}」不存在`);
    }
    for (const r of f.deity_refs ?? []) {
      if (!deityIds.has(r)) hard(`festival ${f.slug}: deity_ref「${r}」不存在`);
    }
    for (const r of f.temple_refs ?? []) {
      if (!templeIds.has(r)) hard(`festival ${f.slug}: temple_ref「${r}」不存在`);
    }
    for (const r of f.vocab_refs ?? []) {
      if (!vocabTerms.has(r)) hard(`festival ${f.slug}: vocab_ref「${r}」不在 vocabulary.json`);
    }
  }
}

// ── 宣告文字不得塞進會被渲染的資料欄位（2026-08-03 立，用戶第二次抓到）──
// 病灶：把「本站僅掛源、不轉載…」這種整段聲明塞進 poems.json 的 version_source，
// 於是每一個籤頁的畫面上都印出一大段勘誤/授權文字。
// 房規：**這類宣告一律集中在 /about/（關於與勘誤）**，頁面上只留一行短標示。
// 判準用兩道：長度上限 ＋ 宣告用語黑名單（兩者都命中才是誤判，分開看都很準）。
const DECLARE_PHRASES = ['僅掛源', '不轉載', '逐首自', '屬廟方著作', '本站不抄', '免責', '依政府資料開放授權'];
const RENDERED_TEXT_FIELDS: { file: string; rows: any[]; fields: string[]; max: number }[] = [
  // 長度上限只套 version_source（站級宣告的慣犯）。
  // notes 是**逐籤的校訂註記**（如「本籤第三句各版本有異文」），屬該籤自身的事實、可以長，
  // 只套宣告用語黑名單。2026-08-03 首版誤把 notes 一起限長，兩筆正當註記被擋，已修。
  { file: 'poems.json', rows: poems, fields: ['version_source'], max: 40 },
  { file: 'poems.json', rows: poems, fields: ['notes'], max: Infinity },
];
for (const { file, rows, fields, max } of RENDERED_TEXT_FIELDS) {
  for (const r of rows) {
    for (const f of fields) {
      const v = r?.[f];
      if (typeof v !== 'string' || !v) continue;
      if (v.length > max) hard(`${file} ${r.id}.${f} 長度 ${v.length} 字 > 上限 ${max}（宣告文字請放 /about/，頁面只留一行短標示）`);
      const hit = DECLARE_PHRASES.find((x) => v.includes(x));
      if (hit) hard(`${file} ${r.id}.${f} 含宣告用語「${hit}」——這類文字集中放 /about/，不要印在每一頁`);
    }
  }
}

if (hardErrors === 0) console.log('  ✓ 全數通過');

// 行業宜側事項 → 宜側 verified 資料覆蓋（M3 只顯示 verified；宜票缺 verified 者頁面恆空 → 軟警告）
const yiVerifiedAffairs = new Set(
  votes.filter((v) => v.verdict === '宜' && v.verified && v.affair !== '*').map((v) => v.affair),
);
const yiEmpty = [...trades, ...scenarios].flatMap((t) =>
  (t.affairs_yi ?? []).filter((a: string) => !yiVerifiedAffairs.has(a)).map((a: string) => `${t.id}→${a}`),
);
if (yiEmpty.length) {
  console.log(`  ⚠ 行業／情境宜側事項無 verified 宜票（吉日區塊將恆空）：${yiEmpty.join('、')}`);
}

// ── 對映率報表（R5、§9.6）──────────────────────────────
function rate(label: string, total: number, matched: number, unmatched: string[]) {
  const pct = total ? ((matched / total) * 100).toFixed(0) : '—';
  softReport.push(`${label}：${matched}/${total}（${pct}%）已對映` + (unmatched.length ? `；待建節點：${[...new Set(unmatched)].join('、')}` : ''));
}

// 關係邊 to/from → 神明節點
const relEndpoints = relations.flatMap((r) => [r.from, r.to]);
const relUnmatched = relEndpoints.filter((x) => !deityIds.has(x));
rate('關係邊端點 → 神明節點', relEndpoints.length, relEndpoints.length - relUnmatched.length, relUnmatched);

// 活動主神 → 神明（R5 主祀神祇對映率）
const evDeUnm = events.map((e) => e.main_deity).filter((x: string) => !deityIds.has(x));
rate('活動主神 → 神明節點', events.length, events.length - evDeUnm.length, evDeUnm);

// 習俗神明 → 神明
const prDe = practices.flatMap((p) => p.deities ?? []);
const prUnm = prDe.filter((x: string) => !deityIds.has(x));
rate('習俗對應神明 → 神明節點', prDe.length, prDe.length - prUnm.length, prUnm);

// 廟宇主祀神祇 → 神明（R5 主祀神祇對映率報表，§9.6 核心 PoC）
const tWithRef = temples.filter((t) => t.main_deity_ref);
const tUnm = tWithRef.map((t) => t.main_deity_ref).filter((x: string) => !deityIds.has(x));
rate('廟宇主祀 → 神明節點', temples.length, tWithRef.length - tUnm.length, tUnm);

// 廟宇年度慶(祭)典（內政部全國宗教資訊網匯入）——硬驗，因為每一條壞掉都直接變成假事實：
//   ・曆別必須逐筆帶：官方 ODS 匯出**沒有農曆／國曆標記**，農曆佔 96%，
//     少一個標記就是把農曆三月廿三印成國曆 3/23（見 docs/festival-data-import.md 陷阱一）。
//   ・日期必須是真的存在的日子：來源含 07/00、02/31 這類髒值。
//   ・名稱必須有漢字：來源含 `.`／`33333` 這類鍵入殘留，有合法日期、會通過其他檢查。
//   ・有 festivals 必須有對應來源標註（§5 無源不發佈）。
const FESTIVAL_SOURCE = '內政部全國宗教資訊網・慶(祭)典查詢';

/** 見下方使用處的註解。與 scripts/import-festivals.mjs 的 contradictsDate() 同一套判準。 */
function descContradictsDate(desc: string, date: string): boolean {
  const s = String(desc ?? '').trim();
  if (!s || s.length > 16) return false;
  if (/^[及或另暨、，,]/.test(s)) return false; // 補充的第二個日期，不是衝突
  const [fm, fd] = String(date).split('-').map(Number);
  const rng = s.match(/^(?:農曆|國曆)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[-–~至]\s*(\d{1,2})\s*日?/);
  if (rng) {
    const [m, a, b] = rng.slice(1).map(Number);
    if (m === fm && a <= fd && fd <= b) return false; // 區間涵蓋日期欄
  }
  const ms = [...s.matchAll(/(?:農曆|國曆)?\s*(\d{1,2})\s*[月/\-]\s*(\d{1,2})\s*日?/g)];
  if (ms.length !== 1) return false;
  return Number(ms[0][1]) !== fm || Number(ms[0][2]) !== fd;
}
let tf = 0;
let tfTemples = 0;
for (const t of temples) {
  const list = t.festivals ?? [];
  if (list.length === 0) continue;
  tfTemples++;
  tf += list.length;
  for (const f of list) {
    const at = `temple ${t.id} 慶典「${f.name}」`;
    if (f.calendar !== 'lunar' && f.calendar !== 'solar') hard(`${at}：calendar 必須是 lunar 或 solar（實為 ${f.calendar}）`);
    if (!/^\d{2}-\d{2}$/.test(f.date ?? '')) hard(`${at}：date 必須為 MM-DD（實為 ${f.date}）`);
    else {
      const [mm, dd] = f.date.split('-').map(Number);
      const max = f.calendar === 'lunar' ? 30 : [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
      if (mm < 1 || mm > 12 || dd < 1 || dd > max) hard(`${at}：日期 ${f.date} 不存在（${f.calendar}）`);
    }
    if (!/[一-鿿]/.test(f.name ?? '')) hard(`${at}：祭典名稱須含漢字（來源有 .／33333 這類殘留）`);
    // 2026-08-05：說明欄不得與日期欄互相矛盾。**來源自身就有這種資料**——修悟堂「五府千歲聖誕」
    // 日期欄 農曆01-03、說明欄「農曆6月18日」（後者正是池府千歲聖誕，站上 deities.json 有三個掛源）。
    // 我們無從判定哪個對、也不該替來源判斷，而要去拜拜的人拿到錯日期比沒有更糟 → 整筆不得存在。
    // ⚠️ 判準與 scripts/import-festivals.mjs 的 contradictsDate() 相同（改一邊要改兩邊；
    //    該檔是 .mjs、本檔是 .ts，故刻意各留一份純函式而非 import）。
    //    只擋「說明整段就是一個日期且與日期欄不同」；「及8月23日」（第二個日期）與
    //    「3月21-23日…」（區間涵蓋）不算矛盾，那是補充。實測全量僅 2 筆命中，已於同日移除。
    if (f.desc && descContradictsDate(f.desc, f.date)) {
      hard(`${at}：說明「${f.desc}」與日期 ${f.date} 矛盾，無從判定何者為真 → 不得發佈`);
    }
  }
  if (!(t.sources ?? []).some((s: { ref?: string }) => (s.ref ?? '').includes(FESTIVAL_SOURCE)))
    hard(`temple ${t.id}：有 festivals 卻無「${FESTIVAL_SOURCE}」來源標註`);
}
softReport.push(`廟宇年度慶(祭)典：${tfTemples}/${temples.length} 間、共 ${tf} 筆（內政部全國宗教資訊網）`);

// 廟宇 intro／open_time（交通部觀光署觀光資訊資料庫，OGDL 1.0，2026-08-05 匯入）硬驗三件事：
//   ・有 intro／open_time 必須有對應來源標註（OGDL 1.0 要求標示出處，且 §5 無源不發佈）。
//   ・intro 不得同時與 history 並存——那 22 間 history 是逐間查證的敘述句，品質高於觀光文案，
//     匯入器對有 history 者不寫 intro；並存代表有人繞過匯入器手改。
//   ・intro 不得命中行銷／旅遊指南腔詞表。**規則與匯入器共用同一支 lib**，
//     否則 gate 擋不住日後手改（這正是把規則抽成 lib 的理由）。
const { TOURISM_SOURCE, acceptIntro } = await import('./lib/tourism-intro.mjs');
let tIntro = 0;
let tOpen = 0;
for (const t of temples) {
  const hasIntro = !!(t as { intro?: string }).intro;
  const hasOpen = !!(t as { open_time?: string }).open_time;
  if (!hasIntro && !hasOpen) continue;
  if (hasIntro) tIntro++;
  if (hasOpen) tOpen++;
  if (!(t.sources ?? []).some((s: { ref?: string }) => (s.ref ?? '').includes(TOURISM_SOURCE)))
    hard(`temple ${t.id}：有 intro／open_time 卻無「${TOURISM_SOURCE}」來源標註`);
  if (hasIntro && t.history)
    hard(`temple ${t.id}：intro 與 history 並存（history 為已查證敘述句，應優先且不共存）`);
  if (hasIntro) {
    const v = acceptIntro((t as { intro?: string }).intro);
    if (!v.ok) hard(`temple ${t.id}：intro 不符採用規則（${v.why}）——見 scripts/lib/tourism-intro.mjs`);
  }
}
softReport.push(`廟宇簡介／開放時間：intro ${tIntro} 間、open_time ${tOpen} 間（交通部觀光署，OGDL 1.0）`);

// 待查 / draft 統計（§5 無源不發佈）
const draftDe = deities.filter((d) => d.draft).map((d) => d.id);
const draftPr = practices.filter((p) => p.draft).length;
const draftEv = events.filter((e) => e.draft).map((e) => e.id);

console.log('\n=== 對映率報表（R5 / §9.6；軟提示，不阻 build）===');
softReport.forEach((l) => console.log(`  • ${l}`));

console.log('\n=== 待補狀態（§5 無源不發佈 gate）===');
console.log(`  • 神明 draft（聖誕待查等）：${draftDe.length} 尊 — ${draftDe.join('、') || '無'}`);
console.log(`  • 活動 draft（文資待核）：${draftEv.length} 筆 — ${draftEv.join('、') || '無'}`);
console.log(`  • 習俗 draft（步驟/地區待引註）：${draftPr}/${practices.length} 筆`);

console.log('\n=== 資料量 ===');
console.log(`  籤 ${poems.length}｜典故 ${allusionIdList.length}｜籤系 ${systems.length}｜神明 ${deities.length}｜關係 ${relations.length}｜活動 ${events.length}｜習俗 ${practices.length}`);

if (hardErrors) {
  console.error(`\n✗ 硬性錯誤 ${hardErrors} 筆，請修正。\n`);
  process.exit(1);
}
console.log('\n✓ 完整性檢查通過（軟報表僅供策展追蹤）。\n');
