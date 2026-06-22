// M3 農民曆 — 主組裝（C.1 推導鏈）
//
// 純函式 library：不 import 內容資料（守模組邊界 §12.0）。
// 神明聖誕由呼叫端 join Deity 後以 deityBirthdays 傳入（C.3）。
//
// ⚠️ 天文相依欄位（農曆/節氣/年柱/月柱/宜忌大部）需官方天文資料（中央氣象署定朔·節氣）。
// 未接資料前一律 verified=false、不對外顯示（C.4-5、§5）。本檔提供 AstronomicalProvider
// 介面，待接官方資料源即可點亮進階層。

import { gregorianToJDN } from './jdn';
import { dayPillar, hourPillar, chongZodiac, monthPillar, BRANCHES } from './ganzhi';
import { jianchu } from './jianchu';
import { ershiba } from './ershiba';
import { activeShenSha } from './shensha';
import { huangHeiDao } from './huanghei';
import { resolveAffair } from './resolve';
import affairsData from './rules/affairs.json';
import taishenData from './rules/taishen.json';
import wuhouData from './rules/wuhou.json';
import pengzuData from './rules/pengzu.json';
import nayinData from './rules/nayin.json';
import type { DayRecord, GanZhi, Sourced, DayVerdict } from './types';

const AFFAIRS = (affairsData as { affairs: { id: string; name: string }[] }).affairs;
const AFFAIR_NAME = new Map(AFFAIRS.map((a) => [a.id, a.name]));
const TAISHEN = (taishenData as { taishen: { ganzhi: string; fang: string; sources?: string[]; verified?: boolean }[] }).taishen;
// C 豐化古籍表（決定性、掛源）
const WUHOU = wuhouData as { terms: Record<string, string[]>; houLabels: string[]; _source: string };
const PENGZU = pengzuData as { gan: Record<string, string>; zhi: Record<string, string>; _source: string };
const NAYIN = nayinData as { map: Record<string, string>; _source: string };

/** 月相（依農曆日近似；真月相依定朔時刻，此處以民俗常用之農曆日對應） */
function moonPhaseOf(day: number): string {
  if (day === 1) return '朔（新月）';
  if (day <= 6) return '蛾眉月';
  if (day <= 8) return '上弦月';
  if (day <= 13) return '盈凸月';
  if (day <= 16) return '望（滿月）';
  if (day <= 21) return '虧凸月';
  if (day <= 23) return '下弦月';
  return '殘月';
}

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
  /** 日煞方位（C.2 S10）；可選 */
  shaDirection?(jdn: number): string | null;
  /** 節日（農曆節 + 節氣節）；可選 */
  festivals?(jdn: number): string[];
  /** 建除十二神（含交節重值，C.2 S5）；可選——優先於本站公式 */
  zhiXing?(jdn: number): string;
  /** 七十二候：當前節氣（繁體）與候序 index（C 豐化）；可選 */
  houInfo?(jdn: number): { term: string; index: number } | null;
  /** 節氣倒數：距上一/下一節氣日數；可選 */
  termCountdown?(jdn: number): { prevName: string; sinceDays: number; nextName: string; untilDays: number } | null;
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

  // 月柱、建除依月支（節分月）→ 依天文資料；月柱由年干＋月支序組裝（五虎遁）
  const monthBranch = monthBranchIdx != null ? BRANCHES[monthBranchIdx % 12] : null;
  // 建除：優先用 provider（含交節重值，C.2 S5）；無 provider 時退本站公式（不含重值）
  const jianchuVal = connected && astro?.zhiXing
    ? astro.zhiXing(jdn)
    : monthBranch
      ? jianchu(monthBranch, day干.branch)
      : null;
  const monthGZ =
    connected && yearGZ && monthBranchIdx != null ? monthPillar(yearGZ.stem, monthBranchIdx) : null;
  const shaDir = connected && astro?.shaDirection ? astro.shaDirection(jdn) : null;

  const SRC_LUNAR = ['lunar-javascript（壽星天文曆算法，對齊香港天文台）；發佈前對中央氣象署抽查 C.4-4'];

  // ── 進階層（C.6 考據化）：神煞集合 → 黃黑道 / 宜忌；verified 取規則表 verified ──
  let huangHei: DayRecord['huangHeiDao'] = sourced(null, false, ['進階層：月支→青龍起神表待考據化 C.6']);
  let yi: DayVerdict[] = [];
  let ji: DayVerdict[] = [];
  let taiShen: Sourced<string | null> = sourced(null, false, ['進階層：胎神逐日表待考據化 C.6']);
  if (connected && monthBranch && jianchuVal) {
    const ctx = {
      monthBranch,
      dayStem: day干.stem,
      dayBranch: day干.branch,
      dayGanZhi: `${day干.stem}${day干.branch}`,
    };
    const active = activeShenSha(ctx);
    const activeSet = new Set(active.map((a) => a.id));
    const verifiedSet = new Set(active.filter((a) => a.verified).map((a) => a.id));

    // S9 宜忌組裝（每事項一裁決，帶 derivation＋sources＋verified）
    for (const a of AFFAIRS) {
      const v = resolveAffair(a.id, activeSet, jianchuVal, verifiedSet);
      if (!v) continue;
      v.affair = AFFAIR_NAME.get(a.id) ?? a.id;
      (v.judgement === '宜' ? yi : ji).push(v);
    }

    // S7 黃黑道
    const hh = huangHeiDao(monthBranch, day干.branch);
    if (hh) huangHei = sourced({ name: hh.name, auspicious: hh.auspicious }, hh.verified, hh.sources);

    // S10 胎神（逐日表）
    const ts = TAISHEN.find((t) => t.ganzhi === ctx.dayGanZhi);
    if (ts && ts.fang && ts.fang !== '待查') {
      taiShen = sourced(ts.fang, !!ts.verified, ts.sources ?? ['胎神逐日表']);
    }
  }

  // ── C 豐化：彭祖百忌 / 納音（僅依日干支，恆可得）；七十二候 / 月相 / 節氣倒數（依天文 provider） ──
  const pgGan = PENGZU.gan[day干.stem];
  const pgZhi = PENGZU.zhi[day干.branch];
  const pengZu: Sourced<{ gan: string; zhi: string } | null> =
    pgGan && pgZhi ? sourced({ gan: pgGan, zhi: pgZhi }, true, [PENGZU._source]) : sourced(null, false);
  const nyVal = NAYIN.map[`${day干.stem}${day干.branch}`] ?? null;
  const naYin: Sourced<string | null> = sourced(nyVal, !!nyVal, nyVal ? [NAYIN._source] : []);

  let wuHou: Sourced<{ term: string; hou: string; phenology: string } | null> = sourced(null, false);
  let termCountdown: DayRecord['termCountdown'] = null;
  let moonPhase: string | null = null;
  if (connected) {
    const hi = astro?.houInfo?.(jdn);
    if (hi && WUHOU.terms[hi.term]?.[hi.index] != null) {
      wuHou = sourced(
        { term: hi.term, hou: WUHOU.houLabels[hi.index], phenology: WUHOU.terms[hi.term][hi.index] },
        true,
        [WUHOU._source],
      );
    }
    termCountdown = astro?.termCountdown?.(jdn) ?? null;
    if (lunarVal) moonPhase = moonPhaseOf(lunarVal.day);
  }

  const record: DayRecord = {
    solar,
    jdn,
    lunar: sourced(lunarVal, connected, connected ? SRC_LUNAR : []),
    solarTerm: sourced(termVal, connected, connected ? SRC_LUNAR : []),
    pillars: {
      year: sourced(yearGZ, connected, connected ? ['立春分年（C.2 S4）；' + SRC_LUNAR[0]] : []),
      month: sourced(monthGZ, connected, connected ? ['節分月＋五虎遁（C.2 S4）'] : []),
      day: sourced(day干, true, ['日干支序公式，已以官方農民曆＋lunar-javascript 跨6日校準（calibration.test）']),
      hour: sourced(null, false, ['需真太陽時（經度＋均時差），C.6 發佈後增補']),
    },
    // 建除：本站公式 + 真月支；與 lunar-javascript 一致（calibration.test 交叉驗證）
    jianchu: sourced(jianchuVal, connected, connected ? ['建除義例（C.2 S5）；交叉驗證 lunar-javascript'] : []),
    // 廿八宿：錨定常數已以 lunar-javascript 跨6日校準（C.5）
    ershiba: sourced(xiu, true, ['七政廿八宿值日，錨定常數已校準（calibration.test）']),
    // 黃黑道／宜忌（進階層，C.6 考據化）：引擎已產出，verified 取規則表，未驗證者頁面不顯示
    huangHeiDao: huangHei,
    yi,
    ji,
    // C 豐化（決定性、掛源）
    wuHou,
    pengZu,
    naYin,
    moonPhase,
    termCountdown,
    chongSha: day干
      ? sourced(
          { zodiac: chongZodiac(day干.branch), direction: shaDir ?? '—' },
          connected, // 沖為確定；煞方來自 lunar-javascript
          connected ? ['沖：日支對沖（C.2 S10）；煞方：lunar-javascript'] : ['沖：日支對沖（確定）'],
        )
      : sourced(null, false),
    taiShen,
    jiShi: sourced([], false, ['時辰黃黑道·需真太陽時 C.6']),
    festivals: connected && astro?.festivals ? astro.festivals(jdn) : [],
    deityBirthdays,
    status: {
      inRange: astro ? inRange : true, // 無 provider 時不宣告超範圍
      astronomicalDataConnected: connected,
      note: connected
        ? '核心層已接天文資料源（lunar-javascript）：農曆/節氣/四柱(除時柱)/建除/廿八宿/沖煞/節日/聖誕已點亮。進階層（黃黑道/神煞/宜忌/胎神）仍須《協紀辨方書》考據化（C.6），verified=false 不對外顯示。'
        : '官方天文資料源未接：農曆/節氣/年月柱等核心層 verified=false。確定性骨架（JDN/日柱/廿八宿）已就緒。',
    },
  };

  void hourPillar; // 介面已備（五鼠遁），待真太陽時接入
  return record;
}
