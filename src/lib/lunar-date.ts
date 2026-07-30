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
    if (ld === wantD) return iso;
    if (wantD === 30 && ld === 29 && isLunarMonthEnd(iso)) return iso;
  }
  return null;
}

/** 國曆 ISO → 「M/D」顯示形式（如 2026-08-27 → 8/27）。 */
export const solarMd = (iso: string): string => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/**
 * 節氣名（如「清明」「冬至」）→ 自 fromIso 起的下一次國曆日期，找不到回 null。
 * 為何需要這支：**清明、冬至等節日是節氣、不是農曆月日**（清明約落在國曆 4/4–4/6，由太陽黃經定，
 * 農曆日期每年不同），故不能用 lunarToNextSolar 表達。節氣表由 lunar-javascript 提供（與農民曆同源）。
 */
/**
 * 節日 → 下一次國曆日期＋要顯示的日期標籤。統一 lunar_date（農曆月日）與 solar_term（節氣）兩種節日。
 * 頁面與 gate 都走這支，避免各自判斷「這個節日是農曆還是節氣」。
 */
export function festivalNextSolar(
  f: { lunar_date?: string; solar_term?: string },
  fromIso: string,
): { iso: string | null; label: string } {
  if (f.solar_term) {
    return { iso: solarTermToNextSolar(f.solar_term, fromIso), label: `節氣${f.solar_term}` };
  }
  if (f.lunar_date) {
    return { iso: lunarToNextSolar(f.lunar_date, fromIso), label: lunarDateLabel(f.lunar_date) };
  }
  return { iso: null, label: '' };
}

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
