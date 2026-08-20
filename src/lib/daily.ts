// 每日一籤 — 全站同一支「今日選讀」（§0.5 拍板 (a)）
//
// 語意：當日所有人看到同一支（策展，像每日一詩），不標「你的運勢」、不因人隨機。
// 排除 (b) 每人隨機（滑向算命）、(c) 線上擲筊問事。
//
// 日期基準：UTC+8（C.8）。靜態站於 build 期決定今日選讀；由每日 cron 重建推進「今日」
// （見 .github/workflows）。選讀為確定性輪替：(UTC+8 紀元日數) mod 籤數。
//
// 🔴 2026-08-21：不帶參數的 `todayInTaipei()` **不再各自讀牆上時鐘**，一律回同一個
//    「這次 build 的基準日」（src/lib/build-date.ts，該檔檔頭有完整緣由）。
//    帶參數時仍是純函式。全站 53 個 call site 全都是不帶參數的那種，
//    所以這一改等於一次把整個 build 釘在同一天，而同一天內輸出逐字不變。
import { buildDate, taipeiDateOf } from './build-date.ts';

/**
 * 取得 UTC+8 的「今日」ISO 日。
 * 不帶參數＝這次 build 的基準日（全 build 唯一、已 memoize）；
 * 帶 Date 參數＝該瞬間對應的台北日曆日（純函式，不碰基準日）。
 */
export function todayInTaipei(now?: Date): { iso: string; epochDay: number } {
  return now === undefined ? buildDate() : taipeiDateOf(now);
}

/** 確定性今日選讀：在已排序籤集合中取一支（全站一致） */
export function pickDailyIndex(epochDay: number, count: number): number {
  if (count <= 0) return 0;
  return ((epochDay % count) + count) % count;
}
