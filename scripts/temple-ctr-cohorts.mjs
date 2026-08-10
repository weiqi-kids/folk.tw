#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gscQuery, loadConfig } from './lib/google-data.mjs';
import { commonTempleName } from '../src/lib/temple-name.ts';
import {
  aggregateTempleCohorts,
  fetchAllGscRows,
  templeProfile,
} from './lib/temple-ctr-cohorts.mjs';

function parseArgs(argv) {
  const options = { days: 28, minImpressions: 100, maxRelativeCtr: 0.75, maxRows: 1_000_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--json') options.json = true;
    else if (arg === '--start') options.start = argv[++index];
    else if (arg === '--end') options.end = argv[++index];
    else if (arg === '--days') options.days = Number(argv[++index]);
    else if (arg === '--min-impressions') options.minImpressions = Number(argv[++index]);
    else if (arg === '--max-relative-ctr') options.maxRelativeCtr = Number(argv[++index]);
    else if (arg === '--max-rows') options.maxRows = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function dateRange(options) {
  const end = options.end ? new Date(`${options.end}T00:00:00Z`) : new Date(Date.now() - 3 * 86_400_000);
  const start = options.start
    ? new Date(`${options.start}T00:00:00Z`)
    : new Date(end.getTime() - (options.days - 1) * 86_400_000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    throw new Error('日期無效：請使用 --start YYYY-MM-DD --end YYYY-MM-DD，且 start 不晚於 end。');
  }
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

function pct(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function actionFor(row, actions) {
  if (row.positionBucket === '21+') {
    return `此排名帶的主要瓶頸是可見度，不把低 CTR 歸因於 title。${actions[row.intent]}`;
  }
  return actions[row.intent];
}

function markdown(report) {
  const lines = [
    `# 宮廟 CTR cohort（${report.range.startDate}～${report.range.endDate}）`,
    '',
    `GSC page×query ${report.collection.rawRows.toLocaleString()} 列，${report.collection.pages} 次分頁；` +
      `納入 ${report.collection.acceptedRows.toLocaleString()} 列、${report.collection.templePages.toLocaleString()} 個詳情頁。`,
    report.collection.skippedUnknownTemple
      ? `另有 ${report.collection.skippedUnknownTemple.toLocaleString()} 列網址找不到目前 temples.json 對應，已排除並列入資料品質檢查。`
      : '所有詳情頁網址都能對應目前 temples.json。',
    '',
    report.collection.exhausted
      ? 'API 結果已翻到短頁；仍受 GSC 隱私門檻與 Search Analytics 匯出限制，不能解讀為未抽樣的原始搜尋紀錄。'
      : `⚠️ 已碰到 --max-rows=${report.collection.maxRows.toLocaleString()}，結果截斷，請提高上限重跑。`,
    '',
    '## Cohort',
    '',
    '| Intent | Position | Clicks | Impressions | CTR | 同位置基準 | 相對基準 | Queries | Pages |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const row of report.cohorts) {
    lines.push(
      `| ${row.intentLabel} | ${row.positionBucket} | ${row.clicks} | ${row.impressions} | ${pct(row.ctr)} | ${pct(row.benchmarkCtr)} | ${row.relativeCtr == null ? '—' : pct(row.relativeCtr)} | ${row.queryCount} | ${row.pageCount} |`,
    );
  }
  lines.push('', '## 高曝光、低 CTR：建議檢查', '');
  if (!report.actionable.length) {
    lines.push(`沒有 cohort 同時達到 ${report.thresholds.minImpressions} 曝光且 CTR 低於同位置基準的 ${pct(report.thresholds.maxRelativeCtr)}。`);
  } else {
    for (const row of report.actionable) {
      lines.push(
        `### ${row.intentLabel}／${row.positionBucket}`,
        '',
        `${row.impressions} 曝光、${row.clicks} 點擊，CTR ${pct(row.ctr)}（同位置基準 ${pct(row.benchmarkCtr)}）。`,
        '',
        `建議：${actionFor(row, report.actions)}`,
        '',
        '代表查詢（只供 cohort 診斷，不觸發逐廟改 title）：',
        '',
      );
      for (const example of row.examples) {
        lines.push(`- ${example.query} — ${example.impressions} 曝光、${pct(example.ctr)}、平均位置 ${example.position.toFixed(1)}；${new URL(example.page).pathname}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

const HELP = `用法：pnpm seo:temple-ctr -- [選項]

  --days N                 天數（預設 28；end 預設今天前 3 天）
  --start YYYY-MM-DD       明確起日
  --end YYYY-MM-DD         明確迄日
  --min-impressions N      可行動 cohort 最低曝光（預設 100）
  --max-relative-ctr N     CTR / 同位置基準門檻（預設 0.75）
  --max-rows N             安全上限（預設 1000000）
  --json                    輸出 JSON（預設 Markdown）`;

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(HELP);
  process.exit(0);
}
const range = dateRange(options);
const temples = JSON.parse(readFileSync(resolve('src/data/temples.json'), 'utf8'));
const deities = JSON.parse(readFileSync(resolve('src/data/deities.json'), 'utf8'));
const deityById = new Map(deities.map((deity) => [deity.id, deity]));
const profiles = new Map(
  temples.map((temple) => [
    temple.id,
    templeProfile(temple, deityById.get(temple.main_deity_ref), commonTempleName(temple.name)),
  ]),
);

const { gscSiteUrl } = loadConfig();
const collection = await fetchAllGscRows(
  gscQuery,
  gscSiteUrl,
  {
    ...range,
    dimensions: ['page', 'query'],
    type: 'web',
    dataState: 'final',
    dimensionFilterGroups: [
      {
        filters: [
          {
            dimension: 'page',
            operator: 'includingRegex',
            expression: 'https://folk\\.tw/temples/[^/]+/?$',
          },
        ],
      },
    ],
  },
  { maxRows: options.maxRows },
);

const rows = collection.rows.map((row) => ({
  page: row.keys?.[0] ?? '',
  query: row.keys?.[1] ?? '',
  clicks: row.clicks,
  impressions: row.impressions,
  ctr: row.ctr,
  position: row.position,
}));
const result = aggregateTempleCohorts(rows, profiles, options);
const report = {
  generatedAt: new Date().toISOString(),
  range,
  thresholds: {
    minImpressions: options.minImpressions,
    maxRelativeCtr: options.maxRelativeCtr,
  },
  collection: {
    rawRows: rows.length,
    acceptedRows: result.acceptedRows,
    templePages: result.acceptedPages,
    pages: collection.pages,
    exhausted: collection.exhausted,
    truncated: collection.truncated,
    maxRows: options.maxRows,
    skippedNonDetail: result.skippedNonDetail,
    skippedUnknownTemple: result.skippedUnknownTemple,
  },
  cohorts: result.cohorts,
  benchmarks: result.benchmarks,
  actionable: result.actionable,
  actions: {
    temple_name: '先比對 SERP／地圖包與法人前綴 cohort；只做 cohort 級模板實驗，不逐廟自動改 title。',
    region_temple: '檢查縣市、鄉鎮與廟名是否在 title／description 前段一致呈現，再以 cohort 做 A/B 前後比較。',
    region_deity: '檢查可驗證的地址與主祀是否清楚；只對這個意圖群組測模板，不把神明關係推測成事實。',
    festival_service: '先補有來源的祭典或服務事實與入口；沒有資料就列缺口，不自行生成廟方服務。',
    other: '先讀代表查詢再拆新意圖；不要用「其他」群組直接驅動全站 title 改寫。',
  },
};

console.log(options.json ? JSON.stringify(report, null, 2) : markdown(report));
