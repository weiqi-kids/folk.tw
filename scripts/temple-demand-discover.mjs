#!/usr/bin/env node
// 讀最新完整 GSC demandEvidence，將新達門檻的「地區 × 神明」頁 append 到永久白名單。
// 既有 URL 永不移除；沒有 --write 時只印候選與差異。

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_DEMAND_THRESHOLDS,
  demandPageKey,
  discoverTempleDemandPages,
} from './lib/temple-demand-discovery.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = resolve(root, 'data/seo-daily');
const pagesFile = resolve(root, 'src/data/temple-demand-pages.json');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const requested = valueAfter('--snapshot');
const snapshots = readdirSync(dataDir)
  .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
  .sort();
const snapshotFile = requested
  ? resolve(root, requested)
  : resolve(dataDir, snapshots.at(-1) ?? 'missing.json');
if (!existsSync(snapshotFile)) throw new Error(`找不到 GSC 快照：${snapshotFile}`);

const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'));
const temples = JSON.parse(readFileSync(resolve(root, 'src/data/temples.json'), 'utf8'));
const deities = JSON.parse(readFileSync(resolve(root, 'src/data/deities.json'), 'utf8'));
const existing = JSON.parse(readFileSync(pagesFile, 'utf8'));
const existingKeys = new Set(existing.map(demandPageKey));
const candidates = discoverTempleDemandPages(snapshot, temples, deities, DEFAULT_DEMAND_THRESHOLDS);
const evidenceFile = relative(root, snapshotFile).replaceAll('\\', '/');
const additions = candidates
  .filter((candidate) => !existingKeys.has(demandPageKey(candidate)))
  .map((candidate) => ({
    county: candidate.county,
    town: candidate.town,
    deity: candidate.deity,
    query: candidate.query,
    evidenceFile,
  }));

console.log(`✓ ${evidenceFile}：${candidates.length} 個交集達門檻；永久白名單 ${existing.length} 頁；新增 ${additions.length} 頁`);
for (const candidate of candidates) {
  const state = existingKeys.has(demandPageKey(candidate)) ? '已發布' : '待新增';
  console.log(`  ${state} ${candidate.countyName}${candidate.town} × ${candidate.deityName}` +
    `｜${candidate.impressions} 曝光／${candidate.clicks} 點擊／${candidate.templeCount} 間廟`);
}

if (!WRITE || additions.length === 0) {
  if (!WRITE) console.log('（乾跑；加 --write 才更新永久白名單。）');
  process.exit(0);
}

writeFileSync(pagesFile, JSON.stringify([...existing, ...additions], null, 2) + '\n');
console.log(`✓ 已 append ${additions.length} 頁 → ${relative(root, pagesFile)}`);
