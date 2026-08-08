#!/usr/bin/env node
// 廟宇頁社群分享卡（og:image）產生器：每間廟一張 1200×630 PNG。
//
// 為什麼要做：分享廟宇連結給廟方（宮廟開發外撥流程）時，原本 12,018 頁共用同一張
// `public/og.png`＝神酷品牌卡，廟方主委看到的是別人的招牌而不是自己的廟。
// 改為每間廟一張，**卡面完全不出現神酷或 folk.tw 字樣**（用戶要求）。
//
// 事實鐵則：卡面所有文字皆取自 temples.json／deities.json 既有欄位，**絕不杜撰**。
//   第一行＝廟名；第二行＝縣市鄉鎮 · 主祀神；
//   第三行（有才出現）＝主要祭典（main_festival，21 間）或「○○聖誕」（7,424 間＝94.1%）。
//   措辭界線見下方 recentActivity() 的註解——**標籤寫「聖誕」而非「近期活動」是刻意的**。
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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { C, esc, visualWidth, wrap, assertCjkFont, toPng } from './lib/og-card.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const { templeCounty, templeTownship } = await import(join(root, 'src/lib/temple-region.ts'));
const { lunarDateLabel, lunarToNextSolar, solarMd } = await import(join(root, 'src/lib/lunar-date.ts'));
const { pickMainFestival, festivalCardLine } = await import(join(root, 'src/lib/temple-festival.ts'));

const temples = JSON.parse(readFileSync(join(root, 'src/data/temples.json'), 'utf8'));
const deities = JSON.parse(readFileSync(join(root, 'src/data/deities.json'), 'utf8'));
const deityById = new Map(deities.map((d) => [d.id, d]));

/**
 * 卡面第二行：兩層，皆為既有資料，查無則回 null（→ 只顯示廟名／地區／主祀神）。
 *
 * 1) `main_festival`（21/7891 間）→ 標籤「主要祭典」＝該廟已查證的祭典。
 * 2) 主祀神聖誕（**7,424/7891 間＝94.1%**）→ 標籤「○○聖誕」。
 *
 * ⚠️ 標籤措辭是刻意的，不是隨便寫：
 *   ・標「近期活動：農曆三月廿三」＝**替廟方宣稱他們那天有辦活動**，我們沒有這個事實 → 杜撰。
 *   ・標「媽祖聖誕：農曆三月廿三（國曆 4/29）」＝陳述**神明的**聖誕日，不宣稱該廟辦什麼。
 * 台灣廟宇實務上年度主祭典就是主祀神聖誕（例祭日），主委看到日期自然知道所指，
 * 但頁面/卡片不替他們斷言。**改這段措辭前先想清楚上面這條界線**（2026-07-30 用戶討論後定案）。
 *
 * 為何不用「近期活動」欄位：實測公開資料裡沒有涵蓋全台 7,891 間的活動行事曆——
 * 全國宗教資訊網的慶(祭)典查詢擋境外 IP、nchdb 無公開 API、文化部藝文活動是表演展覽。
 * 詳見 docs/taiwan-host-handoff.md。
 */
export function recentActivity(t, todayIso) {
  if (t.main_festival) {
    const first = String(t.main_festival).split(/(?<=[。！？])/)[0].trim();
    if (first) return { label: '主要祭典', text: first };
  }
  // 2026-07-31：內政部慶(祭)典資料匯入後，2,498 間廟有了**自己登記的**年度祭典。
  // 它排在主祀神聖誕之前——外撥時主委看到的是自家廟的祭典，而不是全台同主祀神共用的神明生日。
  // 挑代表筆與措辭一律走 lib（頁面、gate 同一支），本檔不自行判斷。
  const own = pickMainFestival(t.festivals);
  if (own) {
    const line = festivalCardLine(own, todayIso);
    if (line.text) return line;
  }
  const d = t.main_deity_ref ? deityById.get(t.main_deity_ref) : null;
  const b = (d?.birthday_lunar ?? []).find((x) => x.kind === '聖誕' && /^\d{2}-\d{2}$/.test(x.date));
  if (!b) return null; // 城隍／太歲等 467 間無聖誕者：正確地不顯示，不硬湊
  const deityName = t.main_deity_raw ?? d?.name ?? '';
  const iso = todayIso ? lunarToNextSolar(b.date, todayIso) : null;
  return {
    label: `${deityName}聖誕`,
    text: iso ? `${lunarDateLabel(b.date)}（國曆 ${solarMd(iso)}）` : lunarDateLabel(b.date),
  };
}

export function cardSvg(t, todayIso) {
  const county = templeCounty(t.district);
  const township = templeTownship(t.district);
  const region = county ? `${county.name}${township?.name ?? ''}` : '';
  const mainDeity = t.main_deity_raw ?? (t.main_deity_ref ? deityById.get(t.main_deity_ref)?.name : '') ?? '';
  const act = recentActivity(t, todayIso);

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

export async function renderCard(t, outDir, todayIso) {
  const svg = cardSvg(t, todayIso);
  const png = await toPng(svg); // palette 16 色，勿降到 8（見 lib/og-card.mjs）
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${t.id}.png`), png);
  return png.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`字型：${assertCjkFont()}`);
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : join(root, 'dist', 'og', 'temples');
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());

  const sampleIdx = args.indexOf('--sample');
  let list = temples;
  if (sampleIdx >= 0) {
    const ids = args.slice(sampleIdx + 1).filter((a) => !a.startsWith('--'));
    list = temples.filter((t) => ids.includes(t.id));
    if (!list.length) { console.error(`找不到廟：${ids.join('、')}`); process.exit(1); }
  }

  let bytes = 0;
  let n = 0;
  let withFest = 0;
  let withBday = 0;
  for (const t of list) {
    const act = recentActivity(t, todayIso);
    if (act?.label === '主要祭典') withFest++;
    else if (act) withBday++;
    bytes += await renderCard(t, outDir, todayIso);
    if (++n % 1000 === 0) console.log(`  …${n}/${list.length}`);
  }
  console.log(
    `✓ 產出 ${n} 張分享卡 → ${outDir}（共 ${(bytes / 1048576).toFixed(1)} MB；` +
      `主要祭典 ${withFest} 張、主祀神聖誕 ${withBday} 張、僅廟名 ${n - withFest - withBday} 張）`,
  );
}
