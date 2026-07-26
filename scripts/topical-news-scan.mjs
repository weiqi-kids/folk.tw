#!/usr/bin/env node
// 時事祈福 · 新聞掃描偵測器（P2）：涵蓋不在結構化 feed（USGS/GDACS）裡的新聞型災難
//   （例：2026-07-17 中國重慶彭水烏江三橋山崩）。
// 流程：LLM 用 WebSearch 掃新聞 → 機器層複驗來源（生命線，不信任 LLM 自述）→ 對
//   topical.json 去重 → 正向議題閘產莊重中文標題 → 寫入 topical.json（status:active,
//   detector:'news'）。印 PUBLISHED\t<id>\t<title>\t<url>（與 orchestrate.mjs 同格式）供 cron 發 Slack。
//   自身不碰 git。用法：node scripts/topical-news-scan.mjs [--dry]（--dry 只印不寫檔）。
//
// 為何獨立成腳本（不 import orchestrate.mjs）：orchestrate.mjs 在 import 時即執行 top-level
//   偵測/寫檔流程；故本檔允許少量複製其 gate/去重/normPlace 邏輯，換取彼此不互相觸發。
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { hasBannedNumber, SAFE_EVENT, findMainlandTerms, replaceMainlandTerms } from './lib/topical-guard.mjs';
import { geocodePlace } from './lib/topical-geo.mjs';
import { findDuplicate, normPlace, officialCycloneName, eventText } from './lib/topical-dedup.mjs';

const TOPICAL = 'src/data/topical.json';
const DRY = process.argv.includes('--dry');
const today = new Date().toISOString().slice(0, 10);

// 事件類型 → 中文標籤（與 orchestrate.mjs TYPE_LABEL 對齊）。
const TYPE_LABEL = {
  quake: '地震', cyclone: '熱帶氣旋', flood: '水災', volcano: '火山活動', wildfire: '野火',
  landslide: '山崩', 'bridge-collapse': '橋樑坍塌', fire: '火災', 'gas-explosion': '氣爆',
  storm: '風災', other: '重大事件',
};
const VALID_TYPES = new Set(Object.keys(TYPE_LABEL));

// 去重輔助已抽到 lib/topical-dedup.mjs（純函式、可用歷史事故資料回測；見該檔檔頭）。
// 本檔只在 makeId 用到 normPlace，其餘判定一律走 findDuplicate。

// ── (a) LLM 掃描：要求 claude 用 WebSearch 實際搜尋、只回找得到且點得開的事件 ──────────
function scanNews() {
  const PROMPT = `你是台灣民俗祈福站的新聞偵察員。請**用 WebSearch 實際搜尋**「過去約 72 小時內，台灣人可能會想集體祈福的重大天災或重大意外」，範圍含台灣、中國、日本、東南亞等地，事件類型如：山崩、土石流、橋樑坍塌、氣爆、重大火災、水災、風災、火山、熱帶氣旋等（地震已有其他來源，可略）。

嚴格規則：
- **只回你實際在搜尋結果中找到、且能點開閱讀的真實事件**。查無合適事件就回空陣列 []。
- **嚴禁虛構**：不得編造網址、不得編造傷亡數字、不得杜撰不存在的事件。每筆至少附 2 個「彼此獨立」的真實新聞來源網址（不同媒體），且那些網址必須是你搜尋時真的看到的。
- 地名用**來源原文**（中文來源如「重慶市彭水縣」直接沿用原漢字，不另譯）。
- summary 只寫一句可查證的事實，勿誇大。

只輸出**嚴格單行 JSON 陣列**，每筆物件格式：
{"eventType":"landslide|bridge-collapse|gas-explosion|fire|flood|storm|volcano|cyclone|wildfire|other","place":"來源原文地名","time":"YYYY-MM-DD","summary":"一句事實","sources":[{"ref":"媒體名","url":"https://…"},{"ref":"媒體名","url":"https://…"}]}
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
// 去 HTML 標籤後正規化（去空白、小寫、去標點）供關鍵詞比對。
function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
}
const normText = (s) => String(s || '').toLowerCase().replace(/[\s　]+/g, '').replace(/[，,、。.；;：:「」『』（）()\-—－]/g, '');

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

// 從 place / summary 萃取可比對的關鍵詞（中文取連續 2+ 漢字片段；再加整串 place）。
function keywordsOf(cand) {
  const kws = new Set();
  const place = String(cand.place || '');
  if (place) kws.add(normText(place));
  // 中文詞：地名的漢字段（如「重慶」「彭水」「烏江」）。
  for (const seg of (place.match(/[一-鿿]{2,}/g) || [])) kws.add(normText(seg));
  // summary 的顯著中文詞（取較長片段，避免「發生」這種泛詞誤中）。
  for (const seg of (String(cand.summary || '').match(/[一-鿿]{3,}/g) || [])) kws.add(normText(seg));
  return [...kws].filter(Boolean);
}

async function verifyCandidate(cand) {
  const label = `${cand.eventType || '?'}@${cand.place || '?'}`;
  console.error(`[news-scan] 複驗候選：${label}（time=${cand.time}）`);

  if (!VALID_TYPES.has(cand.eventType)) {
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
  const kws = keywordsOf(cand);
  let matched = false, matchInfo = '';
  for (let i = 0; i < aliveHtml.length; i++) {
    const body = normText(stripHtml(aliveHtml[i]));
    const hit = kws.find((k) => k.length >= 2 && body.includes(k));
    if (hit) { matched = true; matchInfo = `「${hit}」命中 ${alive[i].url}`; break; }
  }
  if (!matched) {
    console.error(`[news-scan]   丟棄：無存活來源內容含關鍵詞（kws=${kws.join('/')}）`); return null;
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

// ── (e) 正向議題閘＋莊重中文框架（複製自 orchestrate.mjs gateAndFrame 精神）───────────
function gateAndFrame(c) {
  // 颱風要有名字（2026-07-26 加，與 orchestrate.mjs 同規）：新聞是中文的，名字多半就在摘要裡，
  // 但「LLM 通常會自己帶到」不是保證——改成機械抽出（只認 CWA 正式名單）再硬性要求寫進標題。
  const zhName = c.eventType === 'cyclone' ? officialCycloneName(eventText(c)) : null;
  const label = zhName ? '颱風' : (TYPE_LABEL[c.eventType] ?? '重大事件');
  const nameLine = zhName ? `\n${label}名稱：「${zhName}」（中央氣象署正式中文譯名，直接照抄勿改）` : '';
  const nameRule = zhName
    ? `\n  - **標題必須寫出${label}名「${zhName}」**：形如「為${label}${zhName}祈福」或「為○○${label}${zhName}平安祈福」（○○＝受影響地區）；event 也要提到名字。名字只准照抄上面那幾個字，不得改寫或自創其他譯名。`
    : '';
  const src = c.sources?.[0]?.ref || '新聞來源';
  const PROMPT = `你是台灣民俗祈福站的守門與編輯。以下是來自新聞（「${src}」等）的災難事實：
類型：${label}
地點：「${c.place}」
日期：${c.time}${nameLine}${c.summary ? `\n事件摘要：${c.summary}` : ''}
任務(1) 相關性＋正向議題判定，pass 需同時滿足：
  a. 值得集體祈福——事件發生在有人居住/會受影響之地、有集體關切必要（**全球皆可，台灣人也會為國際重大災難如日本地震、中國山崩祈福**）；若在**無人或極少人受影響之處、無集體關切必要**，判 block（不必為每個事件都開頁）。
  b. 正向框——做「為平安／復原祈福」（集體平安、非政治、非爭議對立、非消費痛苦、非對災難算吉凶）。
  c. **災害已經實際發生，不是還在預報階段**——**沒有災害就不用祈福**。兩類分開看：
     ・地震、山崩、橋垮、氣爆、火災這種「發生即是事件」者：事實本身就代表已經發生，天然符合本條。
     ・颱風、洪水這種「先預警、後致災」者：必須**已經登陸／已經淹到／已經對人造成影響**才算；
       若報導通篇只有「預計」「可能」「將會」「發布警報」「加強戒備」這類未來式而無已發生的災情，
       判 block，等真的發生了再開（P2 每 8 小時掃一次，下一輪會再掃到，不會漏）。
  任一不符即 block。
任務(2) 若 pass，產生莊重的**台灣繁體中文**：title 形如「為○○${label}平安祈福」或「為○○祈福」，event 為一到兩句。硬性要求：${nameRule}
  - **台灣慣用語＋全形標點**（，。、；「」），**禁半形逗號句號、禁大陸用語**。
  - **地名以上述來源「${c.place}」為準**：有通用台灣譯名才用（如「土耳其」「日本能登」），**沒有就保留原名或用保守描述**；若來源本為中文地名（如「重慶市彭水縣」）則**直接沿用原漢字、不另譯不改**。數字一律照來源，勿改。
  - 只依上述事實，不誇大。**event 不要寫出任何具體傷亡／失聯／疏散人數或金額**（這些數字未經機器複驗、且常隨救援變動；具體數字留給有逐筆掛源的後續發展時間軸）。event 只做莊重的事件描述＋祈福祝願，可用「造成傷亡」「多人失聯」等不帶數字的概述。
只輸出單行 JSON：{"verdict":"pass"|"block","title":"…","event":"…"}。`;
  const r = spawnSync('claude', ['-p', PROMPT, '--model', 'claude-sonnet-5'],
    { encoding: 'utf8', timeout: 120000, env: { ...process.env, IS_SANDBOX: '1' } });
  if (r.status !== 0 || !r.stdout) return { verdict: 'block', reason: 'claude 執行失敗' };
  const m = r.stdout.match(/\{[\s\S]*\}/);
  if (!m) return { verdict: 'block', reason: '無 JSON 輸出' };
  try {
    const g = JSON.parse(m[0]);
    // 機械保底：緊鄰中文字的半形逗號/分號轉全形（英文語境不動；不碰句號免誤傷小數）。
    const zh = (s) => typeof s === 'string'
      ? s.replace(/([一-鿿])\s*,/g, '$1，').replace(/([一-鿿])\s*;/g, '$1；')
      : s;
    // 大陸用語機械替換（見 lib/topical-guard.mjs）：P2 讀的多是陸媒報導，最容易沾到。
    const tw = (s) => {
      const hits = findMainlandTerms(s);
      if (!hits.length) return s;
      console.error(`[news-scan] ⚑ 陸用語替換：${hits.map((h) => `${h.term}→${h.tw}`).join('、')}`);
      return replaceMainlandTerms(s);
    };
    g.title = tw(zh(g.title)); g.event = tw(zh(g.event));
    return g;
  } catch { return { verdict: 'block', reason: 'JSON 解析失敗' }; }
}

// ── 主流程 ────────────────────────────────────────────────────────────────
async function main() {
  const list = JSON.parse(readFileSync(TOPICAL, 'utf8'));
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
    const g = gateAndFrame(v);
    if (g.verdict !== 'pass' || !g.title) {
      console.error(`[news-scan] ${id} 未過閘：${g.reason || 'block'}`); continue;
    }
    // 硬守門：面向使用者文案絕不出現具體傷亡/災損數字（見 lib/topical-guard.mjs）。
    if (hasBannedNumber(g.title)) { console.error(`[news-scan] ${id} 標題含具體數字，攔下不開頁`); continue; }
    let safeEvent = g.event || SAFE_EVENT;
    if (hasBannedNumber(safeEvent)) { console.error(`[news-scan] ${id} event 含具體數字，改用無數字祈福語`); safeEvent = SAFE_EVENT; }

    // (f) 寫入
    // 颱風中文名（取自摘要＋剛產出的標題／祈福語）留檔：供跨產線去重，也讓 P4 知道
    // 「這頁已經有名字了、不必再補名」。只認 CWA 正式名單，抽不到就留空。
    const cycloneNameZh = v.eventType === 'cyclone'
      ? officialCycloneName(eventText({ ...v, title: g.title, event: safeEvent })) : null;
    const rec = {
      id, eventType: v.eventType, title: g.title,
      event: safeEvent,
      sources: v.sources,
      place: v.place, time: v.time,
      ...(cycloneNameZh ? { cycloneNameZh } : {}),
      ...(v.lat != null && v.lon != null ? { lat: v.lat, lon: v.lon } : {}),
      detector: 'news', since: today, status: 'active',
    };

    // (f2) 過閘後再驗一次去重：颱風名有時只出現在 (e) 才產出的標題／祈福語裡
    //      （摘要可能只寫「熱帶氣旋」不提名字），(d) 那輪自然抓不到。多驗一次不花成本。
    const dup2 = findDuplicate(list, { ...rec0, title: rec.title, event: rec.event });
    if (dup2) {
      console.error(`[news-scan] ${id}（${g.title}）與 ${dup2.id} ${dupWhy(dup2)}，略過（過閘後複驗）`); continue;
    }
    if (!DRY) { list.push(rec); known.add(id); changed = true; }
    console.log(`PUBLISHED\t${id}\t${g.title}\thttps://folk.tw/qiugian/blessing/${id}/`);
  }

  if (changed && !DRY) writeFileSync(TOPICAL, JSON.stringify(list, null, 2) + '\n');
}

await main();
