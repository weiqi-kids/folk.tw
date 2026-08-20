// calendar-date 的 golden 測試（純函式，不需 build）。
//
// 執行：pnpm test:calendar-date
//
// 🔴 為什麼要有這支：`CalendarDate` 這個 union 的價值是「傳錯曆別編譯不過」，
//    但**編譯期保證不會告訴你換算本身有沒有被改壞**。而這裡每一個換算都是
//    「頁面上印給讀者看的一個日期」——算錯不會紅燈，只會安靜地替主辦方／廟方
//    宣稱一個沒發生過的日子（總紅線第 1 條）。所以下面把日期逐字釘死。
//
// ⚠️ 這支測的不是一場已發生的事故（2026-08-20 建立時全量比對確認線上沒有錯值），
//    它釘的是**那個錯法從此寫不出來**：
//      ① 同一個 "MM-DD" 傳給不同曆別必須得到不同答案（證明曆別真的有作用）
//      ② 回曆一律 null（不換算，也不丟錯、不回假日期）
//      ③ 短月退日：農曆七月卅在無卅日之年退到廿九，**標籤要跟著退**
//      ④ 兩支 label 函式的措辭差異是刻意的上線事實，不可「順手統一」
//      ⑤ zod enum 與 union 不得各自漂走

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CALENDAR_KINDS,
  calendarDateLabel,
  calendarDateLabelShort,
  festivalCalendarDate,
  festivalNextSolar,
  nextOccurrence,
  parseCalendarDate,
  type CalendarDate,
} from './calendar-date.ts';
import { LOCAL_CELEBRATION_CALENDARS, localCelebrationsSchema } from '../content-schemas.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));

let failed = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = typeof got === 'object' ? JSON.stringify(got) : String(got);
  const w = typeof want === 'object' ? JSON.stringify(want) : String(want);
  if (g === w) return;
  failed += 1;
  console.log(`  ✗ ${label}\n      得到：${g}\n      期望：${w}`);
};
const ok = (label: string, cond: boolean, detail = '') => {
  if (cond) return;
  failed += 1;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
};

// ── A. nextOccurrence golden ────────────────────────────────────────────────
console.log('A. nextOccurrence golden（iso｜label｜lunar，逐字）：');

const GOLDEN: [CalendarDate, string, string][] = [
  // [輸入, 基準日, 期望 "iso|label|lunar"]
  [{ cal: 'lunar', mmdd: '03-23' }, '2026-01-01', '2026-05-09|農曆三月廿三|03-23'],
  // 🔴 短月退日：2026 農曆七月只有廿九日 → 落在 9/10，**標籤跟著變成廿九**。
  //    這一筆就是 /festivals/dizang/ 那頁的 title 在用的日期。
  [{ cal: 'lunar', mmdd: '07-30' }, '2026-01-01', '2026-09-10|農曆七月廿九|07-29'],
  // 同一個 07-30，2025 年七月有卅日 → 不退日，標籤是三十。
  [{ cal: 'lunar', mmdd: '07-30' }, '2025-07-01', '2025-09-21|農曆七月三十|07-30'],
  [{ cal: 'lunar', mmdd: '07-01' }, '2026-01-01', '2026-08-13|農曆七月初一|07-01'],
  // 🔴 與上一筆同樣是 "07-01"，只是曆別不同 → 答案必須不同。
  //    這一組是本 union 存在的理由：改動前這兩者的函式簽章一模一樣。
  [{ cal: 'solar', mmdd: '07-01' }, '2026-01-01', '2026-07-01|國曆7月1日|null'],
  [{ cal: 'solar', mmdd: '09-28' }, '2026-01-01', '2026-09-28|國曆9月28日|null'],
  // 02-29 只在閏年存在：2026 起往後找兩年 → 2028。
  [{ cal: 'solar', mmdd: '02-29' }, '2026-01-01', '2028-02-29|國曆2月29日|null'],
  // 窗口內找不到 → iso 為 null，但 label 仍是有效的名目標籤（不是「不換算」）。
  [{ cal: 'solar', mmdd: '02-29' }, '2029-01-01', 'null|國曆2月29日|null'],
  [{ cal: 'solar_term', term: '清明' }, '2026-01-01', '2026-04-05|節氣清明|null'],
  [{ cal: 'solar_term', term: '冬至' }, '2026-08-20', '2026-12-22|節氣冬至|null'],
  [{ cal: 'solar_term', term: '不存在的節氣' }, '2026-01-01', 'null|節氣不存在的節氣|null'],
];
for (const [d, from, want] of GOLDEN) {
  const o = nextOccurrence(d, from);
  eq(`${d.cal} ${'mmdd' in d ? d.mmdd : d.term} @${from}`, o ? `${o.iso}|${o.label}|${o.lunar}` : 'null', want);
}

// ── B. 回曆：永遠 null，不丟錯、不回假日期 ──────────────────────────────────
console.log('B. 回曆不換算：');
for (const from of ['2026-01-01', '2026-08-20', '2027-06-15', '2030-12-31']) {
  eq(`hijri 01-01 @${from}`, nextOccurrence({ cal: 'hijri', mmdd: '01-01' }, from), null);
}
// 🔴 null 的意思是「這個曆別我們不換算」，與 `{iso:null}`（可換算但那年沒有這天）不同。
//    混用這兩者就會在頁面上印出假日期，所以這裡把區別本身釘住。
ok(
  'null（不換算）與 {iso:null}（算不出來）是兩種不同的回傳',
  nextOccurrence({ cal: 'hijri', mmdd: '01-01' }, '2026-01-01') === null
    && nextOccurrence({ cal: 'solar', mmdd: '02-29' }, '2029-01-01')?.iso === null,
);

// ── C. parseCalendarDate：認不得就 null，不掉進「當成回曆」的舊分支 ──────────
console.log('C. parseCalendarDate 關口：');
eq('lunar 03-23', parseCalendarDate('lunar', '03-23'), { cal: 'lunar', mmdd: '03-23' });
eq('solar_term 清明', parseCalendarDate('solar_term', '清明'), { cal: 'solar_term', term: '清明' });
for (const [cal, v] of [
  ['gregorian', '01-01'], // 認不得的曆別：改動前會被當成回曆印出去
  ['', '01-01'],
  ['lunar', '1-1'],
  ['lunar', '0101'],
  ['lunar', ''],
  ['hijri', '01-1'],
  ['solar_term', ''],
] as [string, string][]) {
  eq(`parseCalendarDate(${JSON.stringify(cal)}, ${JSON.stringify(v)})`, parseCalendarDate(cal, v), null);
}

// ── D. 兩支 label 的措辭差異是刻意的（節日頁 vs 清單／廟宇頁）─────────────────
console.log('D. label 措辭 golden：');
const LABELS: [CalendarDate, string, string][] = [
  // [輸入, 長版（節日頁）, 短版（清單／廟宇頁）]
  [{ cal: 'lunar', mmdd: '07-30' }, '農曆七月三十', '農曆七月三十'],
  // ⚠️ 「農曆**一**月」不是筆誤：lunarDateLabel() 的月份用的是 CN_NUM（一…十二），
  //    而 /festivals/local/ 的**月份分組標題**另有一份用「正月」的對照表。這個不一致
  //    是既有上線事實（2026-08-20 查證），本次重構刻意不動它——改措辭是文案決定，
  //    不是型別重構該順手做的事。要改的話兩邊都得改，並重跑 check:rendered。
  [{ cal: 'lunar', mmdd: '01-15' }, '農曆一月十五', '農曆一月十五'],
  [{ cal: 'solar', mmdd: '12-24' }, '國曆12月24日', '國曆 12/24'],
  [{ cal: 'solar', mmdd: '10-25' }, '國曆10月25日', '國曆 10/25'],
  [{ cal: 'hijri', mmdd: '01-01' }, '回曆1月1日', '回曆 1 月 1 日'],
  [{ cal: 'solar_term', term: '清明' }, '節氣清明', '節氣清明'],
];
for (const [d, long, short] of LABELS) {
  eq(`長版 ${JSON.stringify(d)}`, calendarDateLabel(d), long);
  eq(`短版 ${JSON.stringify(d)}`, calendarDateLabelShort(d), short);
}
// 🔴 這兩支不可被「順手統一」——差異已經上線（節日頁與地方慶典清單頁措辭不同）。
ok(
  '長短版對 solar 必須不同（統一了就是改了線上文案）',
  calendarDateLabel({ cal: 'solar', mmdd: '12-24' }) !== calendarDateLabelShort({ cal: 'solar', mmdd: '12-24' }),
);

// ── E. zod enum 與 union 不得各自漂走 ───────────────────────────────────────
console.log('E. schema ↔ union 一致性：');
for (const c of LOCAL_CELEBRATION_CALENDARS) {
  ok(`schema 的曆別 "${c}" 是 CalendarDate 認得的`, (CALENDAR_KINDS as readonly string[]).includes(c));
  ok(`parseCalendarDate 接受 schema 的曆別 "${c}"`, parseCalendarDate(c, '01-01') !== null);
}

// ── F. local-celebrations.json 全量：schema 過、且每一筆都建得出 CalendarDate ──
console.log('F. local-celebrations.json 全量：');
const lc = readJson('src/data/local-celebrations.json').items as { id: string; calendar: string; date: string }[];
ok('母體非空（gate 掃到 0 筆等於沒掃）', lc.length > 0, `實際 ${lc.length} 筆`);
let lcBad = 0;
for (const row of lc) {
  const r = localCelebrationsSchema.safeParse(row);
  if (!r.success) {
    lcBad += 1;
    if (lcBad <= 5) console.log(`  ✗ ${row.id} 不符 schema：${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('；')}`);
  }
  const d = parseCalendarDate(row.calendar, row.date);
  ok(`${row.id} 建得出 CalendarDate`, d !== null, `calendar=${row.calendar} date=${row.date}`);
  // 回曆的那幾筆一定不換算；其餘一定不是 null 回傳。
  if (d) {
    const o = nextOccurrence(d, '2026-01-01');
    ok(`${row.id} 的換算與曆別相符`, d.cal === 'hijri' ? o === null : o !== null);
  }
}
failed += lcBad;
console.log(`   ${lc.length} 筆逐筆驗過（不符 schema ${lcBad} 筆）`);

// ── G. festivals.json 全量：三個互斥欄位不得同時出現，且相容包裝行為一致 ────────
console.log('G. festivals.json 全量：');
const festivals = readJson('src/data/festivals.json') as {
  slug: string; lunar_date?: string; solar_date?: string; solar_term?: string;
}[];
ok('母體非空', festivals.length > 0, `實際 ${festivals.length} 筆`);
let dated = 0;
for (const f of festivals) {
  const set = [f.lunar_date, f.solar_date, f.solar_term].filter(Boolean);
  // 🔴 型別上這三個 optional 欄位可以同時存在，資料上不行。真的出現兩個時，
  //    festivalCalendarDate() 會照優先序默默挑一個——那就變成「靜默地選錯日期」。
  ok(`${f.slug} 至多一個日期欄位`, set.length <= 1, `實際有 ${set.length} 個：${JSON.stringify(set)}`);
  const d = festivalCalendarDate(f);
  if (set.length === 0) {
    ok(`${f.slug} 無日期欄位 → 無 CalendarDate`, d === null);
    eq(`${f.slug} 無日期時的相容回傳`, festivalNextSolar(f, '2026-01-01'), { iso: null, label: '' });
    continue;
  }
  dated += 1;
  ok(`${f.slug} 建得出 CalendarDate`, d !== null);
  // 相容包裝必須恰好等於 nextOccurrence 的前兩個欄位（不得長出第二份分派邏輯）。
  for (const from of ['2026-01-01', '2026-08-20', '2027-03-01']) {
    const o = nextOccurrence(d!, from)!;
    eq(`${f.slug}@${from} 相容包裝一致`, festivalNextSolar(f, from), { iso: o.iso, label: o.label });
  }
}
console.log(`   ${festivals.length} 筆（有日期 ${dated} 筆）`);

// ── H. 收尾 ────────────────────────────────────────────────────────────────
if (failed) {
  console.log(`\n✗ calendar-date 測試失敗 ${failed} 項`);
  process.exit(1);
}
console.log(`\n✓ calendar-date 測試全過（golden ${GOLDEN.length + LABELS.length} 組｜地方慶典 ${lc.length} 筆｜節日 ${festivals.length} 筆）`);
