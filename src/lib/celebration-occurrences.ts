// ═══════════════════════════════════════════════════════════════════════════
// 「這個慶典歷年實際辦過哪幾次」的讀取入口。
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 為什麼要有這份資料（2026-08-19 站主裁示）：一批慶典**算不出下一次國曆日期**
//    （數年一科、不定期、或日期每年由擲筊決定）。頁面原本顯示「日期以主辦單位公告
//    為準」——那是一句免責，對讀者沒有用。裁示是**把不確定變成內容**：改列歷年
//    實際辦過哪幾次、由新到舊，下一次還沒公告就明說還沒公告。
//
// 🔴 每一筆都必須是**紀錄**，不是推算。
//    「每三年一科」不可以拿來反推歷年科期——那是算出來的，不是查到的。
//    `confidence` 只有兩種：`verified`（一手來源指名日期）與 `weak`（僅新聞報導）。
//    沒有第三種，推算的一律不收（總紅線第 1 條）。
//
// ⚠️ 時間軸太短（少於 2 筆）就不要渲染成一個區塊——一筆孤零零的紀錄撐不起
//    「歷年」這個說法，反而像資料沒做完。判斷用 `hasTimeline()`。

import data from '../data/celebration-occurrences.json' with { type: 'json' };
export type Occurrence = {
  /** 西元年。 */
  year: number;
  /** 顯示用標籤，例「2019 己亥科」。只知年份不知月日時，這裡要說明。 */
  label: string;
  /** `YYYY-MM-DD`；只知年份就是 null。 */
  date_start: string | null;
  date_end: string | null;
  /** 農曆說明（來源怎麼寫就怎麼記）。 */
  lunar?: string | null;
  /** 主辦地點逐年不同的才有值（例：三山國王客家文化節在 39 間廟輪替）。 */
  venue?: string | null;
  source_ref: string;
  source_note: string;
  confidence: 'verified' | 'weak';
};

export type CelebrationOccurrences = {
  lc_id: string;
  name: string;
  case_id: string | null;
  occurrences: Occurrence[];
  next_announced: { date_start: string; date_end?: string | null; source_ref: string } | null;
  notes?: string | null;
  /** 這一項在站上對應的既有頁面（人工判斷：官方名與俗名常不同，不能靠字面比對）。 */
  page_ref?: { type: 'event' | 'festival'; id: string } | null;
};

const byLcId = new Map<string, CelebrationOccurrences>(
  (data.items as CelebrationOccurrences[]).map((x) => [x.lc_id, x]),
);

/** 某項慶典的歷年紀錄（由新到舊）。查無回 null。 */
export function occurrencesFor(lcId: string): CelebrationOccurrences | null {
  return byLcId.get(lcId) ?? null;
}

/**
 * 這一項的紀錄夠不夠撐起一個「歷年」區塊。
 * 門檻是 2 筆：一筆不叫歷年，而且會讓讀者以為資料沒做完。
 */
export function hasTimeline(lcId: string): boolean {
  const row = byLcId.get(lcId);
  return Boolean(row && row.occurrences.length >= 2);
}

/**
 * 某個既有頁面（活動頁／節日頁）要不要顯示歷年紀錄。
 * 🔴 用 `page_ref` 查，**不要用名稱比對**——repo 寫「蕭壟」而官方寫「蕭壠」、
 *    「土城香」官方名是「鹿耳門聖母廟土城仔香」，字面比對一定會漏。
 */
export function occurrencesForPage(
  type: 'event' | 'festival',
  id: string,
): CelebrationOccurrences | null {
  const row = (data.items as CelebrationOccurrences[]).find(
    (x) => x.page_ref?.type === type && x.page_ref?.id === id,
  );
  return row && row.occurrences.length >= 2 ? row : null;
}

/** 有可渲染時間軸的項目（給頁面列區塊用，不要在頁面寫死清單）。 */
export function timelineItems(): CelebrationOccurrences[] {
  return (data.items as CelebrationOccurrences[]).filter((x) => x.occurrences.length >= 2);
}
