// 跨文本追蹤查詢層（§2.2）— build-time 反向索引
//
// 對應參照站的「字典追蹤」：典故反查、籤系反查、神格聚合、關係圖。
// 全在 build 期計算（靜態站＝建置期預算，§1），查詢期零成本。
//
// 「無源不發佈」gate（§5）：production 預設濾掉 draft 與無來源實體。

import { getCollection, type CollectionEntry } from 'astro:content';

const isProd = import.meta.env.PROD;

/** 發佈 gate：draft 為真則隱藏；prod 下另要求事實型實體具來源（§5、§9.5） */
function publishable<T extends { data: { draft?: boolean; sources?: unknown[] } }>(
  e: T,
  requireSources = false,
): boolean {
  if (e.data.draft) return false;
  if (isProd && requireSources && (!e.data.sources || e.data.sources.length === 0)) return false;
  return true;
}

// ── 集合載入（已過 gate） ──────────────────────────────

export async function getDeities() {
  return (await getCollection('deities')).filter((e) => publishable(e, true));
}
export async function getPoems() {
  return (await getCollection('poems')).filter((e) => publishable(e));
}
export async function getAllusions() {
  return (await getCollection('allusions')).filter((e) => !e.data.draft || !isProd);
}
export async function getSystems() {
  return await getCollection('divinationSystems');
}
export async function getRelations() {
  return (await getCollection('deityRelations')).filter((e) => publishable(e));
}
export async function getEvents() {
  return (await getCollection('events')).filter((e) => publishable(e));
}
export async function getPractices() {
  // M5 seed 多為 draft（主題已立、內容待引註）；非 prod 仍顯示以利開發
  return (await getCollection('practices')).filter((e) => !e.data.draft || !isProd);
}
export async function getTemples() {
  return await getCollection('temples');
}

/** 神明 → 主祀此神之廟宇（§2.2 橋接；R5 主祀對映） */
export async function templesByDeity(): Promise<Map<string, CollectionEntry<'temples'>[]>> {
  const temples = await getTemples();
  const map = new Map<string, CollectionEntry<'temples'>[]>();
  for (const t of temples) {
    const ref = t.data.main_deity_ref;
    if (!ref) continue;
    (map.get(ref) ?? map.set(ref, []).get(ref)!).push(t);
  }
  return map;
}
export async function getInterpretations() {
  return (await getCollection('interpretations')).filter((e) => !e.data.draft || !isProd);
}

/** 全部典故的 id→名稱（不過濾 draft），供籤頁顯示典故名（即使故事未撰） */
export async function allusionNameById(): Promise<Map<string, string>> {
  return new Map((await getCollection('allusions')).map((e) => [e.id, e.data.name]));
}

/** poemId → 該籤之白話賞析＋八項分項解（依 id join；本站原創，§6） */
export async function interpretationById(): Promise<Map<string, CollectionEntry<'interpretations'>>> {
  const items = await getInterpretations();
  return new Map(items.map((e) => [e.id, e]));
}

// ── 反向索引 ───────────────────────────────────────────

/** 典故 → 出現於哪些籤（§2.2 典故反查；A.2 跨文本追蹤核心） */
export async function poemsByAllusion(): Promise<Map<string, CollectionEntry<'poems'>[]>> {
  const poems = await getPoems();
  const map = new Map<string, CollectionEntry<'poems'>[]>();
  for (const p of poems) {
    for (const a of p.data.allusions) {
      const id = a.ref.id;
      (map.get(id) ?? map.set(id, []).get(id)!).push(p);
    }
  }
  return map;
}

/** 籤詩系統 → 哪些神明採用（§2.2 籤系反查；橋接 M1↔M2） */
export async function deitiesBySystem(): Promise<Map<string, CollectionEntry<'deities'>[]>> {
  const deities = await getDeities();
  const map = new Map<string, CollectionEntry<'deities'>[]>();
  for (const d of deities) {
    for (const s of d.data.divination_systems) {
      (map.get(s.id) ?? map.set(s.id, []).get(s.id)!).push(d);
    }
  }
  return map;
}

/** 籤詩系統 → 該系統全部籤（依籤序，§2.2）。供神明頁直連籤、籤頁前後籤導覽。 */
export async function poemsBySystem(): Promise<Map<string, CollectionEntry<'poems'>[]>> {
  const poems = await getPoems();
  const map = new Map<string, CollectionEntry<'poems'>[]>();
  for (const p of poems) {
    (map.get(p.data.system.id) ?? map.set(p.data.system.id, []).get(p.data.system.id)!).push(p);
  }
  for (const list of map.values()) list.sort((a, b) => a.data.no - b.data.no);
  return map;
}

/** 神明 → 對應拜拜習俗（practice.deities 含此神，§2.2 反向；M2↔M5） */
export async function practicesByDeity(): Promise<Map<string, CollectionEntry<'practices'>[]>> {
  const practices = await getPractices();
  const map = new Map<string, CollectionEntry<'practices'>[]>();
  for (const p of practices) {
    for (const id of p.data.deities) {
      (map.get(id) ?? map.set(id, []).get(id)!).push(p);
    }
  }
  return map;
}

/** 神明 → 以此為主神之民俗活動（event.main_deity，§2.2 反向；M2↔M4） */
export async function eventsByDeity(): Promise<Map<string, CollectionEntry<'events'>[]>> {
  const events = await getEvents();
  const map = new Map<string, CollectionEntry<'events'>[]>();
  for (const e of events) {
    const id = e.data.main_deity;
    if (!id) continue;
    (map.get(id) ?? map.set(id, []).get(id)!).push(e);
  }
  return map;
}

/** 廟宇 id → 名稱（供事件頁把主辦/目的廟字串連到 /temples） */
export async function templeNameById(): Promise<Map<string, string>> {
  return new Map((await getTemples()).map((t) => [t.id, t.data.name]));
}

/** 神格分類 → 同類神明（§2.2 神格聚合） */
export async function deitiesByCategory(): Promise<Map<string, CollectionEntry<'deities'>[]>> {
  const deities = await getDeities();
  const map = new Map<string, CollectionEntry<'deities'>[]>();
  for (const d of deities) {
    (map.get(d.data.category) ?? map.set(d.data.category, []).get(d.data.category)!).push(d);
  }
  return map;
}

/** 橫向群組 → 成員神明（五文昌/八仙/三奶夫人…，B.3-5） */
export async function deitiesByGroup(): Promise<Map<string, CollectionEntry<'deities'>[]>> {
  const deities = await getDeities();
  const map = new Map<string, CollectionEntry<'deities'>[]>();
  for (const d of deities) {
    for (const g of d.data.groups) {
      (map.get(g) ?? map.set(g, []).get(g)!).push(d);
    }
  }
  return map;
}

/** 某神明的關係邊（出邊 + 入邊），供神明頁圖視圖（§2.2 v1 先列表） */
export async function relationsOf(deityId: string) {
  const rels = await getRelations();
  return {
    out: rels.filter((r) => r.data.from === deityId),
    in: rels.filter((r) => r.data.to === deityId),
  };
}

/** 月-日（農曆 MM-DD）→ 當日聖誕之神明（具名實例），供 M3 農民曆 join（C.3） */
export async function deityBirthdayIndex(): Promise<Map<string, { deityId: string; name: string }[]>> {
  const deities = await getDeities();
  const map = new Map<string, { deityId: string; name: string }[]>();
  for (const d of deities) {
    for (const b of d.data.birthday_lunar) {
      if (b.kind !== '聖誕') continue;
      if (!/^\d{2}-\d{2}$/.test(b.date)) continue; // 跳過「待查/無定」
      const arr = map.get(b.date) ?? map.set(b.date, []).get(b.date)!;
      arr.push({ deityId: d.id, name: d.data.name });
    }
  }
  return map;
}

/** 農曆月（1–12）→ 該月具名實例聖誕（依日排序），供 M3 日期頁「本月聖誕一覽」內連 M2。 */
export async function deityBirthdaysByMonth(): Promise<
  Map<number, { date: string; deityId: string; name: string }[]>
> {
  const idx = await deityBirthdayIndex();
  const out = new Map<number, { date: string; deityId: string; name: string }[]>();
  for (const [key, arr] of idx) {
    const month = Number(key.slice(0, 2));
    const list = out.get(month) ?? out.set(month, []).get(month)!;
    for (const a of arr) list.push({ date: key, deityId: a.deityId, name: a.name });
  }
  for (const list of out.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** M3 日期頁 → 相關拜拜習俗（M5）：依當日節日／農曆日「高精度」對映（寧缺勿誤連）。 */
export async function practicesForDate(
  festivals: string[],
  lunarMonth: number | null,
  lunarDay: number | null,
): Promise<CollectionEntry<'practices'>[]> {
  const m = lunarMonth;
  const d = lunarDay;
  const ids = new Set(
    [
      { id: 'saomu', hit: festivals.includes('清明') }, // 清明 → 掃墓/培墓
      { id: 'baizuxian', hit: festivals.includes('除夕') }, // 除夕 → 祭祖
      { id: 'baitiangong', hit: m === 1 && d === 9 }, // 正月初九 → 拜天公
      { id: 'zuo16', hit: m === 7 && d === 7 }, // 七月初七 → 做十六歲
      { id: 'pudu', hit: m === 7 && d === 15 }, // 七月十五 → 中元普渡
    ]
      .filter((r) => r.hit)
      .map((r) => r.id),
  );
  if (!ids.size) return [];
  return (await getPractices()).filter((p) => ids.has(p.id));
}
