#!/usr/bin/env node
// 不需 full build 的 RSS 契約 gate：檢查入口、自動偵測、內容來源與一週邊界。
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../src/pages/rss.xml.ts', import.meta.url), 'utf8');
const base = readFileSync(new URL('../src/layouts/Base.astro', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../src/lib/weekly-feed.ts', import.meta.url), 'utf8');
const problems = [];

for (const required of ['application/rss+xml; charset=utf-8', '神酷每週拜拜提醒', 'weeklyFeedItems(today, 8)', 'atom:link']) {
  if (!route.includes(required)) problems.push(`RSS route 缺少 ${required}`);
}
for (const required of ['rel="alternate"', 'type="application/rss+xml"', 'href="https://folk.tw/rss.xml"', '每週拜拜提醒 RSS']) {
  if (!base.includes(required)) problems.push(`Base 缺少 ${required}`);
}
for (const required of ['festivalNextSolar(festival, weekStart)', 'upcomingDeityBirthdays(weekStart, 7)', 'practice.offerings', 'practice.taboo', '下週先知道']) {
  if (!lib.includes(required)) problems.push(`週報內容未同源接入 ${required}`);
}

const { mondayOf } = await import('../src/lib/weekly-date.ts');
if (mondayOf('2026-08-10') !== '2026-08-10' || mondayOf('2026-08-16') !== '2026-08-10') {
  problems.push('週一邊界計算錯誤');
}
const festivals = JSON.parse(readFileSync(new URL('../src/data/festivals.json', import.meta.url), 'utf8'));
const { festivalNextSolar } = await import('../src/lib/lunar-date.ts');
const current = festivals.find((f) => f.slug === 'guimenkai');
const preview = festivals.find((f) => f.slug === 'qixi');
if (festivalNextSolar(current, '2026-08-10').iso !== '2026-08-13') problems.push('鬼門開日期來源未得到 2026-08-13');
if (festivalNextSolar(preview, '2026-08-17').iso !== '2026-08-19') problems.push('七夕預告日期來源未得到 2026-08-19');
if (!lib.includes('count = 8') || !lib.includes('-7 * offset')) problems.push('RSS 未保留 8 週歷史');
if (!lib.includes('鬼門開') && (!lib.includes('festival.lead') || !lib.includes('供品參考'))) problems.push('RSS 未包含節日與實用準備內容');

if (problems.length) {
  console.error(`✗ RSS 檢查失敗（${problems.length} 項）`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('✓ RSS 檢查通過：8 週歷史，節日、聖誕、準備事項與下週預告皆由站內資料產生。');
