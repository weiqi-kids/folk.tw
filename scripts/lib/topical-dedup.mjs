// 時事祈福 · 同一事件去重（純函式，無副作用；2026-07-25 自 topical-news-scan.mjs 抽出）
//
// 抽出來的理由：這段邏輯 2026-07-17 重慶彭水山崩踩過一次坑——同一起事件被開了三頁
// （「重慶市彭水縣」／「重慶市彭水苗族土家族自治縣」／「重庆彭水县汉葭街道」），
// 原本埋在 main() 迴圈裡無法測。抽成純函式後可用歷史資料回測（見檔尾用法），
// 改動去重規則時能直接驗「當初那三筆會不會被擋」。
//
// 三道規則（任一命中即視為重複），全部都先要求「時間差 ≤3 天」：
//   d1 地名字串相等   — 最便宜，涵蓋同一寫法重複回報。
//   d2 來源網址重疊   — 引用到同一篇報導＝同一起事件，地名寫法再怎麼變都擋得住。
//   d3 同型別＋距離 ≤10km — 需要座標（P2 在複驗後補地理編碼，見 lib/topical-geo.mjs）；
//                          無座標時退回地名字串比對（＝原行為，不放行也不誤擋）。

import { normSourceUrl } from './topical-geo.mjs';

export const SAME_EVENT_DAYS = 3;
export const SAME_EVENT_KM = 10;

/** 地名正規化：小寫、去空白、去中英文逗號頓號。 */
export const normPlace = (s) => String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[，,、]/g, '');

const inferType = (e) => e.eventType ?? (e.mag != null || String(e.id).startsWith('eq-') ? 'quake' : 'other');

/** 兩點距離（km）；任一方缺座標回 Infinity。 */
export function km(a, b) {
  if (a?.lat == null || b?.lat == null) return Infinity;
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const withinDays = (a, b, days = SAME_EVENT_DAYS) =>
  Math.abs(Date.parse(a.time) - Date.parse(b.time)) / 864e5 <= days;

/** 同事件判定：同 eventType 且時間差 ≤3 天 且（座標 ≤10km 或 normPlace 相符）。 */
export function sameEvent(a, b) {
  if (inferType(a) !== inferType(b)) return false;
  if (!withinDays(a, b)) return false;
  const d = km(a, b);
  if (d !== Infinity) return d <= SAME_EVENT_KM;
  return normPlace(a.place) && normPlace(a.place) === normPlace(b.place);
}

/**
 * 在既有事件清單中找出與候選重複者。
 * @param {Array<object>} list  topical.json 全部條目（含已併頁的 mergedInto 條目——它們的地名字串
 *                              仍是擋住同事件再開頁的有效線索，故不可過濾掉）
 * @param {object} cand  { eventType, place, time, lat?, lon?, sources? }
 * @returns {{ id: string, rule: 'place'|'source-url'|'geo' } | null}
 */
export function findDuplicate(list, cand) {
  const hitPlace = list.find((it) =>
    normPlace(it.place) && normPlace(it.place) === normPlace(cand.place) && withinDays(it, cand));
  if (hitPlace) return { id: hitPlace.id, rule: 'place' };

  const candUrls = new Set((cand.sources ?? []).map((s) => normSourceUrl(s.url)));
  const hitUrl = candUrls.size
    ? list.find((it) => withinDays(it, cand) &&
        (it.sources ?? []).some((s) => candUrls.has(normSourceUrl(s.url))))
    : null;
  if (hitUrl) return { id: hitUrl.id, rule: 'source-url' };

  const hitGeo = list.find((it) => sameEvent(it, cand));
  if (hitGeo) return { id: hitGeo.id, rule: 'geo' };

  return null;
}
