// SEO / GEO 結構化資料輔助：BreadcrumbList 與實體 schema 產生器。
const SITE = 'https://folk.tw';

/** 共用 Organization（E-E-A-T，P2-7）：作為各實體的 publisher。 */
export const ORG = {
  '@type': 'Organization',
  name: '神酷',
  alternateName: '神庫',
  url: SITE,
  sameAs: ['https://github.com/weiqi-kids/folk.tw'],
};

/** BreadcrumbList JSON-LD。items：[{name, path}]，path 為站內路徑（如 /poems）。 */
export function breadcrumb(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE}${it.path.endsWith('/') ? it.path : `${it.path}/`}`,
    })),
  };
}

/** FAQPage JSON-LD（AEO，P1-4）。過濾空白問答；全空回傳 null（呼叫端略過）。 */
export function faqPage(items: { q: string; a: string }[]) {
  const mainEntity = items
    .map((it) => ({ q: it.q.trim(), a: it.a.trim() }))
    .filter((it) => it.q && it.a)
    .map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    }));
  if (!mainEntity.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity,
  };
}

/** 農民曆日期頁 BreadcrumbList（P0-1）：農民曆 → 該日期。 */
export function almanacBreadcrumb(date: string) {
  return breadcrumb([
    { name: '農民曆', path: '/almanac' },
    { name: date, path: `/almanac/${date}` },
  ]);
}

/** 神明實體（Thing）JSON-LD。 */
export function deityThing(d: {
  id: string;
  name: string;
  aliases?: string[];
  category: string;
  office?: string[];
  summary?: string;
  sameAs?: string[];
  birthday?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Thing',
    '@id': `${SITE}/deities/${d.id}`,
    name: d.name,
    ...(d.aliases?.length ? { alternateName: d.aliases } : {}),
    ...(d.summary ? { description: d.summary } : {}),
    additionalType: 'https://schema.org/Intangible',
    keywords: [d.category, ...(d.office ?? [])].join('、'),
    ...(d.sameAs?.length ? { sameAs: d.sameAs } : {}),
    url: `${SITE}/deities/${d.id}`,
    isPartOf: { '@type': 'Dataset', name: '神酷（神庫）', url: SITE },
    publisher: ORG,
  };
}

/** 儀節步驟（HowTo）JSON-LD（程序知識，AEO/GEO）。步驟 text 全空或有效步驟少於 2 回傳 null。 */
export function howTo(p: {
  name: string;
  description?: string;
  steps: { name?: string; text: string }[];
  supply?: string[];
  totalTime?: string;
}) {
  const step = p.steps
    .map((s) => ({ name: s.name, text: s.text.trim() }))
    .filter((s) => s.text)
    .map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      ...(s.name ? { name: s.name } : {}),
      text: s.text,
    }));
  if (step.length < 2) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: p.name,
    ...(p.description ? { description: p.description } : {}),
    ...(p.totalTime ? { totalTime: p.totalTime } : {}),
    step,
    ...(p.supply?.length
      ? { supply: p.supply.map((x) => ({ '@type': 'HowToSupply', name: x })) }
      : {}),
    publisher: ORG,
  };
}

/** 民俗活動（Event）JSON-LD。農曆/擲筊/未定日期不杜撰國曆 startDate，僅呼叫端傳真實 ISO 日期時才設。 */
export function eventThing(e: {
  name: string;
  description?: string;
  startDate?: string;
  location?: string;
  locationLat?: number;
  locationLng?: number;
  eventType?: string;
  url: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.name,
    url: e.url,
    ...(e.description ? { description: e.description } : {}),
    ...(e.startDate ? { startDate: e.startDate } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(e.location
      ? {
          location: {
            '@type': 'Place',
            name: e.location,
            ...(Number.isFinite(e.locationLat) && Number.isFinite(e.locationLng)
              ? {
                  geo: {
                    '@type': 'GeoCoordinates',
                    latitude: e.locationLat,
                    longitude: e.locationLng,
                  },
                }
              : {}),
          },
        }
      : {}),
    organizer: ORG,
  };
}

/** 廟宇（Place / PlaceOfWorship）JSON-LD。有座標時附 GeoCoordinates，利在地/地圖結果。 */
export function templePlace(t: {
  id: string;
  name: string;
  deity?: string; // 主祀神（原始文字）
  address?: string; // 地址或行政區
  lat?: number;
  lng?: number;
  website?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': ['Place', 'PlaceOfWorship'],
    '@id': `${SITE}/temples/${t.id}`,
    name: t.name,
    url: `${SITE}/temples/${t.id}`,
    ...(t.deity ? { description: `主祀${t.deity}` } : {}),
    ...(t.address ? { address: { '@type': 'PostalAddress', addressCountry: 'TW', streetAddress: t.address } } : {}),
    ...(Number.isFinite(t.lat) && Number.isFinite(t.lng)
      ? { geo: { '@type': 'GeoCoordinates', latitude: t.lat, longitude: t.lng } }
      : {}),
    ...(t.website ? { sameAs: [t.website] } : {}),
    isPartOf: { '@type': 'Dataset', name: '神酷（神庫）', url: SITE },
  };
}

/** 籤詩實體（CreativeWork）JSON-LD。 */
export function poemWork(p: {
  id: string;
  no: number;
  label: string; // 干支或籤題
  systemName: string;
  lines: string[];
  fortune?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    '@id': `${SITE}/poems/${p.id}`,
    name: `第 ${p.no} 籤 ${p.label}`,
    inLanguage: 'zh-Hant-TW',
    genre: '籤詩',
    isPartOf: { '@type': 'CreativeWorkSeries', name: p.systemName },
    text: p.lines.join('，'),
    ...(p.fortune ? { about: `吉凶：${p.fortune}` } : {}),
    isPartOfDataset: { '@type': 'Dataset', name: '神酷（神庫）', url: SITE },
    publisher: ORG,
  };
}
