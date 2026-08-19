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

import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
// 🔴 資料集寫入、旗標解析、來源標註**一律走這支**（唯一入口，見其檔頭）。
import { attachSource, cliFlags, commitDataset } from './lib/dataset-commit.mjs';

const IN = '/root/.config/folk-tw/intake/inbox/photos';
const OUT_DIR = 'public/moi';
const DEITIES = 'src/data/deities.json';
const TEMPLES = 'src/data/temples.json';
const CAND = [
  { file: 'docs/knowledge-photo-candidates.json', kind: 'deity', idField: 'deity_id', prefix: 'deity' },
  { file: 'docs/temple-photo-candidates.json', kind: 'temple', idField: 'temple_id', prefix: 'temple' },
];
// 🔴 旗標一律從這裡讀（含 --json）。抽出前 --write 與 --json 各自直接翻 process.argv。
const flags = cliFlags();
const WRITE = flags.write;

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
// ⚠️ 候選檔是**會自己清空的工作佇列**（它的定義是「該尊尚無圖」），所以匯入成功後重跑
//    產生器，候選就會變 0 筆——那是對的，但也代表**本檔的 meta 配對只在佇列還滿的時候成立**。
//    匯入後的權威記錄是 deities.json／temples.json 的 `image`（author／author_role／
//    license／source 都在那裡），不是候選檔。要重建候選，重跑 import-knowledge-deities.mjs
//    --photos（它讀的是 inbox 的原始 HTML，那份還在）。
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

// 抓回來的檔**不保證是圖**：來源若用 302 導到一個 200 的 HTML 錯誤頁，
// 那個頁面會超過 min_bytes 而被當成合格檔存進 inbox（台灣端 2026-08-07 指出的縫）。
// inbox 是 write-only、**存進去就刪不掉**，所以這裡自己認 magic bytes，
// 不是圖就跳過並報數——不能讓 sharp 在中途丟例外，那會讓整批匯入停在一半。
const MAGIC = [
  { name: 'jpeg', b: [0xff, 0xd8, 0xff] },
  { name: 'png', b: [0x89, 0x50, 0x4e, 0x47] },
  { name: 'gif', b: [0x47, 0x49, 0x46, 0x38] },
  { name: 'webp', b: [0x52, 0x49, 0x46, 0x46] }, // RIFF；第 8..11 是 WEBP，下面再驗
  { name: 'bmp', b: [0x42, 0x4d] },
];
const sniff = (buf) => {
  const hit = MAGIC.find((m) => m.b.every((x, i) => buf[i] === x));
  if (!hit) return null;
  if (hit.name === 'webp' && buf.subarray(8, 12).toString('latin1') !== 'WEBP') return null;
  return hit.name;
};

const stat = { seen: 0, noMeta: 0, alreadyImported: 0, noPhotographer: 0, hasImage: 0, noTarget: 0, notImage: 0, written: 0 };
const notImageKeys = [];
if (WRITE) mkdirSync(join(OUT_DIR, 'deities'), { recursive: true });
if (WRITE) mkdirSync(join(OUT_DIR, 'temples'), { recursive: true });

for (const f of files.sort()) {
  stat.seen++;
  const buf = readFileSync(join(IN, f));
  if (!sniff(buf)) { stat.notImage++; notImageKeys.push(f); continue; }
  const key = f.replace(/\.[A-Za-z0-9]+$/, '');
  const m = meta.get(key) ?? meta.get(f);
  if (!m) {
    // 候選檔查無此 key，有兩種完全不同的情況，**不可以混報**：
    //   ① 這張圖早就匯入過了 → 候選佇列自己排空（它的定義是「該尊尚無圖」），所以查不到。
    //      這是正常狀態，報成問題會讓 intake-status 的「待匯入」段天天喊假警報，
    //      而會叫錯的狼會訓練人忽略整段（2026-08-08 加這段檢查的理由）。
    //   ② 真的來路不明的檔 → 那才要報。
    // 判準：從 key 反推目標（`deity-<id>` / `temple-<id>`），看它是不是已經掛著 /moi/ 的圖。
    const mk = key.match(/^(deity|temple)-(.+)$/);
    const already = mk
      ? /^\/moi\//.test(((mk[1] === 'deity' ? deityById : templeById).get(mk[2])?.image?.src) ?? '')
      : false;
    if (already) stat.alreadyImported++;
    else stat.noMeta++;
    continue;
  }

  // 🔴 沒有攝影者就不採用——姓名表示是著作人格權，掛一張沒署名的圖比沒圖糟。
  const author = String(m.photographer ?? '').trim();
  if (!author) { stat.noPhotographer++; continue; }

  const target = m.kind === 'deity' ? deityById.get(m.id) : templeById.get(m.id);
  if (!target) { stat.noTarget++; continue; }
  if (target.image && target.image.src) { stat.hasImage++; continue; }

  const rel = `/moi/${m.kind === 'deity' ? 'deities' : 'temples'}/${m.id}.webp`;
  if (WRITE) {
    await sharp(buf).rotate().resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 82 }).toFile(`public${rel}`);
  }
  target.image = {
    src: rel,
    alt: String(m.alt ?? '').trim() || `${target.name}`,
    author,
    author_role: String(m.credit_role ?? '').trim() || '攝',
    license: LICENSE,
    source: m.page,
  };
  // 掛源：授權條件就是標示資料來源連結。
  // ref 內含每張各異的來源頁網址 → 用 dedupeBy 只比那段（見 lib/dataset-commit.mjs 檔頭 ⑤）。
  attachSource(target, {
    ref: `內政部全國宗教資訊網·照片（${author}${String(m.credit_role ?? '').trim() || '攝'}） ${m.page}`,
    note: '照片；2026-08-06 經內政部同意使用，條件為標示資料來源連結',
  }, { dedupeBy: m.page });
  stat.written++;
}

// --json：給 scripts/intake-status.mjs 的「待匯入」段消費（契約見 import-temple-history.mjs）。
if (flags.json) {
  console.log(JSON.stringify({
    read: stat.seen,
    pending: { 代表圖: stat.written },
    // 這兩個不是「待匯入」而是「收到但不能用」，狀態報告要分開講，別混在一起。
    blocked: { 無署名: stat.noPhotographer, 非圖檔: stat.notImage, 來路不明: stat.noMeta },
    already: stat.alreadyImported,
  }));
  process.exit(0);
}
console.log(`\n照片匯入：inbox 有 ${stat.seen} 個檔`);
console.log(`  寫入 ${stat.written}｜已有圖不覆寫 ${stat.hasImage}`);
console.log(`  先前已匯入 ${stat.alreadyImported}（候選佇列已排空，正常）`);
console.log(`  略過：候選檔查無此 key ${stat.noMeta}｜**無攝影者姓名** ${stat.noPhotographer}｜對象不存在 ${stat.noTarget}｜非圖檔 ${stat.notImage}`);
if (stat.notImage) {
  console.log(`  ⚠️ 這些檔的 magic bytes 不是圖（多半是被 302 導去的 HTML 頁），已跳過：`);
  for (const k of notImageKeys.slice(0, 8)) console.log(`     ${k}`);
}
if (stat.noPhotographer) console.log('  ⚠️ 無攝影者者一律不採用（姓名表示是著作人格權）。');

// 兩個資料集各自提交；收尾那句話是本檔自己的（還要提圖片落點），故兩邊都不印 note。
for (const [path, data] of [[DEITIES, deities], [TEMPLES, temples]]) {
  commitDataset({ path, data, write: WRITE, dryNote: null, doneNote: null });
}
if (!WRITE) {
  console.log('\n（乾跑，未寫檔也未轉圖。加 --write 才實際執行。）');
  process.exit(0);
}
console.log(`\n✓ 已寫回 ${DEITIES}、${TEMPLES}，圖片轉存於 ${OUT_DIR}/`);
