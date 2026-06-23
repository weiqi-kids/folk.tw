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
      item: `${SITE}${it.path}`,
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
