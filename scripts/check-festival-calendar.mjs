#!/usr/bin/env node
// 不需 build 的節日提醒 gate：全部節日須由 festivalNextSolar 同源產出可用 Google URL 與 ICS。

import { readFileSync } from 'node:fs';

const festivals = JSON.parse(readFileSync(new URL('../src/data/festivals.json', import.meta.url), 'utf8'));
const { FESTIVAL_OG_SLUGS } = await import('../src/lib/festival-og.ts');
const { festivalNextSolar } = await import('../src/lib/lunar-date.ts');
const { compactCalendarDate, festivalIcs, googleCalendarUrl, nextCalendarDay } = await import('../src/lib/festival-calendar.ts');

const fromIso = '2026-08-09';
const problems = [];

// 短月退日的國曆日與農曆標籤必須是同一個實際日期；不可把 9/10（七月廿九）
// 仍標成資料登錄的「七月三十」。同時鎖住一個有三十日的年份，避免修正過頭。
const dizang = festivals.find((festival) => festival.slug === 'dizang');
const shortMonth = festivalNextSolar(dizang ?? {}, '2026-01-01');
if (shortMonth.iso !== '2026-09-10' || shortMonth.label !== '農曆七月廿九') {
  problems.push(`2026 七月短月應為 2026-09-10／農曆七月廿九，實際 ${shortMonth.iso}／${shortMonth.label}`);
}
const fullMonth = festivalNextSolar({ lunar_date: '07-30' }, '2025-01-01');
if (fullMonth.iso !== '2025-09-21' || fullMonth.label !== '農曆七月三十') {
  problems.push(`2025 七月三十應保持 2025-09-21／農曆七月三十，實際 ${fullMonth.iso}／${fullMonth.label}`);
}

if (festivals.length !== 69) problems.push(`festivals.json 應有 69 筆（16 個既有頁＋52 個草稿頁＋1 個問題型深頁），目前為 ${festivals.length}`);
const draftWeeks = festivals.filter((festival) => Number.isInteger(festival.draft_week));
if (draftWeeks.length !== 52 || new Set(draftWeeks.map((festival) => festival.draft_week)).size !== 52) {
  problems.push(`draft_week 應完整涵蓋 1–52，目前為 ${draftWeeks.length} 筆`);
}
const festivalSlugs = new Set(festivals.map((festival) => festival.slug));
const ogSlugs = new Set(FESTIVAL_OG_SLUGS);
const missingOgSlugs = festivals.filter((festival) => !ogSlugs.has(festival.slug)).map((festival) => festival.slug);
const extraOgSlugs = FESTIVAL_OG_SLUGS.filter((slug) => !festivalSlugs.has(slug));
if (missingOgSlugs.length || extraOgSlugs.length || FESTIVAL_OG_SLUGS.length !== festivals.length) {
  problems.push(`OG／Discover slug 清單與 festivals.json 不一致（資料缺圖 ${missingOgSlugs.join(', ') || '無'}；清單多出 ${extraOgSlugs.join(', ') || '無'}）`);
}

for (const [slug, iso, label] of [
  ['september-solar-terms', '2026-09-07', '節氣白露'],
  ['zhongqiu', '2026-09-25', '農曆八月十五'],
  ['kinmen-bo-bing', '2026-09-25', '農曆八月十五'],
  ['kongzi-birthday', '2026-09-28', '國曆9月28日'],
]) {
  const actual = festivalNextSolar(festivals.find((festival) => festival.slug === slug) ?? {}, '2026-01-01');
  if (actual.iso !== iso || actual.label !== label) {
    problems.push(`${slug} 應為 ${iso}／${label}，實際 ${actual.iso}／${actual.label}`);
  }
}

let datedCount = 0;
let undatedCount = 0;
for (const festival of festivals) {
  const next = festivalNextSolar(festival, fromIso);
  if (!next.iso) {
    if (festival.date_status !== 'source_required') {
      problems.push(`${festival.slug} 無法產生日期但未標記 date_status=source_required`);
    }
    undatedCount++;
    continue;
  }
  if (festival.date_status === 'source_required') {
    problems.push(`${festival.slug} 已標記 date_status=source_required 卻產生了日期`);
  }
  datedCount++;
  const start = compactCalendarDate(next.iso);
  const end = compactCalendarDate(nextCalendarDay(next.iso));
  const google = new URL(googleCalendarUrl(festival, next.iso, next.label));
  if (google.origin !== 'https://calendar.google.com') problems.push(`${festival.slug} Google Calendar 網域錯誤`);
  if (google.searchParams.get('dates') !== `${start}/${end}`) problems.push(`${festival.slug} Google Calendar 日期不同源`);
  if (google.searchParams.get('text') !== festival.name) problems.push(`${festival.slug} Google Calendar 名稱不符`);

  const ics = festivalIcs(festival, next.iso, next.label);
  for (const required of [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', `UID:${festival.slug}-${start}@folk.tw`,
    `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, `URL:https://folk.tw/festivals/${festival.slug}/`,
    'END:VEVENT', 'END:VCALENDAR',
  ]) {
    if (!ics.includes(required)) problems.push(`${festival.slug} ICS 缺少 ${required}`);
  }
  if (!ics.endsWith('\r\n') || /(?<!\r)\n/.test(ics)) problems.push(`${festival.slug} ICS 未使用 CRLF`);
  for (const line of ics.split('\r\n')) {
    if (Buffer.byteLength(line, 'utf8') > 75) problems.push(`${festival.slug} ICS 行超過 75 bytes`);
  }
}

const page = readFileSync(new URL('../src/pages/festivals/[slug].astro', import.meta.url), 'utf8');
const endpoint = readFileSync(new URL('../src/pages/festivals/[slug].ics.ts', import.meta.url), 'utf8');
if (!page.includes('加入 Google Calendar') || !page.includes('下載 Apple／通用 .ics')) problems.push('節日頁缺少提醒 CTA');
if (!endpoint.includes('festivalNextSolar')) problems.push('ICS route 未使用 festivalNextSolar');

if (problems.length > 0) {
  console.error(`✗ 節日行事曆檢查失敗（${problems.length} 項）`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`✓ 節日行事曆檢查通過：${festivals.length} 筆節日資料（${datedCount} 筆有日期、${undatedCount} 筆待公告）；有日期頁的 Google Calendar／ICS 與 festivalNextSolar 同源。`);
