#!/usr/bin/env node
// 全站 Discover／收錄前置檢查。
//
// Discover 沒有一個「Discover 專用 schema」；Google 的資格前提是頁面可被
// 索引、符合政策，之後才由系統依興趣與品質決定是否曝光。因此這支 gate
// 先掃所有 build 出來的 HTML，再把頁面分成：
//   1. indexable：所有沒有 noindex 的頁面，檢查基本收錄衛生。
//   2. content：有機會成為 Discover 內容的詳情頁，另檢查正文、主標、圖片。
//
// 用法：
//   pnpm build:release && pnpm check:discover
//   node scripts/check-discover-coverage.mjs --json
//   node scripts/check-discover-coverage.mjs --strict
//
// 這支只檢查 build 產物，不會呼叫 Google API，也不把「有資格」誤報成
// 「一定會進 Discover」。

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = valueAfter('--dist') || 'dist';
const STRICT = process.argv.includes('--strict');
const JSON_OUTPUT = process.argv.includes('--json');
const ORIGIN = 'https://folk.tw';

function valueAfter(flag) {
  const i = process.argv.indexOf(flag);
  const value = i >= 0 ? process.argv[i + 1] : '';
  return value && !value.startsWith('--') ? value : '';
}

function fail(message) {
  console.error(`[check-discover-coverage] ${message}`);
  process.exit(2);
}

if (!existsSync(DIST) || !statSync(DIST).isDirectory()) fail(`找不到 ${DIST}/，請先 pnpm build:release。`);

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    const info = statSync(file);
    if (info.isDirectory()) yield* htmlFiles(file);
    // Astro 的 404.html 不是一個可索引的內容路由；真正的頁面都在
    // <route>/index.html。排除它也避免把靜態錯誤頁誤算成 //。
    else if (name === 'index.html') yield file;
  }
}

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']*)`, 'i'));
  return match?.[1] ?? '';
}

function firstTag(html, re) {
  return html.match(re)?.[0] ?? '';
}

function meta(html, key, value) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  return (
    tags.find((tag) => attr(tag, key).toLowerCase() === value.toLowerCase())
      ? attr(tags.find((tag) => attr(tag, key).toLowerCase() === value.toLowerCase()), 'content')
      : ''
  );
}

function decode(value) {
  return String(value ?? '')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'");
}

function visibleText(html) {
  return decode(String(html ?? ''))
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[\u200b-\u200d\ufeff]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function pageUrl(file) {
  const rel = relative(DIST, file).split(sep).join('/');
  if (rel === 'index.html') return '/';
  return `/${rel.slice(0, -'/index.html'.length)}/`;
}

function localPath(url) {
  const rawPath = url.startsWith(ORIGIN) ? url.slice(ORIGIN.length) : url;
  if (!rawPath.startsWith('/')) return '';
  let decoded = rawPath;
  try { decoded = decodeURIComponent(rawPath); } catch { /* 用原值繼續，下面會報不存在 */ }
  return join(DIST, decoded.split(/[?#]/u)[0]);
}

function jsonLdTypes(html) {
  const types = [];
  const blocks = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu,
  );
  for (const match of blocks) {
    try {
      const value = JSON.parse(match[1]);
      const visit = (node) => {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(visit);
        if (typeof node !== 'object') return;
        if (node['@type']) {
          const list = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
          types.push(...list.map(String));
        }
        if (node['@graph']) visit(node['@graph']);
      };
      visit(value);
    } catch {
      // JSON-LD syntax is checked elsewhere; this report only needs readable types.
    }
  }
  return [...new Set(types)].sort();
}

function sitemapPaths() {
  const files = readdirSync(DIST).filter((name) => /^sitemap(?:-\d+)?\.xml$/u.test(name));
  const paths = new Set();
  for (const name of files) {
    const xml = readFileSync(join(DIST, name), 'utf8');
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/gu)) {
      try {
        const url = new URL(match[1]);
        if (url.hostname === 'folk.tw') paths.add(decodeURIComponent(url.pathname));
      } catch {
        // Sitemap syntax is checked by the existing release/canonical gates.
      }
    }
  }
  return paths;
}

function localCandidate(url) {
  const parts = url.split('/').filter(Boolean);
  if (!parts.length) return false;
  const [root, second, third] = parts;
  if (root === 'search' || root === 'line' || root === 'jiaobei') return false;
  if (root === 'almanac' && parts.length === 2 && /^\d{4}-\d{2}-\d{2}$/u.test(second)) return true;
  if (root === 'temples' && second === 'nearby') return false;
  if (root === 'temples' && second === 'region' && parts.length >= 4) return true;
  if (root === 'temples' && parts.length === 2) return true;
  if (root === 'qiugian' && second === 'blessing' && third) return true;
  if (root === 'qiugian' && second) return true;
  return [
    'allusions',
    'compare',
    'deities',
    'events',
    'festivals',
    'good-days',
    'medicine-slips',
    'poems',
    'practices',
    'scenarios',
    'systems',
    'trades',
    'zodiac',
  ].includes(root) && parts.length >= 2;
}

// 內容候選頁是「頁面本身在回答一個主題／實體問題」的詳情頁；
// 農民曆日期是可查詢的每日工具資料，不與文章型內容混在同一個圖片提醒裡。
function contentCandidate(url) {
  if (!localCandidate(url)) return false;
  const parts = url.split('/').filter(Boolean);
  const [root, second] = parts;
  if (root === 'almanac') return !/^\d{4}-\d{2}-\d{2}$/u.test(second ?? '');
  if (root === 'temples' && second === 'region') return false;
  return true;
}

function topLevel(url) {
  return url.split('/').filter(Boolean)[0] ?? '(root)';
}

function decodedPath(url) {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return url;
  }
}

const rows = [];
for (const file of htmlFiles(DIST)) {
  const html = readFileSync(file, 'utf8');
  const url = pageUrl(file);
  const robots = meta(html, 'name', 'robots');
  const canonicalTag = firstTag(html, /<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/iu);
  const canonical = attr(canonicalTag, 'href');
  const title = decode(html.match(/<title>([\s\S]*?)<\/title>/iu)?.[1] ?? '').trim();
  const description = meta(html, 'name', 'description');
  const ogImage = meta(html, 'property', 'og:image');
  const ogWidth = meta(html, 'property', 'og:image:width');
  const ogHeight = meta(html, 'property', 'og:image:height');
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/iu)?.[1] ?? '';
  const bodyText = visibleText(main);
  const h1Count = (main.match(/<h1\b/giu) ?? []).length;
  const imageTags = main.match(/<img\b[^>]*>/giu) ?? [];
  const jsonLd = jsonLdTypes(html);
  const indexable = !/\bnoindex\b/iu.test(robots);
  rows.push({
    file,
    url,
    top: topLevel(url),
    indexable,
    candidate: indexable && localCandidate(url),
    content: indexable && contentCandidate(url),
    robots,
    canonical,
    title,
    description,
    ogImage,
    ogWidth,
    ogHeight,
    bodyLength: bodyText.length,
    h1Count,
    imageCount: imageTags.length,
    jsonLd,
    ogExists: Boolean(ogImage && existsSync(localPath(ogImage))),
  });
}

const indexable = rows.filter((row) => row.indexable);
const candidates = rows.filter((row) => row.candidate);
const content = rows.filter((row) => row.content);
const errors = [];
const warnings = [];
const add = (list, row, message) => list.push(`${row.url}: ${message}`);

for (const row of indexable) {
  if (!row.title) add(errors, row, '缺少 title');
  if (!row.description) add(errors, row, '缺少 meta description');
  if (!row.canonical) add(errors, row, '缺少 canonical');
  const expectedCanonical = `${ORIGIN}${row.url}`;
  const canonicalPath = row.canonical ? decodedPath(row.canonical) : '';
  // 「今日鏡像頁」豁免容忍 ±1 天（2026-08-15 修）：build 與本檢查若跨越台北午夜
  // （CI 於 UTC 16:00 前後起跑＝台北 00:00 正是常態），build 時的「今天」與檢查時差一天，
  // 只豁免單日會誤紅（實例：run 31816388006，/almanac/2026-08-14/ 在台北 00:08 被判違規）。
  const taipeiDate = (offsetDays) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date(Date.now() + offsetDays * 86400000));
  const isTodayAlmanacMirror =
    [-1, 0, 1].some((d) => row.url === `/almanac/${taipeiDate(d)}/`) && canonicalPath === '/almanac/';
  if (!isTodayAlmanacMirror && canonicalPath !== row.url) {
    add(errors, row, `canonical 不是自我網址（${row.canonical || '空白'}；預期 ${expectedCanonical}）`);
  }
  if (row.h1Count !== 1) add(errors, row, `main 內 h1 數量為 ${row.h1Count}（應為 1）`);
  if (!/max-image-preview\s*:\s*large/iu.test(row.robots)) add(errors, row, 'robots 未宣告 max-image-preview:large');
  if (!row.ogImage) add(errors, row, '缺少 og:image');
  else if (!row.ogExists) add(errors, row, `og:image 本地檔不存在（${row.ogImage}）`);
}

for (const row of content) {
  if (row.bodyLength < 200) add(warnings, row, `正文可見文字偏薄（${row.bodyLength} 字）`);
  if (row.ogImage.endsWith('/og.png')) add(warnings, row, '仍使用全站共用品牌圖；可被索引，但缺少內容相關的大圖訊號');
  // 1200×630 是既有分享卡比例；1200×675 是內容主視覺比例。兩者都符合
  // Google Discover 對大圖的實務要求，不能把合法的 16:9 卡誤報成缺口。
  const hasLargeOg = row.ogWidth === '1200' && ['630', '675'].includes(row.ogHeight);
  if (!hasLargeOg) add(warnings, row, `og:image 宣告尺寸 ${row.ogWidth || '?'}×${row.ogHeight || '?'}，需確認實檔`);
}

const countBy = (list, key) => Object.fromEntries(
  [...new Set(list.map((row) => row[key]))].sort().map((value) => [value, list.filter((row) => row[key] === value).length]),
);
const sitemap = sitemapPaths();
const indexableNotInSitemap = indexable.filter((row) => !sitemap.has(row.url));
const noindexInSitemap = rows.filter((row) => !row.indexable && sitemap.has(row.url));
const report = {
  totalHtml: rows.length,
  indexable: indexable.length,
  noindex: rows.length - indexable.length,
  contentCandidates: content.length,
  technicalCandidates: candidates.length,
  indexableByTop: countBy(indexable, 'top'),
  noindexByTop: countBy(rows.filter((row) => !row.indexable), 'top'),
  candidateByTop: countBy(content, 'top'),
  sitemap: {
    urls: sitemap.size,
    indexableInSitemap: indexable.length - indexableNotInSitemap.length,
    indexableNotInSitemap: indexableNotInSitemap.length,
    noindexInSitemap: noindexInSitemap.length,
    notInSitemapByTop: countBy(indexableNotInSitemap, 'top'),
    noindexExamples: noindexInSitemap.slice(0, 20).map((row) => row.url),
  },
  errors: errors.length,
  warnings: warnings.length,
  errorExamples: errors.slice(0, 30),
  warningExamples: warnings.slice(0, 30),
  candidateJsonLdTypes: countBy(
    candidates.map((row) => ({ jsonLd: row.jsonLd.join(',') || '(none)' })),
    'jsonLd',
  ),
  candidateImages: {
    withOgImage: content.filter((row) => row.ogImage).length,
    withLocalOgImage: content.filter((row) => row.ogExists).length,
    withUniqueOgImage: content.filter((row) => row.ogImage && !row.ogImage.endsWith('/og.png')).length,
    defaultOgImage: content.filter((row) => row.ogImage.endsWith('/og.png')).length,
    withBodyImage: content.filter((row) => row.imageCount > 0).length,
    defaultOgByTop: countBy(content.filter((row) => row.ogImage.endsWith('/og.png')), 'top'),
  },
  thinCandidates: content.filter((row) => row.bodyLength < 200).length,
  thinByTop: countBy(content.filter((row) => row.bodyLength < 200), 'top'),
  thinExamples: content.filter((row) => row.bodyLength < 200).map((row) => ({ url: row.url, bodyLength: row.bodyLength, title: row.title })),
};

if (JSON_OUTPUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Discover 全站檢查：HTML ${report.totalHtml} 頁；indexable ${report.indexable} 頁；noindex ${report.noindex} 頁。`);
  console.log(`內容候選頁 ${report.contentCandidates} 頁；另有技術上可索引但偏工具／日期／列表的頁面 ${report.technicalCandidates - report.contentCandidates} 頁。`);
  console.log(`基本錯誤 ${report.errors}；內容提醒 ${report.warnings}。`);
  console.log(`候選頁圖片：og:image ${report.candidateImages.withOgImage}/${report.contentCandidates}；獨立圖片 ${report.candidateImages.withUniqueOgImage}/${report.contentCandidates}；共用品牌圖 ${report.candidateImages.defaultOgImage}/${report.contentCandidates}；正文有圖 ${report.candidateImages.withBodyImage}/${report.contentCandidates}。`);
  console.log(`Sitemap：${report.sitemap.urls} 個網址；indexable 已提交 ${report.sitemap.indexableInSitemap}；刻意未提交 ${report.sitemap.indexableNotInSitemap}；noindex 卻提交 ${report.sitemap.noindexInSitemap}。`);
  if (errors.length) {
    console.error('\n錯誤（indexable 頁必須修正）：');
    for (const message of errors.slice(0, 30)) console.error(`  ✗ ${message}`);
    if (errors.length > 30) console.error(`  …另有 ${errors.length - 30} 項，請加 --json 查看統計。`);
  }
  if (warnings.length) {
    console.log('\n內容提醒（不等於 Discover 不合格）：');
    for (const message of warnings.slice(0, 30)) console.log(`  ! ${message}`);
    if (warnings.length > 30) console.log(`  …另有 ${warnings.length - 30} 項，請加 --json 查看統計。`);
  }
}

if (STRICT && errors.length) process.exit(1);
