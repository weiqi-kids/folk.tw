#!/usr/bin/env node
// 時事祈福自動編排：多來源偵測（USGS 地震＋GDACS 全球災害…）→ 統一候選 → 去重
//   → claude 正向議題閘＋產莊重中文標題 → 開祈福頁(status active)
//   ＋ 逾 14 天 active 自動歸檔(→noindex) → 寫 src/data/topical.json。
// 印 PUBLISHED / ARCHIVED 摘要行（tab 分隔）供 cron 包裝決定 commit/push/Slack。自身不碰 git。
// 只有偵測到「新事件」時才呼叫 claude（顯著事件罕見→平時零 claude 用量、零改動）。
// 用法：node scripts/topical-orchestrate.mjs [--dry]（--dry 只偵測＋過閘＋印，不寫檔）。
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const TOPICAL = 'src/data/topical.json';
const DRY = process.argv.includes('--dry');
const DETECT_DAYS = 3, ARCHIVE_DAYS = 14;
const today = new Date().toISOString().slice(0, 10);

// 事件類型 → 中文標籤（供 gate 產文案、UI 可用）。新增類型只要在此登記即可。
const TYPE_LABEL = {
  quake: '地震', cyclone: '熱帶氣旋', flood: '水災', volcano: '火山活動', wildfire: '野火',
  landslide: '山崩', 'bridge-collapse': '橋樑坍塌', fire: '火災', 'gas-explosion': '氣爆',
  storm: '風災', other: '重大事件',
};
// 舊條目無 eventType 時的推論（向後相容：有 mag 或 id 以 eq- 開頭＝地震）。
const inferType = (e) => e.eventType ?? (e.mag != null || String(e.id).startsWith('eq-') ? 'quake' : 'other');

// ── 偵測器 1：USGS 地震（台灣周邊低門檻＋全球重大）────────────────────────────
// 「是否值得開頁」的相關性把關交給下方正向議題閘（無人區/無集體關切必要則 block），故門檻不必抓太死。
const TW = { minmag: 5.0, lat: 23.8, lon: 121.0, radius: 450 };
const GLOBAL_MINMAG = 6.8;
async function fetchUSGS(params) {
  const start = new Date(Date.now() - DETECT_DAYS * 864e5).toISOString().slice(0, 10);
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${start}&orderby=time&${params}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) return [];
  const d = await r.json();
  return (d.features || []).map((f) => ({
    id: 'eq-' + f.id, eventType: 'quake', detector: 'usgs',
    mag: f.properties.mag, place: f.properties.place,
    time: new Date(f.properties.time).toISOString().slice(0, 10),
    lon: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1],
    sources: [
      { ref: 'USGS 地震資訊', url: f.properties.url },
      { ref: '交通部中央氣象署地震測報中心', url: 'https://scweb.cwa.gov.tw/zh-tw/earthquake/data' },
    ],
  }));
}
async function usgsDetector() {
  const [tw, global] = await Promise.all([
    fetchUSGS(`minmagnitude=${TW.minmag}&latitude=${TW.lat}&longitude=${TW.lon}&maxradiuskm=${TW.radius}`),
    fetchUSGS(`minmagnitude=${GLOBAL_MINMAG}`),
  ]);
  const byId = new Map();
  for (const e of [...tw, ...global]) byId.set(e.id, e); // 併相同 id（台灣重大地震兩層都會出現）
  return [...byId.values()];
}

// ── 偵測器 2：GDACS 全球災害預警（歐盟 JRC 官方，免金鑰）─────────────────────
// 只取 Orange/Red（Green 多無集體關切必要）；排除 EQ（地震歸 USGS，免雙源）與 DR 乾旱（非急性「此刻平安」）。
const GDACS_TYPE = { TC: 'cyclone', FL: 'flood', VO: 'volcano', WF: 'wildfire' };
const GDACS_FRESH_DAYS = 14; // 事件起始逾此天數視為過舊，不開新頁（避免長期乾旱/舊洪災）。
async function gdacsDetector() {
  const r = await fetch('https://www.gdacs.org/xml/rss.xml', { signal: AbortSignal.timeout(20000) });
  if (!r.ok) return [];
  const xml = await r.text();
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const pick = (tag) => it.match(new RegExp(`<(?:gdacs:)?${tag}[^>]*>([\\s\\S]*?)</(?:gdacs:)?${tag}>`, 'i'))?.[1]?.trim();
    const etype = pick('eventtype');
    const alert = pick('alertlevel');
    if (!GDACS_TYPE[etype] || !(alert === 'Orange' || alert === 'Red')) continue;
    if ((pick('iscurrent') || '').toLowerCase() !== 'true') continue;
    const from = pick('fromdate');
    const time = from ? new Date(from).toISOString().slice(0, 10) : today;
    if ((Date.parse(today) - Date.parse(time)) / 864e5 > GDACS_FRESH_DAYS) continue;
    // 座標在 <geo:lat>/<geo:long>（各事件類型一致），非 <gdacs:point>。
    const geo = (t) => Number(it.match(new RegExp(`<geo:${t}>([^<]+)</geo:${t}>`, 'i'))?.[1]);
    const lat = geo('lat'), lon = geo('long');
    const eventid = pick('eventid');
    const link = (pick('link') || '').replace(/&amp;/g, '&');
    out.push({
      id: `gdacs-${etype.toLowerCase()}-${eventid}`, eventType: GDACS_TYPE[etype], detector: 'gdacs',
      place: pick('country') || pick('eventname') || '',
      severity: [pick('severity'), pick('population')].filter(Boolean).join('，'),
      summary: pick('description') || pick('title') || '',
      time, lat: Number.isFinite(lat) ? lat : undefined, lon: Number.isFinite(lon) ? lon : undefined,
      sources: [{ ref: 'GDACS 全球災害預警系統', url: link }],
    });
  }
  return out;
}

const DETECTORS = [usgsDetector, gdacsDetector];

// ── 去重：同事件收斂（跨偵測器、跨執行）────────────────────────────────────
// 地震同一場會被不同觀測網各報一筆（2026-07-17 墨西哥 attibqh8/us7000t1bu 兩筆）；點狀事件則近點＋數日內陸續出稿。
const DEDUP = { quake: { km: 250, days: 1 }, _default: { km: 10, days: 3 } };
const normPlace = (s) => String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[，,、]/g, '');
function km(a, b) {
  if (a?.lat == null || b?.lat == null) return Infinity;
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function sameEvent(a, b) {
  const ta = inferType(a), tb = inferType(b);
  if (ta !== tb) return false; // 類型不同一律不同事件
  const { km: maxkm, days } = DEDUP[ta] ?? DEDUP._default;
  if (Math.abs(Date.parse(a.time) - Date.parse(b.time)) / 864e5 > days) return false;
  const d = km(a, b);
  if (d !== Infinity) return d <= maxkm;        // 有座標：比距離
  return normPlace(a.place) && normPlace(a.place) === normPlace(b.place); // 無座標：退回地名正規化
}
// 同事件多筆取代表：優先 USGS 'us' 網（最權威），否則規模最大者，否則第一筆。
function pickCanonical(group) {
  return group.find((e) => String(e.id).startsWith('eq-us')) ??
    group.reduce((a, b) => ((b.mag ?? 0) > (a.mag ?? 0) ? b : a));
}

async function detect() {
  const cands = [];
  for (const det of DETECTORS) {
    try { cands.push(...(await det())); }
    catch (e) { console.error(`[topical] 偵測器 ${det.name} 失敗：${e.message}`); }
  }
  const groups = [];
  for (const e of cands) {
    const g = groups.find((grp) => sameEvent(grp[0], e));
    if (g) g.push(e); else groups.push([e]);
  }
  return groups.map(pickCanonical);
}

// ── 正向議題閘＋莊重中文框架（型別無關）。回 { verdict, title, event }。失敗一律保守 block。──
function gateAndFrame(c) {
  const label = TYPE_LABEL[c.eventType] ?? '重大事件';
  const src = c.sources?.[0]?.ref || '來源';
  const fact = c.mag != null ? `規模 ${c.mag}` : (c.severity || '');
  const PROMPT = `你是台灣民俗祈福站的守門與編輯。以下是來自「${src}」的災難事實：
類型：${label}
地點：「${c.place}」
日期：${c.time}${fact ? `\n嚴重度：${fact}` : ''}${c.summary ? `\n事件摘要：${c.summary}` : ''}
任務(1) 相關性＋正向議題判定，pass 需同時滿足：
  a. 值得集體祈福——事件發生在有人居住/會受影響之地、有集體關切必要（**全球皆可，台灣人也會為國際重大災難如日本地震、中國山崩祈福**）；若在**無人或極少人受影響之處、無集體關切必要**，判 block（不必為每個事件都開頁）。
  b. 正向框——做「為平安／復原祈福」（集體平安、非政治、非爭議對立、非消費痛苦、非對災難算吉凶）。任一不符即 block。
任務(2) 若 pass，產生莊重的**台灣繁體中文**：title 形如「為○○${label}平安祈福」或「為○○祈福」，event 為一到兩句。硬性要求：
  - **台灣慣用語＋全形標點**（，。、；「」），**禁半形逗號句號、禁大陸用語**。
  - **地名以上述來源「${c.place}」為準**：有通用台灣譯名才用（如「土耳其」「日本能登」），**沒有就保留原名或用保守描述（如「墨西哥外海」）——絕不自創或套大陸譯名**；若來源本為中文地名（如「重慶市彭水縣」）則**直接沿用原漢字、不另譯不改**。數字一律照來源，勿改。
  - 只依上述事實，不誇大、不編造傷亡人數。
只輸出單行 JSON：{"verdict":"pass"|"block","title":"…","event":"…"}。`;
  const r = spawnSync('claude', ['-p', PROMPT, '--model', 'claude-sonnet-5'],
    { encoding: 'utf8', timeout: 120000, env: { ...process.env, IS_SANDBOX: '1' } });
  if (r.status !== 0 || !r.stdout) return { verdict: 'block', reason: 'claude 執行失敗' };
  const m = r.stdout.match(/\{[\s\S]*\}/);
  if (!m) return { verdict: 'block', reason: '無 JSON 輸出' };
  try {
    const g = JSON.parse(m[0]);
    // 機械保底：claude 偶爾仍吐半形逗號/分號（見 2026-07-19 墨西哥頁事故）。緊鄰中文字者一律轉全形，
    // 英文語境（如「Madero, Mexico」）左側為拉丁字母故不動；不碰句號免誤傷「7.3」這種小數。
    const zh = (s) => typeof s === 'string'
      ? s.replace(/([一-鿿])\s*,/g, '$1，').replace(/([一-鿿])\s*;/g, '$1；')
      : s;
    g.title = zh(g.title); g.event = zh(g.event);
    return g;
  } catch { return { verdict: 'block', reason: 'JSON 解析失敗' }; }
}

const list = JSON.parse(readFileSync(TOPICAL, 'utf8'));
const known = new Set(list.map((x) => x.id));
let changed = false;

// 1) 逾期 active → 歸檔（頁面轉 noindex）
for (const it of list) {
  if (it.status === 'active' && it.since && (Date.parse(today) - Date.parse(it.since)) / 864e5 > ARCHIVE_DAYS) {
    if (!DRY) { it.status = 'archived'; changed = true; }
    console.log(`ARCHIVED\t${it.id}\t${it.title}`);
  }
}

// 2) 新事件 → 過正向閘 → 開頁
for (const c of await detect()) {
  if (known.has(c.id)) continue;
  // 跨執行去重：與既有條目（含已歸檔）同震者略過，免同一場事件換個網解又開一頁。
  if (list.some((it) => sameEvent(it, c))) { console.error(`[topical] ${c.id} 與既有事件同震，略過`); continue; }
  const g = gateAndFrame(c);
  if (g.verdict !== 'pass' || !g.title) { console.error(`[topical] ${c.id} 未過閘：${g.reason || 'block'}`); continue; }
  const rec = {
    id: c.id, eventType: c.eventType, title: g.title,
    event: g.event || `願受影響的人都平安、家園早日復原。`,
    sources: c.sources,
    // place/severity/mag/lat/lon/time 留檔供跨執行 sameEvent 比對。
    place: c.place, time: c.time,
    ...(c.mag != null ? { mag: c.mag } : {}),
    ...(c.severity ? { severity: c.severity } : {}),
    ...(c.lat != null ? { lat: c.lat, lon: c.lon } : {}),
    detector: c.detector, since: today, status: 'active',
  };
  if (!DRY) { list.push(rec); changed = true; }
  console.log(`PUBLISHED\t${c.id}\t${g.title}\thttps://folk.tw/qiugian/blessing/${c.id}/`);
}

if (changed && !DRY) writeFileSync(TOPICAL, JSON.stringify(list, null, 2) + '\n');
