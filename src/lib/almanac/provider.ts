// AstronomicalProvider 實作 — 接 lunar-javascript（壽星天文曆算法，對齊香港天文台）。
//
// C.0 宣告：農曆／節氣／定朔之天文資料以此為基準版本。lunar-javascript 之農曆、節氣、
// 干支輸出對齊香港天文台／通行通書；正式發佈前建議再對中央氣象署官方農民曆抽查（C.4-4）。
// 此 provider 點亮 M3「核心層」（農曆/節氣/年月柱/建除/廿八宿/沖煞/聖誕）；
// 「進階層」宜忌/神煞/黃黑道/胎神仍須《協紀辨方書》考據化（C.6），不由本 provider 提供。

import { Solar } from 'lunar-javascript';
import { jdnToGregorian } from './jdn';
import { BRANCHES } from './ganzhi';
import type { AstronomicalProvider, GanZhi } from './index';

function lunarOf(jdn: number) {
  const { year, month, day } = jdnToGregorian(jdn);
  return Solar.fromYmd(year, month, day).getLunar();
}

function gz(str: string): GanZhi {
  return { stem: str[0], branch: str[1], index: -1 };
}

/** 擴充 provider：額外提供 lunar-javascript 可得之核心層欄位（煞方、值日參照） */
export interface LunarAstronomicalProvider extends AstronomicalProvider {
  /** 日煞方位（C.2 S10 沖煞之煞方） */
  shaDirection(jdn: number): string | null;
  /** 節日（農曆節 + 節氣節） */
  festivals(jdn: number): string[];
  /** 建除十二神（含交節重值，C.2 S5）。回繁體。 */
  zhiXing(jdn: number): string;
}

// lunar-javascript 之建除回簡體，正規化為繁體
const ZHI_NORM: Record<string, string> = { 闭: '閉', 满: '滿', 执: '執' };

export const lunarProvider: LunarAstronomicalProvider = {
  // lunar-javascript 實務涵蓋年限充裕；宣告保守範圍（C.8 有效年限）
  yearRange: [1900, 2100],

  lunar(jdn) {
    const l = lunarOf(jdn);
    return {
      year: l.getYear(),
      month: Math.abs(l.getMonth()),
      day: l.getDay(),
      isLeap: l.getMonth() < 0, // lunar-javascript 以負月表閏月
    };
  },

  solarTerm(jdn) {
    const l = lunarOf(jdn);
    const today = l.getJieQi(); // 當日恰為節氣則回名稱，否則 ''
    if (today) return { name: today, isTransitionDay: true };
    const prev = l.getPrevJieQi(true); // 含當前所在節氣區間
    return { name: prev ? prev.getName() : '', isTransitionDay: false };
  },

  yearPillar(jdn) {
    // 立春分年（C.2 S4）
    return gz(lunarOf(jdn).getYearInGanZhiByLiChun());
  },

  monthBranchIndex(jdn) {
    // getMonthInGanZhi 以「節」分月（節分月，C.2 S4）
    const branch = lunarOf(jdn).getMonthInGanZhi()[1];
    return BRANCHES.indexOf(branch as (typeof BRANCHES)[number]);
  },

  shaDirection(jdn) {
    const s = lunarOf(jdn).getDaySha();
    return s ? `煞${s}` : null;
  },

  festivals(jdn) {
    const l = lunarOf(jdn);
    const out = [...l.getFestivals()]; // 農曆節（春節/端午/中秋…）
    const jq = l.getJieQi();
    if (jq && ['清明', '冬至'].includes(jq)) out.push(jq); // 兼具節日意義之節氣
    return out;
  },

  zhiXing(jdn) {
    const z = lunarOf(jdn).getZhiXing(); // 已含交節重值（C.2 S5）
    return ZHI_NORM[z] ?? z;
  },
};
