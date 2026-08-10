const INTENT_LABELS = {
  temple_name: '廟名',
  region_temple: '地區＋廟名',
  region_deity: '地區＋神明',
  festival_service: '祭典／服務',
  other: '其他',
};

const SERVICE_RE = /(祭典|慶典|廟會|遶境|繞境|進香|刈香|暗訪|普渡|醮典|建醮|法會|安太歲|點燈|光明燈|收驚|問事|祭改|補運|求籤|籤詩|擲筊|拜拜|怎麼拜|開放時間|營業時間|參拜時間|活動|聖誕|千秋)/;

export const POSITION_BUCKETS = ['1–3', '4–10', '11–20', '21+'];

export function normalizeSearchText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/臺/g, '台')
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

function uniqueUseful(values) {
  return [...new Set(values.map(normalizeSearchText).filter((value) => value.length >= 2))];
}

export function templeProfile(temple, deity, commonName = temple.name) {
  const county = normalizeSearchText(temple.district).match(/^(.+?[縣市])/u)?.[1] ?? '';
  const afterCounty = normalizeSearchText(temple.district).slice(county.length);
  const township = afterCounty.match(/^(.+?[區鄉鎮市])/u)?.[1] ?? '';

  return {
    id: temple.id,
    names: uniqueUseful([temple.name, commonName]),
    regions: uniqueUseful([
      county,
      county.replace(/[縣市]$/u, ''),
      township,
      township.replace(/[區鄉鎮市]$/u, ''),
    ]),
    deities: uniqueUseful([
      temple.main_deity_raw,
      deity?.name,
      ...(deity?.aliases ?? []),
    ]),
  };
}

function longestContained(text, candidates) {
  return candidates
    .filter((candidate) => text.includes(candidate))
    .sort((a, b) => b.length - a.length)[0] ?? '';
}

export function classifyQuery(query, profile) {
  const text = normalizeSearchText(query);
  if (SERVICE_RE.test(text)) return 'festival_service';

  const matchedName = longestContained(text, profile.names);
  if (matchedName) {
    const remainder = text.replace(matchedName, '');
    if (profile.regions.some((region) => remainder.includes(region))) return 'region_temple';
    return 'temple_name';
  }

  const hasRegion = profile.regions.some((region) => text.includes(region));
  const hasDeity = profile.deities.some((deity) => text.includes(deity));
  if (hasRegion && hasDeity) return 'region_deity';
  return 'other';
}

export function positionBucket(position) {
  const value = Number(position);
  if (value <= 3) return '1–3';
  if (value <= 10) return '4–10';
  if (value <= 20) return '11–20';
  return '21+';
}

export function templeIdFromPage(page) {
  try {
    const pathname = new URL(page).pathname;
    const match = pathname.match(/^\/temples\/([^/]+)\/?$/u);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function emptyStats(intent = '', bucket = '') {
  return {
    intent,
    intentLabel: INTENT_LABELS[intent] ?? intent,
    positionBucket: bucket,
    clicks: 0,
    impressions: 0,
    weightedPosition: 0,
    ctr: 0,
    queries: new Set(),
    pages: new Set(),
    examples: [],
    _positionNumerator: 0,
  };
}

function addRow(stats, row) {
  const clicks = Number(row.clicks) || 0;
  const impressions = Number(row.impressions) || 0;
  const position = Number(row.position) || 0;
  stats.clicks += clicks;
  stats.impressions += impressions;
  stats._positionNumerator += position * impressions;
  stats.queries.add(row.query);
  stats.pages.add(row.page);
  stats.examples.push({
    query: row.query,
    page: row.page,
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position,
  });
}

function finishStats(stats, exampleLimit) {
  stats.ctr = stats.impressions ? stats.clicks / stats.impressions : 0;
  stats.weightedPosition = stats.impressions ? stats._positionNumerator / stats.impressions : 0;
  stats.queryCount = stats.queries.size;
  stats.pageCount = stats.pages.size;
  stats.examples.sort((a, b) => b.impressions - a.impressions || a.ctr - b.ctr);
  stats.examples = stats.examples.slice(0, exampleLimit);
  delete stats._positionNumerator;
  delete stats.queries;
  delete stats.pages;
  return stats;
}

export function aggregateTempleCohorts(rows, profiles, options = {}) {
  const exampleLimit = options.exampleLimit ?? 5;
  const minImpressions = options.minImpressions ?? 100;
  const maxRelativeCtr = options.maxRelativeCtr ?? 0.75;
  const groups = new Map();
  const benchmarks = new Map();
  let skippedNonDetail = 0;
  let skippedUnknownTemple = 0;
  const accepted = [];
  const acceptedPages = new Set();

  for (const row of rows) {
    const templeId = templeIdFromPage(row.page);
    if (!templeId) {
      skippedNonDetail += 1;
      continue;
    }
    const profile = profiles.get(templeId);
    if (!profile) {
      skippedUnknownTemple += 1;
      continue;
    }
    const intent = classifyQuery(row.query, profile);
    const bucket = positionBucket(row.position);
    const enriched = { ...row, intent, bucket };
    accepted.push(enriched);
    acceptedPages.add(row.page);

    const key = `${intent}|${bucket}`;
    if (!groups.has(key)) groups.set(key, emptyStats(intent, bucket));
    addRow(groups.get(key), enriched);
    if (!benchmarks.has(bucket)) benchmarks.set(bucket, emptyStats('all', bucket));
    addRow(benchmarks.get(bucket), enriched);
  }

  const benchmarkRows = [...benchmarks.values()].map((stats) => finishStats(stats, 0));
  const benchmarkByBucket = new Map(benchmarkRows.map((row) => [row.positionBucket, row]));
  const cohorts = [...groups.values()]
    .map((stats) => finishStats(stats, exampleLimit))
    .map((cohort) => {
      const benchmarkCtr = benchmarkByBucket.get(cohort.positionBucket)?.ctr ?? 0;
      const relativeCtr = benchmarkCtr ? cohort.ctr / benchmarkCtr : null;
      return {
        ...cohort,
        benchmarkCtr,
        relativeCtr,
        actionable:
          cohort.impressions >= minImpressions &&
          benchmarkCtr > 0 &&
          cohort.ctr < benchmarkCtr * maxRelativeCtr,
      };
    })
    .sort((a, b) =>
      POSITION_BUCKETS.indexOf(a.positionBucket) - POSITION_BUCKETS.indexOf(b.positionBucket) ||
      b.impressions - a.impressions,
    );

  return {
    cohorts,
    benchmarks: benchmarkRows.sort(
      (a, b) => POSITION_BUCKETS.indexOf(a.positionBucket) - POSITION_BUCKETS.indexOf(b.positionBucket),
    ),
    actionable: cohorts.filter((row) => row.actionable).sort((a, b) => b.impressions - a.impressions),
    acceptedRows: accepted.length,
    acceptedPages: acceptedPages.size,
    skippedNonDetail,
    skippedUnknownTemple,
  };
}

/** GSC Search Analytics 的 rowLimit 上限是 25,000；持續翻頁直到短頁或空頁。 */
export async function fetchAllGscRows(queryFn, siteUrl, body, options = {}) {
  const pageSize = Math.min(25_000, Math.max(1, options.pageSize ?? 25_000));
  const maxRows = Math.max(pageSize, options.maxRows ?? 1_000_000);
  const rows = [];
  let pages = 0;
  let exhausted = false;

  while (rows.length < maxRows) {
    const response = await queryFn(siteUrl, {
      ...body,
      rowLimit: Math.min(pageSize, maxRows - rows.length),
      startRow: rows.length,
    });
    const pageRows = response.rows ?? [];
    pages += 1;
    rows.push(...pageRows);
    if (pageRows.length < pageSize) {
      exhausted = true;
      break;
    }
  }

  return { rows, pages, exhausted, truncated: !exhausted };
}

export { INTENT_LABELS };
