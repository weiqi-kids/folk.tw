#!/usr/bin/env node
// 缺座標廟宇的地址地理編碼回填（2026-07-28 建）。
//
// 與 `scripts/refresh-temple-coords.ts` 的分工：
//   那支從**內政部 temple.xml** 回填（權威、精準，但 MOI 端點擋境外 IP，本機與 CI 都連不到，
//   必須有人從台灣端下載 XML 放進來）。這支不需要 XML——直接拿 temples.json 既有的
//   **完整地址**（`district` 欄，全站 100% 具備）去地理編碼，補上那批一直缺座標的廟。
//
// 為什麼要補：缺座標的廟頁不渲染地圖與「位置與 Google 評論」區塊，是全站最單薄的一批。
//   實測 GSC「已檢索－目前尚未建立索引」101 頁中，廟宇頁缺座標率 9%，
//   而全站缺座標率只有 2.9%——**單薄與不被收錄相關**。
//
// 安全閘（沿用 refresh-temple-coords.ts 的規矩，寧可留空也不塞錯座標）：
//   1. 只碰 lat/lng 為空者，絕不覆寫既有座標。
//   2. 查詢字串用「完整地址」而非廟名——廟名重複率極高（全台數十間「福德宮」），
//      用廟名查等於賭運氣；地址是唯一的。
//   3. 命中座標必須落在該廟所屬縣市的經驗 bbox 內（由現有有效座標推算＋外擴 0.03 度），
//      否則丟棄。這道擋的是「Nominatim 把不熟的台灣地址解析到別的縣市甚至國外」。
//   4. 乾跑為預設，`--write` 才寫檔。
//
// 用法：node scripts/geocode-missing-temples.mjs [--write] [--max N]
import { readFileSync, writeFileSync } from 'node:fs';
import { geocodePlace } from './lib/topical-geo.mjs';

const FILE = 'src/data/temples.json';
const WRITE = process.argv.includes('--write');
const maxIdx = process.argv.indexOf('--max');
const MAX = maxIdx >= 0 ? Number(process.argv[maxIdx + 1]) : Infinity;

const raw = JSON.parse(readFileSync(FILE, 'utf8'));
const temples = Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray);
if (!Array.isArray(temples)) { console.error('無法解析 temples.json'); process.exit(1); }

// 縣市前綴（臺→台 正規化後比對，與 src/lib/temple-region.ts 同規則）
const COUNTIES = ['台北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市',
  '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣',
  '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'];
const countyOf = (d) => COUNTIES.find((c) => String(d ?? '').replace(/臺/g, '台').startsWith(c)) ?? null;

// 由現有有效座標推算各縣市 bbox，外擴 0.03 度（同 refresh-temple-coords.ts）
const bbox = {};
for (const t of temples) {
  if (t.lat == null || t.lng == null) continue;
  const c = countyOf(t.district);
  if (!c) continue;
  const x = (bbox[c] ??= { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 });
  x.minLat = Math.min(x.minLat, t.lat); x.maxLat = Math.max(x.maxLat, t.lat);
  x.minLng = Math.min(x.minLng, t.lng); x.maxLng = Math.max(x.maxLng, t.lng);
}
for (const c in bbox) {
  const x = bbox[c];
  x.minLat -= 0.03; x.maxLat += 0.03; x.minLng -= 0.03; x.maxLng += 0.03;
}
const inCounty = (c, lat, lng) => {
  const x = bbox[c];
  return x ? lat >= x.minLat && lat <= x.maxLat && lng >= x.minLng && lng <= x.maxLng : false;
};

// 安全閘 5（實測踩到才加）：地址必須有街道／門牌層級的資訊才查。
// 只有「台南市中西區」這種行政區地址時，Nominatim 回的是**該行政區的中心點**，
// 不是廟的位置——實測台南開基天后宮因此拿到 22.99215,120.20596，與實際位置差約 1 公里。
// 那是憑空生出來的座標，比留空更糟（地圖會把人導到錯的地方），故一律跳過。
const hasStreetLevel = (d) => /[路街巷弄號段]/.test(String(d ?? ''));

const allMissing = temples.filter((t) => (t.lat == null || t.lng == null) && t.district);
const missing = allMissing.filter((t) => hasStreetLevel(t.district));
const skipped = allMissing.length - missing.length;
console.log(`缺座標 ${allMissing.length} 間（全站 ${temples.length}）；其中 ${missing.length} 間地址到街道／門牌層級可查，`
  + `${skipped} 間只有行政區→跳過（查了只會拿到區中心的假座標）。${WRITE ? '寫入模式' : '乾跑（加 --write 才寫檔）'}`);

let ok = 0, rejected = 0, notFound = 0, done = 0;
for (const t of missing) {
  if (done >= MAX) break;
  done++;
  const county = countyOf(t.district);
  const hit = await geocodePlace(t.district);
  if (!hit) { notFound++; console.log(`  ✗ 查無　${t.name}｜${t.district}`); continue; }
  if (!county || !inCounty(county, hit.lat, hit.lon)) {
    rejected++;
    console.log(`  ⚠ 出界丟棄　${t.name}｜${t.district} → ${hit.lat.toFixed(4)},${hit.lon.toFixed(4)}（不在${county ?? '?'} bbox 內）`);
    continue;
  }
  ok++;
  console.log(`  ✓ ${t.name}｜${t.district} → ${hit.lat.toFixed(5)},${hit.lon.toFixed(5)}`);
  if (WRITE) { t.lat = hit.lat; t.lng = hit.lon; }
}

console.log(`\n=== 查 ${done} 間：成功 ${ok}、出界丟棄 ${rejected}、查無 ${notFound} ===`);
if (WRITE && ok) {
  writeFileSync(FILE, JSON.stringify(raw, null, 2) + '\n');
  console.log(`已寫回 ${FILE}（只補空值，未覆寫任何既有座標）。接著跑 pnpm build:changed；正式發佈前跑 pnpm build:release。`);
} else if (ok) {
  console.log('乾跑未寫檔。確認上面結果後加 --write。');
}
