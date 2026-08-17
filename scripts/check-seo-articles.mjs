#!/usr/bin/env node
// 外部趨勢文章的 machine gate。
//
// 這支只檢查獨立的 src/content/seo-articles，不把既有籤詩／神明／廟宇資料
// 套上同一套字數規則。Content Collection schema 會再驗 frontmatter 型別；本 gate
// 補上 schema 不適合表達的出版條件：足夠正文、可回查來源、站內路徑、去重與高風險承諾語。

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const ROOT = 'src/content/seo-articles';
const MIN_BODY_CHARS = 800;
const MIN_INTERNAL_LINKS = 2;

function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return /\.md$/u.test(entry.name) ? [path] : [];
  });
}

export function splitMarkdown(raw) {
  const text = String(raw ?? '').replace(/^\uFEFF/u, '');
  if (!text.startsWith('---\n')) return { frontmatter: '', body: text };
  const end = text.indexOf('\n---', 4);
  if (end < 0) return { frontmatter: text.slice(4), body: '' };
  const bodyStart = text.indexOf('\n', end + 4);
  return {
    frontmatter: text.slice(4, end),
    body: bodyStart < 0 ? '' : text.slice(bodyStart + 1),
  };
}

function block(frontmatter, key) {
  const lines = String(frontmatter).split('\n');
  const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*$`, 'u').test(line));
  if (start < 0) return '';
  const result = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^[A-Za-z][A-Za-z0-9_]*:/u.test(lines[i])) break;
    result.push(lines[i]);
  }
  return result.join('\n');
}

function countUrls(text) {
  return (String(text).match(/https:\/\/[^\s'"`>]+/gu) ?? []).length;
}

function prose(body) {
  return String(body)
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/!?(?:\[[^\]]*\])\([^)]*\)/gu, '連結')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[#>*_`~-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalized(text) {
  return String(text)
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .replace(/[「」『』“”‘’.,，。！？!?；;：:、（）()【】《》〈〉\-—…·/\\]/gu, '')
    .toLowerCase();
}

function ngrams(text, size = 8) {
  const chars = Array.from(normalized(text));
  const result = new Set();
  for (let i = 0; i <= chars.length - size; i += 1) result.add(chars.slice(i, i + size).join(''));
  return result;
}

function overlapRatio(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const gram of a) if (b.has(gram)) common += 1;
  return common / Math.min(a.size, b.size);
}

export function validateArticleText(file, raw) {
  const errors = [];
  const { frontmatter, body } = splitMarkdown(raw);
  const slug = basename(file, '.md');
  const required = [
    ['title', /^title:\s*\S/um],
    ['description', /^description:\s*\S/um],
    ['datePublished', /^datePublished:\s*\d{4}-\d{2}-\d{2}\s*$/um],
    ['dateModified', /^dateModified:\s*\d{4}-\d{2}-\d{2}\s*$/um],
    ['query', /^query:\s*\S/um],
    ['trendSources', /^trendSources:\s*(?:$|\[|https?:)/um],
    ['sources', /^sources:\s*$/um],
  ];

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) errors.push('檔名必須是小寫英數與連字號 slug');
  for (const [label, pattern] of required) if (!pattern.test(frontmatter)) errors.push(`缺少或格式錯誤：${label}`);

  const trendLine = /^trendSources:\s*(.*)$/mu.exec(frontmatter)?.[1] ?? '';
  const trendBlock = `${trendLine}\n${block(frontmatter, 'trendSources')}`;
  const sourceBlock = block(frontmatter, 'sources');
  if (countUrls(trendBlock) < 1) errors.push('trendSources 至少需要 1 個 HTTPS 來源');
  if ((sourceBlock.match(/^\s*-\s+type:\s*\S/gmu) ?? []).length < 2) {
    errors.push('sources 至少需要 2 筆具 type 的來源');
  }
  if (countUrls(sourceBlock) < 2) errors.push('sources 至少需要 2 個 HTTPS URL');

  const text = prose(body);
  const chars = Array.from(text).length;
  if (chars < MIN_BODY_CHARS) errors.push(`正文過短：${chars} 字，至少 ${MIN_BODY_CHARS} 字`);
  if ((body.match(/^##\s+/gmu) ?? []).length < 2) errors.push('正文至少需要 2 個二級標題');
  if ((body.match(/\]\(\/[a-z0-9][a-z0-9/_-]*\/?\)/gu) ?? []).length < MIN_INTERNAL_LINKS) {
    errors.push(`正文至少需要 ${MIN_INTERNAL_LINKS} 條站內連結`);
  }

  const risky = [
    ['保證式承諾', /(?:保證|百分之百|一定)(?:有效|靈驗|成功|準確|會實現)/u],
    ['立即見效／排名式宣稱', /(?:立即見效|最準|第一名|冠軍|排行榜)/u],
    ['把搜尋趨勢當成事實', /(?:熱門搜尋|上升搜尋|搜尋趨勢)[^。！？\n]{0,30}(?:所以|因此|代表|證明)/u],
  ];
  for (const [label, pattern] of risky) if (pattern.test(text)) errors.push(`正文含${label}`);

  const publishedDate = /^datePublished:\s*(\d{4}-\d{2}-\d{2})/mu.exec(frontmatter)?.[1];
  const modifiedDate = /^dateModified:\s*(\d{4}-\d{2}-\d{2})/mu.exec(frontmatter)?.[1];
  if (publishedDate && modifiedDate && modifiedDate < publishedDate) {
    errors.push('dateModified 不得早於 datePublished');
  }

  return { errors, text, grams: ngrams(text) };
}

const files = markdownFiles(ROOT);
const results = files.map((file) => ({ file, ...validateArticleText(file, readFileSync(file, 'utf8')) }));
const errors = results.flatMap((result) => result.errors.map((message) => `${result.file}: ${message}`));

for (let i = 0; i < results.length; i += 1) {
  for (let j = i + 1; j < results.length; j += 1) {
    const ratio = overlapRatio(results[i].grams, results[j].grams);
    if (ratio >= 0.42) {
      errors.push(`${results[i].file} ↔ ${results[j].file}: 正文 8-gram 重複 ${ratio.toFixed(2)}，疑似換標題重發`);
    }
  }
}

if (errors.length) {
  console.error(`SEO 主題文章 gate：${errors.length} 個錯誤`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`SEO 主題文章 gate 通過：${files.length} 篇`);
}
