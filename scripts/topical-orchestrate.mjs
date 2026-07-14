#!/usr/bin/env node
// 時事祈福自動編排：USGS 台灣周邊顯著地震偵測 → 去重 → claude 正向議題閘＋產莊重中文標題
//   → 開祈福頁(status active) ＋ 逾 14 天 active 自動歸檔(→noindex) → 寫 src/data/topical.json。
// 印 PUBLISHED / ARCHIVED 摘要行（tab 分隔）供 cron 包裝決定 commit/push/Slack。自身不碰 git。
// 只有偵測到「新事件」時才呼叫 claude（顯著地震罕見→平時零 claude 用量、零改動）。
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const TOPICAL = 'src/data/topical.json';
const MINMAG = 5.5, LAT = 23.8, LON = 121.0, RADIUS = 450, DETECT_DAYS = 3, ARCHIVE_DAYS = 14;
const today = new Date().toISOString().slice(0, 10);

async function detect() {
  const start = new Date(Date.now() - DETECT_DAYS * 864e5).toISOString().slice(0, 10);
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${start}`
    + `&minmagnitude=${MINMAG}&latitude=${LAT}&longitude=${LON}&maxradiuskm=${RADIUS}&orderby=time`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.features || []).map((f) => ({
      id: 'eq-' + f.id, mag: f.properties.mag, place: f.properties.place,
      time: new Date(f.properties.time).toISOString().slice(0, 10), url: f.properties.url,
    }));
  } catch (e) { console.error('[topical] USGS 取用失敗：' + e.message); return []; }
}

// claude 正向議題閘＋莊重中文框架。回 { verdict, title, event }。失敗一律保守 block。
function gateAndFrame(c) {
  const PROMPT = `你是台灣民俗祈福站的守門與編輯。USGS 測得地震事實：地點「${c.place}」、規模 ${c.mag}、日期 ${c.time}。
任務(1) 正向議題判定：若適合做「為此事平安／復原祈福」（集體平安、非政治、非爭議對立、非消費痛苦、非對災難算吉凶）則 pass，否則 block。
任務(2) 若 pass，產生莊重的繁體中文：title 形如「為○○地震平安祈福」（○○用可辨識中文地名；不確定精確中文地名就用「台灣東部外海」這類保守描述），event 為一到兩句、只依上述事實、不誇大、不編造傷亡人數。
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
  const g = gateAndFrame(c);
  if (g.verdict !== 'pass' || !g.title) { console.error(`[topical] ${c.id} 未過閘：${g.reason || 'block'}`); continue; }
  list.push({
    id: c.id, title: g.title,
    event: g.event || `USGS 測得 ${c.place}，規模 ${c.mag}。`,
    sources: [
      { ref: 'USGS 地震資訊', url: c.url },
      { ref: '交通部中央氣象署地震測報中心', url: 'https://scweb.cwa.gov.tw/zh-tw/earthquake/data' },
    ],
    since: today, status: 'active',
  });
  changed = true;
  console.log(`PUBLISHED\t${c.id}\t${g.title}\thttps://folk.tw/qiugian/blessing/${c.id}/`);
}

if (changed) writeFileSync(TOPICAL, JSON.stringify(list, null, 2) + '\n');
