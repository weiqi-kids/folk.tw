// 生肖 × 太歲：/zodiac/ 的唯一判定入口。頁面不得自行重算。
//
// 🔴 這裡只做**曆法關係的陳述**，不做吉凶預測：
//    「屬鼠今年沖太歲」是地支關係（子午相沖），與「今年會不順」是兩回事。
//    後者查無權威源，本站不寫（總紅線 1）。頁面文案同此界線。
//
// 資料全部來自站上既有農民曆引擎，不自建算法：
//   · 年柱（立春分年）── computeDayRecord().pillars.year，verified=true
//     來源：C.2 S4 ＋ lunar-javascript（壽星天文曆算法，對齊香港天文台）
//   · 日支對沖生肖 ──  chongZodiac()，C.2 S10，verified=true
//
// ⚠️ 值太歲／沖太歲只取「同支」與「對沖」兩種。刑／害／破在通行黃曆裡寫法不一，
//    站上的神煞投票表尚未涵蓋，**查證前不寫**——寧可少講兩種，不要湊滿五種。

import { BRANCHES, ZODIACS, chongZodiac } from './almanac/ganzhi';
import { computeDayRecord } from './almanac';
import { lunarProvider } from './almanac/provider';

export type ZodiacSlug =
  | 'rat' | 'ox' | 'tiger' | 'rabbit' | 'dragon' | 'snake'
  | 'horse' | 'goat' | 'monkey' | 'rooster' | 'dog' | 'pig';

/** 12 生肖：slug ／ 中文 ／ 地支。順序＝地支序（子起），不可調動。 */
export const ZODIAC_LIST: { slug: ZodiacSlug; name: string; branch: string }[] =
  (['rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake',
    'horse', 'goat', 'monkey', 'rooster', 'dog', 'pig'] as ZodiacSlug[])
    .map((slug, i) => ({ slug, name: ZODIACS[i], branch: BRANCHES[i] }));

export const bySlug = new Map(ZODIAC_LIST.map((z) => [z.slug, z]));
export const byName = new Map(ZODIAC_LIST.map((z) => [z.name, z]));

/** 今年年柱（立春分年）。取自農民曆引擎，附其 verified 與來源。 */
export function yearPillarOf(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const p = computeDayRecord(y, m, d, { astro: lunarProvider }).pillars.year;
  // 年柱理論上恆有值（立春分年不需時柱那種真太陽時），但型別上可為 null——
  // 真的拿不到就回空字串讓下游關係判定全部落在 'none'，不臆造一個年支出來。
  return {
    stem: p.value?.stem ?? '',
    branch: p.value?.branch ?? '',
    verified: p.verified,
    sources: p.sources,
  };
}

export type TaisuiRelation = 'zhi' | 'chong' | 'none';

/**
 * 生肖與當年地支的關係。
 * zhi   ＝ 值太歲（生肖地支＝年支，俗稱「本命年」）
 * chong ＝ 沖太歲（生肖地支與年支對沖）
 * none  ＝ 兩者皆非。**不代表吉凶**，只代表沒有這兩種地支關係。
 */
export function taisuiRelation(zodiacBranch: string, yearBranch: string): TaisuiRelation {
  if (zodiacBranch === yearBranch) return 'zhi';
  const yi = BRANCHES.indexOf(yearBranch as (typeof BRANCHES)[number]);
  if (yi >= 0 && BRANCHES[(yi + 6) % 12] === zodiacBranch) return 'chong';
  return 'none';
}

export const RELATION_LABEL: Record<TaisuiRelation, string> = {
  zhi: '值太歲（本命年）',
  chong: '沖太歲',
  none: '無值沖關係',
};

/** 今年值太歲／沖太歲各是哪個生肖。 */
export function taisuiZodiacs(yearBranch: string) {
  const i = BRANCHES.indexOf(yearBranch as (typeof BRANCHES)[number]);
  return { zhi: ZODIACS[i], chong: ZODIACS[(i + 6) % 12] };
}

/**
 * 某生肖對應的出生年（西元）。
 * ⚠️ 以**立春**分年，非元旦也非農曆正月初一——年初出生者可能屬前一個生肖，
 *    頁面必須把這句話寫出來，否則就是給了會出錯的答案。
 */
export function birthYears(branch: string, from = 1936, to = 2032): number[] {
  const bi = BRANCHES.indexOf(branch as (typeof BRANCHES)[number]);
  const out: number[] = [];
  for (let y = from; y <= to; y++) if (((y - 4) % 12 + 12) % 12 === bi) out.push(y);
  return out;
}

/** 起始日起 n 天的「今日沖生肖」。與 /almanac/chongsha/ 同一個引擎。 */
export function chongDays(startIso: string, n: number) {
  const out: { iso: string; md: string; zodiac: string; dir: string }[] = [];
  const [sy, sm, sd] = startIso.split('-').map(Number);
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(sy, sm - 1, sd + i));
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    const cs = computeDayRecord(y, m, d, { astro: lunarProvider }).chongSha.value;
    out.push({
      iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      md: `${m}/${d}`,
      zodiac: cs?.zodiac ?? '—',
      dir: (cs?.direction ?? '').replace(/^煞/, '') || '—',
    });
  }
  return out;
}

export { chongZodiac };
