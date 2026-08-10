import { countyName, templeCounty, templeTownship } from '../../src/lib/temple-region.ts';

export const DEFAULT_DEMAND_THRESHOLDS = {
  minImpressions: 50,
  minClicks: 1,
  minTemples: 5,
};

export function queryEvidence(snapshot) {
  const rows = snapshot?.gsc?.demandEvidence ?? snapshot?.gsc?.topQueries ?? [];
  return rows.map((row) => ({
    query: String(row.query ?? '').trim(),
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    ctr: Number(row.ctr) || 0,
    position: row.position == null ? null : Number(row.position),
  }));
}

export function discoverTempleDemandPages(snapshot, temples, deities, thresholds = DEFAULT_DEMAND_THRESHOLDS) {
  const places = new Map();
  for (const temple of temples) {
    const county = templeCounty(temple.district);
    const town = templeTownship(temple.district);
    if (!county || !town) continue;
    places.set(`${county.slug}/${town.name}`, {
      county: county.slug,
      town: town.name,
      stem: town.name.replace(/[區鄉鎮市]$/, ''),
    });
  }

  const templeCounts = new Map();
  for (const temple of temples) {
    const county = templeCounty(temple.district);
    const town = templeTownship(temple.district);
    if (!county || !town || !temple.main_deity_ref) continue;
    const key = `${county.slug}/${town.name}/${temple.main_deity_ref}`;
    templeCounts.set(key, (templeCounts.get(key) ?? 0) + 1);
  }

  const candidates = new Map();
  const publishedDeities = deities.filter((deity) => !deity.draft);
  for (const row of queryEvidence(snapshot)) {
    if (row.impressions < thresholds.minImpressions || row.clicks < thresholds.minClicks) continue;
    for (const place of places.values()) {
      if (place.stem.length < 2 || !row.query.includes(place.stem)) continue;
      for (const deity of publishedDeities) {
        const terms = [deity.name, ...(deity.aliases ?? [])].filter((term) => term.length >= 2);
        if (!terms.some((term) => row.query.includes(term))) continue;
        const key = `${place.county}/${place.town}/${deity.id}`;
        const templeCount = templeCounts.get(key) ?? 0;
        if (templeCount < thresholds.minTemples) continue;
        const candidate = {
          county: place.county,
          countyName: countyName(place.county),
          town: place.town,
          deity: deity.id,
          deityName: deity.name,
          query: row.query,
          impressions: row.impressions,
          clicks: row.clicks,
          ctr: row.ctr,
          position: row.position,
          templeCount,
        };
        const previous = candidates.get(key);
        if (!previous || candidate.impressions > previous.impressions ||
            (candidate.impressions === previous.impressions && candidate.clicks > previous.clicks)) {
          candidates.set(key, candidate);
        }
      }
    }
  }
  return [...candidates.values()].sort((a, b) =>
    b.impressions - a.impressions || b.clicks - a.clicks ||
    `${a.county}/${a.town}/${a.deity}`.localeCompare(`${b.county}/${b.town}/${b.deity}`, 'zh-Hant'),
  );
}

export function demandPageKey(page) {
  return `${page.county}/${page.town}/${page.deity}`;
}
