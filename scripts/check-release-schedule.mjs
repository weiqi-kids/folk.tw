#!/usr/bin/env node
// Release gate for pre-written festival pages.
//
// `publish_at` is intentionally a date-only field.  A future entry may stay in
// festivals.json for research/review, but it must not leak into the generated
// site through a route, internal link, RSS, sitemap, Pagefind, or IndexNow.
// Run after the postbuild generators with `--require-dist`; without dist the
// source-data validation still runs and the artifact scan is reported skipped.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
// 基準日不在這裡再實作一次：唯一入口是 src/lib/build-date.ts（該檔檔頭有完整緣由）。
// 這道 gate 掃的是**原始碼**，所以用 buildDate()（根戳記 → 時鐘），不是 distBuildDate()。
import { buildDate } from '../src/lib/build-date.ts';

const DATA = 'src/data/festivals.json';
const DIST = 'dist';
const requireDist = process.argv.includes('--require-dist');
const today = process.env.RELEASE_DATE || buildDate().iso;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isIsoDate = (value) => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

const festivals = JSON.parse(readFileSync(DATA, 'utf8'));
const errors = [];
const seen = new Set();
for (const festival of festivals) {
  if (seen.has(festival.slug)) errors.push(`festivals.json slug 重複：${festival.slug}`);
  seen.add(festival.slug);
  if (festival.publish_at != null && festival.publish_at !== '' && !isIsoDate(festival.publish_at)) {
    errors.push(`${festival.slug} publish_at 必須是 YYYY-MM-DD：${festival.publish_at}`);
  }
}
const future = festivals.filter((festival) =>
  typeof festival.publish_at === 'string' && isIsoDate(festival.publish_at) && festival.publish_at > today,
);

const textFiles = new Set(['.html', '.xml', '.txt', '.json', '.js', '.css', '.map', '.webmanifest']);
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (textFiles.has(name.includes('.') ? `.${name.split('.').pop()}` : '')) out.push(path);
  }
  return out;
}

if (future.length > 0 && existsSync(DIST)) {
  const files = walk(DIST);
  for (const festival of future) {
    const routeNeedle = new RegExp(`/festivals/${festival.slug}(?:/|["'<>\\s]|$)`);
    for (const path of files) {
      // The per-page path check below gives a clearer diagnostic; skip it here
      // only for the source-independent route artifacts themselves.
      const rel = relative(DIST, path);
      if (rel === `festivals/${festival.slug}/index.html` || rel === `festivals/${festival.slug}.ics`) continue;
      let body;
      try {
        body = readFileSync(path, 'utf8');
      } catch {
        continue;
      }
      if (body.includes('\u0000')) continue;
      if (routeNeedle.test(body)) errors.push(`未釋出 ${festival.slug} URL 出現在 dist/${rel}`);
    }
    for (const artifact of [
      `festivals/${festival.slug}/index.html`,
      `festivals/${festival.slug}.ics`,
    ]) {
      if (existsSync(join(DIST, artifact))) errors.push(`未釋出 ${festival.slug} 仍產生 dist/${artifact}`);
    }
  }
} else if (future.length > 0 && requireDist) {
  errors.push('需要 --require-dist 但找不到 dist/，無法驗證未釋出 URL 是否洩漏');
}

if (errors.length) {
  console.error(`✗ release schedule gate 失敗（${errors.length} 項；cutoff ${today}）`);
  for (const error of errors.slice(0, 80)) console.error(`  - ${error}`);
  if (errors.length > 80) console.error(`  …另有 ${errors.length - 80} 項`);
  process.exit(1);
}

if (future.length === 0) {
  console.log(`✓ release schedule gate 通過：${festivals.length} 筆皆已釋出（cutoff ${today}）`);
} else if (existsSync(DIST)) {
  console.log(`✓ release schedule gate 通過：${future.length} 筆未到 publish_at 的節日未出現在產物（cutoff ${today}）`);
} else {
  console.log(`✓ release schedule 資料格式通過：${future.length} 筆待釋出（cutoff ${today}；尚未掃描 dist）`);
}
