#!/usr/bin/env node
// 籤詩頁與神明頁的 Discover 分享卡（og:image）產生器。
//
// 為什麼要做（2026-08-08）：全站只有廟宇頁有專屬分享卡，其餘一萬多頁共用
// `public/og.png` 一張品牌卡。在加上全站分享按鈕之前，先把「分享出去有東西看」補起來——
// 按鈕不缺，缺的是預覽。
//
// 🔴 事實鐵則（與廟宇卡同）：卡面所有文字皆取自既有欄位，**絕不杜撰**。
//    查無該欄位就不畫那一行，不硬湊、不補話。
//    · 籤詩卡：籤系名＋第 N 籤（＋干支／題）／四句籤詩／吉凶（127/215 有，其餘不畫）
//    · 神明卡：神名／別名（首個）·類別／職司（75/94 有）／聖誕（67/94 有）
//
// 🔴 措辭界線：籤詩卡上**只有籤詩本文與吉凶二字**，不放任何分項解或賞析——
//    那些是站上的文化解讀，抽離脈絡印在卡上會讀成對個人的預言，
//    與 /about 的「不對個人預言吉凶」自打嘴巴。
//
// ⚠️ 與廟宇卡不同，本卡帶 folk.tw 小字：廟宇卡刻意不出現站名是因為外撥時
//    要讓主委看到自家招牌（2026-07-30 用戶指示）；籤詩／神明卡的使用情境是使用者主動轉發，
//    出處反而是需要的。
//
// 用法：
//   node scripts/gen-og-content.mjs --sample <poemId|deityId> ...  # 只產指定幾張
//   node scripts/gen-og-content.mjs                                 # 全量（postbuild）
//   node scripts/gen-og-content.mjs --out <dir>                     # 指定輸出根目錄

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { C, esc, uniqueMotif, visualWidth, wrap, assertCjkFont, toPng } from './lib/og-card.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const { lunarDateLabel } = await import(join(root, 'src/lib/lunar-date.ts'));

const poems = JSON.parse(readFileSync(join(root, 'src/data/poems.json'), 'utf8'));
const deities = JSON.parse(readFileSync(join(root, 'src/data/deities.json'), 'utf8'));
const systems = JSON.parse(readFileSync(join(root, 'src/data/divination-systems.json'), 'utf8'));
const systemName = new Map(systems.map((s) => [s.id, s.name]));

/** 共用外框：暖紙底＋硃紅頂邊與左邊條＋右下角出處小字。 */
const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <style>
    .lbl  { font-family:'Noto Serif CJK TC','Noto Serif TC',serif; font-size:30px; fill:${C.inkSoft}; }
    .tag  { font-family:'Noto Serif CJK TC','Noto Serif TC',serif; font-size:28px; fill:${C.paper2}; }
    .ln   { font-family:'Noto Serif CJK TC','Noto Serif TC',serif; font-weight:700; fill:${C.ink}; }
    .nm   { font-family:'Noto Serif CJK TC','Noto Serif TC',serif; font-weight:700; fill:${C.ink}; }
    .sub  { font-family:'Noto Serif CJK TC','Noto Serif TC',serif; font-size:36px; fill:${C.inkSoft}; }
    .mark { font-family:'Noto Serif CJK TC','Noto Serif TC',serif; font-size:26px; fill:${C.gold}; }
  </style>
  <rect width="1200" height="675" fill="${C.paper}"/>
  <rect x="0" y="0" width="1200" height="16" fill="${C.accent}"/>
  <rect x="0" y="16" width="18" height="659" fill="${C.accent}"/>
  ${inner}
  <text x="1140" y="637" class="mark" text-anchor="end">folk.tw</text>
</svg>`;

/**
 * 吉凶徽章（127/215 有；查無者不畫）。
 * 放右上角而不是籤詩下方：215 籤全是 4 句、句長全 ≤7 字，版面應該張張一致，
 * 但徽章若佔掉底部，有吉凶的卡就得把四句縮一級 → 同一批卡兩種字級。
 * 移到右上後四句永遠吃滿高度，順便補掉右側大片留白。
 */
const fortuneBadge = (fortune, y) => {
  if (!fortune) return '';
  const w = Math.round(44 + visualWidth(fortune) * 28);
  const x = 1140 - w;
  return `<rect x="${x}" y="${y}" width="${w}" height="46" rx="8" fill="${C.accent}"/>
  <text x="${x + 22}" y="${y + 33}" class="tag">${esc(fortune)}</text>`;
};

export function poemCardSvg(p) {
  const sys = systemName.get(p.system) ?? '';
  const label = p.ganzhi ?? p.title ?? '';
  const head = [sys, `第 ${p.no} 籤`, label].filter(Boolean).join('　·　');
  const lines = (p.lines ?? []).slice(0, 4);

  // 版面高度是固定的 675，所以**行距由可用高度反推**，不從字級推——
  // 反過來做（gap = size × 係數）在四句時會把最後一句推到卡片外，
  // 或讓標題與第一句的字身重疊（初版就是這樣：標題 baseline 140、第一句 76px 從 134 起）。
  const FIRST = 248; // 第一句 baseline：與標題（y=144）之間留得下一個字身
  const LAST = 578; // 最後一句 baseline：與右下角出處小字（y=637）不打架
  const gap = lines.length > 1 ? Math.floor((LAST - FIRST) / (lines.length - 1)) : 0;

  // 字級取「句長容得下」與「行距容得下」兩者較小的——只看句長會讓四句黏在一起。
  const widest = Math.max(...lines.map(visualWidth), 1);
  const byWidth = widest <= 7 ? 76 : widest <= 9 ? 66 : widest <= 12 ? 56 : 48;
  const size = lines.length > 1 ? Math.min(byWidth, Math.floor(gap * 0.72)) : byWidth;

  const top = lines.length > 1 ? FIRST : 330; // 單句（少數籤系）整組居中
  const bottom = top + (lines.length - 1) * gap;

  const lineEls = lines
    .map((ln, i) => `<text x="96" y="${top + i * gap}" class="ln" font-size="${size}px">${esc(ln)}</text>`)
    .join('\n  ');

  return frame(`${uniqueMotif(p.id, { x: 820, y: 168, width: 300, height: 405, variant: 'poem' })}
  <rect x="60" y="104" width="6" height="${bottom - 68}" fill="${C.gold}"/>
  <text x="96" y="144" class="lbl">${esc(head)}</text>
  ${fortuneBadge(p.fortune, 110)}
  ${lineEls}`);
}

export function deityCardSvg(d) {
  const nameUnits = visualWidth(d.name);
  const size = nameUnits <= 4 ? 118 : nameUnits <= 6 ? 104 : nameUnits <= 8 ? 92 : 80;
  const nameLines = wrap(d.name, Math.floor(1010 / size)).slice(0, 2);

  const alias = (d.aliases ?? []).find((a) => a !== d.name) ?? '';
  const sub = [alias, d.category].filter(Boolean).join('　·　');
  const office = (d.office ?? []).length ? `職司　${d.office.join('、')}` : '';
  // 聖誕：只取 kind==='聖誕' 且格式合法者；飛昇／得道等其他 kind 不當聖誕用。
  const b = (d.birthday_lunar ?? []).find((x) => x.kind === '聖誕' && /^\d{2}-\d{2}$/.test(x.date));
  const bday = b ? `聖誕　${lunarDateLabel(b.date)}` : '';

  const extras = [office, bday].filter(Boolean);
  let y = extras.length ? (nameLines.length > 1 ? 236 : 288) : nameLines.length > 1 ? 272 : 326;
  const nameEls = nameLines
    .map((ln, i) => `<text x="96" y="${y + i * (size + 14)}" class="nm" font-size="${size}px">${esc(ln)}</text>`)
    .join('\n  ');
  const afterName = y + (nameLines.length - 1) * (size + 14);
  const subY = afterName + 72;
  const barTop = Math.round(y - size * 0.9);

  const extraEls = extras
    .map((t, i) => `<text x="96" y="${subY + 76 + i * 60}" class="sub">${esc(wrap(t, 26)[0] ?? '')}</text>`)
    .join('\n  ');

  return frame(`${uniqueMotif(d.id, { x: 820, y: 110, width: 300, height: 490, variant: 'deity' })}
  <rect x="60" y="${barTop}" width="6" height="${Math.round(subY + 12 - barTop)}" fill="${C.gold}"/>
  ${nameEls}
  ${sub ? `<text x="96" y="${subY}" class="sub">${esc(sub)}</text>` : ''}
  ${extraEls}`);
}

async function write(svg, outDir, id) {
  mkdirSync(outDir, { recursive: true });
  const png = await toPng(svg);
  writeFileSync(join(outDir, `${id}.png`), png);
  return png.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`字型：${assertCjkFont()}`);
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outRoot = outIdx >= 0 ? args[outIdx + 1] : join(root, 'dist', 'og');
  const sampleIdx = args.indexOf('--sample');
  const only = sampleIdx >= 0 ? new Set(args.slice(sampleIdx + 1).filter((a) => !a.startsWith('--'))) : null;

  let bytes = 0;
  let nPoems = 0;
  let nDeities = 0;
  let withFortune = 0;
  let withOffice = 0;
  let withBday = 0;

  for (const p of poems) {
    if (only && !only.has(p.id)) continue;
    bytes += await write(poemCardSvg(p), join(outRoot, 'poems'), p.id);
    nPoems++;
    if (p.fortune) withFortune++;
  }
  for (const d of deities) {
    if (only && !only.has(d.id)) continue;
    bytes += await write(deityCardSvg(d), join(outRoot, 'deities'), d.id);
    nDeities++;
    if ((d.office ?? []).length) withOffice++;
    if ((d.birthday_lunar ?? []).some((x) => x.kind === '聖誕' && /^\d{2}-\d{2}$/.test(x.date))) withBday++;
  }

  console.log(
    `✓ 產出 ${nPoems + nDeities} 張分享卡 → ${outRoot}（共 ${(bytes / 1048576).toFixed(1)} MB）\n` +
      `  籤詩 ${nPoems} 張（其中 ${withFortune} 張有吉凶，其餘正確不畫該徽章）\n` +
      `  神明 ${nDeities} 張（其中 ${withOffice} 張有職司、${withBday} 張有聖誕，查無者不硬湊）`,
  );
}
