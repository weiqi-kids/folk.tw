// 曆別 × 日期的**型別化唯一入口**（2026-08-20 由 `lunar-date.ts` 更名而來）。
//
// 🔴 為什麼要有 `CalendarDate` 這個 discriminated union（**預防性**，非事故補救）：
//    本檔原本對外給的是四支**簽章完全相同**的函式——
//        lunarToNextSolar(mmdd: string, fromIso: string)      農曆月日
//        solarMdToNext(mmdd: string, fromIso: string)         國曆月日
//    「MM-DD」這個字串**同時裝著四種不同的東西**（農曆／國曆／回曆月日、以及節氣名），
//    而型別上它們都只是 `string`。把農曆 07-30 傳給 `solarMdToNext()` 會通過 `astro check`、
//    回一個看起來完全合理的 `2026-07-30`——**錯的日期不會紅燈，只會安靜地印在頁面上**。
//    這正是 `event-cycle.ts` 那次事故的同一個病灶（`ke_rule` 一個欄位裝兩種東西），
//    差別只在那次已經印到線上、這次還沒有。**沒有人查的型別會漂走，就跟沒有人查的宣稱一樣。**
//
//    ⚠️ 2026-08-20 全量比對後確認：**目前沒有任何呼叫點傳錯曆別**（改前改後 8,610 筆
//    推導值逐一相同）。所以這支不是在修 bug，是在讓那個 bug 從此寫不出來。
//
//    作者自己在 `src/pages/temples/[id].astro` 標過同一個缺口：
//        「別寫成 slice(0,3)——那會取到 "01-" → Number() 得 NaN，
//          而目前這幾筆全是農曆、走不到後兩支，**錯了也不會有人發現**。」
//    那三段 `x.calendar === 'lunar' ? … : x.calendar === 'solar' ? … : …` 的手寫分派
//    （清單頁與廟宇頁各一份、措辭必須一致卻沒有東西保證）已收進本檔的 label 函式。
//
// ── 兩種「沒有日期」不可混為一談（`nextOccurrence()` 的回傳契約）──────────
//    回 `null`        ＝ **這個曆別我們不換算**。目前只有回曆：伊斯蘭曆與國曆的對應
//                       每年前移約 11 天，我們沒有可信的換算來源，硬算就是杜撰
//                       （總紅線第 1 條）。**不可以丟錯、也不可以回一個假日期。**
//    回 `{ iso: null }` ＝ 曆別可換算，但這個日期在搜尋窗口內不存在
//                       （國曆 02-29 遇非閏年、農曆日在 400 天內找不到）。
//                       此時 `label` 仍是有效的**名目**標籤，頁面照樣可以顯示「農曆七月卅」。
//    這兩者的差別是頁面要不要顯示「國曆 X/Y」的唯一判準，混用就會印出假日期。
//
// ⚠️ **`calendarDateLabel()` 與 `calendarDateLabelShort()` 是兩支不是一支**，這是刻意的
//    （同 `event-cycle.ts` 的 `cycleLabel` vs `cycleShort`）：節日頁寫「國曆12月24日」、
//    地方慶典清單與廟宇頁寫「國曆 12/24」，兩種措辭都已經上線。
//    要改哪一種措辭就改哪一支，**不要把其中一支改成呼叫另一支**。
//
// ── 以下是原 `lunar-date.ts` 的檔頭，逐字保留 ────────────────────────────────
// 農曆日期原語（**零 Astro 依賴**，可被 scripts/ 的 gate 直接 import）。
//
// 為何獨立成檔：`birthdays.ts` 依賴 `./queries` → `astro:content`，故 `scripts/check-rendered.mjs`
// 無法 import 它。但 gate 必須用「與頁面完全相同」的換算來驗證渲染結果，
// 否則就是在 gate 裡重寫一份日期邏輯——那正是 CLAUDE.md 禁止的（廟宇地區解析曾因此在 12 處出錯）。
// 因此把純函式集中在本檔：頁面經 `birthdays.ts` 用它，gate 直接用它，**唯一真實來源**。
//
// **只依賴 lunar-javascript**（與 almanac provider.ts 同源，閏月/定朔一致），刻意不 import 任何專案內模組——
// 一有 import，bare node 就會因無副檔名而解析失敗（既有 gate 只能 import temple-region.ts 正是同理）。
// 日期位移用 lunar-javascript 自己的 Solar.next()，不另外接 almanac/dates 的 addDays。

import pkg from 'lunar-javascript';

const { Solar } = pkg;

// lunar-javascript 的型別宣告漏了 Solar.next()（執行期存在、已實測），故在此收斂為一個具型別的介面，
// 不散落 as any。next(n) 回傳位移 n 天後的 Solar。
type SolarLike = {
  next(n: number): SolarLike;
  toYmd(): string;
  getLunar(): { getMonth(): number; getDay(): number };
};

const solarOf = (iso: string): SolarLike => {
  const [y, m, d] = iso.split('-').map(Number);
  return Solar.fromYmd(y, m, d) as unknown as SolarLike;
};

const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const lunarMonthCn = (m: number) => CN_NUM[m] ?? String(m);

function lunarDayCn(d: number): string {
  if (d <= 10) return '初' + CN_NUM[d];
  if (d < 20) return '十' + CN_NUM[d - 10];
  if (d === 20) return '二十';
  if (d < 30) return '廿' + CN_NUM[d - 20];
  return '三十';
}

const labelOf = (key: string) => `農曆${lunarMonthCn(Number(key.slice(0, 2)))}月${lunarDayCn(Number(key.slice(3)))}`;

const lunarKeyOf = (lunar: { getMonth(): number; getDay(): number }): string =>
  `${String(lunar.getMonth()).padStart(2, '0')}-${String(lunar.getDay()).padStart(2, '0')}`;

/** 農曆「MM-DD」→ 中文標籤（如「03-23」→「農曆三月廿三」）。非 MM-DD 回空字串。 */
export const lunarDateLabel = (mmdd: string): string => (/^\d{2}-\d{2}$/.test(mmdd) ? labelOf(mmdd) : '');

/** 該國曆日是否為農曆月最後一日（明日農曆月份不同即是）。 */
export function isLunarMonthEnd(iso: string): boolean {
  const s = solarOf(iso);
  return s.next(1).getLunar().getMonth() !== s.getLunar().getMonth();
}

/**
 * 農曆「MM-DD」→ 自 fromIso 起的下一次國曆日期（YYYY-MM-DD），找不到回 null。
 * 短月規則：卅日的節日／聖誕，遇農曆月僅廿九日之年順延至該月最後一日
 * （與 upcomingDeityBirthdays 同一規則，例：地藏王七月卅 → 2026 年七月無卅日 → 9/10 廿九）。
 * ⏱ 只算「國曆日期」這個靜態事實；倒數 N 天由前端依台灣時區即時算，故 build 不新鮮也不會錯。
 */
export function lunarToNextSolar(mmdd: string, fromIso: string, days = 400): string | null {
  return lunarToNextOccurrence(mmdd, fromIso, days)?.iso ?? null;
}

export interface LunarOccurrence {
  /** 該次實際落在的國曆日期。 */
  iso: string;
  /** 該個國曆日實際對應的農曆 MM-DD；短月退日時會是 29，不是資料登錄的 30。 */
  lunar: string;
  /** 由 actual lunar 產生的顯示標籤，必定與 iso 相符。 */
  label: string;
}

/**
 * 農曆登錄日→下一次實際發生日。
 *
 * 與 `lunarToNextSolar()` 的差別是這支同時回傳該國曆日的**實際**農曆日與標籤。
 * 如 07-30 遇短月落在 07-29，資料仍保留 07-30，但當年日期文案必須顯示七月廿九。
 */
export function lunarToNextOccurrence(mmdd: string, fromIso: string, days = 400): LunarOccurrence | null {
  if (!/^\d{2}-\d{2}$/.test(mmdd)) return null;
  const wantM = Number(mmdd.slice(0, 2));
  const wantD = Number(mmdd.slice(3));
  const start = solarOf(fromIso);
  for (let i = 0; i < days; i++) {
    const s = i === 0 ? start : start.next(i);
    const iso = s.toYmd();
    const l = s.getLunar();
    const lm = l.getMonth();
    if (lm < 0) continue; // 負月＝閏月，節日/聖誕不計閏月
    if (lm !== wantM) continue;
    const ld = l.getDay();
    if (ld === wantD || (wantD === 30 && ld === 29 && isLunarMonthEnd(iso))) {
      const lunar = lunarKeyOf(l);
      return { iso, lunar, label: lunarDateLabel(lunar) };
    }
  }
  return null;
}

/** 國曆 ISO → 「M/D」顯示形式（如 2026-08-27 → 8/27）。 */
export const solarMd = (iso: string): string => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/**
 * 國曆「MM-DD」→ 自 fromIso 起的下一次國曆日期（YYYY-MM-DD），找不到回 null。
 * 為何需要這支：地方宗教慶典有 6 筆是**國曆**日期（新北平安夜 12/24 等），
 * 它們不必換算農曆，但仍要算「下一次是哪一年的那天」才能與農曆筆一起排序。
 * ⚠️ 2/29 只在閏年存在，故往後找兩年；找不到回 null（頁面因此不列，不會印出假日期）。
 */
export function solarMdToNext(mmdd: string, fromIso: string): string | null {
  if (!/^\d{2}-\d{2}$/.test(mmdd)) return null;
  const y0 = Number(fromIso.slice(0, 4));
  for (let i = 0; i <= 2; i++) {
    const iso = `${y0 + i}-${mmdd}`;
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    // 日期不存在時 Date 會進位（2026-02-29 → 3/1），比對回去即可判斷。
    if (dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) continue;
    if (iso >= fromIso) return iso;
  }
  return null;
}

/**
 * 節氣名（如「清明」「冬至」）→ 自 fromIso 起的下一次國曆日期，找不到回 null。
 * 為何需要這支：**清明、冬至等節日是節氣、不是農曆月日**（清明約落在國曆 4/4–4/6，由太陽黃經定，
 * 農曆日期每年不同），故不能用 lunarToNextSolar 表達。節氣表由 lunar-javascript 提供（與農民曆同源）。
 */
export function solarTermToNextSolar(term: string, fromIso: string, years = 2): string | null {
  const y0 = Number(fromIso.slice(0, 4));
  for (let i = 0; i <= years; i++) {
    const lunar = Solar.fromYmd(y0 + i, 6, 1).getLunar() as unknown as {
      getJieQiTable(): Record<string, { toYmd(): string }>;
    };
    const hit = lunar.getJieQiTable()?.[term];
    const iso = hit?.toYmd();
    if (iso && iso >= fromIso) return iso;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CalendarDate：一筆日期一定同時說明「它是哪一種曆」（理由見檔頭）
// ═══════════════════════════════════════════════════════════════════════════

/** 站上會出現的曆別。**新增一種就會讓下面每一個 switch 少一個 case 而編譯失敗**，這是刻意的。 */
export const CALENDAR_KINDS = ['lunar', 'solar', 'solar_term', 'hijri'] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

/**
 * 一筆有曆別的日期。
 *
 * 🔴 `mmdd` 與 `term` 刻意用不同的欄位名：即使兩者都是 `string`，
 *    也不可能把節氣名當成月日傳進去（結構不同 → 型別直接擋）。
 */
export type CalendarDate =
  /** 農曆月日「MM-DD」。卅日遇短月的退日規則見 `lunarToNextOccurrence()`。 */
  | { cal: 'lunar'; mmdd: string }
  /** 國曆（西曆）月日「MM-DD」。 */
  | { cal: 'solar'; mmdd: string }
  /** 節氣名（「清明」「冬至」…）。由太陽黃經定，逐年國曆日期不同。 */
  | { cal: 'solar_term'; term: string }
  /** 伊斯蘭曆月日「MM-DD」。**我們不換算**（見檔頭與 `nextOccurrence()`）。 */
  | { cal: 'hijri'; mmdd: string };

/** `nextOccurrence()` 的回傳。`iso` 為 null 的意思見檔頭「兩種沒有日期」。 */
export interface Occurrence {
  /** 下一次的國曆日期（YYYY-MM-DD）；窗口內不存在時為 null。 */
  iso: string | null;
  /** 要顯示的日期標籤（長版措辭）。農曆會用**實際**落日的農曆日，短月退日時與登錄值不同。 */
  label: string;
  /** 該國曆日實際對應的農曆 MM-DD（僅 `cal:'lunar'` 且算得出來時有值）。 */
  lunar: string | null;
}

/**
 * 由「曆別字串＋日期字串」建出 `CalendarDate`；認不得就回 null。
 *
 * 🔴 **這是資料檔（raw JSON import，欄位型別只有 `string`）進到型別世界的唯一關口。**
 *    認不得的曆別回 null，呼叫端就必須明確決定「顯示什麼」——而不是像先前那樣
 *    掉進 `: …` 的最後一個分支，被當成回曆印出來。
 */
export function parseCalendarDate(calendar: string, value: string): CalendarDate | null {
  if (calendar === 'solar_term') return value ? { cal: 'solar_term', term: value } : null;
  if (calendar === 'lunar' || calendar === 'solar' || calendar === 'hijri') {
    return /^\d{2}-\d{2}$/.test(value) ? { cal: calendar, mmdd: value } : null;
  }
  return null;
}

/**
 * `festivals.json` 的三個**互斥 optional 欄位** → 一個 `CalendarDate`。
 *
 * ⚠️ 型別上那三個欄位可以同時存在（`lunar_date?` / `solar_date?` / `solar_term?`），
 *    資料上不行。2026-08-20 全量查證：68 筆裡 45 筆恰好一個、23 筆（draft 週報稿）
 *    三個都沒有，**沒有任何一筆超過一個**。這裡的優先序（節氣 → 農曆 → 國曆）
 *    是照抄改動前 `festivalNextSolar()` 的判斷順序，**行為刻意不變**。
 *    要真正讓「同時存在」不可能，得改 `festivals.json` 的欄位結構＝另一個題目。
 */
export function festivalCalendarDate(f: {
  lunar_date?: string | null;
  solar_date?: string | null;
  solar_term?: string | null;
}): CalendarDate | null {
  if (f.solar_term) return { cal: 'solar_term', term: f.solar_term };
  if (f.lunar_date) return { cal: 'lunar', mmdd: f.lunar_date };
  if (f.solar_date) return { cal: 'solar', mmdd: f.solar_date };
  return null;
}

/** 長版標籤（節日頁系）：「農曆七月卅」「國曆12月24日」「節氣清明」。 */
export function calendarDateLabel(d: CalendarDate): string {
  switch (d.cal) {
    case 'lunar':
      return lunarDateLabel(d.mmdd);
    case 'solar':
      return `國曆${Number(d.mmdd.slice(0, 2))}月${Number(d.mmdd.slice(3))}日`;
    case 'solar_term':
      return `節氣${d.term}`;
    case 'hijri':
      return `回曆${Number(d.mmdd.slice(0, 2))}月${Number(d.mmdd.slice(3))}日`;
  }
}

/**
 * 短版標籤（地方慶典清單頁與廟宇頁系）：「農曆七月卅」「國曆 12/24」「回曆 1 月 1 日」。
 * ⚠️ 與 `calendarDateLabel()` 的措辭差異是既有上線事實，不是漏統一（見檔頭）。
 */
export function calendarDateLabelShort(d: CalendarDate): string {
  switch (d.cal) {
    case 'lunar':
      return lunarDateLabel(d.mmdd);
    case 'solar':
      return `國曆 ${Number(d.mmdd.slice(0, 2))}/${Number(d.mmdd.slice(3))}`;
    case 'solar_term':
      return `節氣${d.term}`;
    case 'hijri':
      return `回曆 ${Number(d.mmdd.slice(0, 2))} 月 ${Number(d.mmdd.slice(3))} 日`;
  }
}

/**
 * **下一次發生日的唯一入口**：任何「這個日期下次是國曆哪一天」都走這支。
 *
 * 🔴 回曆一律回 `null`（不換算，不丟錯、不回假日期）——理由見檔頭。
 *    這與 `/festivals/local/` 那句「回曆 2 筆刻意不換算」是同一條原則，
 *    差別在於原本那是頁面上的一個 `: null` 分支，現在是型別層保證每個消費端都必須面對它。
 */
export function nextOccurrence(d: CalendarDate, fromIso: string): Occurrence | null {
  switch (d.cal) {
    case 'hijri':
      return null;
    case 'solar_term':
      return { iso: solarTermToNextSolar(d.term, fromIso), label: calendarDateLabel(d), lunar: null };
    case 'solar':
      return { iso: solarMdToNext(d.mmdd, fromIso), label: calendarDateLabel(d), lunar: null };
    case 'lunar': {
      // 短月退日時 label 要用**實際**落日的農曆日（地藏王七月卅 → 該年七月廿九）；
      // 算不出來就退回名目標籤，頁面仍顯示「農曆七月卅」但不顯示國曆日。
      const occurrence = lunarToNextOccurrence(d.mmdd, fromIso);
      return occurrence
        ? { iso: occurrence.iso, label: occurrence.label, lunar: occurrence.lunar }
        : { iso: null, label: calendarDateLabel(d), lunar: null };
    }
  }
}

/**
 * 節日 → 下一次國曆日期＋要顯示的日期標籤。統一 lunar_date（農曆月日）、
 * solar_date（固定國曆月日）與 solar_term（節氣）三種節日。
 * 頁面與 gate 都走這支，避免各自判斷「這個節日是農曆還是節氣」。
 *
 * ⚠️ 2026-08-20 起這支只是 `festivalCalendarDate()` ＋ `nextOccurrence()` 的**相容包裝**
 *    （回傳形狀 `{iso,label}` 有 13 個消費端，其中 `scripts/lib/render-context.mjs`
 *    是 gate 的鏡像）。分派邏輯已經沒有第二份，改行為改 `nextOccurrence()`。
 *    ⚠️ `festivals.json` 不會有回曆，故 `nextOccurrence()` 的 null 分支在這裡等同「無日期」。
 */
export function festivalNextSolar(
  f: { lunar_date?: string; solar_date?: string; solar_term?: string },
  fromIso: string,
): { iso: string | null; label: string } {
  const d = festivalCalendarDate(f);
  const occurrence = d ? nextOccurrence(d, fromIso) : null;
  return occurrence ? { iso: occurrence.iso, label: occurrence.label } : { iso: null, label: '' };
}
