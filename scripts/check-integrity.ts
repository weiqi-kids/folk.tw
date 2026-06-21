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
if (hardErrors === 0) console.log('  ✓ 全數通過');

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
