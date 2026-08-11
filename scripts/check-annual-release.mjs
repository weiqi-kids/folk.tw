#!/usr/bin/env node
// 52 週年度發布 manifest gate。
//
// 這支 gate 把「文章已寫好」和「有資格進入發布 queue」分開：只有當年度日期
// 有證據、來源／視覺審核通過、且 publish_at 確實是活動日前一個月時，才可標記
// scheduled。其餘週次會明確列為 blocked，而不是默默排成假日期。

import {
  WEEK_COUNT, WEEK_DIR, effectiveRows, isIsoDate, listWeekFiles,
  loadManifest, monthOf, oneMonthBefore,
} from './lib/annual-release.mjs';

const errors = [];
const warnings = [];
const addError = (message) => errors.push(message);
const addWarning = (message) => warnings.push(message);

let manifest;
try {
  manifest = loadManifest();
} catch (error) {
  console.error(`✗ annual release manifest 讀取失敗：${error.message}`);
  process.exit(1);
}

if (manifest.config.version !== 1) addError(`不支援的 manifest version：${manifest.config.version}`);
if (manifest.config.timezone !== 'Asia/Taipei') addError('timezone 必須是 Asia/Taipei');
if (manifest.leadDays !== 30) addError(`lead_days 必須是 30，目前 ${manifest.leadDays}`);
if (!Number.isInteger(manifest.maxUrlsPerMonth) || manifest.maxUrlsPerMonth < 1 || manifest.maxUrlsPerMonth > 4) {
  addError(`max_urls_per_month 必須是 1–4 的整數，目前 ${manifest.maxUrlsPerMonth}`);
}
if (!Number.isInteger(manifest.maxNewCanonicalsPerMonth) || manifest.maxNewCanonicalsPerMonth < 1 || manifest.maxNewCanonicalsPerMonth > 4) {
  addError(`max_new_canonicals_per_month 必須是 1–4 的整數，目前 ${manifest.maxNewCanonicalsPerMonth}`);
}

const files = listWeekFiles(WEEK_DIR);
const expectedFiles = Array.from({ length: WEEK_COUNT }, (_, index) => `week-${String(index + 1).padStart(2, '0')}.md`);
if (files.length !== WEEK_COUNT || expectedFiles.some((file) => !files.includes(file))) {
  addError(`週稿檔案不完整：預期 ${WEEK_COUNT}，實際 ${files.length}`);
}

const entryWeeks = new Set();
for (const row of manifest.config.entries ?? []) {
  const week = Number(row?.week);
  if (!Number.isInteger(week) || week < 1 || week > WEEK_COUNT) addError(`manifest entry week 不合法：${row?.week}`);
  if (entryWeeks.has(week)) addError(`manifest entry week 重複：${week}`);
  entryWeeks.add(week);
}

const rows = effectiveRows(manifest, WEEK_DIR);
const byMonth = new Map();
const newByMonth = new Map();
for (const row of rows) {
  const prefix = `${row.file}：`;
  if (row.week < 1 || row.week > WEEK_COUNT) addError(`${prefix} week 不在 1–52`);
  if (!row.title) addError(`${prefix} 找不到文章 title`);
  if (!row.canonical) addError(`${prefix} canonical 不合法或缺少尾斜線`);
  if (!row.annual_status) addError(`${prefix} annual_status 缺少`);
  if (!['blocked', 'scheduled', 'published'].includes(String(row.schedule_status))) {
    addError(`${prefix} schedule_status 不合法：${row.schedule_status}`);
  }
  if (!['source_required', 'verified'].includes(String(row.date_status))) {
    addError(`${prefix} date_status 不合法：${row.date_status}`);
  }
  if (!['pending', 'pass'].includes(String(row.review_status))) {
    addError(`${prefix} review_status 不合法：${row.review_status}`);
  }
  if (!['refresh', 'merge', 'new'].includes(String(row.mode))) {
    addError(`${prefix} mode 不合法：${row.mode}`);
  }

  const hasEventDate = row.event_date != null && row.event_date !== '';
  const hasPublishAt = row.publish_at != null && row.publish_at !== '';
  if (hasEventDate && !isIsoDate(row.event_date)) addError(`${prefix} event_date 必須是 YYYY-MM-DD`);
  if (hasPublishAt && !isIsoDate(row.publish_at)) addError(`${prefix} publish_at 必須是 YYYY-MM-DD`);
  if (row.schedule_status === 'scheduled') {
    if (!hasEventDate || !hasPublishAt) addError(`${prefix} scheduled 必須同時有 event_date 與 publish_at`);
    if (row.date_status !== 'verified') addError(`${prefix} scheduled 必須 date_status=verified`);
    if (row.review_status !== 'pass') addError(`${prefix} scheduled 必須 review_status=pass`);
    if (hasEventDate && hasPublishAt && oneMonthBefore(row.event_date) !== row.publish_at) {
      addError(`${prefix} publish_at 應為 event_date 前一個月（${oneMonthBefore(row.event_date)}）`);
    }
  } else if (row.schedule_status === 'published') {
    if (!hasEventDate || !hasPublishAt) addError(`${prefix} published 必須保留 event_date 與 publish_at 證據`);
    if (row.date_status !== 'verified') addError(`${prefix} published 必須 date_status=verified`);
    if (row.review_status !== 'pass') addError(`${prefix} published 必須 review_status=pass`);
  } else if (hasPublishAt) {
    addError(`${prefix} blocked/published 以外的週次不可填 publish_at；先完成年度證據與審核`);
  }
  if (row.date_status === 'source_required' && (hasEventDate || hasPublishAt)) {
    addError(`${prefix} source_required 不可帶日期，避免把推算值當公告`);
  }
  if (row.schedule_status === 'blocked' && row.review_status === 'pass') {
    addWarning(`${prefix} review 已通過但仍 blocked；有日期證據後才能排入 queue`);
  }
  if (row.schedule_status === 'scheduled') {
    const month = monthOf(row.publish_at);
    if (!byMonth.has(month)) byMonth.set(month, new Set());
    byMonth.get(month).add(row.canonical);
    if (row.mode === 'new') {
      if (!newByMonth.has(month)) newByMonth.set(month, new Set());
      newByMonth.get(month).add(row.canonical);
    }
  }
}

for (const [month, urls] of byMonth) {
  if (urls.size > manifest.maxUrlsPerMonth) {
    addError(`${month} 有 ${urls.size} 個 scheduled canonical，超過每月 ${manifest.maxUrlsPerMonth} 個小批上限`);
  }
}
for (const [month, urls] of newByMonth) {
  if (urls.size > manifest.maxNewCanonicalsPerMonth) {
    addError(`${month} 有 ${urls.size} 個新 canonical，超過每月 ${manifest.maxNewCanonicalsPerMonth} 個上限`);
  }
}

const scheduled = rows.filter((row) => row.schedule_status === 'scheduled');
const blocked = rows.filter((row) => row.schedule_status === 'blocked');
console.log(`年度 release manifest：52/52 週稿對齊；scheduled ${scheduled.length}，blocked ${blocked.length}`);
if (warnings.length) {
  console.log(`提示 ${warnings.length} 項：`);
  for (const warning of warnings.slice(0, 30)) console.log(`  - ${warning}`);
}
if (errors.length) {
  console.error(`✗ annual release gate 失敗（${errors.length} 項）`);
  for (const error of errors.slice(0, 80)) console.error(`  - ${error}`);
  if (errors.length > 80) console.error(`  …另有 ${errors.length - 80} 項`);
  process.exit(1);
}
console.log('✓ annual release gate 通過：未核定日期的週次保持 blocked，不會進入發布或提交 queue。');
