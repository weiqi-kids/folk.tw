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
