#!/usr/bin/env node
// 節慶／年度內容品質 gate。
//
// 這支刻意不掃全站宮廟、籤詩與典故：那些資料有不同的來源形態與既有門檻，
// 不應被「新年度頁」的最低字數或 facts 規則誤殺。本檔只檢查
// src/data/festivals.json，並可用 --manifest 指定一份年度釋出清單。
//
// 兩種模式：
//   node scripts/check-content-quality.mjs
//     全部節慶做基線檢查；歷史資料不足的項目只 WARN。
//   node scripts/check-content-quality.mjs --strict --manifest docs/annual-release-manifest.json
//     對 manifest 標成 scheduled／ready，或明確 quality.strict 的項目，
//     要求 3+ 條不重複、逐條掛源 facts、intent、FAQ 問題與足夠 lead。
//   node scripts/check-content-quality.mjs --strict-all
//     人工審稿時把所有節慶都套用新頁門檻。
//
// exit 1 只代表 ERROR；WARN 會保留在輸出，方便把存量逐月補齊。
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const strictFlag = args.includes('--strict');
const strictAll = args.includes('--strict-all');
const jsonOutput = args.includes('--json');

function valueAfter(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return '';
  return args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : '';
}

const dataPath = valueAfter('--data') || 'src/data/festivals.json';
const manifestPath = valueAfter('--manifest');
const distPath = valueAfter('--dist') || 'dist';
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`無法讀取 JSON ${path}：${error.message}`);
  }
}

const festivals = readJson(dataPath);
if (!Array.isArray(festivals)) {
  throw new Error(`${dataPath} 必須是陣列`);
}

// manifest 可以是陣列，也可以是 { releases/items/entries: [] }。不把年度規劃文件
// 自動當成資料來源，避免「計畫中」的項目意外成為阻擋 build 的頁面。
function manifestRows(value) {
  if (Array.isArray(value)) return value;
  for (const key of ['releases', 'items', 'entries', 'campaigns']) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

const manifest = manifestPath ? readJson(manifestPath) : null;
const manifestEntries = manifestRows(manifest);
const manifestBySlug = new Map();
for (const row of manifestEntries) {
  if (!row || typeof row !== 'object') continue;
  const slug = String(row.slug ?? row.festivalSlug ?? row.id ?? '').trim();
  if (!slug) continue;
  manifestBySlug.set(slug, row);
}

const festivalBySlug = new Map();
const errors = [];
const warnings = [];

function add(kind, slug, message) {
  const text = `${slug ? `${slug}: ` : ''}${message}`;
  if (kind === 'error') errors.push(text);
  else warnings.push(text);
}

function visibleText(value) {
  return String(value ?? '').replace(/\s+/gu, '').replace(/[\u200b-\u200d\ufeff]/gu, '');
}

function normalized(value) {
  return visibleText(value)
    .normalize('NFKC')
    .replace(/[「」『』“”‘’.,，。！？!?；;：:、（）()【】《》〈〉「」『』\-—…·/\\]/gu, '')
    .toLowerCase();
}

function sourceList(value) {
  return Array.isArray(value) ? value : [];
}

function sourceRef(source) {
  if (typeof source === 'string') return source.trim();
  return String(source?.ref ?? '').trim();
}

function hasHttpUrl(value) {
  return /https?:\/\/\S+/iu.test(String(value ?? ''));
}

function factText(fact) {
  if (typeof fact === 'string') return fact.trim();
  return String(fact?.text ?? '').trim();
}

function factSources(fact) {
  if (typeof fact === 'string') return [];
  return sourceList(fact?.sources);
}

function dateOnly(value) {
  const match = String(value ?? '').match(/^\d{4}-\d{2}-\d{2}/u);
  return match ? match[0] : '';
}

function releaseInfo(festival, row) {
  // 接受幾種命名是為了讓資料匯入器和年度 manifest 可以各自保持清楚，
  // 但最後都收斂成同一份 quality 判定。
  const nested = festival.release ?? festival.publication ?? festival.schedule ?? {};
  const quality = festival.quality ?? {};
  const manifestQuality = row?.quality ?? {};
  const status = String(
    row?.status ?? row?.release_status ?? nested.status ?? festival.release_status ?? '',
  ).trim().toLowerCase();
  const publishAt = dateOnly(
    row?.publish_at ?? row?.publishAt ?? row?.release_at ?? row?.releaseAt ??
      nested.publish_at ?? nested.publishAt ?? festival.publish_at ?? festival.publishAt,
  );
  const intent = String(
    row?.intent ?? row?.search_intent ?? manifestQuality.intent ?? quality.intent ??
      festival.intent ?? festival.search_intent ?? '',
  ).trim();
  const explicitStrict =
    row?.strict === true || manifestQuality.strict === true || quality.strict === true;
  const profile = String(row?.profile ?? manifestQuality.profile ?? quality.profile ?? '').trim().toLowerCase();
  const strictStatus = new Set(['scheduled', 'ready', 'release-ready', 'prepublish']);
  // --strict 不代表把 manifest 裡的 planned 項目也當成 ready；年度清單可以先
  // 登記題目與月份，等研究完成再將 status 改成 scheduled／ready。只有後兩者、
  // annual profile 或明確 strict 才進新頁硬門檻。
  const futurePublish = Boolean(publishAt && publishAt > today);
  const strict = strictAll || explicitStrict || strictStatus.has(status) || futurePublish ||
    (strictFlag && profile === 'annual');
  return { status, publishAt, intent, explicitStrict, profile, futurePublish, strict };
}

function aiSignals(text) {
  const layers = new Set();
  const hits = [];
  const patterns = [
    ['formula', '空泛總結句', /(綜上所述|總的來說|總而言之|整體而言|歸根結底)/u, true],
    ['formula', '「換句話說」', /換句話說/u, true],
    ['formula', '「值得注意的是」', /值得(注意|一提|關注|玩味)的是/u, true],
    ['contrast', '「不僅／不只是…更」套句', /(不僅|不只是|並非)[^。！？\n]{0,32}(而是|更是|更|還|也)/u, true],
    ['generic', '無出處的模糊引用', /(研究顯示|研究指出|專家認為|學者認為|普遍認為|有文獻(表示|指出))/u, true],
    ['opening', '模板化開場', /^(在這個|隨著|近年來|現代社會|在當今)/u, false],
    ['sequence', '制式三段排比', /(首先[^。！？]{0,40}(其次|接著)[^。！？]{0,40}(最後|總之))/u, false],
    ['emotion', '抽象療癒收束', /(帶來更多溫暖|照亮彼此|讓人感到療癒|不妨放下|值得被看見)/u, false],
  ];
  for (const [layer, label, pattern, highConfidence] of patterns) {
    if (!pattern.test(text)) continue;
    layers.add(layer);
    hits.push({ layer, label, highConfidence });
  }
  return { layers, hits };
}

function sentences(text) {
  return String(text ?? '')
    .split(/[。！？!?；;\n]+/u)
    .map((part) => normalized(part))
    .filter((part) => part.length >= 12);
}

function ngrams(text, size = 8) {
  const chars = Array.from(normalized(text));
  const result = new Set();
  for (let i = 0; i <= chars.length - size; i += 1) {
    result.add(chars.slice(i, i + size).join(''));
  }
  return result;
}

function overlapRatio(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const gram of a) if (b.has(gram)) common += 1;
  return common / Math.min(a.size, b.size);
}

function pageText(festival) {
  return [
    festival.name,
    festival.question,
    festival.lead,
    ...(festival.facts ?? []).map(factText),
  ].filter(Boolean).join('。');
}

function contentUrl(slug) {
  return `${resolve(distPath)}/festivals/${slug}/index.html`;
}

// 先收集 slug，避免重複 slug 讓跨頁比較與 manifest 對映產生不確定結果。
for (const festival of festivals) {
  const slug = String(festival?.slug ?? '').trim();
  if (!slug) {
    add('error', '', 'festival 缺少 slug');
    continue;
  }
  if (festivalBySlug.has(slug)) add('error', slug, 'slug 重複');
  festivalBySlug.set(slug, festival);
}

const strictSlugs = new Set();
for (const festival of festivals) {
  const slug = String(festival?.slug ?? '').trim();
  if (!slug) continue;
  const row = manifestBySlug.get(slug);
  const release = releaseInfo(festival, row);
  if (release.strict) strictSlugs.add(slug);

  const strict = release.strict;
  const failOrWarn = (message) => add(strict ? 'error' : 'warn', slug, message);

  // 基本識別與查詢意圖：question 是頁面 FAQ 的第一筆答案來源，不能只留一個標題。
  const name = visibleText(festival.name);
  const question = visibleText(festival.question);
  const lead = visibleText(festival.lead);
  if (name.length < 2) add('error', slug, 'name 太短或缺少節慶名稱');
  if (question.length < 8) failOrWarn('question 太短（至少 8 字，需能表達一個可搜尋問題）');
  if (question && !/[？?]/u.test(question)) failOrWarn('question 未以問句呈現（缺少？或 ?）');
  if (!release.intent) failOrWarn('缺少 intent／search_intent（請標示主要查詢意圖）');
  if (release.intent.length > 80) failOrWarn('intent 過長，應是短的查詢意圖標籤而非段落');

  // lead/FAQ 最低品質。現有頁面較短的項目先留下可觀測 WARN；新排程頁要達到可回答
  // 搜尋問題的完整程度，避免只換節日名稱的薄頁。
  if (lead.length < 80) failOrWarn(`lead 僅 ${lead.length} 字，低於最低基線 80 字`);
  else if (strict && lead.length < 120) {
    add('error', slug, `lead 僅 ${lead.length} 字；新／年度釋出頁至少 120 字`);
  }
  if (lead && normalized(lead) === normalized(question)) failOrWarn('lead 與 question 幾乎相同，疑似薄頁');

  // 來源欄位是事實頁的硬底線；有來源但 ref 空白也等同無來源。
  const pageSources = sourceList(festival.sources);
  const pageRefs = pageSources.map(sourceRef).filter(Boolean);
  if (!pageRefs.length) {
    add('error', slug, '無有效 sources.ref（事實型節慶頁不得無來源）');
  }
  if (pageSources.length > 0 && pageRefs.length < pageSources.length) {
    failOrWarn(`有 ${pageSources.length - pageRefs.length} 筆 source 缺少 ref`);
  }
  const invalidPageRefs = pageRefs.filter((ref) => !hasHttpUrl(ref));
  if (invalidPageRefs.length) failOrWarn(`有 ${invalidPageRefs.length} 筆 source.ref 不是 http(s) URL`);
  if (pageRefs.length === 1) add('warn', slug, '目前只有 1 個頁面來源；若有第二個獨立來源請補上');

  // facts：存量不足只警告；標成 scheduled／ready 或 strict 的頁面逐條硬擋。
  const facts = Array.isArray(festival.facts) ? festival.facts : [];
  const factTexts = facts.map(factText);
  const factKeys = new Map();
  for (const [index, fact] of facts.entries()) {
    const text = factTexts[index];
    const key = normalized(text);
    if (!text) {
      failOrWarn(`facts[${index}] 缺少 text`);
      continue;
    }
    if (text.length < 30) failOrWarn(`facts[${index}] 僅 ${text.length} 字，內容過短`);
    if (key && factKeys.has(key)) {
      add(strict ? 'error' : 'warn', slug, `facts[${index}] 與 facts[${factKeys.get(key)}] 完全重複`);
    } else if (key) {
      factKeys.set(key, index);
    }
    const sources = factSources(fact);
    const refs = sources.map(sourceRef).filter(Boolean);
    if (!refs.length) {
      failOrWarn(`facts[${index}] 缺少逐句掛源 sources`);
    } else {
      const badRefs = refs.filter((ref) => !hasHttpUrl(ref));
      if (badRefs.length) failOrWarn(`facts[${index}] 的 source.ref 缺少 http(s) URL`);
    }
  }
  const uniqueFactCount = new Set(factTexts.map(normalized).filter(Boolean)).size;
  if (uniqueFactCount < 3) {
    failOrWarn(`只有 ${uniqueFactCount} 條不重複 facts；新／年度釋出頁至少 3 條`);
  }
  if (!facts.length) add('warn', slug, '沒有 facts；目前由資料關係／lead 支撐，建議補逐句掛源的獨有事實');

  // 來源與內容的粗略可觀測對映：不要求 fact.ref 與 page source.ref 字串完全相同，
  // 因為 fact ref 常包含「機關／文章名＋URL」；只要至少帶 URL 即可在頁面上追溯。
  const allFactRefs = facts.flatMap(factSources).map(sourceRef).filter(Boolean);
  const factUrls = allFactRefs.filter(hasHttpUrl);
  if (facts.length && factUrls.length === 0) failOrWarn('facts 有內容但沒有任何可追溯 URL');

  // 高信心 AI 套句：存量只報告；嚴格頁面若命中高信心句，直接阻擋。
  const text = pageText(festival);
  const signals = aiSignals(text);
  if (signals.hits.length) {
    const high = signals.hits.filter((hit) => hit.highConfidence);
    const message = `疑似機械／AI 套句：${signals.hits.map((hit) => hit.label).join('、')}`;
    if (strict && (high.length > 0 || signals.layers.size >= 2)) add('error', slug, message);
    else add('warn', slug, message);
  }

  // 若已經有 dist，補驗「來源真的渲染出來」與基本 title/meta 產物。
  // 沒有 dist 時不失敗，因為此支也會在 Astro build 前置執行。
  const htmlFile = contentUrl(slug);
  if (existsSync(htmlFile)) {
    const html = readFileSync(htmlFile, 'utf8');
    const title = html.match(/<title>([^<]*)<\/title>/iu)?.[1]?.trim() ?? '';
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/iu)?.[1]?.replace(/<[^>]+>/gu, '').trim() ?? '';
    const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/iu)?.[1] ?? '';
    if (!title) failOrWarn('dist 頁面缺少 <title>');
    if (!h1) failOrWarn('dist 頁面缺少 <h1>');
    if (description.length < 50) failOrWarn(`dist meta description 僅 ${description.length} 字`);
    for (const ref of pageRefs) {
      // ref 可能含 HTML 特殊字元，但 URL 的 host/path 通常仍會原樣出現在 href。
      const url = ref.match(/https?:\/\/\S+/iu)?.[0]?.replace(/[，。)）】」]+$/u, '');
      const htmlUrl = url?.replaceAll('&', '&amp;');
      if (url && !html.includes(url) && !html.includes(htmlUrl)) {
        failOrWarn(`來源未在 dist 頁面渲染：${url}`);
        break;
      }
    }
  }
}

// Manifest 的項目也要被反查：一個已標 ready/scheduled 卻沒有 festivals 資料，
// 代表它不可能被 Astro 建頁，應在釋出前看見，而不是等 sitemap 才發現。
for (const [slug, row] of manifestBySlug) {
  if (festivalBySlug.has(slug)) continue;
  const status = String(row?.status ?? row?.release_status ?? '').trim().toLowerCase();
  const strict = strictAll || row?.strict === true || row?.quality?.strict === true ||
    new Set(['scheduled', 'ready', 'release-ready', 'prepublish']).has(status);
  if (strict) add('error', slug, `manifest 標為 ${status || 'strict'}，但 festivals.json 沒有對應內容`);
  else add('warn', slug, `manifest 有此項目但 festivals.json 尚無內容（目前狀態：${status || 'planned'}）`);
}

// 跨頁 exact sentence／8-gram 比對。日期、標題與通用 FAQ 不納入，只比較 lead + facts，
// 讓同一節慶的不同日期標示不會把結果灌高。
const corpus = festivals
  .filter((festival) => festivalBySlug.get(festival.slug) === festival)
  .map((festival) => ({
    slug: festival.slug,
    strict: strictSlugs.has(festival.slug),
    text: [festival.lead, ...(festival.facts ?? []).map(factText)].filter(Boolean).join('。'),
  }));

const sentenceOwners = new Map();
for (const item of corpus) {
  for (const sentence of sentences(item.text)) {
    if (!sentenceOwners.has(sentence)) sentenceOwners.set(sentence, []);
    sentenceOwners.get(sentence).push(item);
  }
}
for (const [sentence, owners] of sentenceOwners) {
  const uniqueOwners = [...new Map(owners.map((owner) => [owner.slug, owner])).values()];
  if (uniqueOwners.length < 2) continue;
  const slugs = uniqueOwners.map((owner) => owner.slug).join('、');
  const strict = uniqueOwners.some((owner) => owner.strict);
  add(strict ? 'error' : 'warn', '', `跨頁重複完整句（${slugs}）：「${sentence.slice(0, 34)}${sentence.length > 34 ? '…' : ''}」`);
}

for (let i = 0; i < corpus.length; i += 1) {
  for (let j = i + 1; j < corpus.length; j += 1) {
    const a = corpus[i];
    const b = corpus[j];
    const ratio = overlapRatio(ngrams(a.text), ngrams(b.text));
    // 0.28 是「最短頁有超過四分之一 8-gram 被另一頁重用」的警戒線；
    // 0.45 才視為高風險。現有內容的正常日期／儀式共用通常遠低於此值。
    if (ratio < 0.28) continue;
    const strict = a.strict || b.strict;
    const severity = ratio >= 0.45 && strict ? 'error' : 'warn';
    add(severity, '', `跨頁 8-gram 重疊 ${Math.round(ratio * 100)}%：${a.slug} ↔ ${b.slug}`);
  }
}

const result = {
  data: dataPath,
  manifest: manifestPath || null,
  festivals: festivals.length,
  strict: [...strictSlugs],
  errors,
  warnings,
};

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`\n=== festival content quality gate ===`);
  console.log(`資料：${dataPath}；節慶 ${festivals.length} 筆；嚴格檢查 ${strictSlugs.size} 筆`);
  if (manifestPath) console.log(`manifest：${manifestPath}（${manifestBySlug.size} 筆）`);
  if (errors.length) {
    console.error(`✗ ERROR ${errors.length}`);
    for (const message of errors) console.error(`  ✗ ${message}`);
  }
  if (warnings.length) {
    console.warn(`⚠ WARN ${warnings.length}`);
    for (const message of warnings) console.warn(`  ⚠ ${message}`);
  }
  if (!errors.length) console.log(`✓ 品質 gate 通過（WARN ${warnings.length}；存量不足項目請逐月補齊）`);
}

process.exitCode = errors.length ? 1 : 0;
