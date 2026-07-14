// 神明聖誕 → 未來國曆日期（build 時算）：供首頁「近期神明聖誕」區塊與 /deities/birthdays 聖誕曆。
//
// 反向對映（農曆聖誕 MM-DD → 神明）沿用 queries.deityBirthdayIndex()（唯一入口，勿另建）；
// 農曆↔國曆換算用 lunar-javascript（與 almanac provider.ts 同源，閏月/定朔一致）。
//
// ⏱ 時間正確性原則：本檔只算「國曆日期」這個**靜態事實**（今年/明年的下一次），
//    相對「倒數 N 天」不在 build 算——由前端 UpcomingBirthdays.astro 依台灣當下日期即時算並隱藏已過者，
//    如此即使某天沒重新部署（每日收集 commit 帶 [skip ci] 不觸發 deploy），倒數仍永遠正確。

import pkg from 'lunar-javascript';
import { deityBirthdayIndex } from './queries';
import { addDays } from './almanac/dates';

const { Solar } = pkg;

export interface BirthdayEntry {
  iso: string; // 國曆 YYYY-MM-DD（自 fromIso 起的下一次）
  lunar: string; // 農曆 MM-DD
  lunarLabel: string; // 農曆 X月X日（中文）
  deities: { deityId: string; name: string }[];
}

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
/** 農曆「MM-DD」→ 中文標籤（如「03-23」→「農曆三月廿三」）。供廟宇頁 answer-first 摘要重用同一套轉換。 */
export const lunarDateLabel = (mmdd: string): string => (/^\d{2}-\d{2}$/.test(mmdd) ? labelOf(mmdd) : '');
// 該國曆日是否為農曆月最後一日（明日農曆月份不同即是）。
function isLunarMonthEnd(iso: string): boolean {
  const t = addDays(iso, 1);
  const [y, m, d] = t.split('-').map(Number);
  const [y0, m0, d0] = iso.split('-').map(Number);
  return Solar.fromYmd(y, m, d).getLunar().getMonth() !== Solar.fromYmd(y0, m0, d0).getLunar().getMonth();
}

/**
 * 自 fromIso（國曆）起 days 天內、依國曆日序排列的神明聖誕。
 * @param opts.uniqueDeity 每尊神只列「下一次」聖誕（去重）；配 days≈400 可保證 60 尊全數各出現一次，
 *   供全年聖誕曆用（否則跨年邊界可能漏抓 1 尊、或同尊在近首尾各出現一次）。
 */
export async function upcomingDeityBirthdays(
  fromIso: string,
  days: number,
  opts: { uniqueDeity?: boolean } = {},
): Promise<BirthdayEntry[]> {
  const idx = await deityBirthdayIndex(); // Map<"MM-DD", {deityId,name}[]>
  const seen = new Set<string>();
  const out: BirthdayEntry[] = [];
  for (let i = 0; i < days; i++) {
    const iso = addDays(fromIso, i); // 國曆日往前推（與農民曆同一日期算術）
    const [y, m, d] = iso.split('-').map(Number);
    const l = Solar.fromYmd(y, m, d).getLunar();
    const lm = l.getMonth();
    if (lm < 0) continue; // lunar-javascript 以負月表閏月；聖誕不計閏月
    const ld = l.getDay();
    const mm = String(lm).padStart(2, '0');
    // 對映到「今天」的聖誕鍵：當日；若今日為農曆月最後一日且僅廿九（短月無卅），卅日聖誕順延至此日。
    const keys = [`${mm}-${String(ld).padStart(2, '0')}`];
    if (ld === 29 && isLunarMonthEnd(iso)) keys.push(`${mm}-30`);
    for (const key of keys) {
      let deities = idx.get(key);
      if (!deities?.length) continue;
      if (opts.uniqueDeity) {
        deities = deities.filter((x) => !seen.has(x.deityId));
        if (!deities.length) continue;
        deities.forEach((x) => seen.add(x.deityId));
      }
      out.push({ iso, lunar: key, lunarLabel: labelOf(key), deities });
    }
  }
  return out;
}
