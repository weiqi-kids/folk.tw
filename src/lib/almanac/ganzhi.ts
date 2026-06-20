// C.2 S4 — 干支與四柱（部分確定、部分待校準）
import type { GanZhi } from './types';

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
export const BRANCHES = [
  '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥',
] as const;
/** 地支對應生肖（沖煞用，C.2 S10） */
export const ZODIACS = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬'] as const;

/** 由 0..59 干支序組出 GanZhi */
export function ganzhiFromIndex(index: number): GanZhi {
  const i = ((index % 60) + 60) % 60;
  return { stem: STEMS[i % 10], branch: BRANCHES[i % 12], index: i };
}

// ── 日柱（C.2 S4，最先可驗） ───────────────────────────
//
// 日干支序 =（JDN + DAY_GANZHI_ANCHOR）mod 60。
// 校準來源（C.5）：以下三個獨立日期交叉驗證，三者均得 ANCHOR = 49：
//   • 2020-01-01 = 癸卯日（干支序39）：來源 wannianrili.bmcx.com，JDN=2458850
//   • 2023-01-01 = 己未日（干支序55）：來源 wannianrili.bmcx.com，JDN=2459946
//   • 2026-06-20 = 乙丑日（干支序 1）：來源 goodaytw.com + wannianrili.bmcx.com，JDN=2461212
// 計算：(干支序 − JDN) mod 60，三者皆得 49。
export const DAY_GANZHI_ANCHOR = 49;

export function dayPillar(jdn: number): GanZhi {
  return ganzhiFromIndex(jdn + DAY_GANZHI_ANCHOR);
}

// ── 五虎遁 / 五鼠遁（C.2 S4，確定） ───────────────────
// 年干（或日干）→ 正月天干 / 子時天干。
// 甲己→丙/甲、乙庚→戊/丙、丙辛→庚/戊、丁壬→壬/庚、戊癸→甲/壬。
const WU_HU_DUN: Record<string, string> = {
  甲: '丙', 己: '丙', 乙: '戊', 庚: '戊', 丙: '庚', 辛: '庚', 丁: '壬', 壬: '壬', 戊: '甲', 癸: '甲',
};
const WU_SHU_DUN: Record<string, string> = {
  甲: '甲', 己: '甲', 乙: '丙', 庚: '丙', 丙: '戊', 辛: '戊', 丁: '庚', 壬: '庚', 戊: '壬', 癸: '壬',
};

/**
 * 月柱（C.2 S4）。月建固定（正月建寅…），月干由五虎遁。
 * @param yearStem 立春分界後之年干（見年柱）
 * @param monthBranchIndex 月支序：正月建寅=2 … 由節分月（需節氣，待天文資料）
 */
export function monthPillar(yearStem: string, monthBranchIndex: number): GanZhi {
  const firstMonthStem = WU_HU_DUN[yearStem]; // 正月（建寅）天干
  const firstStemIdx = STEMS.indexOf(firstMonthStem as (typeof STEMS)[number]);
  // 正月=寅(序2)。從寅起算第 n 個月，天干順排
  const offset = (monthBranchIndex - 2 + 12) % 12;
  const stem = STEMS[(firstStemIdx + offset) % 10];
  return { stem, branch: BRANCHES[monthBranchIndex % 12], index: -1 };
}

/** 時柱（C.2 S4）。時支按時辰，時干由五鼠遁。需真太陽時（C.6 發佈後增補）。 */
export function hourPillar(dayStem: string, hourBranchIndex: number): GanZhi {
  const ziStem = WU_SHU_DUN[dayStem]; // 子時天干
  const ziStemIdx = STEMS.indexOf(ziStem as (typeof STEMS)[number]);
  const stem = STEMS[(ziStemIdx + (hourBranchIndex % 12)) % 10];
  return { stem, branch: BRANCHES[hourBranchIndex % 12], index: -1 };
}

/** 日支 → 對沖生肖（C.2 S10）。子午、丑未…相沖。 */
export function chongZodiac(dayBranch: string): string {
  const i = BRANCHES.indexOf(dayBranch as (typeof BRANCHES)[number]);
  return ZODIACS[(i + 6) % 12];
}
