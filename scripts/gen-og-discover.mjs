#!/usr/bin/env node
// 將站內既有的 SVG 通用視覺轉成 Discover／OG 可直接抓取的 1200×675 WebP。
// 這些不是 AI 生成的事實圖片，而是既有的抽象站內視覺；只作為沒有專屬照片或
// 社群文字卡的內容頁主視覺。文字、日期、來源仍由各頁正文與 JSON-LD 提供。
// 輸出在 dist，不進 repo；每次 postbuild 重建，避免手動拷貝造成路徑漂移。

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const outDir = join(ROOT, 'dist', 'og', 'discover');
const visuals = {
  'qian-slips': 'qian-slips.svg',
  'prayer-light': 'prayer-light.svg',
  'calendar-compass': 'calendar-compass.svg',
  'medicine-manuscript': 'medicine-manuscript.svg',
  'zodiac-wheel': 'zodiac-wheel.svg',
};

mkdirSync(outDir, { recursive: true });
for (const [slug, file] of Object.entries(visuals)) {
  await sharp(join(ROOT, 'public', 'visuals', file))
    .resize(1200, 675, { fit: 'cover', position: 'centre' })
    .webp({ quality: 90 })
    .toFile(join(outDir, `${slug}.webp`));
}

console.log(`✓ 產出 ${Object.keys(visuals).length} 張通用 Discover 主視覺 → ${outDir}`);
