#!/usr/bin/env node
// 年度主題草稿的內容與證據 gate。
//
// 草稿留在 docs/topic-drafts/，不會自動成為網站頁面；這支檢查確保「開始寫」
// 代表真的有可審核文案，而不是只有題目。--strict 會要求年度交付檔全部存在。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = 'docs/topic-drafts';
const expected = [
  'aug-nov.md',
  'dec-mar.md',
  'apr-jul.md',
  'chongyang.md',
  'dongzhi.md',
  'duanwu.md',
  'missing-weeks.md',
  'content-themes-33-52.md',
];
const strict = process.argv.includes('--strict');
const errors = [];
const warnings = [];

function add(kind, file, message) {
  (kind === 'error' ? errors : warnings).push(`${file}: ${message}`);
}

if (!existsSync(root)) {
  console.error('主題草稿 gate：docs/topic-drafts 不存在');
  process.exit(1);
}

const files = readdirSync(root)
  .filter((name) => name.endsWith('.md') && name !== 'README.md')
  .sort();
for (const name of expected) {
  if (!files.includes(name)) add(strict ? 'error' : 'warn', name, '尚未產出年度交付檔');
}

function normalized(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .replace(/[「」『』“”‘’.,，。！？!?；;：:、（）()【】《》〈〉\-—…·/\\]/gu, '')
    .toLowerCase();
}

function grams(value, size = 8) {
  const chars = Array.from(normalized(value));
  const result = new Set();
  for (let i = 0; i <= chars.length - size; i += 1) result.add(chars.slice(i, i + size).join(''));
  return result;
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const gram of a) if (b.has(gram)) common += 1;
  return common / Math.min(a.size, b.size);
}

const bodies = new Map();
for (const name of files) {
  const path = join(root, name);
  const body = readFileSync(path, 'utf8');
  bodies.set(name, body);
  if (body.length < 900) add('error', name, `內容僅 ${body.length} 字元，尚不足以進入 reviewer`);
  if (!/^#\s+[^\n]+/mu.test(body)) add('error', name, '缺少主標題');
  if (!/搜尋意圖/iu.test(body)) add('error', name, '缺少搜尋意圖判定');
  if (!/FAQ/iu.test(body)) add('error', name, '缺少 FAQ');
  if (!/合併|重複|風險/iu.test(body)) add('error', name, '缺少合併／重複風險說明');
  if (!/source_required|review-gate|待核定/iu.test(body)) {
    add('error', name, '沒有標記年度來源尚待核定或審稿狀態');
  }

  const urls = [...body.matchAll(/https?:\/\/[^\s)）>]+/giu)].map((match) => match[0].replace(/[.,，。；;]+$/u, ''));
  const uniqueUrls = new Set(urls);
  if (uniqueUrls.size < 3) add('error', name, `可追溯 URL 僅 ${uniqueUrls.size} 個，至少需要 3 個`);
  const officialUrls = urls.filter((url) => /(?:\.(?:gov\.tw|edu\.tw|org\.tw)(?:\/|$)|\.(?:gov|edu)(?:\/|$)|boch\.gov\.tw|moi\.gov\.tw|taiwan\.net\.tw)/iu.test(url));
  if (new Set(officialUrls).size < 2) add('error', name, '官方／公立來源 URL 少於 2 個，不能只靠一般網站或待核定文字');
  if ((body.match(/來源/gu) ?? []).length < 3) add('error', name, '來源標註不足 3 處');
  if (!/圖片|OG|授權/iu.test(body)) add('error', name, '缺少圖片／OG／授權的發布前檢核');

  // 以「路由／編號內容單元」為最低品質邊界，避免整份檔案很長、
  // 但每個主題只剩一句標語。FAQ、標題與合併說明不列入內容單元。
  const headings = [...body.matchAll(/^###\s+([^\n]+)$/gmu)];
  const units = headings.filter((match) => {
    const heading = match[1];
    return /`\/(?:festivals|events|practices)\/[^`]+\/`/u.test(heading)
      || /^\d+\./u.test(heading)
      || /(?:guide|更新(?:草稿|卡)|主文草稿)/u.test(heading);
  });
  for (let index = 0; index < units.length; index += 1) {
    const heading = units[index];
    const start = (heading.index ?? 0) + heading[0].length;
    const end = index + 1 < units.length
      ? (units[index + 1].index ?? body.length)
      : body.length;
    const section = body.slice(start, end);
    if (section.length < 180) {
      add('error', name, `內容單元「${heading[1]}」僅 ${section.length} 字元，需補足可審核正文`);
    }
    if (!/https?:\/\/|來源|source_required/iu.test(section)) {
      add('error', name, `內容單元「${heading[1]}」沒有鄰近來源或 source_required 標記`);
    }
  }

  for (const [label, pattern] of [
    ['模板化總結句', /綜上所述|總的來說|總而言之|整體而言/gu],
    ['換句話說套句', /換句話說/gu],
    ['模糊權威引用', /研究顯示|研究指出|專家認為|學者認為/gu],
  ]) {
    if (pattern.test(body)) add('error', name, `出現 ${label}，請改成有來源的具體敘述`);
  }
}

const entries = [...bodies.entries()].map(([name, body]) => ({ name, grams: grams(body) }));
for (let i = 0; i < entries.length; i += 1) {
  for (let j = i + 1; j < entries.length; j += 1) {
    const ratio = overlap(entries[i].grams, entries[j].grams);
    if (ratio >= 0.42) {
      add('error', `${entries[i].name} ↔ ${entries[j].name}`, `跨檔 8-gram 重複率 ${(ratio * 100).toFixed(1)}%`);
    } else if (ratio >= 0.3) {
      add('warn', `${entries[i].name} ↔ ${entries[j].name}`, `跨檔 8-gram 重複率 ${(ratio * 100).toFixed(1)}%，請人工確認`);
    }
  }
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);
for (const error of errors) console.error(`✗ ${error}`);
if (errors.length) {
  console.error(`主題草稿 gate 失敗：${errors.length} errors，${warnings.length} warnings`);
  process.exit(1);
}
console.log(`主題草稿 gate 通過：${files.length} 檔，0 errors，${warnings.length} warnings`);
