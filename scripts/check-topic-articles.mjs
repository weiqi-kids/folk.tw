#!/usr/bin/env node
// 52 週文章稿的收錄前 gate。
//
// 這支檢查的是 docs/topic-articles/ 的「文章交付稿」，不是把 markdown
// 自動發布成頁面。--require-dist 會再把 canonical、OG、sitemap 與 production
// 內鏈對照 dist；沒有 dist 時，預設只做來源稿本身的檢查。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dir = 'docs/topic-articles';
const distDir = 'dist';
const requireDist = process.argv.includes('--require-dist');
const expected = Array.from({ length: 52 }, (_, i) => `week-${String(i + 1).padStart(2, '0')}.md`);
const files = readdirSync(dir).filter((file) => /^week-\d{2}\.md$/u.test(file)).sort();
const errors = [];
const warnings = [];
const docs = [];

const allowedAnnualStatuses = new Set([
  'published-refresh',
  'published-merge',
  'published-watch',
  'review-gate',
  'merge-only',
]);

// These are real hubs, but not independent weekly article routes. A weekly
// article pointing at one of them must explicitly say merge_only: true.
const hubPaths = new Set([
  '/almanac/',
  '/deities/',
  '/events/',
  '/practices/',
  '/scenarios/',
  '/compare/',
  '/temples/',
  '/festivals/',
  '/qiugian/',
  '/poems/',
  '/allusions/',
  '/systems/',
  '/vocabulary/',
]);

// These are dynamic route bases, not pages. They must never be described as a
// canonical URL: /almanac/month/YYYY-MM/, /temples/region/:county/ and
// /qiugian/blessing/:slug/ are the actual route shapes.
const abstractRootPaths = new Set([
  '/almanac/month/',
  '/temples/region/',
  '/qiugian/blessing/',
]);

const internalWorkWords = [
  /主文\s*草稿/iu,
  /正文\s*草稿/iu,
  /FAQ\s*草稿/iu,
  /先合併/iu,
  /範圍：/u,
  /\bevergreen\b/iu,
  /\bfacts?\b/iu,
  /\bofficial\b/iu,
  /來源要求/iu,
  /發布時只/iu,
  /source_required/iu,
  /review-gate/iu,
  /ready-refresh/iu,
  /published-refresh/iu,
  /研究資料包/iu,
  /evidence\s*packet/iu,
  /GA4/iu,
  /GSC/iu,
  /工具操作/iu,
  /內部(?:成效)?工具/iu,
  /Slack/iu,
  /\bOG\b/iu,
  /既有工具維護/iu,
  /可核實\s*facts?/iu,
  /可核對\s*facts?/iu,
  /發布狀態/iu,
  /合併[／與、]/u,
  /既有\s*canonical/iu,
  /年度資料待核對/iu,
  /待評估/iu,
];

function addError(file, message) {
  errors.push(`${file}: ${message}`);
}

function addWarning(file, message) {
  warnings.push(`${file}: ${message}`);
}

function parseFrontmatter(text, file) {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(text);
  if (!match) {
    addError(file, '缺少 frontmatter');
    return {};
  }
  const values = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const value = line.slice(separator + 1).trim();
    values[line.slice(0, separator).trim()] = value.replace(/^(['"])([\s\S]*)\1$/u, '$2');
  }
  return values;
}

function canonicalPaths(value) {
  const raw = String(value ?? '').trim();
  const scalar = raw.replace(/^(['"])([\s\S]*)\1$/u, '$2').trim();
  const marked = [...scalar.matchAll(/`([^`]+)`/gu)]
    .map((match) => match[1].trim())
    .filter((value) => value.startsWith('/'));
  if (marked.length) return marked;
  return /^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/$/u.test(scalar) ? [scalar] : [];
}

function isSingleCanonicalValue(value) {
  const raw = String(value ?? '').trim().replace(/^(['"])([\s\S]*)\1$/u, '$2').trim();
  return /^`\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/`$/u.test(raw)
    || /^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/$/u.test(raw);
}

function hasExplicitMergeOnly(meta) {
  return /^(?:true|yes|1)$/iu.test(String(meta.merge_only ?? '').trim());
}

function isMergeOnly(meta) {
  const status = String(meta.annual_status ?? '').trim();
  return hasExplicitMergeOnly(meta) || status === 'merge-only';
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\[[^\]]*\]\([^)]*\)/gu, '')
    .replace(/https?:\/\/\S+/gu, '')
    .replace(/[`*_>#|\-—]/gu, '')
    .replace(/\s+/gu, '')
    .replace(/[，。！？；：、（）()「」『』〈〉《》【】.,!?;:]/gu, '')
    .toLowerCase();
}

function textLength(value) {
  return normalize(value).length;
}

function section(text, headingPattern, nextLevel = 2) {
  const match = headingPattern.exec(text);
  if (!match || match.index == null) return '';
  const start = match.index + match[0].length;
  const next = new RegExp(`^#{1,${nextLevel}} (?!#)`, 'gmu');
  next.lastIndex = start;
  const nextMatch = next.exec(text);
  return text.slice(start, nextMatch?.index ?? text.length).trim();
}

function removeSubsection(text, headingPattern) {
  const match = headingPattern.exec(text);
  if (!match || match.index == null) return text;
  const start = match.index;
  const rest = text.slice(start + match[0].length);
  const next = /^#{2,3} (?!#)/mu.exec(rest);
  const end = next ? start + match[0].length + next.index : text.length;
  return `${text.slice(0, start)}\n${text.slice(end)}`;
}

function coreSection(body) {
  // The core section may contain a nested `## 文化背景` heading in an
  // earlier draft.  Stop at the explicit annual-information boundary rather
  // than at the first following `##`, otherwise a valid article is measured
  // only by its first subtopic.  If the boundary is missing, fall back to the
  // normal section parser so the missing annual section is still reported by
  // the structural checks below.
  const heading = /^## (?:文化脈絡與實用說明|文化背景與實用資訊)$/mu.exec(body);
  if (!heading || heading.index == null) return '';
  const start = heading.index + heading[0].length;
  const boundary = /^## (?:年度資料怎麼維護|最新日期與活動資訊)$/mu;
  const rest = body.slice(start);
  const boundaryMatch = boundary.exec(rest);
  const core = boundaryMatch
    ? rest.slice(0, boundaryMatch.index).trim()
    : section(body, /^## (?:文化脈絡與實用說明|文化背景與實用資訊)$/mu, 2);
  return removeSubsection(core, /^### (?:閱讀範圍|閱讀提示)$/mu).trim();
}

function proseParagraphs(text) {
  return text
    .split(/\n\s*\n/gu)
    .map((block) => block
      .replace(/^#{1,6}\s+[^\n]+$/gmu, '')
      .replace(/^\|[^\n]*$/gmu, '')
      .replace(/^\s*[-*]\s+/gmu, '')
      .replace(/^\s*\d+[.)]\s+/gmu, '')
      .trim())
    .filter((block) => {
      const value = normalize(block);
      if (value.length < 80) return false;
      if (/^(?:這篇先回答|本文先處理|本文先提供|年度國曆日期|文化脈絡可以先讀|常年資料適合先用|本篇的常年文化說明)/u.test(value)) return false;
      return true;
    });
}

function paragraphSimilarity(left, right) {
  const grams = (value) => {
    const chars = Array.from(normalize(value));
    const set = new Set();
    for (let i = 0; i <= chars.length - 8; i += 1) set.add(chars.slice(i, i + 8).join(''));
    return set;
  };
  const a = grams(left);
  const b = grams(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

function distinctTopicParagraphs(core) {
  const selected = [];
  for (const paragraph of proseParagraphs(core)) {
    if (selected.some((previous) => paragraphSimilarity(previous, paragraph) >= 0.9)) continue;
    selected.push(paragraph);
  }
  return selected;
}

function extractLead(body, core) {
  const beforeSections = body.split(/^## /mu)[0];
  const candidates = beforeSections
    .split(/\n\s*\n/gu)
    .map((block) => block
      .replace(/^#{1,6}\s+[^\n]+$/gmu, '')
      .replace(/^\s*[-*]\s+/gmu, '')
      .trim())
    .filter((block) => {
      const value = normalize(block);
      if (value.length < 20) return false;
      return !/^(?:這篇先回答|本文先處理|本文先提供|年度國曆日期|文化脈絡可以先讀|常年資料適合先用|本篇的常年文化說明)/u.test(value);
    });
  if (candidates.length) return candidates[0];
  return proseParagraphs(core)[0] ?? '';
}

function faqAnswers(body) {
  const faq = section(body, /^## 常見問題$/mu, 2);
  if (!faq) return [];
  return faq
    .split(/^### /gmu)
    .slice(1)
    .map((block) => block.replace(/^[^\n]*\n?/, '').trim())
    .filter(Boolean);
}

function sourceUrls(body) {
  const urls = new Set();
  for (const match of body.matchAll(/https?:\/\/[^\s)）>]+/gu)) {
    const raw = match[0].replace(/[.,，。；;、）)>]+$/u, '');
    try {
      const parsed = new URL(raw);
      urls.add(parsed.href);
    } catch {
      // Ignore malformed text fragments; the URL count gate will still fail.
    }
  }
  return urls;
}

function similarity(a, b) {
  const grams = (text) => new Set(normalize(text).match(/[\u3400-\u9fff]{8}/gu) || []);
  const left = grams(a);
  const right = grams(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function walk(dirPath, output = []) {
  if (!existsSync(dirPath)) return output;
  for (const name of readdirSync(dirPath)) {
    const file = join(dirPath, name);
    const stat = statSync(file);
    if (stat.isDirectory()) walk(file, output);
    else output.push(file);
  }
  return output;
}

function metaContent(html, marker) {
  const start = html.indexOf(marker);
  if (start < 0) return '';
  const valueStart = start + marker.length;
  const valueEnd = html.indexOf('"', valueStart);
  return valueEnd < 0 ? '' : html.slice(valueStart, valueEnd);
}

function routeFile(route) {
  return join(distDir, route.replace(/^\//u, ''), 'index.html');
}

function normalizeInternalPath(value) {
  const path = value.split('#')[0].split('?')[0];
  return path.endsWith('/') ? path : `${path}/`;
}

function routeFromHtml(file) {
  const value = relative(distDir, file).replaceAll('\\', '/');
  if (value === 'index.html') return '/';
  if (!value.endsWith('/index.html')) return '';
  return `/${value.slice(0, -'index.html'.length)}`;
}

function buildDistIndex() {
  if (!requireDist) return null;
  if (!existsSync(distDir)) {
    addError('dist', '使用 --require-dist 但 dist/ 不存在');
    return null;
  }

  const htmlFiles = walk(distDir).filter((file) => file.endsWith('.html'));
  const inbound = new Map();
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    const sourceRoute = routeFromHtml(file);
    for (const part of html.split('href="').slice(1)) {
      const href = part.split('"')[0];
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      const target = normalizeInternalPath(href);
      if (target === sourceRoute) continue;
      inbound.set(target, (inbound.get(target) ?? 0) + 1);
    }
  }

  const sitemap = new Set();
  for (const file of readdirSync(distDir).filter((name) => /^sitemap-\d+\.xml$/u.test(name))) {
    const xml = readFileSync(join(distDir, file), 'utf8');
    for (const part of xml.split('<loc>').slice(1)) {
      const value = part.split('</loc>')[0];
      if (value) sitemap.add(value);
    }
  }
  return { htmlFiles, inbound, sitemap };
}

const distIndex = buildDistIndex();

if (files.length !== expected.length || expected.some((file) => !files.includes(file))) {
  errors.push(`文章稿檔案不完整：預期 52，實際 ${files.length}`);
}

for (const file of files) {
  const text = readFileSync(join(dir, file), 'utf8');
  const meta = parseFrontmatter(text, file);
  const week = Number(meta.week);
  if (week !== Number(file.slice(5, 7))) addError(file, 'week 欄位不一致');
  for (const key of ['title', 'canonical', 'source_packet', 'status', 'publish_at', 'annual_status']) {
    if (!meta[key]) addError(file, `缺少 ${key}`);
  }

  const body = text.replace(/^---[\s\S]*?---\n/u, '');
  const chars = textLength(body);
  if (chars < 1000) addError(file, `全文正文過短（${chars} 字）`);
  if (!/^# .+/mu.test(body)) addError(file, '缺少文章 H1');
  if (!/^## (?:文化脈絡與實用說明|文化背景與實用資訊)$/mu.test(body)) {
    addError(file, '缺少核心文化段落');
  }
  if (!/^## (?:年度資料怎麼維護|最新日期與活動資訊)$/mu.test(body)) {
    addError(file, '缺少年度資訊段落');
  }
  if (!/^## 常見問題$/mu.test(body)) addError(file, '缺少 FAQ');
  if (!/^## 來源$/mu.test(body)) addError(file, '缺少來源段落');

  const annualStatus = String(meta.annual_status ?? '').trim();
  if (!allowedAnnualStatuses.has(annualStatus)) {
    addError(file, `annual_status 不在固定 enum：${annualStatus || '(空值)'}`);
  }

  const paths = canonicalPaths(meta.canonical);
  if (paths.length !== 1) {
    addError(file, `canonical 必須只有一個合法 path，目前 ${paths.length} 個`);
  }
  if (paths.length === 1 && !isSingleCanonicalValue(meta.canonical)) {
    addError(file, 'canonical 必須只包含一個 path，不可附加註解或其他路徑文字');
  }
  for (const path of paths) {
    if (!/^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/$/u.test(path)) {
      addError(file, `canonical path 格式不合法：${path}`);
    }
    if (abstractRootPaths.has(path)) {
      addError(file, `canonical 不可使用抽象動態根路徑：${path}`);
    }
  }
  const primaryPath = paths[0] ?? '';

  const mergeOnly = isMergeOnly(meta);
  const explicitMergeOnly = hasExplicitMergeOnly(meta);
  if (mergeOnly && !explicitMergeOnly) {
    addError(file, 'merge-only 文章必須明確標記 merge_only: true');
  }
  if (hubPaths.has(primaryPath) && !explicitMergeOnly) {
    addError(file, `指向 hub ${primaryPath} 卻沒有明確 merge_only: true`);
  }
  if (annualStatus === 'published-merge' && !explicitMergeOnly) {
    addError(file, 'annual_status 是 published-merge，卻沒有明確 merge_only: true');
  }

  if (!meta.source_packet || !existsSync(meta.source_packet)) {
    addError(file, `source_packet 不存在：${meta.source_packet || '(空值)'}`);
  }

  const core = coreSection(body);
  const coreChars = textLength(core);
  if (/^## 文化背景$/mu.test(core)) {
    addError(file, '核心段落內仍有第二層「## 文化背景」標題，應改為 ### 子標題');
  }
  const minimumCoreChars = mergeOnly ? 600 : 800;
  if (coreChars < minimumCoreChars) {
    addError(file, `核心文化段落僅 ${coreChars} 字，需至少 ${minimumCoreChars} 字`);
  }
  const topicParagraphs = distinctTopicParagraphs(core);
  if (topicParagraphs.length < 3) {
    addError(file, `核心文化段落只有 ${topicParagraphs.length} 個獨立主題段落，至少需要 3 個`);
  }

  const internalMatch = internalWorkWords.find((pattern) => pattern.test(body));
  if (internalMatch) {
    addError(file, `混入內部工作語：${internalMatch}`);
  }

  const urls = sourceUrls(body);
  const domains = new Set([...urls].map((url) => new URL(url).hostname));
  const minimumUrls = mergeOnly ? 2 : 3;
  if (urls.size < minimumUrls) addError(file, `來源 URL 僅 ${urls.size} 個，至少需要 ${minimumUrls} 個`);
  if (domains.size < 2) addError(file, `來源網域僅 ${domains.size} 個，至少需要 2 個`);

  const lead = extractLead(body, core);
  const faq = faqAnswers(body);
  if (!faq.length) addError(file, 'FAQ 沒有可讀的問題答案段落');
  const normalizedLead = normalize(lead);
  if (normalizedLead && faq.some((answer) => normalize(answer) === normalizedLead)) {
    addError(file, 'FAQ 答案逐字重複導讀 lead，需改為直接回答問題');
  }

  if (distIndex && primaryPath) {
    const htmlPath = routeFile(primaryPath);
    if (!existsSync(htmlPath)) {
      addError(file, `canonical 在 dist 沒有可建置頁：${primaryPath}`);
    } else {
      const html = readFileSync(htmlPath, 'utf8');
      const canonical = metaContent(html, '<link rel="canonical" href="');
      const expectedCanonical = `https://folk.tw${primaryPath}`;
      if (canonical !== expectedCanonical) addError(file, `production self-canonical 不一致：${canonical || '(空值)'}`);
      const robots = metaContent(html, '<meta name="robots" content="');
      if (!/\bindex\b/iu.test(robots) || /noindex/iu.test(robots)) addError(file, `production 頁不可 index：${primaryPath}`);
      const og = metaContent(html, '<meta property="og:image" content="');
      if (!og) {
        addError(file, `production 頁缺少 og:image：${primaryPath}`);
      } else {
        try {
          const ogPath = new URL(og).pathname;
          if (!existsSync(join(distDir, ogPath.replace(/^\//u, '')))) addError(file, `og:image 檔案不存在：${og}`);
          if (ogPath === '/og.png') addWarning(file, 'production 使用共用 og.png，發布前確認分享卡是否足夠主題化');
        } catch {
          addError(file, `og:image URL 不合法：${og}`);
        }
      }
      const sitemapUrl = expectedCanonical;
      if (!distIndex.sitemap.has(sitemapUrl)) addError(file, `canonical 不在 sitemap：${primaryPath}`);
      const inbound = distIndex.inbound.get(primaryPath) ?? 0;
      if (inbound < 1) addError(file, `canonical 沒有 production 內鏈：${primaryPath}`);
    }
  }

  docs.push({ file, body });
}

for (let i = 0; i < docs.length; i += 1) {
  for (let j = i + 1; j < docs.length; j += 1) {
    const score = similarity(docs[i].body, docs[j].body);
    if (score >= 0.86) addError(`${docs[i].file} ↔ ${docs[j].file}`, `文章重複度過高（${score.toFixed(2)}）`);
    else if (score >= 0.72) addWarning(`${docs[i].file} ↔ ${docs[j].file}`, `共享段落需人工確認（${score.toFixed(2)}）`);
  }
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);
for (const error of errors) console.error(`✗ ${error}`);
if (errors.length) {
  console.error(`文章稿收錄 gate 失敗：${errors.length} errors，${warnings.length} warnings`);
  process.exit(1);
}
console.log(`文章稿收錄 gate 通過：${docs.length}/52 篇，0 errors，${warnings.length} warnings`);
