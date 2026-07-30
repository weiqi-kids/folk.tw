#!/usr/bin/env node
// 廟宇頁社群分享卡（og:image）產生器：每間廟一張 1200×630 PNG。
//
// 為什麼要做：分享廟宇連結給廟方（宮廟開發外撥流程）時，原本 12,018 頁共用同一張
// `public/og.png`＝神酷品牌卡，廟方主委看到的是別人的招牌而不是自己的廟（實例見
// docs/og-share-card.md）。改為每間廟一張只寫「廟名／地區／主祀神／近期活動」的卡，
// **卡面完全不出現神酷或 folk.tw 字樣**（用戶要求）。
//
// 事實鐵則：卡面所有文字皆取自 temples.json 既有欄位，**絕不杜撰**。
//   卡面＝廟名／縣市鄉鎮／主祀神，**外加**已查證的主要祭典（main_festival，僅 21 間有）。
//   **沒有活動資料就只顯示名稱**（用戶 2026-07-30 指示）——不用主祀神聖誕充當「活動」，
//   因為聖誕是神明的生日、不是該廟的活動，且多數落在數月之後，對廟方沒有意義。
//
// 字型：系統 Noto Serif CJK TC（與站台 global.css 的 'Noto Serif TC' 明體同族）。
// 光柵化：sharp（已在 devDependencies）。SVG 走 librsvg，故顏色用 hex 而非 oklch。
// 壓縮：PNG palette 16 色＝10.4 KB/張（7,891 張約 80 MB）。**不可降到 8 色**——
//   實測量化器會拿硃紅去補文字抗鋸齒，廟名筆畫出現紅色雜邊。
//
// 用法：
//   node scripts/gen-og-temples.mjs --sample <id> [<id>...]   # 只產指定廟（存 dist/og/temples/）
//   node scripts/gen-og-temples.mjs                            # 全量（build 後跑，約 7.9k 張）
//   node scripts/gen-og-temples.mjs --out <dir>                # 指定輸出目錄
//
// 注意：全量會產出約 7.9k 個檔，故安排在 postbuild、輸出進 dist/ 而不進 repo。

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * 前置檢查：系統必須有中文字型，否則 librsvg 會把每個漢字畫成空框——
 * 而且**檔案照樣產得出來、不會報任何錯**，等於默默產出 7,891 張廢卡。
 * 故在這裡硬擋：對不到 CJK 字型就直接失敗。
 */
function assertCjkFont() {
  try {
    const out = execFileSync('fc-match', ['-f', '%{family}', 'Noto Serif CJK TC'], {
      encoding: 'utf8',
    });
    if (/CJK|Han|Hei|Ming|Song|WenQuanYi|Noto Serif TC/i.test(out)) return out.trim();
    throw new Error(`fc-match 回傳「${out}」，看起來不是中文字型`);
  } catch (e) {
    console.error(
      `✗ 找不到可用的中文字型，分享卡會整片變成空框，故中止。\n` +
        `  Ubuntu/Debian：sudo apt-get install -y fonts-noto-cjk\n` +
        `  詳情：${e.message}`,
    );
    process.exit(1);
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const { templeCounty, templeTownship } = await import(join(root, 'src/lib/temple-region.ts'));
// 註：卡面不放聖誕日期（見上），故不需 lunar-date 的換算。

const temples = JSON.parse(readFileSync(join(root, 'src/data/temples.json'), 'utf8'));
const deities = JSON.parse(readFileSync(join(root, 'src/data/deities.json'), 'utf8'));
const deityById = new Map(deities.map((d) => [d.id, d]));

// 站台設計 token（src/styles/variables.css 的 oklch 轉 hex；librsvg 對 oklch 支援不穩）
const C = {
  ink: '#221f1b',
  inkSoft: '#554f48',
  paper: '#f7f3eb',
  paper2: '#fefcf8',
  line: '#dcd3c1',
  accent: '#9a3835',
  gold: '#927846',
};

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 全形字寬約等於字級，半形約一半——用來估算換行與自動縮字級。 */
const visualWidth = (s) =>
  [...String(s)].reduce((n, ch) => n + (/[\x00-\x7F]/.test(ch) ? 0.55 : 1), 0);

/** 依視覺寬度斷行（不硬切詞：中文逐字、英數盡量不切）。 */
function wrap(s, maxUnits) {
  const out = [];
  let line = '';
  for (const ch of String(s)) {
    if (visualWidth(line + ch) > maxUnits && line) { out.push(line); line = ch; }
    else line += ch;
  }
  if (line) out.push(line);
  return out;
}

/**
 * 該廟的活動一行：**只認已查證的主要祭典**（main_festival，21/7891 間有）。
 * 查無則回 null → 卡面只顯示廟名／地區／主祀神。
 * 刻意不拿主祀神聖誕來填：那是神明生日、不是該廟的活動（用戶 2026-07-30 指示）。
 */
export function recentActivity(t) {
  if (!t.main_festival) return null;
  const first = String(t.main_festival).split(/(?<=[。！？])/)[0].trim();
  return first ? { label: '主要祭典', text: first } : null;
}

export function cardSvg(t) {
  const county = templeCounty(t.district);
  const township = templeTownship(t.district);
  const region = county ? `${county.name}${township?.name ?? ''}` : '';
  const mainDeity = t.main_deity_raw ?? (t.main_deity_ref ? deityById.get(t.main_deity_ref)?.name : '') ?? '';
  const act = recentActivity(t);

  // 廟名自動縮級＋斷行：短名最大 118px，長名降到 82px，超長再兩行。
  const nameUnits = visualWidth(t.name);
  const nameSize = nameUnits <= 5 ? 118 : nameUnits <= 7 ? 104 : nameUnits <= 9 ? 92 : 82;
  const nameLines = wrap(t.name, Math.floor(1010 / nameSize)).slice(0, 2);

  const subBits = [region, mainDeity ? `主祀${mainDeity}` : ''].filter(Boolean).join('　·　');

  // 無活動時廟名整組垂直居中（否則下半部大片空白，看起來像沒排版好）。
  let y = act ? (nameLines.length > 1 ? 232 : 286) : nameLines.length > 1 ? 268 : 322;
  const nameEls = nameLines
    .map((ln, i) => `<text x="96" y="${y + i * (nameSize + 14)}" class="nm">${esc(ln)}</text>`)
    .join('');
  const afterName = y + (nameLines.length - 1) * (nameSize + 14);

  const subY = afterName + 74;
  const actTop = subY + 54;
  // 金色細線與「廟名＋副標」整組對齊（原本固定 y=70 浮在頁首，無活動時視覺上會偏上）。
  const barTop = Math.round(y - nameSize * 0.9);
  const barH = Math.round(subY + 12 - barTop);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <style>
    .nm  { font-family:'Noto Serif CJK TC','Noto Serif TC',serif; font-weight:700; font-size:${nameSize}px; fill:${C.ink}; }
    .sub { font-family:'Noto Serif CJK TC','Noto Serif TC',serif; font-size:38px; fill:${C.inkSoft}; }
    .lbl { font-family:'Noto Serif CJK TC','Noto Serif TC',serif; font-size:28px; fill:${C.paper2}; }
    .act { font-family:'Noto Serif CJK TC','Noto Serif TC',serif; font-weight:700; font-size:40px; fill:${C.ink}; }
  </style>
  <rect width="1200" height="630" fill="${C.paper}"/>
  <rect x="0" y="0" width="1200" height="16" fill="${C.accent}"/>
  <rect x="0" y="16" width="18" height="614" fill="${C.accent}"/>
  <rect x="60" y="${barTop}" width="6" height="${barH}" fill="${C.gold}"/>
  ${nameEls}
  ${subBits ? `<text x="96" y="${subY}" class="sub">${esc(subBits)}</text>` : ''}
  ${
    act
      ? `<rect x="96" y="${actTop}" width="${Math.min(1010, 44 + visualWidth(act.label) * 28)}" height="46" rx="8" fill="${C.accent}"/>
  <text x="${96 + 22}" y="${actTop + 33}" class="lbl">${esc(act.label)}</text>
  <text x="96" y="${actTop + 118}" class="act">${esc(wrap(act.text, 25)[0] ?? '')}</text>
  ${wrap(act.text, 25)[1] ? `<text x="96" y="${actTop + 172}" class="act">${esc(wrap(act.text, 25)[1])}</text>` : ''}`
      : ''
  }
</svg>`;
}

export async function renderCard(t, outDir) {
  const svg = cardSvg(t);
  // palette 16 色：10.4 KB/張。勿降到 8 色（文字邊緣會出現硃紅雜邊，實測）。
  const png = await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, palette: true, colors: 16 })
    .toBuffer();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${t.id}.png`), png);
  return png.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`字型：${assertCjkFont()}`);
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : join(root, 'dist', 'og', 'temples');

  const sampleIdx = args.indexOf('--sample');
  let list = temples;
  if (sampleIdx >= 0) {
    const ids = args.slice(sampleIdx + 1).filter((a) => !a.startsWith('--'));
    list = temples.filter((t) => ids.includes(t.id));
    if (!list.length) { console.error(`找不到廟：${ids.join('、')}`); process.exit(1); }
  }

  let bytes = 0;
  let n = 0;
  let withAct = 0;
  for (const t of list) {
    if (recentActivity(t)) withAct++;
    bytes += await renderCard(t, outDir);
    if (++n % 1000 === 0) console.log(`  …${n}/${list.length}`);
  }
  console.log(
    `✓ 產出 ${n} 張分享卡 → ${outDir}（共 ${(bytes / 1048576).toFixed(1)} MB；其中 ${withAct} 張含主要祭典、${n - withAct} 張只顯示名稱）`,
  );
}
