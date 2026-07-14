// AstronomicalProvider 實作 — 接 lunar-javascript（壽星天文曆算法，對齊香港天文台）。
//
// C.0 宣告：農曆／節氣／定朔之天文資料以此為基準版本。lunar-javascript 之農曆、節氣、
// 干支輸出對齊香港天文台／通行通書；正式發佈前建議再對中央氣象署官方農民曆抽查（C.4-4）。
// 此 provider 點亮 M3「核心層」（農曆/節氣/年月柱/建除/廿八宿/沖煞/聖誕）；
// 「進階層」宜忌/神煞/黃黑道/胎神仍須《協紀辨方書》考據化（C.6），不由本 provider 提供。

import { Solar } from 'lunar-javascript';
import { jdnToGregorian, gregorianToJDN } from './jdn';
import { BRANCHES } from './ganzhi';
import type { AstronomicalProvider, GanZhi } from './index';

// lunar-javascript 之節氣／節日名回簡體；本站為繁體（zh-Hant-TW），逐一正規化。
// 二十四節氣僅 5 個簡繁有別，其餘同形。
const TERM_TRAD: Record<string, string> = { 惊蛰: '驚蟄', 谷雨: '穀雨', 小满: '小滿', 芒种: '芒種', 处暑: '處暑' };
const tt = (n: string) => TERM_TRAD[n] ?? n;
// 農曆節日名簡→繁（lunar-javascript getFestivals 回簡體）。
const FEST_TRAD: Record<string, string> = {
  春节: '春節', 元宵节: '元宵節', 龙头节: '龍頭節', 上巳节: '上巳節', 寒食节: '寒食節',
  端午节: '端午節', 七夕: '七夕', 中元节: '中元節', 中秋节: '中秋節', 重阳节: '重陽節',
  寒衣节: '寒衣節', 下元节: '下元節', 腊八节: '臘八節', 除夕: '除夕', 清明节: '清明節',
};
const ft = (n: string) => FEST_TRAD[n] ?? n;

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
  /** 七十二候：當前節氣（繁體）與候序（0 初候/1 次候/2 末候）。 */
  houInfo(jdn: number): { term: string; index: number } | null;
  /** 節氣倒數：距上一節氣已過、距下一節氣尚餘日數（皆繁體名）。 */
  termCountdown(jdn: number): { prevName: string; sinceDays: number; nextName: string; untilDays: number } | null;
}

// lunar-javascript 之建除回簡體，正規化為繁體（滿/執/開/閉）
const ZHI_NORM: Record<string, string> = { 闭: '閉', 满: '滿', 执: '執', 开: '開' };
// getDaySha 之煞方回簡體（东/南/西/北），僅「东」簡繁有別，正規化為繁體。
const SHA_TRAD: Record<string, string> = { 东: '東' };

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
    if (today) return { name: tt(today), isTransitionDay: true };
    const prev = l.getPrevJieQi(true); // 含當前所在節氣區間
    return { name: prev ? tt(prev.getName()) : '', isTransitionDay: false };
  },

  // 七十二候：回當前節氣與候序（0 初候 / 1 次候 / 2 末候）。物候文字由呼叫端 join 古籍表。
  // 候序由「距當前節氣起算日數」定（每候約五日：0–4 初、5–9 次、≥10 末），不依賴
  // lunar-javascript getHou 之標籤（其用 初/二/三候，且 bundled 型別未涵蓋）。
  houInfo(jdn) {
    type JQ = { getName(): string; getSolar(): { getYear(): number; getMonth(): number; getDay(): number } };
    const prev = (lunarOf(jdn) as unknown as { getPrevJieQi(b: boolean): JQ }).getPrevJieQi(true);
    if (!prev) return null;
    const ps = prev.getSolar();
    const since = jdn - gregorianToJDN(ps.getYear(), ps.getMonth(), ps.getDay());
    return { term: tt(prev.getName()), index: Math.min(2, Math.max(0, Math.floor(since / 5))) };
  },

  // 節氣倒數：距上一節氣已過日數、距下一節氣尚餘日數（皆繁體名）。
  termCountdown(jdn) {
    type JQ = { getName(): string; getSolar(): { getYear(): number; getMonth(): number; getDay(): number } };
    const l = lunarOf(jdn) as unknown as { getPrevJieQi(b: boolean): JQ; getNextJieQi(b: boolean): JQ };
    const prev = l.getPrevJieQi(true);
    const next = l.getNextJieQi(true);
    if (!prev || !next) return null;
    const ps = prev.getSolar();
    const ns = next.getSolar();
    return {
      prevName: tt(prev.getName()),
      sinceDays: jdn - gregorianToJDN(ps.getYear(), ps.getMonth(), ps.getDay()),
      nextName: tt(next.getName()),
      untilDays: gregorianToJDN(ns.getYear(), ns.getMonth(), ns.getDay()) - jdn,
    };
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
    return s ? `煞${SHA_TRAD[s] ?? s}` : null;
  },

  festivals(jdn) {
    const l = lunarOf(jdn);
    const out = l.getFestivals().map(ft); // 農曆節（春節/端午/中秋…），簡→繁
    const jq = tt(l.getJieQi());
    if (jq && ['清明', '冬至'].includes(jq)) out.push(jq); // 兼具節日意義之節氣
    return out;
  },

  zhiXing(jdn) {
    const z = lunarOf(jdn).getZhiXing(); // 已含交節重值（C.2 S5）
    return ZHI_NORM[z] ?? z;
  },
};
