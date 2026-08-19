#!/usr/bin/env node
// 時事祈福自動編排：多來源偵測（USGS 地震＋GDACS 全球災害…）→ 統一候選 → 去重
//   → claude 正向議題閘＋產莊重中文標題 → 開祈福頁(status active)
//   ＋ 逾 14 天 active 自動歸檔(→noindex)
//   ＋ 集氣排序去留：只留集氣數最高的 KEEP_ACTIVE 頁 active，其餘歸檔（見下方該段註解）
//   → 寫 src/data/topical.json。
// 印 PUBLISHED / ARCHIVED 摘要行（tab 分隔）供 cron 包裝決定 commit/push/Slack。自身不碰 git。
// 只有偵測到「新事件」時才呼叫 claude（顯著事件罕見→平時零 claude 用量、零改動）。
// 用法：node scripts/topical-orchestrate.mjs [--dry]（--dry 只偵測＋過閘＋印，不寫檔）。
//
// 2026-08-19：原本整段主流程是 top-level（一 import 就跑偵測與寫檔），別的腳本因此無法共用
//   本檔的閘與紀錄形狀、只能複製。現已收進 main()，共用的部分在 lib/topical-{gate,text,record,report}.mjs。
import { readFileSync } from 'node:fs';
import { hasBannedNumber, SAFE_EVENT } from './lib/topical-guard.mjs';
import { sharedCycloneName, typhoonZhName, findTitleClash, CYCLONE_DAYS } from './lib/topical-dedup.mjs';
import { reverseRegion } from './lib/topical-geo.mjs';
import { gateAndFrame } from './lib/topical-gate.mjs';
import {
  readTopical, writeTopical, makeBlessingRecord, archiveRecord,
} from './lib/topical-record.mjs';
import { reportPublished, reportArchived, reportDemoted, reportGrace } from './lib/topical-report.mjs';

const STATS = 'src/data/qiugian-stats.json';
const DRY = process.argv.includes('--dry');
const DETECT_DAYS = 3, ARCHIVE_DAYS = 14;
// 集氣排序去留（用戶 2026-08-12 定案：N=5、寬限 48 小時）。
// ⚠️ `since` 只有日期沒有時刻，所以 48 小時是以「天」判定：since 是今天或昨天者豁免
//    （實際落在真實 24～48 小時之間）。要更精細得先給條目補時刻欄位。
const KEEP_ACTIVE = 5, GRACE_DAYS = 2;
const today = new Date().toISOString().slice(0, 10);
// 本產線的閘身分：log 前綴與「下一輪會再掃到」的節奏（規則本身在 lib/topical-gate.mjs，只有一份）。
const GATE_OPT = { logTag: '[topical]', cadenceNote: 'P1 每 20 分跑一次', srcFallback: '來源' };

// 事件類型 → 中文標籤已抽到 lib/topical-text.mjs（P1／P2 共用，新增類型只改那一份）。
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
    // 「沒有災害不用祈福」的機械前哨（2026-07-26 加）：氣旋若連受影響國家都沒有＝還在大洋上，
    // 那是預警不是災情，連閘都不必進。真正的「已發生 vs 只是預報」判定在下方正向閘條件 c。
    if (GDACS_TYPE[etype] === 'cyclone' && !pick('country')) continue;
    const from = pick('fromdate');
    const time = from ? new Date(from).toISOString().slice(0, 10) : today;
    if ((Date.parse(today) - Date.parse(time)) / 864e5 > GDACS_FRESH_DAYS) continue;
    // 座標在 <geo:lat>/<geo:long>（各事件類型一致），非 <gdacs:point>。
    const geo = (t) => Number(it.match(new RegExp(`<geo:${t}>([^<]+)</geo:${t}>`, 'i'))?.[1]);
    const lat = geo('lat'), lon = geo('long');
    const eventid = pick('eventid');
    const link = (pick('link') || '').replace(/&amp;/g, '&');
    // 熱帶氣旋的國際命名只出現在 RSS 標題（`… tropical cyclone NOUL-26 …`），優先取 <gdacs:eventname>。
    // 留檔供跨產線去重（P2 從新聞只拿得到中文名「紅霞」）**與標題命名**：
    // 兩者都靠 lib/typhoon-names.json 的 CWA 對照表把 NOUL 換算成紅霞。
    const cycloneName = GDACS_TYPE[etype] === 'cyclone'
      ? ((pick('eventname') || '').match(/^([A-Za-z][A-Za-z-]*?)(?:-\d+)?$/)?.[1] ||
         (pick('title') || '').match(/tropical cyclone\s+([A-Za-z][A-Za-z-]+?)(?:-\d+)?[\s.,]/i)?.[1])
      : undefined;
    const cycloneNameZh = typhoonZhName(cycloneName); // 查無 CWA 中文名（如大西洋颶風）則 null，標題退回無名寫法
    // GLIDE：聯合國體系的災害事件唯一識別碼（`WF-2026-000128-ESP`）。同 GLIDE ＝ 同一場災害，
    // 比座標/時間可靠得多（野火洪水會蔓延數週、跨數百公里）。留檔供去重，見 lib/topical-dedup.mjs d0。
    const glide = pick('glide') || undefined;
    out.push({
      id: `gdacs-${etype.toLowerCase()}-${eventid}`, eventType: GDACS_TYPE[etype], detector: 'gdacs',
      ...(cycloneName ? { cycloneName } : {}),
      ...(cycloneNameZh ? { cycloneNameZh } : {}),
      ...(glide ? { glide } : {}),
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

// ── 正向議題閘＋莊重中文框架 → lib/topical-gate.mjs（P1／P2 共用同一份規則）─────────────
//   本檔只提供「呼叫端身分」GATE_OPT。⚠️ 2026-08-19 前 news-scan.mjs 有一份複製品，兩份已漂移；
//   合併時以本檔那份為準（它帶著 GDACS 推估值警語等後補修正），詳見 topical-gate.mjs 檔頭。

// ── 主流程（2026-08-19 由 top-level 收進 main()：讓本檔可被 import 而不動起來，
//    這是把閘／類型表／紀錄形狀抽成共用模組的前提）────────────────────────────────
async function main() {
  const list = readTopical();
  const known = new Set(list.map((x) => x.id));
  let changed = false;

  // 1) 逾期 active → 歸檔（頁面轉 noindex）
  for (const it of list) {
    if (it.mergedInto) continue; // 併頁後的舊條目只剩 redirect，狀態無意義、不必歸檔
    if (it.status === 'active' && it.since && (Date.parse(today) - Date.parse(it.since)) / 864e5 > ARCHIVE_DAYS) {
      if (!DRY) { archiveRecord(it, today); changed = true; }
      reportArchived(it.id, it.title);
    }
  }

  // 2) 新事件 → 過正向閘 → 開頁
  for (const c of await detect()) {
    if (known.has(c.id)) continue;
    // 跨執行去重：與既有條目（含已歸檔）同震者略過，免同一場事件換個網解又開一頁。
    if (list.some((it) => sameEvent(it, c))) { console.error(`[topical] ${c.id} 與既有事件同震，略過`); continue; }
    // GLIDE 去重（最權威，不看距離與時間窗）：同一場災害被 GDACS 分成多個 eventid 時，只有它擋得住。
    // 2026-07-27 三場西班牙野火各自的 GLIDE 不同（…128/130/131-ESP）＝國際上就登記為三場，故不會被誤併。
    if (c.glide) {
      const dupG = list.find((it) => it.glide && it.glide === c.glide);
      if (dupG) { console.error(`[topical] ${c.id} 與 ${dupG.id} 同一個 GLIDE「${c.glide}」，略過`); continue; }
    }
    // 跨產線去重（氣旋專用）：颱風會移動，上面的距離判定對它無效——P2 可能已先用中文名開過同一個颱風的頁。
    // 這裡不動 sameEvent（它有地震 250km/1 天的專屬調校），只補一道名字比對。見 lib/topical-dedup.mjs dC。
    if (c.eventType === 'cyclone') {
      const dup = list.find((it) => it.eventType === 'cyclone' &&
        Math.abs(Date.parse(it.time) - Date.parse(c.time)) / 864e5 <= CYCLONE_DAYS &&
        sharedCycloneName(it, c));
      if (dup) {
        console.error(`[topical] ${c.id} 與 ${dup.id} 同一個颱風「${sharedCycloneName(dup, c)}」，略過`); continue;
      }
    }
    // 地震（USGS）的 place 是「距震央最近的城市」，常是沒人聽過的小鎮（熊本 7.1 →「Uki」宇城市），
    // 導致標題變成沒人會搜的「宇城地震」。開頁前先由座標反查上級行政區（熊本縣）一併餵給 prompt，
    // 讓它挑有辨識度的地名——仍是查來的事實，不違反「絕不自創譯名」。查不到就照舊只用 place。
    if (c.eventType === 'quake' && c.lat != null && c.lon != null) {
      const geo = await reverseRegion(c.lat, c.lon);
      if (geo?.region) {
        c.adminRegion = geo.region;
        c.adminCountry = geo.country;
        console.log(`[topical] ${c.id} 反查行政區：${geo.country}${geo.region}（place=${c.place}）`);
      }
    }
    const g = gateAndFrame(c, GATE_OPT);
    if (g.verdict !== 'pass' || !g.title) { console.error(`[topical] ${c.id} 未過閘：${g.reason || 'block'}`); continue; }
    // 硬守門：面向使用者文案絕不出現具體傷亡/災損數字（見 lib/topical-guard.mjs）。
    if (hasBannedNumber(g.title)) { console.error(`[topical] ${c.id} 標題含具體傷亡/災損數字，攔下不開頁`); continue; }
    // 硬守門：標題不得與既有頁完全相同（來源地理資訊不足以區分，開了使用者也分不出誰是誰）。
    const clash = findTitleClash(list, g.title);
    if (clash) { console.error(`[topical] ${c.id} 標題「${g.title}」與 ${clash.id} 完全相同，攔下不開頁`); continue; }
    let safeEvent = g.event || SAFE_EVENT;
    if (hasBannedNumber(safeEvent)) { console.error(`[topical] ${c.id} event 含具體數字，改用無數字祈福語`); safeEvent = SAFE_EVENT; }
    // place/severity/mag/lat/lon/time 留檔供跨執行 sameEvent 比對；cycloneName（國際命名）供跨產線名字比對。
    // 欄位順序與「有值才寫」的規則收在 lib/topical-record.mjs（四個寫入端共用同一份形狀）。
    const rec = makeBlessingRecord({
      id: c.id, eventType: c.eventType, title: g.title, event: safeEvent, sources: c.sources,
      place: c.place, time: c.time,
      cycloneName: c.cycloneName, cycloneNameZh: c.cycloneNameZh, glide: c.glide,
      mag: c.mag, severity: c.severity, lat: c.lat, lon: c.lon,
      detector: c.detector, since: today,
    });
    if (!DRY) { list.push(rec); changed = true; }
    reportPublished(c.id, g.title);
  }

  // 3) 集氣排序去留（用戶 2026-08-12 定案）：只保留集氣數最高的 KEEP_ACTIVE 頁 active。
  //
  // 🔴 為什麼不是「N 小時沒人點就下架」：2026-08-12 實測 30 天——全站 9,293 sessions、
  //    /qiugian/ 樞紐 207 views，但祈福頁 6 頁合計只有 10 views、集氣 6 次。這個量級下
  //    任何時間窗門檻的答案永遠是「沒人點」＝全刪（含花蓮大地震等級的事件）。
  //    改問「這幾頁裡哪幾頁相對最被在意」，答案不依賴絕對流量，量再小都能運作。
  //    決策脈絡見 docs/topical-blessing.md §3.10。
  // 排序：主鍵集氣數（高→低）；同分時次鍵 since（新→舊）——同樣 0 集氣，舊的已經有過曝光機會
  //    卻沒人點，先淘汰它。
  // ⚠️ 剛開的頁還沒被人看到就被擠掉是不對的 → GRACE_DAYS 內的新頁豁免，
  //    故 active 可**暫時多於** KEEP_ACTIVE，這是預期行為不是 bug。
  // 🔴 下架＝`archived` ＋ `archived_at` ＋ `followup.sealed`，**網址不 404**（紅線 4）、
  //    P4 不再追蹤（sealed → isTracked 為 false，否則它會掛 updates 又把頁面升回 memorial 重進索引）。
  // 🔴 memorial 不受本段影響——那是已有後續發展的事件記錄頁，本來就該長期可查。
  const blessCounts = (() => {
    try { return JSON.parse(readFileSync(STATS, 'utf8')).topical ?? {}; } catch { return {}; }
  })();
  // 聚合器寫回時已去掉 GA4 的 `topical:` 前綴，但兩種寫法都認，免得改一邊就安靜歸零。
  const blessOf = (it) => blessCounts[it.id] ?? blessCounts[`topical:${it.id}`] ?? 0;

  const ranked = list
    .filter((it) => it.status === 'active' && !it.mergedInto && !it.example)
    .map((it) => ({
      it,
      n: blessOf(it),
      ageDays: (Date.parse(today) - Date.parse(it.since || today)) / 864e5,
    }))
    .sort((a, b) => b.n - a.n || String(b.it.since ?? '').localeCompare(String(a.it.since ?? '')));

  let kept = 0;
  for (const r of ranked) {
    if (kept < KEEP_ACTIVE) { kept += 1; continue; }
    if (r.ageDays < GRACE_DAYS) { reportGrace(r.it.id, r.it.title, r.n); continue; }
    if (!DRY) {
      archiveRecord(r.it, today, { seal: true, reason: `集氣排序未進前 ${KEEP_ACTIVE}（集氣 ${r.n}）` });
      changed = true;
    }
    reportDemoted(r.it.id, r.it.title, r.n);
  }

  if (changed && !DRY) writeTopical(list);
}

// 被直接執行才跑；被 import 時只提供上面那些偵測器與純函式、不產生任何副作用。
if (import.meta.url === `file://${process.argv[1]}`) await main();
