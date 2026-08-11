#!/usr/bin/env node
// 主力節日的社群分享卡。
//
// ImageGen 只負責無字背景；節名、國曆、農曆與提問全部從 festivals.json 與
// lunar-date.ts 取得，再用本機 CJK 字型疊上。這樣不會把模型生成的錯字送進 OG，
// 明年日期變動時也只需重新 build，不必重新產插畫。
//
// 背景是專案資產，最終 1200x630 PNG 只寫入 dist，不進 repo。

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { C, esc, visualWidth, wrap, assertCjkFont } from './lib/og-card.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const { festivalNextSolar, solarMd } = await import(join(root, 'src/lib/lunar-date.ts'));
const festivals = JSON.parse(readFileSync(join(root, 'src/data/festivals.json'), 'utf8'));

// 清單的唯一真實來源是 src/lib/festival-og.ts——節日頁的 og:image 與 bot-index.json
// 的 festivals[].image 讀的是同一份，這裡不再自己抄一份（抄兩份會漂移，而且漂移了
// build 仍然全綠，症狀只在使用者端顯示成破圖）。
const { FESTIVAL_OG_SLUGS: CARD_SLUGS } = await import(join(root, 'src/lib/festival-og.ts'));
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const publicFestivals = festivals.filter((festival) => !festival.publish_at || festival.publish_at <= today);

function titleSize(name) {
  const width = visualWidth(name);
  return width <= 4 ? 92 : width <= 7 ? 78 : 68;
}

function overlaySvg(festival, iso, lunarLabel) {
  const size = titleSize(festival.name);
  const titleLines = wrap(festival.name, Math.floor(570 / size)).slice(0, 2);
  const title = titleLines
    .map((line, i) => `<text x="72" y="${168 + i * (size + 12)}" class="title" font-size="${size}px">${esc(line)}</text>`)
    .join('\n');
  const titleBottom = 168 + (titleLines.length - 1) * (size + 12);
  // 搶孤不是全台同一天：festivals.json 明載恆春在七月十五、頭城在七月底。
  // 卡面若只畫換算出的七月十五，會誤讀成兩地都在 8/27，故明確分開。
  const dateLine = festival.slug === 'qianggu'
    ? `${iso.slice(0, 4)} 恆春 ${solarMd(iso)}　·　頭城於七月底`
    : festival.slug === 'kinmen-bo-bing' && iso.startsWith('2026-')
      ? `${iso.slice(0, 4)} 活動檔期 9/1–9/25`
    : festival.slug === 'september-solar-terms'
        ? `${iso.slice(0, 4)} 白露 ${solarMd(iso)}　·　秋分約 9/22–23`
        : `${iso.slice(0, 4)} 年國曆 ${solarMd(iso)}　·　${lunarLabel}`;
  const question = wrap(festival.question, 16).slice(0, 2);
  const questionLines = question
    .map((line, i) => `<text x="74" y="${titleBottom + 118 + i * 48}" class="question">${esc(line)}</text>`)
    .join('\n');

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <linearGradient id="panel" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${C.paper}" stop-opacity="0.98"/>
        <stop offset="0.78" stop-color="${C.paper}" stop-opacity="0.92"/>
        <stop offset="1" stop-color="${C.paper}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <style>
      .kicker,.date,.question,.mark { font-family:'Noto Serif CJK TC','Noto Serif TC',serif; }
      .title { font-family:'Noto Serif CJK TC','Noto Serif TC',serif; font-weight:700; fill:${C.ink}; }
      .kicker { font-size:28px; letter-spacing:5px; fill:${C.accent}; }
      .date { font-size:31px; font-weight:700; fill:${C.gold}; }
      .question { font-size:34px; fill:${C.inkSoft}; }
      .mark { font-size:25px; letter-spacing:2px; fill:${C.accent}; }
    </style>
    <rect width="710" height="630" fill="url(#panel)"/>
    <rect x="0" y="0" width="16" height="630" fill="${C.accent}"/>
    <text x="72" y="72" class="kicker">台灣民俗節日</text>
    ${title}
    <text x="74" y="${titleBottom + 62}" class="date">${esc(dateLine)}</text>
    ${questionLines}
    <text x="72" y="580" class="mark">folk.tw　神酷</text>
  </svg>`);
}

assertCjkFont();
const outDir = join(root, 'dist/og/festivals');
mkdirSync(outDir, { recursive: true });

let total = 0;
for (const slug of CARD_SLUGS) {
  const festival = publicFestivals.find((f) => f.slug === slug);
  if (!festival) {
    // Future scheduled pages intentionally have no route or share card yet.
    if (festivals.some((f) => f.slug === slug)) continue;
    throw new Error(`找不到節日資料：${slug}`);
  }
  const next = festivalNextSolar(festival, today);
  if (!next.iso) throw new Error(`節日無法換算日期：${slug}`);
  const background = join(root, 'src/assets/og-festivals', `${slug}.webp`);
  const out = join(outDir, `${slug}.png`);
  await sharp(background)
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .composite([{ input: overlaySvg(festival, next.iso, next.label), top: 0, left: 0 }])
    .png({ compressionLevel: 9, palette: true, colors: 128 })
    .toFile(out);
  total++;
}

console.log(`✓ 產出 ${total} 張節日分享卡 → ${outDir}`);
