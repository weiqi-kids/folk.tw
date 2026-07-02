// M3 行業視角吉日篩選 — verified 顯示政策的唯一合法入口
//
// ⚠️ M3 鐵則（勿改）：宜忌僅顯示 verified===true 條目（無源不發佈，§5）。
// 本檔是「按事項篩選日子」的單一入口，篩選式與 AlmanacDay.astro / [date].astro
// 完全一致（rec.yi.filter(v => v.verified)）；任何新視角一律經由此處，不得自建判定。
//
// build 內共用快取：月份樞紐（~103 月 × ~30 天）與行業頁（7 業 × 60 天）大量重疊，
// computeDayRecord 為決定性純函式，memo 後全站一次遍歷。

import { computeDayRecord } from './index';
import { lunarProvider } from './provider';
import affairsData from './rules/affairs.json';
import type { DayRecord } from './types';

const AFFAIRS = (affairsData as { affairs: { id: string; name: string; group: string }[] }).affairs;
const AFFAIR_NAME = new Map(AFFAIRS.map((a) => [a.id, a.name]));

const cache = new Map<string, DayRecord>();

/** 與日期頁同一引擎、同一 provider 的 DayRecord（memo 版）。 */
export function dayRecordCached(iso: string): DayRecord {
  const hit = cache.get(iso);
  if (hit) return hit;
  const [y, m, d] = iso.split('-').map(Number);
  const rec = computeDayRecord(y, m, d, { astro: lunarProvider });
  cache.set(iso, rec);
  return rec;
}

/** affairs.json id → 事項顯示名（DayVerdict.affair 存中文名，需經此解析）。 */
export function affairNameOf(id: string): string | undefined {
  return AFFAIR_NAME.get(id);
}

/**
 * 日期集合內，各事項「宜」且 verified 的日子（M3：僅已考據核校者）。
 * @returns Map<affairId, ISO 日期（升冪）>；無資料之事項回空陣列（由呼叫端決定呈現）。
 */
export function verifiedYiDays(isoDates: string[], affairIds: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>(affairIds.map((id) => [id, []]));
  const nameToId = new Map(
    affairIds.flatMap((id) => {
      const name = AFFAIR_NAME.get(id);
      return name ? [[name, id] as const] : [];
    }),
  );
  for (const iso of isoDates) {
    const rec = dayRecordCached(iso);
    for (const v of rec.yi) {
      if (!v.verified) continue; // M3：未核校不出（唯一合法篩選式）
      const id = nameToId.get(v.affair);
      if (id) out.get(id)!.push(iso);
    }
  }
  return out;
}
