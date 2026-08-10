// 「地區 × 神明」需求頁白名單。
//
// 這不是把全台鄉鎮與神明做笛卡兒積。每一筆都必須同時通過：
//   1. GSC 最近可讀的 7 日快照，精確查詢曝光 >= 50 且至少有 1 點擊；
//   2. 該行政區至少有 5 間 main_deity_ref 精確對映的宮廟；
//   3. 頁面內容只由既有宮廟資料衍生。
// scripts/check-temple-demand-pages.mjs 會回讀 evidenceFile 與 temples.json 硬驗；
// 因此新增頁面必須先有真實需求證據，不能只在這裡手填一組 slug。

export const TEMPLE_DEMAND_THRESHOLDS = {
  minImpressions: 50,
  minClicks: 1,
  minTemples: 5,
} as const;

export type TempleDemandPage = {
  county: string;
  town: string;
  deity: string;
  query: string;
  evidenceFile: string;
};

export const TEMPLE_DEMAND_PAGES: readonly TempleDemandPage[] = [
  {
    county: 'changhua',
    town: '員林市',
    deity: 'guangong',
    query: '員林關聖帝君廟',
    evidenceFile: 'data/seo-daily/2026-08-09.json',
  },
];

export const templeDemandHref = (page: Pick<TempleDemandPage, 'county' | 'town' | 'deity'>): string =>
  `/temples/region/${page.county}/${page.town}/${page.deity}/`;

export function findTempleDemandPage(county: string, town: string, deity: string): TempleDemandPage | undefined {
  return TEMPLE_DEMAND_PAGES.find((p) => p.county === county && p.town === town && p.deity === deity);
}

export function templeDemandHrefFor(county: string, town: string, deity: string): string | undefined {
  const page = findTempleDemandPage(county, town, deity);
  return page ? templeDemandHref(page) : undefined;
}
