// 廟宇縣市分組：由 district（多為完整地址）推導所屬縣市，供 /temples 目錄分層瀏覽。
// slug 用 ascii，避免 URL 中文編碼比對的坑（與廟宇 id 含中文不同，目錄頁刻意用 ascii）。

const COUNTIES: [string, string][] = [
  ['台北市', 'taipei'], ['新北市', 'newtaipei'], ['基隆市', 'keelung'], ['桃園市', 'taoyuan'],
  ['新竹市', 'hsinchucity'], ['新竹縣', 'hsinchu'], ['苗栗縣', 'miaoli'], ['台中市', 'taichung'],
  ['彰化縣', 'changhua'], ['南投縣', 'nantou'], ['雲林縣', 'yunlin'], ['嘉義市', 'chiayicity'],
  ['嘉義縣', 'chiayi'], ['台南市', 'tainan'], ['高雄市', 'kaohsiung'], ['屏東縣', 'pingtung'],
  ['宜蘭縣', 'yilan'], ['花蓮縣', 'hualien'], ['台東縣', 'taitung'], ['澎湖縣', 'penghu'],
  ['金門縣', 'kinmen'], ['連江縣', 'lienchiang'],
];

export const ALL_COUNTIES = COUNTIES;
const SLUG_TO_NAME = new Map(COUNTIES.map(([name, slug]) => [slug, name]));
export const countyName = (slug: string): string | undefined => SLUG_TO_NAME.get(slug);

/** 由地址/行政區推導縣市（臺→台 正規化後比對前綴）。無法判定回 null。 */
export function templeCounty(district?: string): { name: string; slug: string } | null {
  if (!district) return null;
  const d = district.replace(/臺/g, '台');
  for (const [name, slug] of COUNTIES) if (d.startsWith(name)) return { name, slug };
  return null;
}
