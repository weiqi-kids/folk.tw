#!/usr/bin/env node
// 求籤共情層每晚聚合：GA4 Data API（近 7 天）→ 各情境本週求籤人數／同籤分布／報喜數
// → 寫回 src/data/qiugian-stats.json（供靜態 build 渲染）。數字為真、少算不灌水。
//
// 相依：scripts/.google-sa-key.json（SA 須有 GA4 讀權，本站已具）＋ GA4 自訂維度 concern/poem_no/outcome
//       （已於 2026-07-14 註冊；自訂維度非追溯，資料自註冊後起算、有 24–48h 處理延遲，故初期可能為 0＝正常）。
// 排程：每日 UTC 15:00（台北 23:00）跑並 commit [skip ci]；deploy.yml 的每日 16:00 UTC 重建套用。
// 手動：node scripts/qiugian-aggregate.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { ga4RunReport, loadConfig } from './lib/google-data.mjs';

const STATS_FILE = 'src/data/qiugian-stats.json';
const { ga4PropertyId } = loadConfig();

const OUTCOME_LABEL = { 上岸: '錄取了 / 上岸', 還在等: '還在等結果', 繼續找: '還沒上，繼續找' };
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
const concernIds = JSON.parse(readFileSync('src/data/concerns.json', 'utf8')).map((c) => c.id);

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
    joys.push({ text: OUTCOME_LABEL[r.keys[1]] ?? r.keys[1], meta: `本週 ${r.n} 人` });
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

writeFileSync(STATS_FILE, JSON.stringify(out, null, 2) + '\n');
const summary = concernIds.map((id) => `${id}:求${out[id].week_draws}/報喜${out[id].baoxi}`).join('  ');
console.log(`[qiugian-aggregate] 已更新 ${STATS_FILE} — ${summary}；時事集氣 ${Object.keys(topical).length} 案`);
