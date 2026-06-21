// 農民曆日期導覽工具 — 可瀏覽範圍與日期計算（靜態預生視窗）。
//
// 純靜態站：以「今日」為中心預生 ±WINDOW_DAYS 的日期頁，使用者可前後翻頁或直接挑日期。
// 每日 cron 重建時視窗隨「今日」滾動推進（見 .github/workflows）。

export const WINDOW_DAYS = 365;

/** ISO 日（YYYY-MM-DD）位移 n 天，回 ISO 日。 */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  const yy = dt.getUTCFullYear().toString().padStart(4, '0');
  const mm = (dt.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = dt.getUTCDate().toString().padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** 可瀏覽範圍 [min, max]，以今日為中心 ±WINDOW_DAYS。 */
export function almanacRange(todayIso: string): { min: string; max: string } {
  return { min: addDays(todayIso, -WINDOW_DAYS), max: addDays(todayIso, WINDOW_DAYS) };
}

/** 單一 canonical 連結：今日走 /almanac，其餘走 /almanac/YYYY-MM-DD。 */
export function almanacHref(iso: string, todayIso: string): string {
  return iso === todayIso ? '/almanac' : `/almanac/${iso}`;
}

/** 視窗內所有日期（不含今日；今日由 /almanac 提供，避免重複網址）。 */
export function almanacDates(todayIso: string): string[] {
  const out: string[] = [];
  for (let n = -WINDOW_DAYS; n <= WINDOW_DAYS; n++) {
    if (n !== 0) out.push(addDays(todayIso, n));
  }
  return out;
}
