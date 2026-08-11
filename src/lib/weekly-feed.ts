// 「神酷每週拜拜提醒」RSS 的內容組裝。
// 日期、節日與神明聖誕都沿用站內既有資料與換算函式；本檔只負責把每週資料整理成摘要，
// 不另建一份日期表，也不自行補寫查無來源的祭拜說法。

import festivalsData from '../data/festivals.json';
import practicesData from '../data/practices.json';
import { addDays } from './almanac/dates';
import { upcomingDeityBirthdays } from './birthdays';
import { festivalNextSolar, solarMd } from './lunar-date';
import { mondayOf, rssDateForTaipeiMonday } from './weekly-date';
import { releasedItems } from './release-schedule';

const SITE = 'https://folk.tw';
const practices = practicesData as Practice[];
const practiceById = new Map(practices.filter((p) => !p.draft).map((p) => [p.id, p]));

type Festival = {
  slug: string;
  name: string;
  lead: string;
  lunar_date?: string;
  solar_term?: string;
  date_note?: string;
  practice_refs: string[];
};

type Practice = {
  id: string;
  title: string;
  offerings: string[];
  taboo: string[];
  draft?: boolean;
};

export type WeeklyFeedItem = {
  weekStart: string;
  title: string;
  description: string;
  pubDate: string;
  guid: string;
};

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function dateRange(start: string, end: string): string {
  const sy = Number(start.slice(0, 4));
  const ey = Number(end.slice(0, 4));
  return sy === ey ? `${sy} 年 ${solarMd(start)}–${solarMd(end)}` : `${sy} 年 ${solarMd(start)}–${ey} 年 ${solarMd(end)}`;
}

export async function weeklyFeedItems(today: string, count = 8): Promise<WeeklyFeedItem[]> {
  const festivals = releasedItems(festivalsData as Festival[], today);
  const currentMonday = mondayOf(today);
  const items: WeeklyFeedItem[] = [];

  for (let offset = 0; offset < count; offset++) {
    const weekStart = addDays(currentMonday, -7 * offset);
    const weekEnd = addDays(weekStart, 6);
    const nextWeekStart = addDays(weekStart, 7);
    const nextWeekEnd = addDays(weekStart, 13);

    const thisFestivals = festivals
      .map((festival) => ({ festival, next: festivalNextSolar(festival, weekStart) }))
      .filter(({ next }) => next.iso !== null && next.iso <= weekEnd)
      .sort((a, b) => a.next.iso!.localeCompare(b.next.iso!));
    const nextFestivals = festivals
      .map((festival) => ({ festival, next: festivalNextSolar(festival, nextWeekStart) }))
      .filter(({ next }) => next.iso !== null && next.iso <= nextWeekEnd)
      .sort((a, b) => a.next.iso!.localeCompare(b.next.iso!));
    const birthdays = await upcomingDeityBirthdays(weekStart, 7);
    const headlineNames = thisFestivals.map(({ festival }) => festival.name).slice(0, 2);
    const title = headlineNames.length
      ? `${headlineNames.join('、')}｜${solarMd(weekStart)}–${solarMd(weekEnd)} 拜拜提醒`
      : `${solarMd(weekStart)}–${solarMd(weekEnd)} 神明聖誕與拜拜提醒`;

    const html: string[] = [
      `<p><strong>${esc(dateRange(weekStart, weekEnd))}</strong>。這份提醒只整理站內已有來源的節日與神明聖誕；各地、各廟作法可能不同，實際儀式仍以當地廟方公告為準。</p>`,
      '<h2>本週節慶</h2>',
    ];

    if (thisFestivals.length === 0) {
      html.push(`<p>本週沒有站內已考據的主要節日，可接著查看下方神明聖誕，或瀏覽<a href="${SITE}/festivals/">完整民俗節日曆</a>。</p>`);
    } else {
      for (const { festival, next } of thisFestivals) {
        html.push(
          `<h3><a href="${SITE}/festivals/${esc(festival.slug)}/">${esc(festival.name)}</a>｜國曆 ${esc(solarMd(next.iso!))}（${esc(next.label)}）</h3>`,
          `<p>${esc(festival.lead)}</p>`,
        );
        if (festival.date_note) html.push(`<p><strong>日期補充：</strong>${esc(festival.date_note)}</p>`);
      }

      const relatedPractices = [...new Set(thisFestivals.flatMap(({ festival }) => festival.practice_refs))]
        .map((id) => practiceById.get(id))
        .filter((practice): practice is Practice => !!practice);
      if (relatedPractices.length) {
        html.push('<h2>準備與注意事項</h2>');
        for (const practice of relatedPractices) {
          const offerings = practice.offerings.slice(0, 6);
          const taboos = practice.taboo.slice(0, 4);
          html.push(`<h3><a href="${SITE}/practices/${esc(practice.id)}/">${esc(practice.title)}</a></h3>`);
          if (offerings.length) html.push(`<p><strong>供品參考：</strong>${offerings.map(esc).join('、')}。</p>`);
          if (taboos.length) html.push(`<p><strong>常見注意：</strong>${taboos.map(esc).join('；')}。</p>`);
          html.push(`<p>完整祭拜順序、金紙與各地差異請看<a href="${SITE}/practices/${esc(practice.id)}/">${esc(practice.title)}條目</a>。</p>`);
        }
      }
    }

    html.push('<h2>本週神明聖誕</h2>');
    if (birthdays.length === 0) {
      html.push(`<p>本週資料庫沒有登記聖誕；可查看<a href="${SITE}/deities/birthdays/">全年神明聖誕曆</a>。</p>`);
    } else {
      html.push('<ul>');
      for (const birthday of birthdays) {
        const names = birthday.deities
          .map((deity) => `<a href="${SITE}/deities/${esc(deity.deityId)}/">${esc(deity.name)}</a>`)
          .join('、');
        html.push(`<li>國曆 ${esc(solarMd(birthday.iso))}（${esc(birthday.lunarLabel)}）：${names}</li>`);
      }
      html.push('</ul>');
    }

    if (nextFestivals.length) {
      html.push('<h2>下週先知道</h2><ul>');
      for (const { festival, next } of nextFestivals) {
        html.push(`<li>國曆 ${esc(solarMd(next.iso!))}（${esc(next.label)}）：<a href="${SITE}/festivals/${esc(festival.slug)}/">${esc(festival.name)}</a></li>`);
      }
      html.push('</ul>');
    }
    html.push(`<p><a href="${SITE}/festivals/">完整節日曆</a>｜<a href="${SITE}/deities/birthdays/">全年神明聖誕曆</a>｜<a href="${SITE}/practices/">拜拜習俗</a></p>`);

    items.push({
      weekStart,
      title,
      description: html.join('\n'),
      pubDate: rssDateForTaipeiMonday(weekStart),
      guid: `${SITE}/rss.xml?week=${weekStart}`,
    });
  }

  return items;
}

export function escapeXml(value: string): string {
  return esc(value);
}
