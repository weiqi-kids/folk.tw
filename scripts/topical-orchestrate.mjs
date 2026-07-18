#!/usr/bin/env node
// 時事祈福自動編排：USGS 台灣周邊顯著地震偵測 → 去重 → claude 正向議題閘＋產莊重中文標題
//   → 開祈福頁(status active) ＋ 逾 14 天 active 自動歸檔(→noindex) → 寫 src/data/topical.json。
// 印 PUBLISHED / ARCHIVED 摘要行（tab 分隔）供 cron 包裝決定 commit/push/Slack。自身不碰 git。
// 只有偵測到「新事件」時才呼叫 claude（顯著地震罕見→平時零 claude 用量、零改動）。
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const TOPICAL = 'src/data/topical.json';
const DETECT_DAYS = 3, ARCHIVE_DAYS = 14;
// 不限台灣：兩層偵測——台灣周邊門檻低（在地有感、集體關切強）＋全球重大地震（台灣人也會為國際災難祈福）。
// 「是否值得開頁」的相關性把關交給下方正向議題閘（無人區/無集體關切必要則 block），故門檻不必抓太死。
const TW = { minmag: 5.0, lat: 23.8, lon: 121.0, radius: 450 };
const GLOBAL_MINMAG = 6.8;
const today = new Date().toISOString().slice(0, 10);

async function fetchUSGS(params) {
  const start = new Date(Date.now() - DETECT_DAYS * 864e5).toISOString().slice(0, 10);
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${start}&orderby=time&${params}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) return [];
  const d = await r.json();
  return (d.features || []).map((f) => ({
    id: 'eq-' + f.id, mag: f.properties.mag, place: f.properties.place,
    time: new Date(f.properties.time).toISOString().slice(0, 10), url: f.properties.url,
    lon: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1],
  }));
}

// 兩點球面距離（km）。缺座標一律當「無限遠」（不誤併）。
function km(a, b) {
  if (a?.lat == null || b?.lat == null) return Infinity;
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// 同一場地震會被不同觀測網（USGS 'us'、海嘯中心 'at'…）各報一筆、id 與規模略異
// （2026-07-17 墨西哥 M7.x 就同時冒出 attibqh8 / us7000t1bu 兩筆重複祈福頁）。
// 近距離＋近時間即視為同事件，靠此收斂，勿只認 id。
const SAME_KM = 250, SAME_DAYS = 1;
function sameEvent(a, b) {
  return km(a, b) <= SAME_KM &&
    Math.abs(Date.parse(a.time) - Date.parse(b.time)) / 864e5 <= SAME_DAYS;
}
// 同事件多筆解取代表：優先 USGS 'us' 網（最權威），否則取規模最大者。
function pickCanonical(group) {
  return group.find((e) => e.id.startsWith('eq-us')) ??
    group.reduce((a, b) => ((b.mag ?? 0) > (a.mag ?? 0) ? b : a));
}

async function detect() {
  try {
    const [tw, global] = await Promise.all([
      fetchUSGS(`minmagnitude=${TW.minmag}&latitude=${TW.lat}&longitude=${TW.lon}&maxradiuskm=${TW.radius}`),
      fetchUSGS(`minmagnitude=${GLOBAL_MINMAG}`),
    ]);
    const byId = new Map();
    for (const e of [...tw, ...global]) byId.set(e.id, e); // 先併相同 id（台灣重大地震兩邊都會出現）
    // 再併「同震不同解」：近距離＋近時間分組，每組只留一筆代表。
    const groups = [];
    for (const e of byId.values()) {
      const g = groups.find((grp) => sameEvent(grp[0], e));
      if (g) g.push(e); else groups.push([e]);
    }
    return groups.map(pickCanonical);
  } catch (e) { console.error('[topical] USGS 取用失敗：' + e.message); return []; }
}

// claude 正向議題閘＋莊重中文框架。回 { verdict, title, event }。失敗一律保守 block。
function gateAndFrame(c) {
  const PROMPT = `你是台灣民俗祈福站的守門與編輯。USGS 測得地震事實：地點「${c.place}」、規模 ${c.mag}、日期 ${c.time}。
任務(1) 相關性＋正向議題判定，pass 需同時滿足：
  a. 值得集體祈福——事件發生在有人居住/會受影響之地、有集體關切必要（**全球皆可，台灣人也會為國際重大災難如日本/土耳其地震祈福**）；若震央在**無人或極少人海域/偏遠區、規模雖大但無實質受影響者**，判 block（不必為每個地震都開頁）。
  b. 正向框——做「為平安／復原祈福」（集體平安、非政治、非爭議對立、非消費痛苦、非對災難算吉凶）。任一不符即 block。
任務(2) 若 pass，產生莊重的繁體中文：title 形如「為○○地震平安祈福」（○○用可辨識中文地名，國際地名用通用中文譯名如「土耳其」「日本能登」；不確定精確中文地名就用保守描述如「台灣東部外海」），event 為一到兩句、只依上述事實、不誇大、不編造傷亡人數。
只輸出單行 JSON：{"verdict":"pass"|"block","title":"…","event":"…"}。`;
  const r = spawnSync('claude', ['-p', PROMPT, '--model', 'claude-sonnet-5'],
    { encoding: 'utf8', timeout: 120000, env: { ...process.env, IS_SANDBOX: '1' } });
  if (r.status !== 0 || !r.stdout) return { verdict: 'block', reason: 'claude 執行失敗' };
  const m = r.stdout.match(/\{[\s\S]*\}/);
  if (!m) return { verdict: 'block', reason: '無 JSON 輸出' };
  try { return JSON.parse(m[0]); } catch { return { verdict: 'block', reason: 'JSON 解析失敗' }; }
}

const list = JSON.parse(readFileSync(TOPICAL, 'utf8'));
const known = new Set(list.map((x) => x.id));
let changed = false;

// 1) 逾期 active → 歸檔（頁面轉 noindex）
for (const it of list) {
  if (it.status === 'active' && it.since && (Date.parse(today) - Date.parse(it.since)) / 864e5 > ARCHIVE_DAYS) {
    it.status = 'archived'; changed = true;
    console.log(`ARCHIVED\t${it.id}\t${it.title}`);
  }
}

// 2) 新事件 → 過正向閘 → 開頁
for (const c of await detect()) {
  if (known.has(c.id)) continue;
  // 跨執行去重：與既有條目（含已歸檔）同震者略過，免同一場地震換個網解又開一頁。
  if (list.some((it) => sameEvent(it, c))) { console.error(`[topical] ${c.id} 與既有事件同震，略過`); continue; }
  const g = gateAndFrame(c);
  if (g.verdict !== 'pass' || !g.title) { console.error(`[topical] ${c.id} 未過閘：${g.reason || 'block'}`); continue; }
  list.push({
    id: c.id, title: g.title,
    event: g.event || `USGS 測得 ${c.place}，規模 ${c.mag}。`,
    sources: [
      { ref: 'USGS 地震資訊', url: c.url },
      { ref: '交通部中央氣象署地震測報中心', url: 'https://scweb.cwa.gov.tw/zh-tw/earthquake/data' },
    ],
    // place/mag/lat/lon/time 留檔供跨執行 sameEvent 比對（舊條目無座標則退回 id 比對）。
    place: c.place, mag: c.mag, lat: c.lat, lon: c.lon, time: c.time,
    since: today, status: 'active',
  });
  changed = true;
  console.log(`PUBLISHED\t${c.id}\t${g.title}\thttps://folk.tw/qiugian/blessing/${c.id}/`);
}

if (changed) writeFileSync(TOPICAL, JSON.stringify(list, null, 2) + '\n');
