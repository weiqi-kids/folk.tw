#!/usr/bin/env node
// 產生「本月可提交」的年度 URL 小批清單。
//
// 只處理 manifest 中已 scheduled、review pass、publish_at 已到且在本月的項目。
// 過去月份的 overdue 項目只報告、不自動追送，避免一次把累積 URL 灌進搜尋引擎。
// 這裡產生的是已上線 canonical 的通知清單；Markdown 週稿不會因此變成 Astro 頁。

import { writeFileSync } from 'node:fs';
import {
  dueRows, effectiveRows, loadManifest, monthOf, publicUrl, taipeiToday,
} from './lib/annual-release.mjs';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : '';
};
const today = valueAfter('--today') || process.env.RELEASE_DATE || taipeiToday();
const out = valueAfter('--out');
const json = args.includes('--json');
const site = process.env.SITE_URL || 'https://folk.tw';

if (!/^\d{4}-\d{2}-\d{2}$/u.test(today)) {
  console.error(`today 必須是 YYYY-MM-DD：${today}`);
  process.exit(1);
}

let manifest;
try {
  manifest = loadManifest(valueAfter('--manifest') || undefined);
} catch (error) {
  console.error(`annual release manifest 讀取失敗：${error.message}`);
  process.exit(1);
}

const rows = effectiveRows(manifest);
const allDue = dueRows(rows, today);
const currentMonth = monthOf(today);
const eligible = allDue.filter((row) => monthOf(row.publish_at) === currentMonth);
const overdue = allDue.filter((row) => monthOf(row.publish_at) < currentMonth);
const urls = [...new Set(eligible.map((row) => publicUrl(row, site)))];
const maxUrls = manifest.maxUrlsPerMonth;

if (urls.length > maxUrls) {
  console.error(`✗ ${currentMonth} 有 ${urls.length} 個到期 canonical，超過每月 ${maxUrls} 個上限；不產生提交清單。`);
  process.exit(1);
}

if (out) writeFileSync(out, urls.length ? `${urls.join('\n')}\n` : '', 'utf8');

const report = {
  today,
  month: currentMonth,
  eligible: eligible.map((row) => ({ week: row.week, canonical: row.canonical, publish_at: row.publish_at })),
  overdue: overdue.map((row) => ({ week: row.week, canonical: row.canonical, publish_at: row.publish_at })),
  urls,
};
if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`annual release due：${currentMonth} 可提交 ${urls.length} 個 URL（cutoff ${today}）`);
  if (urls.length) for (const url of urls) console.log(`  - ${url}`);
  if (overdue.length) {
    console.log(`⚠ ${overdue.length} 個過去月份項目未追送，需人工安排小批補送：`);
    for (const row of overdue) console.log(`  - week-${String(row.week).padStart(2, '0')} ${row.canonical}（${row.publish_at}）`);
  }
  if (!urls.length && !overdue.length) console.log('  本月沒有到期且通過審核的年度 URL。');
}
