// 神明聖誕 → 未來國曆日期（build 時算）：供首頁「近期神明聖誕」區塊與 /deities/birthdays 聖誕曆。
//
// 反向對映（農曆聖誕 MM-DD → 神明）沿用 queries.deityBirthdayIndex()（唯一入口，勿另建）；
// 農曆↔國曆換算用 lunar-javascript（與 almanac provider.ts 同源，閏月/定朔一致）。
//
// ⏱ 時間正確性原則：本檔只算「國曆日期」這個**靜態事實**（今年/明年的下一次），
//    相對「倒數 N 天」不在 build 算——由前端 UpcomingBirthdays.astro 依台灣當下日期即時算並隱藏已過者，
//    如此即使某天沒重新部署（每日收集 commit 帶 [skip ci] 不觸發 deploy），倒數仍永遠正確。

import pkg from 'lunar-javascript';
import { deityBirthdayIndex, getDeities, getSystems } from './queries';
import { addDays } from './almanac/dates';
// 農曆換算原語集中在 ./lunar-date（零 Astro 依賴，scripts/ 的 gate 也 import 同一份）——本檔不另寫一套。
import { isLunarMonthEnd, lunarDateLabel } from './lunar-date';

const { Solar } = pkg;

export interface BirthdayEntry {
  iso: string; // 國曆 YYYY-MM-DD（自 fromIso 起的下一次）
  lunar: string; // 農曆 MM-DD
  lunarLabel: string; // 農曆 X月X日（中文）
  deities: { deityId: string; name: string; systems: { id: string; name: string }[] }[];
}

// 轉出 ./lunar-date 的純函式，維持既有 import 路徑（llms-full.txt.ts／temples/[id].astro）不變。
export { lunarDateLabel, lunarToNextSolar, solarMd } from './lunar-date';

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
  // 求籤系統對映：只有登記 divination_systems 的神明（目前僅媽祖／關聖帝君）才會多顯示求籤連結。
  const allDeities = await getDeities();
  const systems = await getSystems();
  const systemName = new Map(systems.map((s) => [s.id, s.data.name]));
  const systemsByDeity = new Map(
    allDeities.map((d) => [
      d.id,
      d.data.divination_systems.map((s) => ({ id: s.id, name: systemName.get(s.id) ?? s.id })),
    ]),
  );
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
    const actualKey = `${mm}-${String(ld).padStart(2, '0')}`;
    const keys = [actualKey];
    if (ld === 29 && isLunarMonthEnd(iso)) keys.push(`${mm}-30`);
    for (const key of keys) {
      let deities = idx.get(key);
      if (!deities?.length) continue;
      if (opts.uniqueDeity) {
        deities = deities.filter((x) => !seen.has(x.deityId));
        if (!deities.length) continue;
        deities.forEach((x) => seen.add(x.deityId));
      }
      out.push({
        iso,
        lunar: key,
        // key 是資料登錄日；短月的 30 日聖誕會在實際 29 日列出，
        // 所以當年顯示標籤必須用 actualKey，才會與 iso 對得上。
        lunarLabel: lunarDateLabel(actualKey),
        deities: deities.map((x) => ({ ...x, systems: systemsByDeity.get(x.deityId) ?? [] })),
      });
    }
  }
  return out;
}
