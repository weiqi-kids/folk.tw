#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'docs/topic-articles';
const expected = Array.from({ length: 52 }, (_, i) => `week-${String(i + 1).padStart(2, '0')}.md`);
const files = readdirSync(dir).filter((file) => /^week-\d{2}\.md$/u.test(file)).sort();
const errors = [];
const warnings = [];
const docs = [];

if (files.length !== expected.length || expected.some((file) => !files.includes(file))) {
  errors.push(`文章稿檔案不完整：預期 52，實際 ${files.length}`);
}

function frontmatter(text, file) {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(text);
  if (!match) {
    errors.push(`${file} 缺少 frontmatter`);
    return {};
  }
  const values = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

function similarity(a, b) {
  const grams = (text) => new Set(text.replace(/\s+/gu, '').match(/[\u3400-\u9fff]{8}/gu) || []);
  const left = grams(a);
  const right = grams(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
}

for (const file of files) {
  const text = readFileSync(join(dir, file), 'utf8');
  const meta = frontmatter(text, file);
  const week = Number(meta.week);
  if (week !== Number(file.slice(5, 7))) errors.push(`${file} week 欄位不一致`);
  for (const key of ['title', 'canonical', 'source_packet', 'status', 'publish_at']) {
    if (!meta[key]) errors.push(`${file} 缺少 ${key}`);
  }
  const body = text.replace(/^---[\s\S]*?---\n/u, '');
  const chars = body.replace(/\s+/gu, '').length;
  if (chars < 1000) errors.push(`${file} 正文過短（${chars} 字）`);
  for (const heading of ['## 文化脈絡與實用說明', '## 年度資料怎麼維護', '## 常見問題', '## 來源']) {
    if (!body.includes(heading)) errors.push(`${file} 缺少 ${heading}`);
  }
  if (!/^# .+/mu.test(body)) errors.push(`${file} 缺少文章 H1`);
  const urls = new Set((body.match(/https?:\/\/[^)\s]+/gu) || []).map((url) => url.replace(/[，。；、）)]+$/u, '')));
  if (urls.size < 2) warnings.push(`${file} 來源 URL 少於 2 個，發布前補第二個獨立來源`);
  if (/(?:GA4|GSC|工具操作|既有工具維護)/u.test(body)) errors.push(`${file} 混入成效工具／維護主題`);
  docs.push({ file, body });
}

for (let i = 0; i < docs.length; i += 1) {
  for (let j = i + 1; j < docs.length; j += 1) {
    const score = similarity(docs[i].body, docs[j].body);
    if (score >= 0.86) errors.push(`文章重複度過高：${docs[i].file} ↔ ${docs[j].file} (${score.toFixed(2)})`);
    else if (score >= 0.72) warnings.push(`文章有共享段落需人工確認：${docs[i].file} ↔ ${docs[j].file} (${score.toFixed(2)})`);
  }
}

if (errors.length) {
  console.error(`文章稿 gate 失敗：${errors.length} error、${warnings.length} warning`);
  for (const error of errors) console.error(`ERROR ${error}`);
  for (const warning of warnings) console.error(`WARN ${warning}`);
  process.exit(1);
}
console.log(`文章稿 gate 通過：${docs.length}/52 篇，0 error、${warnings.length} warning`);
for (const warning of warnings) console.log(`WARN ${warning}`);
