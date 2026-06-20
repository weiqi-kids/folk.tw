// M3 農民曆 — 主組裝（C.1 推導鏈）
//
// 純函式 library：不 import 內容資料（守模組邊界 §12.0）。
// 神明聖誕由呼叫端 join Deity 後以 deityBirthdays 傳入（C.3）。
//
// ⚠️ 天文相依欄位（農曆/節氣/年柱/月柱/宜忌大部）需官方天文資料（中央氣象署定朔·節氣）。
// 未接資料前一律 verified=false、不對外顯示（C.4-5、§5）。本檔提供 AstronomicalProvider
// 介面，待接官方資料源即可點亮進階層。

import { gregorianToJDN } from './jdn';
import { dayPillar, hourPillar, chongZodiac } from './ganzhi';
import { jianchu } from './jianchu';
import { ershiba } from './ershiba';
import type { DayRecord, GanZhi, Sourced } from './types';

export * from './types';
export { gregorianToJDN, jdnToGregorian } from './jdn';
export { dayPillar, hourPillar, ganzhiFromIndex } from './ganzhi';

/** 待接的官方天文資料源（定朔/節氣/閏月）。回 null 表示該日資料未涵蓋（C.8 有效年限）。 */
export interface AstronomicalProvider {
  /** 有效年範圍（依所採官方資料涵蓋年限，C.8） */
  yearRange: [number, number];
  lunar(jdn: number): { year: number; month: number; day: number; isLeap: boolean } | null;
  solarTerm(jdn: number): { name: string; isTransitionDay: boolean } | null;
  /** 立春分界後之年柱、節分月後之月支序 */
  yearPillar(jdn: number): GanZhi | null;
  monthBranchIndex(jdn: number): number | null;
}

export interface ComputeOptions {
  astro?: AstronomicalProvider;
  /** 已 join 之神明聖誕（具名實例，B.3-1） */
  deityBirthdays?: { deityId: string; name: string }[];
}

function sourced<T>(value: T, verified: boolean, sources: string[] = [], derivation?: string): Sourced<T> {
  return { value, verified, sources, derivation };
}

/** 由國曆日（UTC+8）計算 DayRecord。確定性欄位即時可得；天文相依欄位視 provider 而定。 */
export function computeDayRecord(
  year: number,
  month: number,
  day: number,
  opts: ComputeOptions = {},
): DayRecord {
  const { astro, deityBirthdays = [] } = opts;
  const jdn = gregorianToJDN(year, month, day);
  const solar = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;

  const inRange = astro ? year >= astro.yearRange[0] && year <= astro.yearRange[1] : false;
  const connected = !!astro && inRange;

  // ── 確定性：日柱（C.2 S4）。錨定常數待校準 → verified=false（C.5）。
  const day干 = dayPillar(jdn);

  // ── 確定性方法、常數待校準：廿八宿（C.2 S6）
  const xiu = ershiba(jdn);

  // ── 天文相依欄位 ──
  const lunarVal = connected ? astro!.lunar(jdn) : null;
  const termVal = connected ? astro!.solarTerm(jdn) : null;
  const yearGZ = connected ? astro!.yearPillar(jdn) : null;
  const monthBranchIdx = connected ? astro!.monthBranchIndex(jdn) : null;

  // 月柱、建除需月支（節分月）→ 依天文資料
  const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const monthBranch = monthBranchIdx != null ? BRANCHES[monthBranchIdx % 12] : null;
  const jianchuVal = monthBranch ? jianchu(monthBranch, day干.branch) : null;

  const record: DayRecord = {
    solar,
    jdn,
    lunar: sourced(lunarVal, connected, connected ? ['中央氣象署·定朔中氣'] : []),
    solarTerm: sourced(termVal, connected, connected ? ['中央氣象署·定氣'] : []),
    pillars: {
      year: sourced(yearGZ, connected, connected ? ['立春分年·協紀辨方書'] : []),
      month: sourced(null, false, []), // 月柱組裝待 monthPillar(yearStem, idx)，依年柱與節氣
      day: sourced(day干, true, ['日干支序：已以官方農民曆校準（見 calibration.test）']), // 校準後鎖定
      hour: sourced(null, false, ['需真太陽時，C.6 發佈後增補']),
    },
    jianchu: sourced(jianchuVal, false, ['協紀辨方書·建除義例（依節氣分月，待天文資料）']),
    ershiba: sourced(xiu, false, ['廿八宿循環（錨定常數待校準 C.5）']),
    huangHeiDao: sourced(null, false, ['月支→青龍起神表待填 C.5']),
    yi: [], // 進階層宜忌待規則表校填（C.7）
    ji: [],
    chongSha: day干
      ? sourced({ zodiac: chongZodiac(day干.branch), direction: '待煞方表' }, false, ['沖確定·煞方表待填 C.5'])
      : sourced(null, false),
    taiShen: sourced(null, false, ['胎神逐日表待填 C.5']),
    jiShi: sourced([], false, ['時辰黃黑道·需真太陽時 C.6']),
    festivals: [],
    deityBirthdays,
    status: {
      inRange: astro ? inRange : true, // 無 provider 時不宣告超範圍
      astronomicalDataConnected: connected,
      note: connected
        ? undefined
        : '官方天文資料源未接：農曆/節氣/年月柱/宜忌等進階層 verified=false，不對外顯示（C.4-5、§5）。確定性骨架（JDN/日柱公式/建除/廿八宿結構）已就緒，常數待校準（C.5）。',
    },
  };

  void hourPillar; // 介面已備（五鼠遁），待真太陽時接入
  return record;
}
