// RSS 週界線的純日期工具（零 Astro 依賴，供頁面與 gate 共用）。
import { addDays } from './almanac/dates.ts';

/** 任一 ISO 日期所在週的星期一。 */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(iso, -((day + 6) % 7));
}

/** 週報於台灣時間星期一 00:00 發佈，RSS 以 RFC 822 UTC 日期表示。 */
export function rssDateForTaipeiMonday(iso: string): string {
  return new Date(`${iso}T00:00:00+08:00`).toUTCString();
}
