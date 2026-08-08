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
