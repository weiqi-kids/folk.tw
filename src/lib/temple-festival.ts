// 廟宇年度祭典的**顯示層唯一真實來源**：資料（temples.json 的 `festivals[]`）→ 要印出來的字。
//
// 為何獨立成檔、且只 import lunar-date.ts：
//   同一套推導有三個消費者——廟宇頁 `[id].astro`、OG 分享卡 `gen-og-temples.mjs`（bare node）、
//   部署 gate `check-rendered.mjs`（bare node）。gate 必須用**與頁面完全相同**的推導去驗渲染結果，
//   否則就是在 gate 裡重寫一份規則（CLAUDE.md 明令禁止：廟宇地區解析曾因此在 12 處出錯）。
//   `lunar-date.ts` 刻意零專案內 import，故本檔可被 bare node 以 --experimental-strip-types 載入
//   （`.ts` 副檔名寫死是必要的，tsconfig 已開 allowImportingTsExtensions）。
//
// 🔴 措辭界線（沿用 gen-og-temples.mjs recentActivity() 的既有約定，2026-07-30 用戶討論後定案）：
//   ・主祀神聖誕只能標「○○聖誕」＝陳述**神明的**生日，**不宣稱該廟那天辦什麼**。
//   ・`festivals[]` 不同——這是廟方向內政部登記的**該廟年度慶(祭)典**，
//     所以標「主要祭典」是有事實根據的，不是替廟方斷言。**這正是這批資料的價值所在。**
//   改這裡的措辭前先想清楚上面兩條的差別。

import { lunarDateLabel, lunarToNextSolar, solarMd } from './lunar-date.ts';

export type TempleFestival = {
  name: string;
  calendar: 'lunar' | 'solar';
  date: string; // MM-DD
  desc?: string;
};

/**
 * 泛稱祭典名：來源資料裡有大量「祭典」「祀慶」這類沒有指涉的名稱（光「祭典」就 119 筆）。
 * **不影響挑選哪一筆**（挑選規則＝農曆日期最早，2026-07-31 用戶裁示，不做語意判斷），
 * 只影響**怎麼把它寫成一句話**——「○○宮的主要祭典為『祭典』」是病句，
 * 改寫成「○○宮的年度祭典在農曆八月十五」則同樣忠於資料且讀得通。
 */
const GENERIC_NAMES = new Set(['祭典', '祀慶', '例祭', '主神聖誕', '主神佛誕', '慶典', '祭祀']);
export const isGenericFestivalName = (n: string): boolean => GENERIC_NAMES.has(n.trim());

/** 固定排序：農曆在前 → 日期 → 名稱。純函式、不依賴儲存順序，故頁面與 gate 必然一致。 */
export function sortFestivals(list: readonly TempleFestival[]): TempleFestival[] {
  return [...list].sort(
    (a, b) =>
      (a.calendar === b.calendar ? 0 : a.calendar === 'lunar' ? -1 : 1) ||
      a.date.localeCompare(b.date) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * 代表祭典（顯示在 OG 卡第三行與 meta description）＝**農曆日期最早者**；
 * 全無農曆筆時才取國曆最早者。2026-07-31 用戶裁示：不做語意判斷，最簡單可預測。
 */
export function pickMainFestival(list: readonly TempleFestival[] | undefined): TempleFestival | null {
  if (!list || list.length === 0) return null;
  return sortFestivals(list)[0] ?? null;
}

/** 「農曆七月十五（國曆 8/27）」；todayIso 未給或換算不出則只回農曆標籤。 */
export function festivalDateLabel(f: TempleFestival, todayIso?: string): string {
  if (f.calendar === 'solar') return `國曆 ${Number(f.date.slice(0, 2))}/${Number(f.date.slice(3))}`;
  const lunar = lunarDateLabel(f.date);
  if (!lunar) return '';
  const iso = todayIso ? lunarToNextSolar(f.date, todayIso) : null;
  return iso ? `${lunar}（國曆 ${solarMd(iso)}）` : lunar;
}

/**
 * OG 分享卡第三行用：{ label, text }。與 `recentActivity()` 的既有介面一致。
 * 泛稱名不進 text（避免卡面出現「祭典」兩個字當標題），只留日期。
 */
export function festivalCardLine(
  f: TempleFestival,
  todayIso?: string,
): { label: string; text: string } {
  const date = festivalDateLabel(f, todayIso);
  // ⚠️ 名稱過長就**只顯示日期**（與泛稱名同樣走「年度祭典」標籤），不硬塞後截斷。
  // 原因：OG 卡的活動文字只排得下兩行（`wrap(text, 25)`），名稱一長就會在**日期中間**斷行
  // （實測「…農曆三月」／「初三（國曆 4/9）」），而日期正是外撥要傳達給廟方的資訊。
  // 來源有 118 筆代表名超過 10 字，其中 35 筆根本是被塞進名稱欄的整段說明——
  // 截斷後留下的殘句本來也沒有資訊量，不如乾淨地只給日期。
  const NAME_FITS = 10;
  return isGenericFestivalName(f.name) || f.name.length > NAME_FITS
    ? { label: '年度祭典', text: date }
    : { label: '主要祭典', text: `${f.name}　${date}` };
}

/**
 * 一句話敘述，供 meta description、FAQ 答案與頁面摘要用。
 * 泛稱名改走「年度祭典在<日期>」句型，避免「主要祭典為『祭典』」這種病句。
 */
export function festivalSentence(templeName: string, f: TempleFestival, todayIso?: string): string {
  const date = festivalDateLabel(f, todayIso);
  if (!date) return '';
  return isGenericFestivalName(f.name)
    ? `${templeName}的年度祭典在${date}。`
    : `${templeName}的主要祭典為「${f.name}」，時間為${date}。`;
}
