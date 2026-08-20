// event-cycle 的 golden table 測試。
//
// 執行：pnpm test:event-cycle
//
// 🔴 為什麼是 golden 而不是幾個 assert：這支模組的核心是**造句**，而造句的判準
//    （noteStatesCycle／noteStatesDivination／noteIsProse）是對人寫的散文做正規式判定。
//    正規式寫得漂不漂亮沒有意義，唯一有意義的是「產出的句子被人看過而且沒問題」。
//    所以下面把非 annual 與 divined 的全部 15 筆逐字釘死——**改了模組而句子變了，
//    這支就會紅，逼你重新看一遍那句話**，而不是等它上線變成 /events/… 的病句。
//
// 這支測的是 2026-08-20 真的發生過的線上事故：
//    「三年一科年一科。」「非同步年一科」「（首科1967年）年一科」「…不是固定的農曆日。舉行。」

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { eventCycle, cycleLabel, cycleShort, scheduleSentence } from './event-cycle.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const events = JSON.parse(readFileSync(join(root, 'src/data/events.json'), 'utf8')) as {
  id: string;
  name: string;
  cycle: 'annual' | 'n_year_ke' | 'irregular';
  ke_branches?: string[] | null;
  ke_period_text?: string | null;
  ke_note?: string | null;
  date_note?: string;
  date_resolution: string;
}[];

let failed = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  if (got === want) return;
  failed += 1;
  console.log(`  ✗ ${label}\n      得到：${got}\n      期望：${want}`);
};
const ok = (label: string, cond: boolean, detail = '') => {
  if (cond) return;
  failed += 1;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
};

const byId = new Map(events.map((e) => [e.id, e]));
const sentence = (id: string) => {
  const e = byId.get(id)!;
  return scheduleSentence(e.name, e.date_note, eventCycle(e), e.date_resolution === 'divined');
};
const label = (id: string) => cycleLabel(eventCycle(byId.get(id)!));

// ── A. golden：非 annual 與 divined 的 15 筆，逐字釘死 ────────────────────
console.log('A. FAQ 答句 golden（非 annual 或 divined）：');

const GOLDEN: [string, string, string][] = [
  // [id, 週期標示, FAQ 答句]
  ['dajia', '每年', '大甲媽祖遶境進香約於三月（廟方擲筊擇日）舉行，每年一次。'],
  ['baishatun', '每年', '白沙屯媽祖進香約於三月（前一年12/15擲筊定）舉行，每年一次。'],
  ['donggang', '逢丑、辰、未、戌年一科', '東港迎王平安祭典約於九月舉行，逢丑、辰、未、戌年一科。'],
  ['xigang', '數年一科', '西港香（刈香王醮）約於四月舉行，數年一科。'],
  ['mamingshan_wunian', '逢寅、午、戌年一科', '逢農曆寅、午、戌年舉行五年大科（五年一醮，代天巡狩十二王爺）。'],
  ['wanhegong_laoerma_xitun', '三年一科', '萬和宮老二媽西屯省親遶境約於農曆三月（每三年一次老二媽回西屯省親）舉行。'],
  ['xiaqieding_jinluangong_wangjiao', '不定期，平均約每十年一科王船醮典', '不定期王醮；戰後曾於1948、1960、1969、1974、1982、1992、2000年舉行。'],
  ['nanguanxian_wangjiao', '三大廟各約每 12 年一科慶成五朝王醮，非同步', '不定期；關廟山西宮戰後固定逢戌年（每12年），仁壽宮、保西代天府間隔約12年以上。'],
  ['anding_zhenhugong_wangchuan', '三年一科', '安定真護宮王船祭約於逢丑辰未戌年三年一科，約農曆3月上旬前後舉行。'],
];

for (const [id, wantLabel, wantSentence] of GOLDEN) {
  ok(`${id} 存在於 events.json`, byId.has(id));
  if (!byId.has(id)) continue;
  eq(`${id} 週期標示`, label(id), wantLabel);
  eq(`${id} FAQ 答句`, sentence(id), wantSentence);
}
console.log(`   釘住 ${GOLDEN.length} 筆`);

// ── B. 事故複驗：那四種病句一筆都不准再出現（全量 67 筆）──────────────
console.log('B. 全量掃描，2026-08-20 的四種病句型態：');
const BAD_PATTERNS: [RegExp, string][] = [
  [/一科一科/, '「一科一科」重複（ke_rule 自由文字被當地支串接）'],
  [/科年一科/, '「三年一科年一科」型'],
  [/）年一科/, '「（首科1967年）年一科」型'],
  [/步年一科/, '「非同步年一科」型'],
  [/。舉行。/, '「…不是固定的農曆日。舉行。」型（散文被套上短片語樣板）'],
  [/舉行舉行/, '「舉行舉行」型'],
  [/，，|。。|；；/, '標點重複'],
];
let scanned = 0;
for (const e of events) {
  const s = scheduleSentence(e.name, e.date_note, eventCycle(e), e.date_resolution === 'divined');
  if (!s) continue;
  scanned += 1;
  for (const [re, why] of BAD_PATTERNS) {
    ok(`${e.id}：${why}`, !re.test(s), `實際輸出：${s}`);
  }
  ok(`${e.id}：答句應以句號結尾`, /[。！？]$/.test(s), `實際輸出：${s}`);
}
console.log(`   掃過 ${scanned} 筆答句 × ${BAD_PATTERNS.length} 種型態`);

// ── C. 結構不變量 ────────────────────────────────────────────────────────
console.log('C. 結構不變量：');

// C1. ke_rule 這個欄位不可以復活（它就是病灶本身）
ok('events.json 不得再有 ke_rule 欄位', events.every((e) => !('ke_rule' in e)),
  '該欄位同時裝地支與自由文字，是 2026-08-20 病句的成因；已拆成 ke_branches／ke_period_text／ke_note');

// C2. ke_branches 只能放地支
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
for (const e of events) {
  const bad = (e.ke_branches ?? []).filter((b) => !BRANCHES.includes(b));
  ok(`${e.id}：ke_branches 只能放地支`, bad.length === 0, `混入：${bad.join('、')}`);
}

// C3. 週期年數不得由地支數量推算（馬鳴山逢寅午戌但通行稱「五年一科」，算術會得「四年」）
eq('馬鳴山不得被推算成「四年一科」', label('mamingshan_wunian').includes('四年'), false);

// C4. 卡片短語長度可預期（版位塞得下）
for (const e of events) {
  const short = cycleShort(eventCycle(e));
  ok(`${e.id}：cycleShort 不得超過 6 字`, [...short].length <= 6, `實際：${short}`);
}

// C5. annual 不得帶科年地支（語意衝突）
for (const e of events) {
  ok(`${e.id}：annual 不應有 ke_branches`, !(e.cycle === 'annual' && (e.ke_branches ?? []).length > 0));
}

console.log(failed === 0
  ? `\n✓ event-cycle 測試通過：golden ${GOLDEN.length} 筆逐字相符、${scanned} 筆答句無病句型態、結構不變量全數成立`
  : `\n✗ event-cycle 測試失敗 ${failed} 項`);
process.exit(failed === 0 ? 0 : 1);
