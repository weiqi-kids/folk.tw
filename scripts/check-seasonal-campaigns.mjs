#!/usr/bin/env node
// 農曆七月站內戰役 gate：排程只能定義在 src/lib/seasonal-campaigns.ts，
// 且每個 CTA 目標都必須存在於 festivals.json、至少有一條可供內容頁判定的資料關係。
import { readFileSync } from 'node:fs';
import { seasonalCampaigns } from '../src/lib/seasonal-campaigns.ts';

const festivalsRaw = JSON.parse(readFileSync('src/data/festivals.json', 'utf8'));
const festivals = new Map(festivalsRaw.map((f) => [f.slug, f]));
const errors = [];

if (seasonalCampaigns.length !== 5) errors.push(`戰役排程應為 5 檔，實際 ${seasonalCampaigns.length}`);
const seenSlugs = new Set();
for (const [i, c] of seasonalCampaigns.entries()) {
  if (seenSlugs.has(c.festivalSlug)) errors.push(`重複 campaign festivalSlug：${c.festivalSlug}`);
  seenSlugs.add(c.festivalSlug);
  const festival = festivals.get(c.festivalSlug);
  if (!festival) {
    errors.push(`campaign ${c.festivalSlug} 在 festivals.json 不存在`);
    continue;
  }
  if (c.href !== `/festivals/${c.festivalSlug}/`) {
    errors.push(`${c.festivalSlug} href 與 festivalSlug 不一致：${c.href}`);
  }
  if (!(c.start <= c.target && c.target <= c.end)) {
    errors.push(`${c.festivalSlug} target ${c.target} 不在 ${c.start}～${c.end}`);
  }
  const refs = ['deity_refs', 'practice_refs', 'event_refs', 'temple_refs']
    .flatMap((key) => festival[key] ?? []);
  if (refs.length === 0) errors.push(`${c.festivalSlug} 沒有任何可證明相關頁面的 refs`);
  const prev = seasonalCampaigns[i - 1];
  if (prev) {
    if (prev.end >= c.start) errors.push(`${prev.festivalSlug} 與 ${c.festivalSlug} 日期重疊`);
    const nextDay = new Date(`${prev.end}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    if (nextDay.toISOString().slice(0, 10) !== c.start) {
      errors.push(`${prev.festivalSlug} 與 ${c.festivalSlug} 之間不是每日連續排程`);
    }
  }
}

const home = readFileSync('src/pages/index.astro', 'utf8');
if (!home.includes("from '../lib/seasonal-campaigns'")) errors.push('首頁未讀 seasonal-campaigns 唯一資料源');
if (/const\s+seasonalCampaigns\s*=\s*\[/.test(home)) errors.push('首頁仍保留第二份 seasonalCampaigns 陣列');

const relatedComponent = readFileSync('src/components/RelatedSeasonalCampaign.astro', 'utf8');
for (const placement of ['related_title', 'related_cta']) {
  if (!relatedComponent.includes(`data-growth-placement="${placement}"`)) {
    errors.push(`相關頁 CTA 缺 campaign_click placement：${placement}`);
  }
}
if ((relatedComponent.match(/data-growth-campaign=/g) ?? []).length < 2) {
  errors.push('相關頁標題／CTA 未完整標記 data-growth-campaign');
}

for (const file of [
  'src/pages/deities/[id].astro',
  'src/pages/practices/[id].astro',
  'src/pages/events/[id].astro',
  'src/pages/temples/[id].astro',
]) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes('RelatedSeasonalCampaign')) errors.push(`${file} 未接 RelatedSeasonalCampaign`);
  if (!source.includes('festivalSlugs=')) errors.push(`${file} 未傳入資料關係衍生的 festivalSlugs`);
}

if (errors.length) {
  console.error(`✗ seasonal campaign gate 失敗（${errors.length}）`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

const refCounts = Object.fromEntries(
  ['deity_refs', 'practice_refs', 'event_refs', 'temple_refs'].map((key) => [
    key,
    new Set(seasonalCampaigns.flatMap((c) => festivals.get(c.festivalSlug)?.[key] ?? [])).size,
  ]),
);
console.log(`✓ seasonal campaign gate 通過：${seasonalCampaigns.length} 檔共用唯一排程；關係覆蓋 ${JSON.stringify(refCounts)}`);
