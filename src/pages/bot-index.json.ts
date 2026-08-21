// bot-index.json — 跨 repo 資料饋，餵給 LINE 官方帳號「神酷」（/root/my-line-bot-customer/tenants/shenku/）。
//
// 契約在 contracts/bot-index.schema.json（唯一真實來源，改欄位先改那份）。這支只是照契約
// 產出，不重寫任何曆法邏輯——農曆/節氣換算一律呼叫 src/lib/lunar-date.ts、
// src/lib/almanac/select.ts、src/lib/almanac/provider.ts 既有函式（與 /almanac/[date].astro、
// /festivals/[slug].astro、/good-days/[slug].astro 同一套引擎），理由：bot 端不能重算一套，
// 兩邊漂移的症狀是「兩邊講的好日子不一樣」，不會報錯（見契約文件）。
//
// window 選擇：今天 → 今天+364 天（共 365 天，一整年）。
//   - 用途：bot 使用者問的多半是「這一年內」的節日與宜忌，365 天已覆蓋一次完整的農曆年循環。
//   - 檔案大小：365 天 × 農民曆逐日欄位，實測見下方 WINDOW_DAYS 常數旁的執行期檢查與
//     驗證報告（scratchpad/impl-folk.md）；比 730 天（FUTURE_DAYS 上限）小一半，
//     對每日重產的 ETL 更友善。
//   - 邊界安全：/almanac/<date>/ 只預生到 today+FUTURE_DAYS（730 天，見
//     src/lib/almanac/dates.ts），365 天遠低於這個上限，不會產出死連結；下方仍留一道
//     執行期斷言防止未來有人把 WINDOW_DAYS 調大到超過 FUTURE_DAYS 而不自知。
//   - 重產頻率：window 是「今天起」的滾動窗，站上每日 cron 重建一次（deploy.yml 的
//     schedule），bot 端 ETL 也應每日抓一次——見契約文件「bot 端怎麼拿」一節。不重產的話
//     window 只會越來越短，最後 days 全部落在過去。
import type { APIRoute } from 'astro';
import { getPoems, getSystems, interpretationById } from '../lib/queries';
import { festivalNextSolar, lunarDateLabel } from '../lib/lunar-date';
import { festivalOgUrl } from '../lib/festival-og';
import { addDays, FUTURE_DAYS } from '../lib/almanac/dates';
import { dayRecordCached, verifiedYiDays } from '../lib/almanac/select';
import { todayInTaipei } from '../lib/daily';
import { releasedItems } from '../lib/release-schedule';
import festivalsData from '../data/festivals.json';
import goodDaysData from '../data/good-days.json';
// 籤型＋籤後選擇題鼓勵語（2026-08-16 用戶裁示：LINE 流程貼合網站）。整句在這裡組好，
// bot 端只查表——文案單一來源＝qian-encourage.json，變體選定規則（籤號取模）與站上相同。
import personasData from '../data/poem-personas.json';
import encourageData from '../data/qian-encourage.json';

const SITE = 'https://folk.tw';
const WINDOW_DAYS = 365;

if (WINDOW_DAYS > FUTURE_DAYS) {
  // 防呆：萬一日後有人把 WINDOW_DAYS 調大，必須先確認沒超過 /almanac/ 的預生範圍，
  // 否則 days[].url 與 affairs[].good_days 隱含的 /almanac/<date>/ 連結會變死連結。
  throw new Error(
    `bot-index.json 的 WINDOW_DAYS(${WINDOW_DAYS}) 超過 /almanac/ 的預生上限 FUTURE_DAYS(${FUTURE_DAYS})，會產生死連結`,
  );
}

interface FestivalRaw {
  slug: string;
  name: string;
  aliases?: string[];
  lead?: string;
  lunar_date?: string;
  solar_term?: string;
}

interface GoodDayItem {
  slug: string;
  name: string;
  affairs: string[];
  note?: string;
}

/**
 * 白話賞析（interpretation md body）取第一句、≤80 字、斷在句讀。
 * 策略：先取第一個句號/驚嘆號/問號前的完整句；若那一句本身就超過 80 字（站上賞析偶有長句），
 * 退而求其次在 80 字內找最後一個逗號/頓號/分號當斷點；連這個斷點都找不到就整欄不輸出——
 * 不硬切成半句、不杜撰。與 src/pages/allusions/[id].astro 的 storySummary 同一種「取首句」思路，
 * 差別是這裡額外處理「首句過長」的情況（籤詩白話賞析比典故故事常見更長的複句）。
 */
function poemSummary(body: string | undefined, maxLen = 80): string | undefined {
  const text = (body ?? '').trim().replace(/\n+/g, '');
  if (!text) return undefined;
  const firstSentence = text.split(/(?<=[。！？])/)[0]?.trim() ?? '';
  if (!firstSentence) return undefined;
  if (firstSentence.length <= maxLen) return firstSentence;
  let cut = -1;
  const punct = /[。！？，、；]/g;
  let m: RegExpExecArray | null;
  while ((m = punct.exec(firstSentence))) {
    if (m.index + 1 <= maxLen) cut = m.index + 1;
    else break;
  }
  return cut > 0 ? firstSentence.slice(0, cut) : undefined;
}

export const GET: APIRoute = async () => {
  const { iso: todayIso } = todayInTaipei();
  const windowDays: string[] = [];
  for (let i = 0, d = todayIso; i < WINDOW_DAYS; i++, d = addDays(d, 1)) windowDays.push(d);
  const windowTo = windowDays[windowDays.length - 1];

  // ── 籤詩 ─────────────────────────────────────────────
  const poemEntries = await getPoems();
  const interps = await interpretationById();
  const systemsCol = await getSystems();
  const systemName = new Map(systemsCol.map((s) => [s.id, s.data.name]));

  const systemCounts = new Map<string, number>();
  for (const p of poemEntries) systemCounts.set(p.data.system.id, (systemCounts.get(p.data.system.id) ?? 0) + 1);
  const systems = systemsCol
    .filter((s) => systemCounts.has(s.id))
    .map((s) => ({ slug: s.id, name: systemName.get(s.id) ?? s.id, count: systemCounts.get(s.id)! }));

  // 籤後選擇題（契約 poems[].choices）：站上四顆鈕的對照表，bot 端按鈕文字必須一致。
  const CHOICE_LABELS: Record<string, string> = {
    push: '繼續向前衝',
    pause: '暫時放一放',
    ask: '找人商量',
    wait: '再等等看',
  };
  const encMap: Record<string, string[]> = {};
  for (const e of encourageData as { persona: string; choice: string; text: string }[]) {
    if (e.text) (encMap[`${e.persona}:${e.choice}`] ??= []).push(e.text);
  }
  const personaTypeById = new Map(personasData.types.map((t) => [t.id, t]));
  const personaPoems = personasData.poems as Record<string, { type: string; keywords: string[] }>;

  /** LINE 端整句回話。LINE 沒有煩惱情境，{c} 一律代「這件事」（先收「{c}這件事」防黏字）。 */
  const lineChoices = (pid: string, no: number): Record<string, string> | undefined => {
    const a = personaPoems[pid];
    if (!a) return undefined;
    const out: Record<string, string> = {};
    for (const c of Object.keys(CHOICE_LABELS)) {
      const vs = encMap[`${a.type}:${c}`];
      if (!vs?.length) return undefined; // 矩陣缺格＝整組不輸出，不給半套
      const core = vs[no % vs.length].replaceAll('{c}這件事', '這件事').replaceAll('{c}', '這件事');
      out[c] = `你選了「${CHOICE_LABELS[c]}」。這支籤的關鍵詞是「${a.keywords.join('、')}」。${core}`;
    }
    return out;
  };

  const poems = [...poemEntries]
    .sort((a, b) =>
      a.data.system.id === b.data.system.id ? a.data.no - b.data.no : a.data.system.id.localeCompare(b.data.system.id),
    )
    .map((p) => {
      const d = p.data;
      const summary = poemSummary(interps.get(p.id)?.body);
      const pa = personaPoems[p.id];
      const ptype = pa ? personaTypeById.get(pa.type) : undefined;
      const choices = lineChoices(p.id, d.no);
      return {
        id: p.id,
        system: d.system.id,
        no: d.no,
        ...(d.title ? { title: d.title } : {}),
        ...(d.fortune ? { fortune: d.fortune } : {}),
        lines: d.lines,
        ...(summary ? { summary } : {}),
        url: `${SITE}/poems/${p.id}/`,
        ...(ptype ? { qian_type: `${ptype.name}・${ptype.tagline}` } : {}),
        ...(pa?.keywords?.length ? { keywords: pa.keywords } : {}),
        ...(choices ? { choices } : {}),
      };
    });

  // ── 節日 ─────────────────────────────────────────────
  const festivals = releasedItems(festivalsData as FestivalRaw[], todayIso).map((f) => {
    const occurrences: { date: string; lunar?: string }[] = [];
    let cursor = todayIso;
    for (let i = 0; i < 3; i++) {
      const { iso } = festivalNextSolar(f, cursor);
      if (!iso) break; // 換算函式找不到下一次時不外推、不猜測（極端邊界，理論上不會發生）
      occurrences.push({ date: iso, ...(f.lunar_date ? { lunar: f.lunar_date } : {}) });
      cursor = addDays(iso, 1);
    }
    // 分享卡不是每個節日都有（清單見 lib/festival-og.ts）。沒有就整個欄位不輸出，
    // 而不是給一個猜出來的網址——消費端（神酷 LINE Bot）拿到網址就會當成圖去顯示，
    // 拼錯的下場是使用者看到破圖。欄位在契約上是選填，缺了是預期內的狀態。
    const image = festivalOgUrl(f.slug, SITE);
    return {
      slug: f.slug,
      name: f.name,
      aliases: f.aliases ?? [],
      ...(f.lead ? { lead: f.lead } : {}),
      ...(image ? { image } : {}),
      url: `${SITE}/festivals/${f.slug}/`,
      occurrences,
    };
  });

  // ── 看日子（事項 → 宜日）─────────────────────────────
  const goodDayItems = (goodDaysData as { items: GoodDayItem[] }).items;
  const affairs = goodDayItems.map((item) => {
    const byAffair = verifiedYiDays(windowDays, item.affairs);
    const allDays = new Set<string>();
    for (const arr of byAffair.values()) for (const iso of arr) allDays.add(iso);
    return {
      slug: item.slug,
      name: item.name,
      ...(item.note ? { note: item.note } : {}),
      url: `${SITE}/good-days/${item.slug}/`,
      good_days: [...allDays].sort(),
    };
  });

  // ── 看日子（單日查詢）────────────────────────────────
  // dayRecordCached 與 /almanac/[date].astro、/good-days/[slug].astro 同一顆快取（select.ts
  // 模組層級 Map），這裡再算一次 365 天完全命中同一份 memo，不重複算曆法。
  const days = windowDays.map((iso) => {
    const rec = dayRecordCached(iso);
    const lunar = rec.lunar.value;
    // 顯示字串重用 src/lib/lunar-date.ts 的 lunarDateLabel（唯一真實來源），只做字串處理
    // （去掉它固定加的「農曆」前綴、視需要補「閏」），不重算任何農曆邏輯。
    const lunarLabel = lunar
      ? `${lunar.isLeap ? '閏' : ''}${lunarDateLabel(
          `${String(lunar.month).padStart(2, '0')}-${String(lunar.day).padStart(2, '0')}`,
        ).replace(/^農曆/, '')}`
      : undefined;
    const ganzhi = rec.pillars.day.value ? `${rec.pillars.day.value.stem}${rec.pillars.day.value.branch}` : undefined;
    const solarTerm = rec.solarTerm.value?.name;
    const yi = rec.yi.filter((v) => v.verified).map((v) => v.affair);
    const ji = rec.ji.filter((v) => v.verified).map((v) => v.affair);
    return {
      date: iso,
      ...(lunarLabel ? { lunar: lunarLabel } : {}),
      ...(ganzhi ? { ganzhi } : {}),
      ...(solarTerm ? { solar_term: solarTerm } : {}),
      yi,
      ji,
      url: `${SITE}/almanac/${iso}/`,
    };
  });

  const body = {
    version: 1,
    generated_at: new Date().toISOString(),
    site: SITE,
    window: { from: todayIso, to: windowTo },
    systems,
    poems,
    festivals,
    affairs,
    days,
  };

  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
