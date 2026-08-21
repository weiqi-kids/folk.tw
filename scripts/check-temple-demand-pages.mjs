#!/usr/bin/env node
// 「地區 × 神明」需求頁 gate：拒絕無搜尋證據、宮廟數不足或行政區／主祀對映不精確的薄頁。
// 頁面唯一資料源是 src/lib/temple-demand-pages.ts，本檔只驗證，不另維護候選清單。

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TEMPLE_DEMAND_PAGES,
  TEMPLE_DEMAND_THRESHOLDS,
  templeDemandHref,
} from '../src/lib/temple-demand-pages.ts';
import { countyName, templeCounty, templeTownship } from '../src/lib/temple-region.ts';
import {
  discoverTempleDemandPages,
  queryEvidence,
} from './lib/temple-demand-discovery.mjs';

const root = resolve(import.meta.dirname, '..');
const temples = JSON.parse(readFileSync(resolve(root, 'src/data/temples.json'), 'utf8'));
const deities = JSON.parse(readFileSync(resolve(root, 'src/data/deities.json'), 'utf8'));
const violations = [];
const seen = new Set();
const configuredByHref = new Map(TEMPLE_DEMAND_PAGES.map((page) => [templeDemandHref(page), page]));

// 最新快照做全量候選掃描；新過門檻交集若沒進永久白名單就硬擋。
// 已發布頁不會因近期需求下降被移除，改由下方回讀「首次達標快照」證明當初有依據。
const snapshots = readdirSync(resolve(root, 'data/seo-daily'))
  .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
  .sort();
const latestEvidenceFile = `data/seo-daily/${snapshots.at(-1)}`;
const latestSnapshot = JSON.parse(readFileSync(resolve(root, latestEvidenceFile), 'utf8'));
const latestCandidates = discoverTempleDemandPages(
  latestSnapshot,
  temples,
  deities,
  TEMPLE_DEMAND_THRESHOLDS,
);
for (const candidate of latestCandidates) {
  const href = templeDemandHref(candidate);
  if (!configuredByHref.has(href)) violations.push(`${latestEvidenceFile} 有過門檻需求但永久白名單遺漏：${href}`);
}
console.log(`✓ ${latestEvidenceFile} 最新快照全量掃描：${latestCandidates.length} 個地區×神明交集過門檻`);

for (const page of TEMPLE_DEMAND_PAGES) {
  const href = templeDemandHref(page);
  if (seen.has(href)) violations.push(`${href} 重複`);
  seen.add(href);

  const county = countyName(page.county);
  if (!county) violations.push(`${href} county slug 不存在：${page.county}`);
  const deity = deities.find((d) => d.id === page.deity && !d.draft);
  if (!deity) violations.push(`${href} deity 不存在或未發佈：${page.deity}`);

  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(resolve(root, page.evidenceFile), 'utf8'));
  } catch (error) {
    violations.push(`${href} 無法讀取 GSC 證據 ${page.evidenceFile}：${error.message}`);
    continue;
  }
  const evidence = queryEvidence(snapshot).find((row) => row.query === page.query);
  if (!evidence) {
    violations.push(`${href} 在 ${page.evidenceFile} 的 GSC 需求證據查無精確 query「${page.query}」`);
  } else {
    if (evidence.impressions < TEMPLE_DEMAND_THRESHOLDS.minImpressions)
      violations.push(`${href} GSC 曝光 ${evidence.impressions} < ${TEMPLE_DEMAND_THRESHOLDS.minImpressions}`);
    if (evidence.clicks < TEMPLE_DEMAND_THRESHOLDS.minClicks)
      violations.push(`${href} GSC 點擊 ${evidence.clicks} < ${TEMPLE_DEMAND_THRESHOLDS.minClicks}`);
  }

  // 查詢字面至少要同時命中地名與神明正名／別名，避免拿不相關 query 當開頁證據。
  const townStem = page.town.replace(/[區鄉鎮市]$/, '');
  const deityTerms = deity ? [deity.name, ...(deity.aliases ?? [])] : [];
  if (!page.query.includes(townStem) || !deityTerms.some((term) => page.query.includes(term)))
    violations.push(`${href} query 未同時命中地名與神明：${page.query}`);

  const matches = temples.filter((t) =>
    templeCounty(t.district)?.slug === page.county &&
    templeTownship(t.district)?.name === page.town &&
    t.main_deity_ref === page.deity
  );
  if (matches.length < TEMPLE_DEMAND_THRESHOLDS.minTemples)
    violations.push(`${href} 精確主祀宮廟 ${matches.length} 間 < ${TEMPLE_DEMAND_THRESHOLDS.minTemples}`);
  if (!matches.some((t) => typeof t.lat === 'number' && typeof t.lng === 'number'))
    violations.push(`${href} 沒有任何可衍生的地圖資料`);

  console.log(`✓ ${county ?? page.county}${page.town} × ${deity?.name ?? page.deity}：` +
    `${evidence?.impressions ?? 0} 曝光／${evidence?.clicks ?? 0} 點擊，${matches.length} 間宮廟`);
}

const template = readFileSync(resolve(root, 'src/pages/temples/region/[county]/[town]/[deity].astro'), 'utf8');
// 🔴 這組不變量守的是**措辭界線**（「宮廟資料裡有這筆登記」≠「這間廟今年有在辦」），
//    不是任何一句話的字面。2026-08-21 動過一次：那句免責原本寫成
//    「下列內容只表示宮廟資料中有這筆登記祭典，**不代表本站確認**當年度實際舉辦情形。」，
//    站主裁示頁面不得自述本站怎麼作業（見記憶 no-meta-disclaimers-on-pages），
//    改寫成「下列是宮廟登記在案的祭典；當年度是否舉辦、日期有無異動，以廟方公告為準。」
//    ——語意一字未讓，但字面換了，於是這道 gate 紅燈（**它該紅，這正是它的職責**）。
//    改不變量時的判準：新字串必須同時承載「登記」與「未經確認」兩層意思；
//    只要有人把它簡化成「這些廟的祭典」就會失去界線，那時應該擋下來而不是再改一次 gate。
for (const required of ['class="lead"', '主祀{deityName}的宮廟名單', '登記在案的祭典', '以廟方公告為準', 'templeDemandHref']) {
  if (!template.includes(required)) violations.push(`需求頁模板缺必要不變量：${required}`);
}
// 先把那句合法的界線說明整段拿掉再測，否則它自己會觸發下面的關鍵詞。
if (/實際舉辦|舉辦.*活動|這些廟.*過/.test(
  template.replace('當年度是否舉辦、日期有無異動，以廟方公告為準', '')))
  violations.push('需求頁模板疑似替廟方宣稱活動');

if (violations.length) {
  console.error(`\n✗ 地區×神明需求頁 gate：${violations.length} 項違規`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`✓ 地區×神明需求頁 gate：${TEMPLE_DEMAND_PAGES.length} 頁全部通過`);
