// 每日一籤 — 全站同一支「今日選讀」（§0.5 拍板 (a)）
//
// 語意：當日所有人看到同一支（策展，像每日一詩），不標「你的運勢」、不因人隨機。
// 排除 (b) 每人隨機（滑向算命）、(c) 線上擲筊問事。
//
// 日期基準：UTC+8（C.8）。靜態站於 build 期決定今日選讀；由每日 cron 重建推進「今日」
// （見 .github/workflows）。選讀為確定性輪替：(UTC+8 紀元日數) mod 籤數。

/** 取得 UTC+8 的「今日」ISO 日（build 期；CI 以 UTC 執行，故加 8 小時位移） */
export function todayInTaipei(now: Date = new Date()): { iso: string; epochDay: number } {
  const shifted = new Date(now.getTime() + 8 * 3600 * 1000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth() + 1;
  const d = shifted.getUTCDate();
  const iso = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d
    .toString()
    .padStart(2, '0')}`;
  const epochDay = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return { iso, epochDay };
}

/** 確定性今日選讀：在已排序籤集合中取一支（全站一致） */
export function pickDailyIndex(epochDay: number, count: number): number {
  if (count <= 0) return 0;
  return ((epochDay % count) + count) % count;
}
