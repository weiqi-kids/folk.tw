// 生肖 × 太歲：/zodiac/ 的唯一判定入口。頁面不得自行重算。
//
// 🔴 這裡只做**曆法關係的陳述**，不做吉凶預測：
//    「屬鼠今年沖太歲」是地支關係（子午相沖），與「今年會不順」是兩回事。
//    後者查無權威源，站上不寫（總紅線 1）。頁面文案同此界線。
//
// 資料全部來自站上既有農民曆引擎，不自建算法：
//   · 年柱（立春分年）── computeDayRecord().pillars.year，verified=true
//     來源：C.2 S4 ＋ lunar-javascript（壽星天文曆算法，對齊香港天文台）
//   · 日支對沖生肖 ──  chongZodiac()，C.2 S10，verified=true
//
// ⚠️ 值太歲／沖太歲只取「同支」與「對沖」兩種。刑／害／破在通行黃曆裡寫法不一，
//    站上的神煞投票表尚未涵蓋，**查證前不寫**——寧可少講兩種，不要湊滿五種。

import { BRANCHES, ZODIACS, chongZodiac } from './almanac/ganzhi.ts';
import { computeDayRecord } from './almanac/index.ts';
import { lunarProvider } from './almanac/provider.ts';

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

// ── 安太歲：哪些廟登記了 ────────────────────────────────────────────────────
// 🔴 措辭界線（同 src/pages/temples/[id].astro 那條）：`festivals[]` 是**廟方自己向內政部
//    登記的年度慶(祭)典**，所以可以說「登記的祭典中列有安太歲」，
//    **不可以**說「本廟提供安太歲服務」——我們沒有任何一年的實際辦理紀錄。
// ⚠️ 認 `festivals[]` 的 **name 與 desc 兩欄**：實測 14 筆裡有 8 筆寫在 desc
//    （祭典名是「玉皇大帝聖壽」，描述才寫「同時安斗.安光明燈.安太歲」）。只看 name 會漏一半。
// ⚠️ 同時認「安奉太歲」寫法（如「安奉太歲星君上燈大典」），那是同一件事的不同措辭。
//    但**不認單獨的「太歲」**——「太歲殿」是建築、「太歲星君聖誕」是神明生日，都不是辦安太歲。
// ⚠️ `history` 裡也有幾筆提到安太歲，但那是沿革敘事（「某年增建太歲殿」這類），
//    不等於現在有辦，故不收。參拜流程（IndexID=4）到齊後可再加一條來源，那批才是「現在怎麼參拜」。
// ── 太歲殿：哪些廟有供奉太歲的殿／神位 ──────────────────────────────────────
// 🔴 這是**比上面那條弱**的一種事實，兩者不可混為一談：
//    · `antaisuiTemples()`（下面那支）＝廟方登記的**年度祭典**列有安太歲 → 那是「有在辦」。
//    · 本支＝廟方登記的**內容欄位**（沿革／建築特色／參拜流程／簡介）提到太歲殿或太歲星君
//      → 那只是「這間廟有這個殿／這尊神」，**不代表現在有提供安太歲服務**。
//    頁面上的措辭必須跟著這條界線走，check:rendered 會驗那句 caveat 在不在。
//
// 📌 為什麼要有這支（2026-08-08）：原本的計畫是「等參拜流程（IndexID=4）到齊後，
//    從裡面抽『安太歲』關鍵字」。參拜流程 706/706 到齊後實測——**0 筆提到安太歲**。
//    假設是錯的，資料到齊也沒解開。但同一批資料裡有 79 間在參拜動線寫到太歲殿，
//    全欄位合計 139 間，那是真實且有源的事實，只是它回答的問題比原本設想的窄。
//
// ⚠️ 認「太歲殿／太歲星君／太歲君／太歲廳」，**不認單獨的「太歲」**——
//    「犯太歲」「太歲頭上動土」是詞語不是設施，收進來就是假資料。
const TAISUI_SHRINE_RE = /太歲殿|太歲星君|太歲君|太歲廳/;
export function taisuiShrineTemples(
  temples: { id: string; data: { name: string; district?: string; history?: string; architecture?: string; worship_flow?: string; intro?: string } }[],
) {
  return temples
    .filter((t) => {
      const d = t.data;
      return TAISUI_SHRINE_RE.test(`${d.history ?? ''}${d.architecture ?? ''}${d.worship_flow ?? ''}${d.intro ?? ''}`);
    })
    .map((t) => ({ id: t.id, name: t.data.name, district: t.data.district ?? '' }))
    .sort((a, b) => a.district.localeCompare(b.district) || a.name.localeCompare(b.name));
}

const ANTAISUI_RE = /安太歲|安奉[^，。、]{0,6}太歲/;
export function antaisuiTemples(
  temples: { id: string; data: { name: string; district?: string; festivals?: { name?: string; desc?: string }[] } }[],
) {
  return temples
    .filter((t) => (t.data.festivals ?? []).some(
      (f) => ANTAISUI_RE.test(String(f?.name ?? '')) || ANTAISUI_RE.test(String(f?.desc ?? '')),
    ))
    .map((t) => ({ id: t.id, name: t.data.name, district: t.data.district ?? '' }))
    .sort((a, b) => a.district.localeCompare(b.district) || a.name.localeCompare(b.name));
}
