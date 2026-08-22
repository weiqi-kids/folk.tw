#!/usr/bin/env node
// 來源型檔期的盲點報告：找出「權威來源已有項目，但 festivals/events 沒有對應專頁」的候選。
//
// growth-calendar-gaps.mjs 只能量已存在的頁；這支補另一半，但刻意不把來源清單
// 當成搜尋需求，也不自動開頁。每筆輸出都保留 source case、週期與同日既有頁，
// 讓編輯再用 GSC query×page 驗證「值得開的問題叢集」。
//
// 日期界線：
//   - 只有 local-celebration-cases 判為 annual 的項目才排進 upcoming；
//   - n_year / unknown 不把資料列的月日假裝成今年會發生，另列 unscheduled；
//   - date_override / date_disown 走既有 local-celebration-cycle，不能自行換算。
//
// 用法：
//   node --experimental-strip-types scripts/growth-source-candidates.mjs
//   node --experimental-strip-types scripts/growth-source-candidates.mjs --days 60
//   node --experimental-strip-types scripts/growth-source-candidates.mjs --as-of 2026-08-22
//   node --experimental-strip-types scripts/growth-source-candidates.mjs --json

import { readFileSync } from 'node:fs';

const { lunarToNextSolar, solarMdToNext } = await import('../src/lib/calendar-date.ts');
const {
  celebrationDateOverride,
  celebrationDateDisowned,
} = await import('../src/lib/local-celebration-cycle.ts');

const args = process.argv.slice(2);
const json = args.includes('--json');
const daysAt = args.indexOf('--days');
const horizonDays = daysAt >= 0 ? Number(args[daysAt + 1]) : 120;
const asOfAt = args.indexOf('--as-of');
const asOf = asOfAt >= 0 ? args[asOfAt + 1] : null;

if (!Number.isInteger(horizonDays) || horizonDays < 0) {
  console.error('--days 必須是非負整數');
  process.exit(1);
}
if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
  console.error('--as-of 要 YYYY-MM-DD');
  process.exit(1);
}

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const localCelebrations = read('../src/data/local-celebrations.json');
const cases = read('../src/data/local-celebration-cases.json');
const festivals = read('../src/data/festivals.json');
const events = read('../src/data/events.json');

const todayIso = asOf ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
if (!/^\d{4}-\d{2}-\d{2}$/.test(todayIso)) {
  console.error(`無法取得台灣日期：${todayIso}`);
  process.exit(1);
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// 只消掉格式差異與泛稱；不做語意推論。鷄／雞是資料來源的字形差異，視為同字。
const normalize = (value) => String(value ?? '')
  .normalize('NFKC')
  .replaceAll('鷄', '雞')
  .replace(/[「」『』（）()［］【】—–．·・：:，,、；;／/\\\s]/g, '')
  .replace(/活動|節慶|文化祭|系列|大典|祭典|慶典/g, '');

const pageRecords = [
  ...festivals.map((f) => ({
    kind: 'festival',
    id: f.slug,
    name: f.name,
    aliases: f.aliases ?? [],
    calendar: f.lunar_date ? 'lunar' : f.solar_date ? 'solar' : null,
    date: f.lunar_date ?? f.solar_date ?? null,
  })),
  ...events.map((e) => ({
    kind: 'event',
    id: e.id,
    name: e.name,
    aliases: [],
    calendar: e.lunar_date ? 'lunar' : null,
    date: e.lunar_date ?? null,
  })),
];

const pageTerms = (page) => [page.name, ...page.aliases]
  .map(normalize)
  .filter((term) => term.length >= 3);

function pageMatch(item, caseRow, page) {
  if (caseRow.related_event && page.id === caseRow.related_event) {
    return '來源對帳檔指定 related_event';
  }
  const itemTerms = [item.name, caseRow.name, caseRow.case_name]
    .map(normalize)
    .filter((term) => term.length >= 3);
  const terms = pageTerms(page);
  if (itemTerms.some((itemTerm) => terms.some((term) => itemTerm === term))) {
    return '名稱／別名相同';
  }
  // 只接受四字以上的包含關係，避免「元宵」這類短詞把不同活動誤合併。
  if (itemTerms.some((itemTerm) => terms.some((term) => (
    itemTerm.length >= 4 && term.length >= 4 && (itemTerm.includes(term) || term.includes(itemTerm))
  )))) {
    return '名稱／別名包含關係';
  }
  return null;
}

function sameDatePage(item, page) {
  if (!page.calendar || !page.date || page.calendar !== item.calendar || page.date !== item.date) return false;
  return true;
}

function nextIso(item) {
  const override = celebrationDateOverride(item.id);
  const calendar = override?.calendar ?? item.calendar;
  const date = override?.date ?? item.date;
  if (calendar === 'lunar') return lunarToNextSolar(date, todayIso);
  if (calendar === 'solar') return solarMdToNext(date, todayIso);
  return null;
}

const caseById = new Map(cases.items.map((row) => [row.lc_id, row]));
const rows = [];

for (const item of localCelebrations.items) {
  const caseRow = caseById.get(item.id);
  if (!caseRow) continue;

  const disowned = celebrationDateDisowned(item.id);
  const override = celebrationDateOverride(item.id);
  const datedItem = {
    ...item,
    calendar: override?.calendar ?? item.calendar,
    date: override?.date ?? item.date,
  };
  const matched = pageRecords
    .map((page) => ({ page, reason: pageMatch(item, caseRow, page) }))
    .find((x) => x.reason);
  const sameDatePages = pageRecords
    .filter((page) => sameDatePage(datedItem, page))
    .map((page) => ({ kind: page.kind, id: page.id, name: page.name }));

  const status = matched ? 'covered' : sameDatePages.length ? 'same-date-hub' : 'unserved';
  const recurrence = caseRow.verdict;
  const iso = recurrence === 'annual' && !disowned ? nextIso(datedItem) : null;
  const tMinus = iso ? daysBetween(todayIso, iso) : null;

  rows.push({
    id: item.id,
    name: item.name,
    county: item.county,
    calendar: datedItem.calendar,
    sourceDate: datedItem.date,
    recurrence,
    caseId: caseRow.case_id ?? null,
    caseName: caseRow.case_name ?? null,
    basis: caseRow.basis ?? '',
    dateOverride: override?.basis ?? null,
    dateDisowned: disowned?.basis ?? null,
    status,
    page: matched ? { kind: matched.page.kind, id: matched.page.id, name: matched.page.name, reason: matched.reason } : null,
    sameDatePages,
    nextIso: iso,
    tMinus,
  });
}

const upcoming = rows
  .filter((row) => row.recurrence === 'annual' && row.status !== 'covered' && row.nextIso)
  .filter((row) => row.tMinus >= 0 && row.tMinus <= horizonDays)
  .sort((a, b) => a.tMinus - b.tMinus || a.name.localeCompare(b.name));
const unscheduled = rows
  .filter((row) => row.status !== 'covered' && row.recurrence !== 'annual')
  .sort((a, b) => a.name.localeCompare(b.name));
const summary = {
  generatedAt: new Date().toISOString(),
  todayIso,
  horizonDays,
  source: localCelebrations.source?.ref ?? null,
  upcoming,
  unscheduled,
  totals: {
    sourceRows: rows.length,
    upcoming: upcoming.length,
    unscheduled: unscheduled.length,
    covered: rows.filter((row) => row.status === 'covered').length,
    sameDateHub: rows.filter((row) => row.status === 'same-date-hub').length,
    unserved: rows.filter((row) => row.status === 'unserved').length,
  },
};

if (json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`來源型檔期盲點（${todayIso} 起 ${horizonDays} 天）`);
  console.log(`來源：${summary.source ?? '（未標來源）'}`);
  console.log('這是候選清單，不是開頁命令；每筆仍要用 GSC query×page 驗證問題叢集。\n');
  console.log('近期、沒有專屬頁的 annual 項目：');
  if (!upcoming.length) console.log('  （無）');
  for (const row of upcoming) {
    const sameDay = row.sameDatePages.length
      ? `；同日既有頁：${row.sameDatePages.map((p) => `${p.kind}/${p.id}`).join('、')}`
      : '；同日沒有既有節日／活動頁';
    console.log(`  T-${row.tMinus} ${row.nextIso} ${row.name}（${row.county}）${sameDay}`);
    console.log(`    source case ${row.caseId ?? '（空）'}；專頁：無；查詢驗證後才決定頁型`);
  }
  console.log('\n尚未排入今年日期的來源項目：');
  if (!unscheduled.length) console.log('  （無）');
  for (const row of unscheduled) {
    console.log(`  ${row.name}（${row.county}）— ${row.recurrence}；專頁：無；日期以主辦公告為準`);
  }
  console.log(`\n對帳摘要：來源 ${summary.totals.sourceRows}；covered ${summary.totals.covered}；` +
    `same-date-hub ${summary.totals.sameDateHub}；unserved ${summary.totals.unserved}。`);
}
