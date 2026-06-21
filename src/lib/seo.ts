// SEO / GEO 結構化資料輔助：BreadcrumbList 與實體 schema 產生器。
const SITE = 'https://folk.tw';

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

/** 神明實體（Thing）JSON-LD。 */
export function deityThing(d: {
  id: string;
  name: string;
  aliases?: string[];
  category: string;
  office?: string[];
  summary?: string;
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
  };
}
