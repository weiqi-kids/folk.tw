// 農民曆日期導覽工具 — 可瀏覽範圍與日期計算（穩定封存，非滾動）。
//
// 純靜態站：日期頁集合 = [ARCHIVE_START（固定過去錨點）, today + FUTURE_DAYS]。
// 每日 cron 重建只「向前」推進上界、過去錨點不動 → 集合「單調成長、永不移除」，
// 故任何已發佈網址永不 404、可安全被搜尋引擎索引並列入 sitemap（與滾動視窗相反）。
// 任一日期的農民曆資料皆為決定性、永不改變，故封存頁是永久不變的靜態內容。

// ⚠️ ARCHIVE_START 一旦上線即為永久承諾：絕不可前移（往更晚日期），否則早於新錨點的
// 既有網址會 404、並使 GSC 報「已提交但找不到」。要擴大過去涵蓋只能往更早調。
export const ARCHIVE_START = '2020-01-01';
// 向前展望天數（cron 每日把上界推進）。需落在 provider yearRange [1900,2100] 內。
export const FUTURE_DAYS = 730;

/** ISO 日（YYYY-MM-DD）位移 n 天，回 ISO 日。 */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  const yy = dt.getUTCFullYear().toString().padStart(4, '0');
  const mm = (dt.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = dt.getUTCDate().toString().padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** 可瀏覽範圍 [min, max]：固定過去錨點 → 今日＋FUTURE_DAYS。 */
export function almanacRange(todayIso: string): { min: string; max: string } {
  return { min: ARCHIVE_START, max: addDays(todayIso, FUTURE_DAYS) };
}

/** 單一 canonical 連結：今日走 /almanac，其餘走 /almanac/YYYY-MM-DD。 */
export function almanacHref(iso: string, todayIso: string): string {
  return iso === todayIso ? '/almanac' : `/almanac/${iso}`;
}

/** 封存內所有日期（不含今日；今日由 /almanac 提供，避免重複網址）。
 *  必須每次 build 都輸出「整個」[ARCHIVE_START, today+FUTURE_DAYS] 範圍，
 *  否則先前已生成的頁會從 dist 消失而 404。ISO 字串比較即年代序。 */
export function almanacDates(todayIso: string): string[] {
  const out: string[] = [];
  const max = addDays(todayIso, FUTURE_DAYS);
  for (let d = ARCHIVE_START; d <= max; d = addDays(d, 1)) {
    if (d !== todayIso) out.push(d);
  }
  return out;
}

/** 封存涵蓋之所有月份 'YYYY-MM'（ARCHIVE_START 之月 → today+FUTURE_DAYS 之月）。
 *  供封存索引頁／月份樞紐使用，降低爬取深度（每日期頁 ≤2 點擊可達）。 */
export function almanacMonths(todayIso: string): string[] {
  const max = addDays(todayIso, FUTURE_DAYS);
  const maxY = Number(max.slice(0, 4));
  const maxM = Number(max.slice(5, 7));
  let y = Number(ARCHIVE_START.slice(0, 4));
  let m = Number(ARCHIVE_START.slice(5, 7));
  const out: string[] = [];
  while (y < maxY || (y === maxY && m <= maxM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** 某月（'YYYY-MM'）落在封存範圍內之日期（含連結與是否今日）。首/末月可能為部分月。 */
export function almanacMonthDays(
  ym: string,
  todayIso: string,
): { iso: string; day: number; href: string; isToday: boolean }[] {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 該月天數
  const max = addDays(todayIso, FUTURE_DAYS);
  const out: { iso: string; day: number; href: string; isToday: boolean }[] = [];
  for (let d = 1; d <= last; d++) {
    const iso = `${ym}-${String(d).padStart(2, '0')}`;
    if (iso < ARCHIVE_START || iso > max) continue;
    out.push({ iso, day: d, href: almanacHref(iso, todayIso), isToday: iso === todayIso });
  }
  return out;
}
