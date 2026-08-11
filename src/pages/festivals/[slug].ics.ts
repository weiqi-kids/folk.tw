import type { APIRoute, GetStaticPaths } from 'astro';
import festivals from '../../data/festivals.json';
import { festivalIcs } from '../../lib/festival-calendar';
import { festivalNextSolar } from '../../lib/lunar-date';
import { todayInTaipei } from '../../lib/daily';
import { releasedItems } from '../../lib/release-schedule';

export const prerender = true;

export const getStaticPaths = (() => {
  const { iso: today } = todayInTaipei();
  return releasedItems(festivals, today)
    .map((festival) => ({ festival, next: festivalNextSolar(festival, today) }))
    .filter((item): item is typeof item & { next: { iso: string; label: string } } => item.next.iso !== null)
    .map(({ festival, next }) => ({
      params: { slug: festival.slug },
      props: { festival, iso: next.iso, lunarLabel: next.label },
    }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const { festival, iso, lunarLabel } = props;
  return new Response(festivalIcs(festival, iso, lunarLabel), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="folk-tw-${festival.slug}-${iso}.ics"`,
    },
  });
};
