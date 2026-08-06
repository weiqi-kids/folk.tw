#!/usr/bin/env node
// 內政部照片 → `public/moi/` ＋ `deities.json`／`temples.json` 的 `image` 欄位。
//
// 授權（2026-08-06 內政部同意，**明確含照片**）：條件＝標示資料來源連結。
// 🔴 照片還多一層義務：內政部的圖說載明**攝影者姓名**（如「（廖吟梅攝）」），
//    那是著作人格權的姓名表示。本檔把攝影者寫進 `image.author`，
//    渲染層（詳情頁 figcaption，走 src/lib/image-credit.ts）必須顯示，check:rendered 會驗。
//    **攝影者查不到就不採用這張圖**——寧可沒圖，也不能掛一張沒署名的別人的作品。
//
// 🔴 不覆寫既有圖：67 尊神明與 27 間廟已有 Wikimedia Commons 授權圖，
//    那些授權更明確、也已在 /about 彙整。本檔只填空的。故可重複執行（idempotent）。
//
// 流程位置（第四段）：
//   ① import-knowledge-deities.mjs --photos → docs/knowledge-photo-candidates.json
//      import-temple-history.mjs --photos   → docs/temple-photo-candidates.json
//   ② gen-intake-urls-photos.mjs --write    → docs/intake-urls-photos.json
//   ③ 台灣端 photos job 抓回二進位 → inbox/photos/<key>
//   ④ **本檔**：轉檔進 public/moi/、寫回 JSON
//
// 轉檔：一律轉 webp（既有 public/deities/*.webp 就是這個慣例），用 sharp（devDependency，
// gen-og-temples.mjs 已在用）。原檔是 .JPG，直接搬會讓站上同時存在兩種慣例。
//
// 用法：
//   node scripts/import-photos.mjs            # 乾跑（預設）
//   node scripts/import-photos.mjs --write

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const IN = '/root/.config/folk-tw/intake/inbox/photos';
const OUT_DIR = 'public/moi';
const DEITIES = 'src/data/deities.json';
const TEMPLES = 'src/data/temples.json';
const CAND = [
  { file: 'docs/knowledge-photo-candidates.json', kind: 'deity', idField: 'deity_id', prefix: 'deity' },
  { file: 'docs/temple-photo-candidates.json', kind: 'temple', idField: 'temple_id', prefix: 'temple' },
];
const WRITE = process.argv.includes('--write');

const LICENSE = '內政部同意使用（2026-08-06）；條件為標示資料來源連結';

const files = existsSync(IN) ? readdirSync(IN).filter((f) => !/\.(sha256|meta\.json)$/.test(f)) : [];
if (!files.length) {
  console.log('尚未收到任何照片。');
  console.log(`  預期落點：${IN}/<key>`);
  console.log('  由 manifest 的 photos job（url_list 型）抓取。');
  console.log('  ⚠️ 那個 job 要等 docs/intake-urls-photos.json 產出後才可加進 manifest——');
  console.log('     清單不存在時加上去，台灣端抓清單會 404 而整個 job 停擺。');
  process.exit(0);
}

// 候選檔提供 alt／攝影者／來源頁，抓回來的檔只有 bytes。兩邊靠 key 對起來。
const meta = new Map();
for (const c of CAND) {
  if (!existsSync(c.file)) continue;
  for (const r of JSON.parse(readFileSync(c.file, 'utf8'))) {
    const id = r[c.idField];
    if (!id) continue;
    meta.set(`${c.prefix}-${String(id).replace(/[^A-Za-z0-9._-]/g, '_')}`, { ...r, kind: c.kind, id });
  }
}

let sharp;
try { ({ default: sharp } = await import('sharp')); } catch {
  console.error('✗ 找不到 sharp（devDependency）。先跑 pnpm install。');
  process.exit(1);
}

const deities = JSON.parse(readFileSync(DEITIES, 'utf8'));
const temples = JSON.parse(readFileSync(TEMPLES, 'utf8'));
const deityById = new Map(deities.map((d) => [d.id, d]));
const templeById = new Map(temples.map((t) => [t.id, t]));

const stat = { seen: 0, noMeta: 0, noPhotographer: 0, hasImage: 0, noTarget: 0, written: 0 };
if (WRITE) mkdirSync(join(OUT_DIR, 'deities'), { recursive: true });
if (WRITE) mkdirSync(join(OUT_DIR, 'temples'), { recursive: true });

for (const f of files.sort()) {
  stat.seen++;
  const key = f.replace(/\.[A-Za-z0-9]+$/, '');
  const m = meta.get(key) ?? meta.get(f);
  if (!m) { stat.noMeta++; continue; }

  // 🔴 沒有攝影者就不採用——姓名表示是著作人格權，掛一張沒署名的圖比沒圖糟。
  const author = String(m.photographer ?? '').trim();
  if (!author) { stat.noPhotographer++; continue; }

  const target = m.kind === 'deity' ? deityById.get(m.id) : templeById.get(m.id);
  if (!target) { stat.noTarget++; continue; }
  if (target.image && target.image.src) { stat.hasImage++; continue; }

  const rel = `/moi/${m.kind === 'deity' ? 'deities' : 'temples'}/${m.id}.webp`;
  if (WRITE) {
    const buf = readFileSync(join(IN, f));
    await sharp(buf).rotate().resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 82 }).toFile(`public${rel}`);
  }
  target.image = {
    src: rel,
    alt: String(m.alt ?? '').trim() || `${target.name}`,
    author,
    license: LICENSE,
    source: m.page,
  };
  // 掛源：授權條件就是標示資料來源連結。
  target.sources = target.sources ?? [];
  if (!target.sources.some((s) => String(s.ref ?? '').includes(m.page))) {
    target.sources.push({
      type: 'gov',
      ref: `內政部全國宗教資訊網·照片（${author}攝） ${m.page}`,
      note: '照片；2026-08-06 經內政部同意使用，條件為標示資料來源連結',
    });
  }
  stat.written++;
}

console.log(`\n照片匯入：inbox 有 ${stat.seen} 個檔`);
console.log(`  寫入 ${stat.written}｜已有圖不覆寫 ${stat.hasImage}`);
console.log(`  略過：候選檔查無此 key ${stat.noMeta}｜**無攝影者姓名** ${stat.noPhotographer}｜對象不存在 ${stat.noTarget}`);
if (stat.noPhotographer) console.log('  ⚠️ 無攝影者者一律不採用（姓名表示是著作人格權）。');

if (!WRITE) {
  console.log('\n（乾跑，未寫檔也未轉圖。加 --write 才實際執行。）');
  process.exit(0);
}
writeFileSync(DEITIES, JSON.stringify(deities, null, 2) + '\n');
writeFileSync(TEMPLES, JSON.stringify(temples, null, 2) + '\n');
console.log(`\n✓ 已寫回 ${DEITIES}、${TEMPLES}，圖片轉存於 ${OUT_DIR}/`);
