#!/usr/bin/env node
// 「地區 × 神明」需求頁 gate：拒絕無搜尋證據、宮廟數不足或行政區／主祀對映不精確的薄頁。
// 頁面唯一資料源是 src/lib/temple-demand-pages.ts，本檔只驗證，不另維護候選清單。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TEMPLE_DEMAND_PAGES,
  TEMPLE_DEMAND_THRESHOLDS,
  templeDemandHref,
} from '../src/lib/temple-demand-pages.ts';
import { countyName, templeCounty, templeTownship } from '../src/lib/temple-region.ts';

const root = resolve(import.meta.dirname, '..');
const temples = JSON.parse(readFileSync(resolve(root, 'src/data/temples.json'), 'utf8'));
const deities = JSON.parse(readFileSync(resolve(root, 'src/data/deities.json'), 'utf8'));
const violations = [];
const seen = new Set();
const configuredByHref = new Map(TEMPLE_DEMAND_PAGES.map((page) => [templeDemandHref(page), page]));

// 同一份最新快照做全量候選掃描：只有 query 同時命中鄉鎮名與神明正名／別名，且搜尋量、
// 點擊與精確主祀宮廟數都過門檻，才應存在於白名單。這會同時擋住「漏做合格頁」與「硬塞薄頁」。
const evidenceFiles = [...new Set(TEMPLE_DEMAND_PAGES.map((page) => page.evidenceFile))];
for (const evidenceFile of evidenceFiles) {
  const snapshot = JSON.parse(readFileSync(resolve(root, evidenceFile), 'utf8'));
  const places = new Map();
  for (const temple of temples) {
    const county = templeCounty(temple.district), town = templeTownship(temple.district);
    if (!county || !town) continue;
    places.set(`${county.slug}/${town.name}`, {
      county: county.slug,
      town: town.name,
      stem: town.name.replace(/[區鄉鎮市]$/, ''),
    });
  }
  const qualified = new Set();
  for (const row of snapshot.gsc?.topQueries ?? []) {
    if (row.impressions < TEMPLE_DEMAND_THRESHOLDS.minImpressions || row.clicks < TEMPLE_DEMAND_THRESHOLDS.minClicks) continue;
    for (const place of places.values()) {
      if (place.stem.length < 2 || !row.query.includes(place.stem)) continue;
      for (const deity of deities.filter((d) => !d.draft)) {
        const terms = [deity.name, ...(deity.aliases ?? [])].filter((term) => term.length >= 2);
        if (!terms.some((term) => row.query.includes(term))) continue;
        const count = temples.filter((temple) =>
          templeCounty(temple.district)?.slug === place.county &&
          templeTownship(temple.district)?.name === place.town &&
          temple.main_deity_ref === deity.id
        ).length;
        if (count < TEMPLE_DEMAND_THRESHOLDS.minTemples) continue;
        qualified.add(templeDemandHref({ county: place.county, town: place.town, deity: deity.id }));
      }
    }
  }
  for (const href of qualified) {
    if (!configuredByHref.has(href)) violations.push(`${evidenceFile} 有過門檻需求但白名單遺漏：${href}`);
  }
  for (const page of TEMPLE_DEMAND_PAGES.filter((page) => page.evidenceFile === evidenceFile)) {
    const href = templeDemandHref(page);
    if (!qualified.has(href)) violations.push(`${href} 未通過 ${evidenceFile} 的全量候選規則`);
  }
  console.log(`✓ ${evidenceFile} 全量掃描：${qualified.size} 個地區×神明交集過門檻`);
}

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
  const evidence = snapshot.gsc?.topQueries?.find((row) => row.query === page.query);
  if (!evidence) {
    violations.push(`${href} 在 ${page.evidenceFile} 的 gsc.topQueries 查無精確 query「${page.query}」`);
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
for (const required of ['class="lead"', '主祀{deityName}的宮廟名單', '有這筆登記祭典', 'templeDemandHref']) {
  if (!template.includes(required)) violations.push(`需求頁模板缺必要不變量：${required}`);
}
if (/實際舉辦|舉辦.*活動|這些廟.*過/.test(template.replace('不代表本站確認當年度實際舉辦情形', '')))
  violations.push('需求頁模板疑似替廟方宣稱活動');

if (violations.length) {
  console.error(`\n✗ 地區×神明需求頁 gate：${violations.length} 項違規`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`✓ 地區×神明需求頁 gate：${TEMPLE_DEMAND_PAGES.length} 頁全部通過`);
