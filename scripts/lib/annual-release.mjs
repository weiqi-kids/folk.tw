// 全年週稿的發布 manifest 共用邏輯。
//
// 週稿是編輯交付物，不是 Astro route；這個模組只把已經有「當年度日期證據」
// 且通過審核的 canonical 放進小批 release queue。沒有日期證據的週次保持 blocked，
// 不會因為有一篇 Markdown 就被當成可發布頁面。

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const MANIFEST_PATH = 'docs/annual-release-manifest.json';
export const WEEK_DIR = 'docs/topic-articles';
export const WEEK_COUNT = 52;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

export const DEFAULTS = {
  schedule_status: 'blocked',
  date_status: 'source_required',
  review_status: 'pending',
  mode: 'refresh',
};

export function isIsoDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function taipeiToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function oneMonthBefore(value) {
  if (!isIsoDate(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  const targetMonth = month - 2;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return `${String(targetYear).padStart(4, '0')}-${String(normalizedMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(text);
  if (!match) return {};
  const values = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    values[key] = value.replace(/^(['"])([\s\S]*)\1$/u, '$2');
  }
  return values;
}

export function canonicalPath(value) {
  const raw = String(value ?? '').trim().replace(/^(['"])([\s\S]*)\1$/u, '$2');
  const match = /^`([^`]+)`$/u.exec(raw);
  const path = match ? match[1] : raw;
  return /^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/$/u.test(path) ? path : '';
}

export function loadManifest(path = MANIFEST_PATH) {
  if (!existsSync(path)) throw new Error(`找不到年度 release manifest：${path}`);
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} 必須是物件`);
  }
  const defaults = { ...DEFAULTS, ...(value.defaults ?? {}) };
  const overrides = new Map();
  for (const row of Array.isArray(value.entries) ? value.entries : []) {
    if (!row || typeof row !== 'object') continue;
    overrides.set(Number(row.week), row);
  }
  return {
    path,
    config: value,
    defaults,
    overrides,
    leadDays: Number(value.lead_days ?? 30),
    maxUrlsPerMonth: Number(value.max_urls_per_month ?? 4),
    maxNewCanonicalsPerMonth: Number(value.max_new_canonicals_per_month ?? 4),
  };
}

export function listWeekFiles(dir = WEEK_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^week-\d{2}\.md$/u.test(name))
    .sort();
}

export function effectiveRows(manifest, dir = WEEK_DIR) {
  return listWeekFiles(dir).map((file) => {
    const text = readFileSync(join(dir, file), 'utf8');
    const frontmatter = parseFrontmatter(text);
    const week = Number(frontmatter.week || file.slice(5, 7));
    const override = manifest.overrides.get(week) ?? {};
    const row = { ...manifest.defaults, ...override };
    return {
      ...row,
      week,
      file,
      content_file: join(dir, file),
      title: frontmatter.title ?? '',
      canonical: canonicalPath(frontmatter.canonical),
      annual_status: frontmatter.annual_status ?? '',
      merge_only: /^(?:true|yes|1)$/iu.test(String(frontmatter.merge_only ?? '')),
      frontmatter,
    };
  });
}

export function publicUrl(row, site = 'https://folk.tw') {
  return new URL(row.canonical, site).href;
}

export function dueRows(rows, today = taipeiToday()) {
  return rows.filter((row) =>
    row.schedule_status === 'scheduled' &&
    row.review_status === 'pass' &&
    isIsoDate(row.publish_at) &&
    row.publish_at <= today &&
    !row.merge_only,
  );
}

export function monthOf(value) {
  return isIsoDate(value) ? value.slice(0, 7) : '';
}
