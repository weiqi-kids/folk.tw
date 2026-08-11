// 全年週稿的發布 manifest 共用邏輯。
//
// 週稿是編輯交付物，不是 Astro route；這個模組只把已經有「當年度日期證據」
// 且通過審核的 canonical 放進小批 release queue。沒有日期證據的週次保持 blocked，
// 不會因為有一篇 Markdown 就被當成可發布頁面。

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const MANIFEST_PATH = 'docs/annual-release-manifest.json';
export const WEEK_DIR = 'docs/topic-articles';
export const EVIDENCE_DIR = 'docs/annual-release-evidence';
export const WEEK_COUNT = 52;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

export const DEFAULTS = {
  schedule_status: 'blocked',
  date_status: 'source_required',
  review_status: 'pending',
  mode: 'refresh',
};

/**
 * 研究 agent 產生的 evidence packet 不直接進 Astro；它們是 manifest 的可審計
 * 覆寫來源。只讀 group-*.json，避免把 reviewer 報告或暫存檔誤當成週次資料。
 */
export function listEvidenceFiles(dir = EVIDENCE_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^group-[a-z0-9_-]+\.json$/iu.test(name))
    .sort();
}

export function loadEvidenceEntries(dir = EVIDENCE_DIR) {
  const entries = [];
  for (const file of listEvidenceFiles(dir)) {
    const path = join(dir, file);
    const packet = JSON.parse(readFileSync(path, 'utf8'));
    if (!packet || typeof packet !== 'object' || !Array.isArray(packet.entries)) {
      throw new Error(`${path} 必須包含 entries 陣列`);
    }
    for (const entry of packet.entries) {
      if (!entry || typeof entry !== 'object') throw new Error(`${path} 含有無效 entry`);
      entries.push({ ...entry, evidence_file: path });
    }
  }
  return entries;
}

function loadReviewStatuses(dir = EVIDENCE_DIR) {
  const statuses = new Map();
  for (const file of ['review-audit.json', 'content-review.json']) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    const audit = JSON.parse(readFileSync(path, 'utf8'));
    const rows = Array.isArray(audit) ? audit : (audit.entries ?? audit.reviews ?? []);
    for (const row of rows) {
      const week = Number(row?.week);
      const status = row?.review_status ?? row?.status;
      if (!Number.isInteger(week) || !['pass', 'fail'].includes(status)) continue;
      // 任一獨立審查 fail 就不能進 queue；兩道審查都 pass 才算 pass。
      if (status === 'fail' || statuses.get(week) !== 'fail') statuses.set(week, status);
    }
  }
  return statuses;
}

function normalizeEvidenceEntry(entry) {
  const hasDates = entry.event_date != null && entry.event_date !== '' &&
    entry.publish_at != null && entry.publish_at !== '';
  const dateStatus = entry.date_status ?? (
    entry.mode === 'merge' ? 'not_applicable' : hasDates ? 'verified' : 'source_required'
  );
  let scheduleStatus = entry.schedule_status;
  if (!scheduleStatus) {
    if (hasDates && dateStatus === 'verified') scheduleStatus = 'scheduled';
    else if (entry.mode === 'merge' || dateStatus === 'not_applicable' || dateStatus === 'verified') scheduleStatus = 'ready';
    else scheduleStatus = 'watch';
  }
  return {
    ...entry,
    date_status: dateStatus,
    schedule_status: scheduleStatus,
    review_status: entry.review_status ?? 'pending',
  };
}

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
  const evidenceDir = value.evidence_dir ?? EVIDENCE_DIR;
  const reviewStatuses = loadReviewStatuses(evidenceDir);
  for (const row of loadEvidenceEntries(evidenceDir).map(normalizeEvidenceEntry)) {
    const week = Number(row.week);
    if (Number.isInteger(week)) {
      const reviewStatus = reviewStatuses.get(week);
      overrides.set(week, reviewStatus ? { ...row, review_status: reviewStatus } : row);
    }
  }
  for (const row of Array.isArray(value.entries) ? value.entries : []) {
    if (!row || typeof row !== 'object') continue;
    overrides.set(Number(row.week), row);
  }
  return {
    path,
    config: value,
    defaults,
    overrides,
    evidenceDir,
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
