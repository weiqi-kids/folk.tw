#!/usr/bin/env node
// 時事祈福 · 新聞掃描偵測器（P2）：涵蓋不在結構化 feed（USGS/GDACS）裡的新聞型災難
//   （例：2026-07-17 中國重慶彭水烏江三橋山崩）。
// 流程：LLM 用 WebSearch 掃新聞 → 機器層複驗來源（生命線，不信任 LLM 自述）→ 對
//   topical.json 去重 → 正向議題閘產莊重中文標題 → 寫入 topical.json（status:active,
//   detector:'news'）。印 PUBLISHED\t<id>\t<title>\t<url>（與 orchestrate.mjs 同格式）供 cron 發 Slack。
//   自身不碰 git。用法：node scripts/topical-news-scan.mjs [--dry]（--dry 只印不寫檔）。
//
// 為何獨立成腳本（不 import orchestrate.mjs）：兩者是不同的偵測產線（結構化 feed vs 新聞），
//   各自有 cron 與節奏。⚠️ 2026-08-19 前這裡還寫著「orchestrate.mjs 在 import 時即執行
//   top-level 流程，故本檔允許少量複製其 gate/去重/normPlace 邏輯」——那個 seam 已經修掉
//   （三支都改成 main() ＋ 被直接執行才跑），**閘與紀錄形狀不再各留一份**：
//   正向閘 lib/topical-gate.mjs、類型標籤與文字正規化 lib/topical-text.mjs、
//   紀錄形狀 lib/topical-record.mjs、stdout 摘要協定 lib/topical-report.mjs。
//   合併前兩份 gate 的 prompt 已經漂移過（見 topical-gate.mjs 檔頭），別再複製回來。
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { hasBannedNumber, SAFE_EVENT } from './lib/topical-guard.mjs';
import { geocodePlace } from './lib/topical-geo.mjs';
import { findDuplicate, normPlace, officialCycloneName, eventText, findTitleClash } from './lib/topical-dedup.mjs';
import { VALID_EVENT_TYPES, stripHtml, normText } from './lib/topical-text.mjs';
import { gateAndFrame } from './lib/topical-gate.mjs';
import { readTopical, writeTopical, makeBlessingRecord } from './lib/topical-record.mjs';
import { reportPublished } from './lib/topical-report.mjs';

const DRY = process.argv.includes('--dry');
const today = new Date().toISOString().slice(0, 10);
// 本產線的閘身分：log 前綴與「下一輪會再掃到」的節奏（規則本身在 lib/topical-gate.mjs，只有一份）。
const GATE_OPT = { logTag: '[news-scan]', cadenceNote: 'P2 每 8 小時掃一次', srcFallback: '新聞來源' };

// 去重輔助已抽到 lib/topical-dedup.mjs（純函式、可用歷史事故資料回測；見該檔檔頭）。
// 本檔只在 makeId 用到 normPlace，其餘判定一律走 findDuplicate。

// ── (a) LLM 掃描：要求 claude 用 WebSearch 實際搜尋、只回找得到且點得開的事件 ──────────
function scanNews() {
  const PROMPT = `你是台灣民俗祈福站的新聞偵察員。請**用 WebSearch 實際搜尋**「過去約 72 小時內，台灣人可能會想集體祈福的重大天災或重大意外」，範圍含台灣、中國、日本、東南亞等地。
事件類型分兩族，**兩族都要搜，不要只搜天災**（2026-08-22 補：在此之前只列了天災，整族人為意外從未被搜到）：
・天災：山崩、土石流、水災、風災、火山、熱帶氣旋、野火（地震已有其他來源，可略）
・人為重大意外：航空事故、鐵路事故、海難、建物倒塌、橋樑坍塌、氣爆、重大火災、群眾推擠（踩踏）、工安事故

嚴格規則：
- **只回你實際在搜尋結果中找到、且能點開閱讀的真實事件**。查無合適事件就回空陣列 []。
- **嚴禁虛構**：不得編造網址、不得編造傷亡數字、不得杜撰不存在的事件。每筆至少附 2 個「彼此獨立」的真實新聞來源網址（不同媒體），且那些網址必須是你搜尋時真的看到的。
- 地名用**來源原文**（中文來源如「重慶市彭水縣」直接沿用原漢字，不另譯）。
- placeEn 只在來源本身是外文時填，且**必須照抄來源裡出現的拼法**（如 Geoje、Luzon、Munich）；
  不得自己音譯中文地名，不確定就留空字串——它只用於機器複驗比對，填錯會讓真事件被丟掉。
- summary 只寫一句可查證的事實，勿誇大。

只輸出**嚴格單行 JSON 陣列**，每筆物件格式：
{"eventType":"landslide|bridge-collapse|gas-explosion|fire|flood|storm|volcano|cyclone|wildfire|aviation|rail|maritime|building-collapse|crowd-crush|industrial|other","place":"來源原文地名","placeEn":"來源若為外文，寫該來源使用的英文／羅馬拼音地名；中文來源或不確定就給空字串","time":"YYYY-MM-DD","summary":"一句事實","sources":[{"ref":"媒體名","url":"https://…"},{"ref":"媒體名","url":"https://…"}]}
除了這行 JSON 陣列外不要輸出任何其他文字。查無則輸出：[]`;

  const r = spawnSync('claude', ['-p', PROMPT, '--model', 'claude-sonnet-5'],
    { encoding: 'utf8', timeout: 180000, env: { ...process.env, IS_SANDBOX: '1' } });
  if (r.status !== 0 || !r.stdout) {
    console.error(`[news-scan] claude 掃描失敗（status=${r.status}）：${(r.stderr || '').slice(0, 300)}`);
    return [];
  }
  // 解析容錯：抓第一個 [...] 陣列。
  const m = r.stdout.match(/\[[\s\S]*\]/);
  if (!m) { console.error(`[news-scan] 掃描輸出無 JSON 陣列：${r.stdout.slice(0, 300)}`); return []; }
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    console.error(`[news-scan] LLM 回報 ${arr.length} 個候選`);
    return arr;
  } catch (e) {
    console.error(`[news-scan] JSON 解析失敗：${e.message}`);
    return [];
  }
}

// ── (b) 機器層複驗（防杜撰硬關卡，不信任 LLM 自述）───────────────────────────────
// stripHtml／normText（去標籤後正規化，供關鍵詞比對）見 lib/topical-text.mjs。

async function fetchOk(url) {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) { console.error(`[news-scan]   ✗ fetch ${r.status} ${url}`); return null; }
    const html = await r.text();
    console.error(`[news-scan]   ✓ fetch ${r.status} ${url}`);
    return html;
  } catch (e) {
    console.error(`[news-scan]   ✗ fetch 例外 ${url}：${e.message}`);
    return null;
  }
}

// 行政區單位字：地名切段的邊界。缺了它，全漢字長地名會整串當成單一片段。
const ADMIN_UNIT = /[省市縣県区區鄉郷鎮镇村里屯州府道都郡島岛]/;

/**
 * 把一段全漢字地名拆成可比對的行政層級片段。
 * 🔴 2026-08-22 修：原本只做 `place.match(/[一-鿿]{2,}/g)`，那個 regex 對「廣西南丹縣芒場鎮拉麻村
 * 黃祥坡屯」只會吐回**整串**（中間沒有非漢字可切），而新聞寫的是「廣西南丹縣」，於是永遠對不上。
 * 實據：2026-08-17 廣西南丹山崩連三輪被丟「無存活來源內容含關鍵詞」，第四輪 LLM 剛好把 place
 * 寫短成「廣西南丹縣」才通過（見 seo-ops/logs/folk.tw-topical-news.log）。同期韓國巨濟、菲律賓、
 * 千葉縣、四川宜賓也都是兩個來源 fetch 200 卻被丟掉。
 * 產出三種片段：累積前綴（廣西南丹縣）、本層段（芒場鎮）、去單位字的本層段（芒場）。
 */
export function adminPieces(run) {
  const out = [];
  let start = 0;
  for (let i = 0; i < run.length; i++) {
    if (!ADMIN_UNIT.test(run[i])) continue;
    out.push(run.slice(0, i + 1));
    const seg = run.slice(start, i + 1);
    out.push(seg);
    if (seg.length > 2) out.push(seg.slice(0, -1));
    start = i + 1;
  }
  if (start > 0 && start < run.length) out.push(run.slice(start));
  return out.filter((x) => x.length >= 2);
}

// 泛詞：切段時會掉出來的通用尾巴（「呂宋島為主」→「為主」），單獨出現不具辨識力，
// 留著只會讓「真 URL＋假內容」更容易矇混過關。
const ZH_STOP = new Set(['為主', '等地', '地區', '等地區', '附近', '一帶', '全境', '部分', '多處',
  '沿海', '山區', '市區', '境內', '以及', '造成', '發生', '目前', '持續']);

// 數量詞頭：緊接在數字後的漢字片段若由這些字起頭，它是「數字＋量詞」的尾巴，不是地名或事件詞。
const COUNTER_HEAD = /^[人名萬万億亿千百棟栋戶户間间日月年時时分秒起件輛辆架艘層层公毫度歲岁條条處处位個个場场餘余多]/;

/**
 * 從 place / placeEn / summary 萃取可比對的關鍵詞。
 * 🔴 2026-08-22 一併修掉 summary 被數字切碎的問題：LLM 摘要寫「…已造成至少 27 人死亡、5 萬人受災」，
 * 舊版抽出的是 `人死亡`／`萬人受災`／`人被埋` 這種碎片。它們**兩面都壞**——對真事件幾乎不會命中
 * （來源的措辭不同），對假事件卻很容易命中（任何一篇災難報導都有「人死亡」），等於同時提高誤殺率
 * 與降低守門力。本檢查的用途是擋「真 URL＋假內容」，所以碎片一律丟掉。
 */
export function keywordsOf(cand) {
  const kws = new Set();
  const place = String(cand.place || '');
  if (place) kws.add(normText(place));
  for (const run of (place.match(/[一-鿿]{2,}/g) || [])) {
    kws.add(normText(run));
    for (const piece of adminPieces(run)) kws.add(normText(piece));
  }
  // summary：取 3 字以上漢字片段，但丟掉緊接數字之後的量詞尾巴。
  const summary = String(cand.summary || '');
  const re = /[一-鿿]{3,}/g;
  let m;
  while ((m = re.exec(summary)) !== null) {
    const afterDigit = m.index > 0 && /[0-9０-９]/.test(summary[m.index - 1]);
    if (afterDigit && COUNTER_HEAD.test(m[0])) continue;
    kws.add(normText(m[0]));
  }
  return [...kws].filter((k) => k && !ZH_STOP.has(k));
}

// 外文來源比對用的通用詞，單獨出現不具辨識力。
const LATIN_STOP = new Set(['city', 'province', 'island', 'county', 'region', 'state', 'district',
  'town', 'village', 'north', 'south', 'east', 'west', 'central', 'northern', 'southern', 'eastern',
  'western', 'airport', 'national', 'park', 'area', 'areas', 'near', 'from', 'that', 'with', 'their']);

/**
 * placeEn → 拉丁字關鍵詞。
 * 🔴 2026-08-22 新增。舊版只有中文關鍵詞，對**外文來源**永遠不可能命中：2026-08-17 菲律賓
 * （philstar／manilatimes）、韓國巨濟（koreatimes／xinhua 英文版）、千葉縣（japantimes／
 * newsonjapan）都是兩個來源都活著、內容也真的在講那件事，卻因為頁面是英文而被判「內容對不上」。
 * placeEn 由偵察員照抄來源裡的拼法（prompt 明令不得自己音譯），只用於比對，不進任何面向使用者的文字。
 */
export function latinKeywordsOf(cand) {
  const en = String(cand.placeEn || '');
  if (!en) return [];
  const toks = en.toLowerCase().match(/[a-z]{4,}/g) || [];
  return [...new Set(toks.filter((t) => !LATIN_STOP.has(t)))];
}

async function verifyCandidate(cand) {
  const label = `${cand.eventType || '?'}@${cand.place || '?'}`;
  console.error(`[news-scan] 複驗候選：${label}（time=${cand.time}）`);

  if (!VALID_EVENT_TYPES.has(cand.eventType)) {
    console.error(`[news-scan]   丟棄：eventType 非法（${cand.eventType}）`); return null;
  }
  if (!cand.place || !/^\d{4}-\d{2}-\d{2}$/.test(String(cand.time || ''))) {
    console.error(`[news-scan]   丟棄：place/time 缺漏或格式錯`); return null;
  }
  // 時效防護：只收近 21 天內、非未來的事件（擋 LLM 誤回舊聞或錯誤日期而以 since=today 開成 active）。
  const ageDays = (Date.parse(today) - Date.parse(cand.time)) / 864e5;
  if (!Number.isFinite(ageDays) || ageDays > 21 || ageDays < -1) {
    console.error(`[news-scan]   丟棄：事件日期過舊或未來（${cand.time}）`); return null;
  }
  const declared = Array.isArray(cand.sources) ? cand.sources.filter((s) => s && typeof s.url === 'string') : [];
  const httpSrc = declared.filter((s) => /^https?:\/\//i.test(s.url));
  if (httpSrc.length < 2) {
    console.error(`[news-scan]   丟棄：http(s) 來源不足 2（有 ${httpSrc.length}）`); return null;
  }

  // 逐一 fetch，保留最終 2xx 者。
  const alive = [];
  const aliveHtml = [];
  for (const s of httpSrc) {
    const html = await fetchOk(s.url);
    if (html != null) { alive.push(s); aliveHtml.push(html); }
  }
  if (alive.length < 2) {
    console.error(`[news-scan]   丟棄：存活來源不足 2（存活 ${alive.length}）`); return null;
  }

  // 內容對得上：至少 1 個存活頁 HTML 含事件關鍵詞（擋「真 URL＋假內容」）。
  // normText 已小寫化並去空白，中文與拉丁字關鍵詞可以掃同一份 body。
  const kws = keywordsOf(cand);
  const latin = latinKeywordsOf(cand);
  let matched = false, matchInfo = '';
  for (let i = 0; i < aliveHtml.length; i++) {
    const body = normText(stripHtml(aliveHtml[i]));
    const hit = kws.find((k) => k.length >= 2 && body.includes(k))
      || latin.find((k) => body.includes(k));
    if (hit) { matched = true; matchInfo = `「${hit}」命中 ${alive[i].url}`; break; }
  }
  if (!matched) {
    console.error(`[news-scan]   丟棄：無存活來源內容含關鍵詞（kws=${kws.join('/')}${latin.length ? `｜en=${latin.join('/')}` : '｜en=（無 placeEn）'}）`);
    return null;
  }
  console.error(`[news-scan]   ✓ 通過複驗：存活來源 ${alive.length}，內容 ${matchInfo}`);
  return { ...cand, sources: alive };
}

// ── (c) id 生成（deterministic 永久承諾）───────────────────────────────────────
function makeId(cand) {
  const hash6 = createHash('sha1').update(normPlace(cand.place) + cand.time).digest('hex').slice(0, 6);
  const ymd = cand.time.replace(/-/g, '');
  return `news-${cand.eventType}-${ymd}-${hash6}`;
}

// ── (e) 正向議題閘＋莊重中文框架 → lib/topical-gate.mjs（P1／P2 共用同一份規則）──────────
//   本檔只提供「呼叫端身分」GATE_OPT；⚠️ 2026-08-19 前這裡有一份複製品，且與 orchestrate 那份
//   已經漂移（缺 GDACS 推估值警語、缺 2026-07-27 杜撰案例、寫「橋垮」而非「橋樑坍塌」）。

// ── 主流程 ────────────────────────────────────────────────────────────────
async function main() {
  const list = readTopical();
  const known = new Set(list.map((x) => x.id));
  let changed = false;

  const raw = scanNews();
  for (const cand of raw) {
    // (b) 複驗
    const v = await verifyCandidate(cand);
    if (!v) continue;

    // (b2) 地名 → 座標：新聞來源不給座標，沒有它下面 (d3) 的 ≤10km 判定形同虛設，
    // 同一起事件只要換個地名寫法（繁簡／縣vs自治縣vs街道）就會漏過去重而重開頁（2026-07-25 事故）。
    // 查無座標則 v.lat/lon 維持 undefined，去重自動退回字串比對，不影響原有行為。
    if (v.lat == null || v.lon == null) {
      const geo = await geocodePlace(v.place);
      if (geo) { v.lat = geo.lat; v.lon = geo.lon; console.error(`[news-scan]   地理編碼：${v.place} → ${geo.lat.toFixed(4)},${geo.lon.toFixed(4)}`); }
      else console.error(`[news-scan]   地理編碼查無「${v.place}」，去重退回字串比對`);
    }

    // (c) id
    const id = makeId(v);
    // summary 一併帶上：氣旋類的去重靠颱風名，名字通常只出現在摘要文字裡（見 lib/topical-dedup.mjs dC）。
    const rec0 = { id, eventType: v.eventType, place: v.place, time: v.time, lat: v.lat, lon: v.lon, sources: v.sources, summary: v.summary };

    // (d) 去重：id 已存在，或 findDuplicate 命中四道規則之一（見 lib/topical-dedup.mjs）
    const dupWhy = (d) => ({
      place: '同地同期', 'source-url': '引用同一篇報導',
      'cyclone-name': `同一個颱風「${d.name}」`, geo: '同型別且相距 ≤10km',
    }[d.rule]);
    if (known.has(id)) { console.error(`[news-scan] ${id} id 已存在，略過`); continue; }
    const dup = findDuplicate(list, rec0);
    if (dup) {
      console.error(`[news-scan] ${id}（${v.place}）與 ${dup.id} ${dupWhy(dup)}，略過`); continue;
    }

    // (e) 正向閘
    const g = gateAndFrame(v, GATE_OPT);
    if (g.verdict !== 'pass' || !g.title) {
      console.error(`[news-scan] ${id} 未過閘：${g.reason || 'block'}`); continue;
    }
    // 硬守門：面向使用者文案絕不出現具體傷亡/災損數字（見 lib/topical-guard.mjs）。
    if (hasBannedNumber(g.title)) { console.error(`[news-scan] ${id} 標題含具體數字，攔下不開頁`); continue; }
    // 硬守門：標題不得與既有頁完全相同（見 lib/topical-dedup.mjs findTitleClash）。
    const clash = findTitleClash(list, g.title);
    if (clash) { console.error(`[news-scan] ${id} 標題「${g.title}」與 ${clash.id} 完全相同，攔下不開頁`); continue; }
    let safeEvent = g.event || SAFE_EVENT;
    if (hasBannedNumber(safeEvent)) { console.error(`[news-scan] ${id} event 含具體數字，改用無數字祈福語`); safeEvent = SAFE_EVENT; }

    // (f) 寫入
    // 颱風中文名（取自摘要＋剛產出的標題／祈福語）留檔：供跨產線去重，也讓 P4 知道
    // 「這頁已經有名字了、不必再補名」。只認 CWA 正式名單，抽不到就留空。
    const cycloneNameZh = v.eventType === 'cyclone'
      ? officialCycloneName(eventText({ ...v, title: g.title, event: safeEvent })) : null;
    const rec = makeBlessingRecord({
      id, eventType: v.eventType, title: g.title, event: safeEvent, sources: v.sources,
      place: v.place, time: v.time, cycloneNameZh, lat: v.lat, lon: v.lon,
      detector: 'news', since: today,
    });

    // (f2) 過閘後再驗一次去重：颱風名有時只出現在 (e) 才產出的標題／祈福語裡
    //      （摘要可能只寫「熱帶氣旋」不提名字），(d) 那輪自然抓不到。多驗一次不花成本。
    const dup2 = findDuplicate(list, { ...rec0, title: rec.title, event: rec.event });
    if (dup2) {
      console.error(`[news-scan] ${id}（${g.title}）與 ${dup2.id} ${dupWhy(dup2)}，略過（過閘後複驗）`); continue;
    }
    if (!DRY) { list.push(rec); known.add(id); changed = true; }
    reportPublished(id, g.title);
  }

  if (changed && !DRY) writeTopical(list);
}

// 被直接執行才跑；被 import 時只提供上面那些函式、不產生任何副作用
// （這個 seam 就是把 gate/類型表/紀錄形狀抽成共用模組的前提，見檔頭）。
if (import.meta.url === `file://${process.argv[1]}`) await main();
