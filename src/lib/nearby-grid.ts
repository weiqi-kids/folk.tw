/**
 * 「附近的廟」格網索引——切格規則的**唯一入口**。
 *
 * 為什麼要切格：站上有座標的廟以萬計，把全部座標打包丟給瀏覽器，2026-08-08 實測是
 * 442 KB（gzip 194 KB）。那是一個「按一下才用得到」的功能，不該讓每個開頁的人先付這筆流量。
 * 改成 0.1° 見方切格（在台灣約 11 km × 10 km），定位後只抓身邊那幾格，實際傳輸壓到十幾 KB。
 *
 * 🔴 這支被三處共用，**格子怎麼切只能有一份定義**：
 *      ① `src/pages/temples/nearby/cells/[cell].json.ts`（產出格檔）
 *      ② `src/pages/temples/nearby/index.astro` 的 client script（算自己在哪一格、去抓哪幾格）
 *      ③ `scripts/check-rendered.mjs` 不變量 13（驗格檔與資料相符）
 *    任何一邊自己再寫一次 `Math.floor`，格檔與查詢就會對不上，
 *    而症狀是「附近查不到廟」——不會有紅燈、不會有錯誤訊息，只是安靜地查無資料。
 *
 * ⚠️ 用整數乘法（`lat * 10`）而不是除法（`lat / 0.1`）：後者的浮點誤差會讓恰好落在
 *    格線上的座標掉進上一格。乘法在台灣的座標範圍內沒有這個問題，且三處共用同一支就一致。
 */

/** 每度切幾格。改這個值＝所有格檔的檔名全變，屬破壞性改動（格檔網址不是承諾的頁面，但要重建全部）。 */
export const CELLS_PER_DEG = 10;

/** 座標 → 格子代號。格檔網址即 `/temples/nearby/cells/<key>.json`。 */
export function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat * CELLS_PER_DEG)}_${Math.floor(lng * CELLS_PER_DEG)}`;
}

/**
 * 格檔裡一筆廟的欄位。刻意用陣列不用物件：一萬多筆的 key 名重複佔的位元組不是零，
 * 而這份東西只有本功能的 client script 會讀，不是對外契約。
 * 欄位＝[廟 id, 廟名, 緯度, 經度, 登記地址, 主祀神]。
 */
export type NearbyRow = [string, string, number, number, string, string];

/** 產格檔與驗格檔共用的輸入形狀（endpoint 給 CollectionEntry 攤平後的值，gate 直接讀 temples.json）。 */
export type NearbyTemple = {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
  district?: string;
  main_deity_raw?: string;
};

/**
 * 主祀神只取第一段。`main_deity_raw` 是內政部原始欄位，有廟一次登記了七尊
 * （「虎爺將軍,韋馱佛祖,註生娘娘,關聖帝君…」），整串印在清單上會把版面撐爆。
 * ⚠️ 這只是清單顯示用的取首位，與 `src/pages/temples/[id].astro` 那套 title 清洗
 *    （多一層 8 全形字回退）**不是同一件事**，別互相套用。
 */
export function firstDeity(raw?: string): string {
  return (raw ?? '').split(/[,，、;；]/)[0].trim();
}

/** 座標小數位。5 位約 1 公尺，對「哪間廟離我最近」綽綽有餘，比原始 13 位省一半體積。 */
const COORD_DP = 5;

/**
 * 把廟依座標分進格子。**無座標者不入格**——那不是遺漏，是我們真的不知道它在哪，
 * 硬給一個行政區中心點會把人導到錯的地方（見 docs/decisions/temples.md 的地理編碼安全閘）。
 */
export function buildCells(temples: NearbyTemple[]): Map<string, NearbyRow[]> {
  const cells = new Map<string, NearbyRow[]>();
  for (const t of temples) {
    if (typeof t.lat !== 'number' || typeof t.lng !== 'number') continue;
    const key = cellKey(t.lat, t.lng);
    const row: NearbyRow = [
      t.id,
      t.name,
      Number(t.lat.toFixed(COORD_DP)),
      Number(t.lng.toFixed(COORD_DP)),
      t.district ?? '',
      firstDeity(t.main_deity_raw),
    ];
    (cells.get(key) ?? cells.set(key, []).get(key)!).push(row);
  }
  return cells;
}

/** 兩點直線距離（公尺）。haversine，client 與 gate 同一支。 */
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 距離的顯示字串。1 公里以內給公尺（取十位數，別假裝有公尺級精度）。 */
export function distanceLabel(m: number): string {
  if (m < 1000) return `約 ${Math.max(10, Math.round(m / 10) * 10)} 公尺`;
  return `約 ${(m / 1000).toFixed(m < 10000 ? 1 : 0)} 公里`;
}
