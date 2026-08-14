#!/usr/bin/env node
// 求籤共情層聚合：GA4 Data API（近 7 天）→ 各情境本週求籤人數／同籤分布／報喜數
// → 寫回 src/data/qiugian-stats.json（供靜態 build 渲染）。數字為真、少算不灌水。
//
// 相依：/root/.config/folk-tw/ga4-sa.json（SA 須有 GA4 讀權，本站已具）＋ GA4 自訂維度 concern/poem_no/outcome
//       （已於 2026-07-14 註冊；**自訂維度非追溯**，資料自註冊後起算，故初期可能為 0＝正常）。
// ⚠️ 2026-08-05 更正：此處原寫「有 24–48h 處理延遲」，容易被讀成「查不到今天的資料」。
//    實測（2026-08-05）GA4 標準維度（page_view）與自訂維度（customEvent:concern）
//    **今天的資料都查得到**。那句講的是自訂維度註冊後才開始收集，不是查詢延遲。
// 排程：每 3 小時（UTC 00/03/06/09/12/15/18/21 時的 :07）跑，有變更才 commit [skip ci]；
//       deploy.yml 的每日 16:00 UTC 重建套用到站上（故站上數字仍是一天一換，
//       但 repo 內的數字每 3 小時更新——時事集氣「依真實集氣數決定去留」要讀的是後者）。
// 手動：node scripts/qiugian-aggregate.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { ga4RunReport, loadConfig } from './lib/google-data.mjs';

const STATS_FILE = 'src/data/qiugian-stats.json';
const { ga4PropertyId } = loadConfig();

const notSet = (v) => !v || v === '(not set)' || v === '(other)';

// 依 eventName 過濾、依指定自訂維度分組取 eventCount。查詢失敗（維度未就緒等）→ 回空陣列，不中斷。
async function countBy(eventName, dims) {
  try {
    const r = await ga4RunReport(ga4PropertyId, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: dims.map((name) => ({ name })),
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: eventName } } },
      limit: 10000,
    });
    return (r.rows ?? []).map((row) => ({
      keys: row.dimensionValues.map((d) => d.value),
      n: Number(row.metricValues[0].value || 0),
    }));
  } catch (e) {
    console.error(`[qiugian-aggregate] ${eventName} 查詢略過：${e.message}`);
    return [];
  }
}

const existing = JSON.parse(readFileSync(STATS_FILE, 'utf8'));
const concerns = JSON.parse(readFileSync('src/data/concerns.json', 'utf8'));
const concernIds = concerns.map((c) => c.id);
// outcome 值→顯示標籤，依 concern 作用域（各情境選項不同、值可跨情境重複）；單一真實來源＝concerns.json。
const OUTCOME_LABEL = Object.fromEntries(
  concerns.map((c) => [c.id, Object.fromEntries((c.outcomes ?? []).map((o) => [o.value, o.label]))]),
);

const draws = await countBy('qiugian', ['customEvent:concern']); // [{keys:[concern], n}]
const drawsByPoem = await countBy('qiugian', ['customEvent:concern', 'customEvent:poem_no']);
const baoxi = await countBy('baoxi', ['customEvent:concern', 'customEvent:outcome']);
const qifu = await countBy('qifu', ['customEvent:concern']); // 集氣；時事祈福頁 concern=topical:<id>

const drawMap = Object.fromEntries(draws.filter((r) => !notSet(r.keys[0])).map((r) => [r.keys[0], r.n]));

const out = { _note: existing._note };
for (const id of concernIds) {
  const week_draws = drawMap[id] ?? 0;
  const top = {};
  for (const r of drawsByPoem) {
    if (r.keys[0] !== id || notSet(r.keys[1])) continue;
    top[r.keys[1]] = (top[r.keys[1]] ?? 0) + r.n;
  }
  let baoxiTotal = 0;
  const joys = [];
  for (const r of baoxi) {
    if (r.keys[0] !== id || notSet(r.keys[1])) continue;
    baoxiTotal += r.n;
    joys.push({ text: OUTCOME_LABEL[id]?.[r.keys[1]] ?? r.keys[1], meta: `本週 ${r.n} 人` });
  }
  joys.sort((a, b) => Number(b.meta.replace(/\D/g, '')) - Number(a.meta.replace(/\D/g, '')));
  out[id] = { week_draws, baoxi: baoxiTotal, top, joys };
}

// 時事祈福頁集氣數（concern=topical:<id>）
const topical = {};
for (const r of qifu) {
  if (!notSet(r.keys[0]) && r.keys[0].startsWith('topical:')) {
    const id = r.keys[0].slice('topical:'.length);
    topical[id] = (topical[id] ?? 0) + r.n;
  }
}
out.topical = topical;

// 宮廟歸因（2026-08-14，P0）：廟方專屬連結帶 ?temple=<temples.json 的 id>，求籤事件多帶 temple 維度
// （自訂維度同日註冊、非追溯）。按廟聚合近 7 天求籤數與同籤分布，供廟方報表與後續專屬頁；
// 前端無此參數時不送維度，這裡自然為空。連結慣例見 docs/temple-partner-links.md。
const byTemple = await countBy('qiugian', ['customEvent:temple', 'customEvent:poem_no']);
const temples = {};
for (const r of byTemple) {
  if (notSet(r.keys[0]) || notSet(r.keys[1])) continue;
  const t = (temples[r.keys[0]] ??= { week_draws: 0, top: {} });
  t.week_draws += r.n;
  t.top[r.keys[1]] = (t.top[r.keys[1]] ?? 0) + r.n;
}
// P1（2026-08-14）：籤詩頁開頁（廟方逐籤 QR 的入口）與祈福籤詩圖生成，各自按廟計數
const poemOpens = await countBy('poem_open', ['customEvent:temple']);
for (const r of poemOpens) {
  if (notSet(r.keys[0])) continue;
  (temples[r.keys[0]] ??= { week_draws: 0, top: {} }).poem_opens = ((temples[r.keys[0]].poem_opens ?? 0) + r.n);
}
const qianCards = await countBy('qian_card', ['customEvent:temple']);
for (const r of qianCards) {
  if (notSet(r.keys[0])) continue;
  (temples[r.keys[0]] ??= { week_draws: 0, top: {} }).qian_cards = ((temples[r.keys[0]].qian_cards ?? 0) + r.n);
}
out._temples = temples;

writeFileSync(STATS_FILE, JSON.stringify(out, null, 2) + '\n');
const summary = concernIds.map((id) => `${id}:求${out[id].week_draws}/報喜${out[id].baoxi}`).join('  ');
console.log(`[qiugian-aggregate] 已更新 ${STATS_FILE} — ${summary}；時事集氣 ${Object.keys(topical).length} 案；宮廟歸因 ${Object.keys(temples).length} 廟`);

// 集氣人數快照（P3）：GA4 近 7 天的集氣數會隨事件老化歸零，故把「峰值集氣數」凍結回寫 topical.json，
// 供頁面歸檔（archived）／轉記錄（memorial）後顯示「當時共有 N 人一起集氣」。取 max(既有快照, 本次7天數)，
// **只增不減、真實不灌水**：反映曾達到的真實峰值，不會被之後歸零的低值覆蓋。
const TOPICAL_FILE = 'src/data/topical.json';
try {
  const items = JSON.parse(readFileSync(TOPICAL_FILE, 'utf8'));
  let snapChanged = 0;
  for (const it of items) {
    const week = topical[it.id];
    if (typeof week !== 'number' || week <= 0) continue; // 本週無資料則不動既有快照
    const prev = typeof it.bless_snapshot === 'number' ? it.bless_snapshot : 0;
    const next = Math.max(prev, week);
    if (next !== prev) { it.bless_snapshot = next; snapChanged++; }
  }
  if (snapChanged) {
    writeFileSync(TOPICAL_FILE, JSON.stringify(items, null, 2) + '\n');
    console.log(`[qiugian-aggregate] 集氣快照更新 ${snapChanged} 案（bless_snapshot 只增不減）`);
  }
} catch (e) {
  console.error(`[qiugian-aggregate] 集氣快照回寫略過：${e.message}`);
}
