// 時事祈福 · 地名 → 座標（P2 去重的根本補強，2026-07-25 新增）
//
// 為什麼需要：新聞型事件（P2）沒有結構化來源給座標，去重只能退回「地名字串完全相等」
// （`normPlace(a) === normPlace(b)`）。但 prompt 明定「地名用來源原文」，於是同一起事件在不同輪次、
// 不同媒體下會寫成不同字串——2026-07-17 重慶彭水山崩就因此開了三頁：
//   「重慶市彭水縣」／「重慶市彭水苗族土家族自治縣」／「重庆彭水县汉葭街道」（繁簡＋行政層級都不同）。
// 三者字串互不相等 → 去重全數落空 → 各自產生不同 id（id ＝ hash(normPlace+time)）→ 重複開頁。
//
// 解法：開頁前把地名解析成座標，讓既有且已驗證的「同型別＋時間差 ≤3 天＋距離 ≤10km」判定生效。
// 上面三個寫法實測都落在彭水縣城同一點（29.296,108.161／29.297,108.160），相距 <0.2 km，穩穩被擋。
//
// 邊界：Nominatim 查無或失敗一律回 null，呼叫端**退回原本的字串比對**（不因地理服務失效而放行或誤擋）。
// 禮貌用法：官方政策要求標明 User-Agent 且 ≤1 req/s，本模組內建 1.2s 間隔（P2 每 8 小時、候選個位數，綽綽有餘）。

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const UA = 'folk.tw-topical/1.0 (https://folk.tw; blessing pipeline)';
const GAP_MS = 1200;
let lastCall = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 地名 → { lat, lon }；查無/失敗回 null（呼叫端須有字串比對的退路）。
 * @param {string} place
 * @param {{ timeoutMs?: number }} [opt]
 */
export async function geocodePlace(place, opt = {}) {
  const q = String(place || '').trim();
  if (!q) return null;
  const wait = GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  try {
    const url = `${ENDPOINT}?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh,en' },
      signal: AbortSignal.timeout(opt.timeoutMs ?? 15000),
    });
    if (!res.ok) return null;
    const arr = await res.json();
    const hit = Array.isArray(arr) ? arr[0] : null;
    if (!hit) return null;
    const lat = Number(hit.lat), lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

/**
 * 座標 → 上級行政區名（縣/州/府）＋國家；查無/失敗回 null。
 *
 * 為什麼需要（2026-07-30 熊本地震實例）：USGS 的 `place` 是「距震央最近的城市」，
 * 常常是沒人聽過的小鎮——熊本規模 7.1 地震在 USGS 是 `4 km SE of Uki, Japan`（宇城市），
 * 而 prompt 明定「地名以來源為準」，於是標題產出「為日本宇城地震平安祈福」。
 * 台灣沒人搜「宇城地震」，大家搜的是「熊本地震」——功能沒壞，但命名讓它找不到也認不出。
 * 反查行政區後把「熊本縣」一起餵給 prompt，讓它選有辨識度的那個，且**仍是查來的事實、非自創譯名**。
 *
 * 邊界：失敗一律回 null，呼叫端照舊只用 `place`（地理服務失效不得影響開頁與否）。
 */
export async function reverseRegion(lat, lon, opt = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;
  const wait = GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  try {
    const url = `${REVERSE_ENDPOINT}?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh,en' },
      signal: AbortSignal.timeout(opt.timeoutMs ?? 15000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const a = j?.address;
    if (!a) return null;
    // 由粗到細取第一個有值者：州/省/縣 → 郡 → 直轄市
    const region = a.state || a.province || a.county || a.region || a.city || '';
    const country = a.country || '';
    if (!region && !country) return null;
    return { region: String(region).trim(), country: String(country).trim() };
  } catch {
    return null;
  }
}

/** 來源網址正規化：去 protocol／www／query／hash／結尾斜線，用於「同一篇報導」比對。 */
export function normSourceUrl(u) {
  try {
    const x = new URL(String(u));
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return String(u || '').trim().toLowerCase();
  }
}
