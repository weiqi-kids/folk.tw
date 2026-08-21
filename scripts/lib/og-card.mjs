// 社群分享卡（og:image）的共用基元：色票、字寬估算、斷行、字型前置檢查、光柵化。
//
// 為什麼抽出來（2026-08-08）：原本這些只存在於 gen-og-temples.mjs。要再幫籤詩頁與神明頁
// 產卡時，複製一份就等於把**色票複製成兩份**——之後改品牌色只會改到一邊，
// 而且不會有任何紅燈（兩種卡各自都畫得出來，只是顏色不一樣）。
// 故收斂成單一來源，廟宇卡與內容卡都從這裡拿。
//
// ⚠️ 色值用 hex 不用 oklch：卡片是 SVG 交給 librsvg 光柵化，librsvg 對 oklch 支援不穩。
//    這是**唯一**允許寫死顏色的地方（check:design 掃的是 src/，不掃 scripts/），
//    值必須與 src/styles/variables.css 的 token 對應，改一邊就要改另一邊。

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

/** 站台設計 token（src/styles/variables.css 的 oklch 對應 hex）。 */
export const C = {
  ink: '#221f1b',
  inkSoft: '#554f48',
  paper: '#f7f3eb',
  paper2: '#fefcf8',
  line: '#dcd3c1',
  accent: '#9a3835',
  gold: '#927846',
};

export const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 全形字寬約等於字級，半形約一半——用來估算換行與自動縮字級。 */
export const visualWidth = (s) =>
  [...String(s)].reduce((n, ch) => n + (/[\x00-\x7F]/.test(ch) ? 0.55 : 1), 0);

/** 依視覺寬度斷行（不硬切詞：中文逐字、英數盡量不切）。 */
export function wrap(s, maxUnits) {
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
 * 內容卡的唯一紋樣：由資料 id 穩定推導，不依賴隨機數，也不添加未經來源支持的文字。
 *
 * 這個小圖騰有兩個目的：讓同一張模板上的不同內容仍是不同的 raster asset，
 * 以及在大卡面留下一個安靜的視覺錨點。所有可讀文字仍由各產圖器從既有資料欄位繪出。
 */
export function uniqueMotif(seed, { x = 820, y = 120, width = 300, height = 460, variant = 'card' } = {}) {
  const digest = createHash('sha256').update(String(seed)).digest();
  const palettes = [
    [C.accent, C.gold],
    [C.gold, C.accent],
    [C.inkSoft, C.gold],
    [C.accent, C.inkSoft],
  ];
  const [primary, secondary] = palettes[digest[0] % palettes.length];
  const cx = x + Math.round(width * (0.43 + (digest[1] % 20) / 100));
  const cy = y + Math.round(height * (0.42 + (digest[2] % 16) / 100));
  const baseR = Math.round(Math.min(width, height) * (0.22 + (digest[3] % 10) / 100));
  const ringCount = 3 + (digest[4] % 3);
  const rayCount = 7 + (digest[5] % 6);
  const rotate = digest[6] % 360;
  const dash = 8 + (digest[7] % 12);

  const rings = Array.from({ length: ringCount }, (_, i) => {
    const r = baseR - i * 21;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${i % 2 ? secondary : primary}" stroke-width="${i === 0 ? 5 : 3}" stroke-dasharray="${dash + i * 3} ${dash + 9 + i * 2}" opacity="${0.16 + i * 0.035}"/>`;
  }).join('');

  const rays = Array.from({ length: rayCount }, (_, i) => {
    const angle = ((i * 360) / rayCount + rotate) * (Math.PI / 180);
    const inner = baseR + 22;
    const outer = baseR + 54 + (digest[8 + (i % 8)] % 22);
    const x1 = (cx + Math.cos(angle) * inner).toFixed(1);
    const y1 = (cy + Math.sin(angle) * inner).toFixed(1);
    const x2 = (cx + Math.cos(angle) * outer).toFixed(1);
    const y2 = (cy + Math.sin(angle) * outer).toFixed(1);
    return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${secondary}" stroke-width="3" stroke-linecap="round" opacity=".22"/>`;
  }).join('');

  const dots = Array.from({ length: 12 }, (_, i) => {
    const px = x + 28 + ((digest[16 + i] * 3 + i * 19) % Math.max(40, width - 56));
    const py = y + 24 + ((digest[4 + i] * 5 + i * 31) % Math.max(40, height - 48));
    const r = 2 + (digest[20 + (i % 12)] % 4);
    return `<circle cx="${px}" cy="${py}" r="${r}" fill="${i % 3 ? secondary : primary}" opacity=".22"/>`;
  }).join('');

  // 64 個細小的二進位刻痕：不可讀、不改變內容，但讓每個 id 產生不同的可驗證像素指紋。
  const fingerprint = Array.from({ length: 64 }, (_, i) => {
    const bit = (digest[Math.floor(i / 8)] >> (i % 8)) & 1;
    const px = x + width - 112 + (i % 32) * 3;
    const py = y + height - 28 - Math.floor(i / 32) * 10;
    return `<rect x="${px}" y="${py - (bit ? 6 : 2)}" width="2" height="${bit ? 8 : 4}" fill="${i % 2 ? secondary : primary}" opacity=".34"/>`;
  }).join('');

  const center = variant === 'poem'
    ? `<path d="M${cx - 26} ${cy - 32}h52v64h-52z M${cx - 12} ${cy - 12}h24 M${cx - 12} ${cy + 4}h24" fill="none" stroke="${primary}" stroke-width="5" opacity=".32"/>`
    : variant === 'deity'
      ? `<path d="M${cx} ${cy - 38}l34 24v40l-34 20-34-20v-40z" fill="none" stroke="${primary}" stroke-width="5" opacity=".32"/>`
      : `<path d="M${cx - 28} ${cy}h56 M${cx} ${cy - 28}v56" stroke="${primary}" stroke-width="5" stroke-linecap="round" opacity=".32"/>`;

  return `<g aria-hidden="true" class="unique-motif">${rings}${rays}${dots}${center}${fingerprint}</g>`;
}

/**
 * 前置檢查：系統必須有中文字型，否則 librsvg 會把每個漢字畫成空框——
 * 而且**檔案照樣產得出來、不會報任何錯**，等於默默產出一整批廢卡。
 * 故在這裡硬擋：對不到 CJK 字型就直接失敗。
 */
export function assertCjkFont() {
  try {
    const out = execFileSync('fc-match', ['-f', '%{family}', 'Noto Serif CJK TC'], { encoding: 'utf8' });
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

/**
 * SVG → PNG。palette 16 色＝約 10 KB/張。
 * 🔴 勿降到 8 色——實測量化器會拿硃紅去補文字抗鋸齒，筆畫出現紅色雜邊。
 */
export async function toPng(svg) {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, colors: 16 }).toBuffer();
}
