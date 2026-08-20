#!/usr/bin/env node
// Wikimedia Commons → 民俗文物分類頁的代表圖（`src/data/artifacts.json` 的 image）。
//
// 🔴 本 repo 的圖片鐵則，這支一律照辦：
//   ・**署名查不到就不採用**——寧可那一類沒有圖，也不掛一張沒有作者的別人作品。
//   ・只收 CC 系列與公有領域；其他授權（含 GFDL 這種需要隨附全文的）一律跳過。
//   ・**自存不熱連**：下載後轉 webp 存進 public/artifacts/，不從 Commons 直連。
//   ・逐張把作者·授權·出處寫進資料，`/about/` 的圖片來源清單會逐張列出（授權條件）。
//
// ⚠️ 這些是「分類的示意圖」，不是特定文物的照片——alt 與圖說都要照實說，
//    不可寫成「圖為某某文物」。頁面上的圖說由 [id].astro 負責。
//
// 用法：
//   node scripts/import-artifact-photos.mjs           # 乾跑（只列出挑到誰）
//   node scripts/import-artifact-photos.mjs --write   # 下載、轉檔、寫入資料

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const DATA = 'src/data/artifacts.json';
const OUTDIR = 'public/artifacts';
const WRITE = process.argv.includes('--write');
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'folk.tw artifact-photo importer (contact lightman.chang@gmail.com)';

// 🔴 **人工指定檔案，不用關鍵字自動挑。**
//    2026-08-20 實測：Commons 全文檢索即使加上主題字與臺灣優先，仍會挑出離題的圖
//    （漁具挑到媽祖像、工具挑到「竹籃裝漢堡」、藝師挑到英國木雕教本）。分類示意圖
//    掛錯比沒有更糟，所以改成逐類指定檔名；**沒有指定的分類就是沒有專屬照片**，
//    頁面退回站台識別圖並在圖說寫明那不是文物照片。
//    要新增一類的圖：先在 Commons 找到合授權（CC／PD）且有署名的檔案，把完整檔名填進來。
const CURATED = {
  attire: 'File:Chinese Ladies Footbinding Shoes QM r.jpg',
  furniture: 'File:Interior of the Lukang Folk Arts Museum-13.2023-07-13.jpg',
  fire: 'File:Bilian Temple, stone lantern, Shoufeng Township, Hualien County (Taiwan).jpg',
  fishing: 'File:小林村大武壠族魚笱.jpg',
  tools: 'File:內柵國民小學古物-046 0194.jpg',
  currency: 'File:100 yen banknote Taiwan 1933.jpg',
  architecture: 'File:保安宮龍柱 Dragon Pillars of Baoan Temple - panoramio.jpg',
  'opera-toys': 'File:台灣酬神布袋戲1.jpg',
  foodways: 'File:Traditional Taiwanese Food.jpg',
};

const OK_LICENSE = /^(CC0|CC BY|CC BY-SA|Public domain|PD)/i;
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function byTitle(title) {
  const url = `${API}?action=query&titles=${encodeURIComponent(title)}`
    + '&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200'
    + '&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl&format=json';
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const json = await res.json();
  const page = Object.values(json?.query?.pages ?? {})[0];
  const ii = page?.imageinfo?.[0];
  if (!ii?.thumburl) return null;
  const em = ii.extmetadata ?? {};
  return {
    title: String(page.title).replace(/^File:/, ''),
    thumb: ii.thumburl,
    author: strip(em.Artist?.value),
    license: strip(em.LicenseShortName?.value),
    license_url: strip(em.LicenseUrl?.value) || undefined,
    source: ii.descriptionurl,
  };
}

const data = JSON.parse(readFileSync(DATA, 'utf8'));
if (WRITE && !existsSync(OUTDIR)) mkdirSync(OUTDIR, { recursive: true });

const picked = [];
const skipped = [];
for (const cat of data.categories) {
  const title = CURATED[cat.id];
  if (!title) { skipped.push(cat.id); continue; }
  const info = await byTitle(title);
  if (!info) { console.log(`  ✗ ${cat.id}：${title} 抓不到`); skipped.push(cat.id); continue; }
  // 🔴 兩個必要條件，缺一不採用：作者可署名、授權在白名單內。
  if (!info.author) { console.log(`  ✗ ${cat.id}：${info.title} 查無署名，不採用`); skipped.push(cat.id); continue; }
  if (!OK_LICENSE.test(info.license)) { console.log(`  ✗ ${cat.id}：${info.title} 授權 ${info.license} 不在白名單`); skipped.push(cat.id); continue; }
  picked.push({ cat: cat.id, ...info });
  console.log(`  ✔ ${cat.id.padEnd(16)} ${info.title.slice(0, 40).padEnd(42)} ${info.license} / ${info.author.slice(0, 24)}`);
  await new Promise((r) => setTimeout(r, 250));
}
for (const s of skipped) console.log(`  ⏭ ${s}：未指定合授權圖片，這一類不掛專屬照片`);

if (!WRITE) {
  console.log(`\n（乾跑）可掛圖 ${picked.length} 類、跳過 ${skipped.length} 類。加 --write 才下載寫入。`);
  process.exit(0);
}

for (const p of picked) {
  const res = await fetch(p.thumb, { headers: { 'User-Agent': UA } });
  const buf = Buffer.from(await res.arrayBuffer());
  const out = `${OUTDIR}/${p.cat}.webp`;
  await sharp(buf).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 82 }).toFile(out);
  const cat = data.categories.find((c) => c.id === p.cat);
  cat.image = {
    src: `/artifacts/${p.cat}.webp`,
    alt: `${cat.title}示意圖：${p.title.replace(/\.[a-z]+$/i, '')}`,
    author: p.author,
    license: p.license,
    ...(p.license_url ? { license_url: p.license_url } : {}),
    source: p.source,
  };
  console.log(`  ↓ ${out}`);
}
writeFileSync(DATA, JSON.stringify(data, null, 2) + '\n');
console.log(`\n✓ ${picked.length} 類已掛圖，資料寫回 ${DATA}`);
