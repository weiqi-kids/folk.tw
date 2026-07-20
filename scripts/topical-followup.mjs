#!/usr/bin/env node
// 時事祈福 · 後續發展追蹤器（P4）：事件開頁後，持續追蹤後續新聞，逐筆掛源接成時間軸，
//   並把「有後續發展」的 archived 事件升為 memorial（事件記錄頁）。
// 流程：讀 topical.json → 選追蹤對象 → 每個事件用 claude+WebSearch 找「自上次以來的新進展」→
//   機器層複驗來源（生命線，不信任 LLM 自述）→ 對既有 updates 去重 → append → 升態 →
//   寫 followup 中繼 → 寫檔。印 UPDATED / MEMORIAL 摘要行供 cron 發 Slack。自身不碰 git。
//   用法：node scripts/topical-followup.mjs [--dry]（--dry 只印不寫檔）。
//
// 為何獨立成腳本：與 orchestrate.mjs（開頁）、topical-news-scan.mjs（新聞掃描開頁）、
//   orchestrator 的升 archived 職責解耦——本檔**只**做「已存在事件的後續追蹤」與「archived→memorial」，
//   **絕不**動 active→archived（那是 orchestrator 的職責）。沿用 news-scan 的機器複驗與 gate 呼叫慣例。
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { hasBannedNumber } from './lib/topical-guard.mjs';

const TOPICAL = 'src/data/topical.json';
const DRY = process.argv.includes('--dry');
const today = new Date().toISOString().slice(0, 10);
const DAY = 864e5;

// ── 機器層工具（複製自 topical-news-scan.mjs 精神，彼此不 import 以免互相觸發）─────────────
function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
}
// 全形標點機械保底：緊鄰中文字的半形逗號/分號轉全形（英文語境不動；不碰句號免誤傷小數）。
const zh = (s) => typeof s === 'string'
  ? s.replace(/([一-鿿])\s*,/g, '$1，').replace(/([一-鿿])\s*;/g, '$1；')
  : s;
// url 正規化：去協定大小寫、去尾斜線、去 hash/常見追蹤參數，供去重比對。
function normUrl(u) {
  try {
    const x = new URL(String(u).trim());
    x.hash = '';
    for (const k of [...x.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|from|share|ref)/i.test(k)) x.searchParams.delete(k);
    }
    let s = (x.host + x.pathname + (x.search || '')).toLowerCase();
    s = s.replace(/\/+$/, '');
    return s;
  } catch {
    return String(u || '').trim().toLowerCase().replace(/\/+$/, '');
  }
}
const normText = (s) => String(s || '').toLowerCase()
  .replace(/[\s　]+/g, '').replace(/[，,、。.；;：:「」『』（）()\-—－]/g, '');

async function fetchOk(url) {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) { console.error(`[followup]   ✗ fetch ${r.status} ${url}`); return false; }
    console.error(`[followup]   ✓ fetch ${r.status} ${url}`);
    return true;
  } catch (e) {
    console.error(`[followup]   ✗ fetch 例外 ${url}：${e.message}`);
    return false;
  }
}

// ── (1) 追蹤對象挑選 ──────────────────────────────────────────────────────────
function isTracked(item) {
  if (item.example) return false;
  if (item.followup?.sealed) return false;
  const st = item.status ?? 'active';
  if (!['active', 'archived', 'memorial'].includes(st)) return false;
  const ageDays = (Date.parse(today) - Date.parse(item.since)) / DAY;
  if (!Number.isFinite(ageDays) || ageDays > 90) return false;
  return true;
}

// ── (2) LLM 查後續：要求 claude 用 WebSearch 實際搜尋、只回「自上次以來、尚未記錄過的新進展」──
function scanFollowup(item) {
  const existing = (item.updates ?? [])
    .map((u) => `- ${u.date ?? ''}：${u.text ?? ''}`)
    .filter((s) => s.trim() !== '-：')
    .join('\n');
  const knownBlock = existing
    ? `\n【本站已記錄過的後續發展（請勿重複回報，只回自這些之後的新進展）】\n${existing}\n`
    : '\n【本站尚未記錄任何後續發展】\n';

  const PROMPT = `你是台灣民俗祈福站的後續發展追蹤員。以下是一則已建立祈福頁的重大事件，請**用 WebSearch 實際搜尋**它的**最新後續發展**。
【事件】
標題：${item.title}
地點：${item.place ?? '（見標題）'}
發生日期：${item.time ?? item.since}
${item.event ? `事件摘要：${item.event}` : ''}${knownBlock}
請搜尋並回報自上次記錄以來的**新進展**，例如：救援與搜救進度、傷亡人數的最終定案、失蹤者尋獲、災民安置與重建進度、事故原因調查結果、究責與司法進展、官方善後決策等。

嚴格規則：
- **只回你實際在搜尋結果中找到、且能點開閱讀的真實進展**。查無新進展、或找到的都是上面已記錄過的舊消息，就回空陣列 []。
- **只回自上次記錄以來、且本站尚未記錄過的新進展**；與上面【已記錄】清單重複者不要回。
- **嚴禁虛構**：不得編造網址、不得編造傷亡數字、不得杜撰不存在的進展。每筆至少附 1 個真實、可查證、你搜尋時真的看到的新聞來源網址。
- 語氣**莊重、中性、點到為止**；後續發展以**救援、搜救、安置、重建、調查等進展**為主。
- **不寫任何具體數字**（傷亡／失聯／疏散／受損棟數／人力／裝備數量／金額等一律不寫；如需提及以「已尋獲失聯者」「災區居民已安置」「搶險持續進行」等不帶數字的概述）；**不細數傷亡、不煽情、不消費痛苦、不幸災樂禍、不評論吉凶**。
- text 為**一句中性事實**的台灣繁體中文，用**台灣慣用語＋全形標點（，。、；「」）**，禁半形逗號句號、禁大陸用語。date 用該進展被報導的日期。

只輸出**嚴格單行 JSON 陣列**，每筆物件格式：
{"date":"YYYY-MM-DD","text":"一句中性事實","sources":[{"ref":"媒體名","url":"https://…"}]}
除了這行 JSON 陣列外不要輸出任何其他文字。查無新進展則輸出：[]`;

  const r = spawnSync('claude', ['-p', PROMPT, '--model', 'claude-sonnet-5'],
    { encoding: 'utf8', timeout: 180000, env: { ...process.env, IS_SANDBOX: '1' } });
  if (r.status !== 0 || !r.stdout) {
    console.error(`[followup] claude 追蹤失敗（status=${r.status}）：${(r.stderr || '').slice(0, 300)}`);
    return [];
  }
  const m = r.stdout.match(/\[[\s\S]*\]/);
  if (!m) { console.error(`[followup] 追蹤輸出無 JSON 陣列：${r.stdout.slice(0, 300)}`); return []; }
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    console.error(`[followup] LLM 回報 ${arr.length} 個候選後續`);
    return arr;
  } catch (e) {
    console.error(`[followup] JSON 解析失敗：${e.message}`);
    return [];
  }
}

// ── (3) 機器層複驗（不信任 LLM 自述）+ (4) 去重 ───────────────────────────────
// 事件相關期間：發生日前一天 ~ 今天（含）；擋 LLM 誤回事件前的舊聞或未來日期。
function eventStart(item) {
  const t = Date.parse(item.time || item.since);
  return Number.isFinite(t) ? t : Date.parse(item.since);
}

async function verifyUpdate(item, u, existingHashes, existingUrls) {
  const text = zh(String(u.text ?? '').trim());
  const label = `${(text || '(空)').slice(0, 24)}…`;
  console.error(`[followup] 複驗後續：「${label}」（date=${u.date}）`);

  if (!text) { console.error('[followup]   丟棄：text 空'); return null; }
  // 硬守門：後續更新絕不出現具體傷亡/災損數字（見 lib/topical-guard.mjs）——觸雷即丟棄該筆。
  if (hasBannedNumber(text)) { console.error(`[followup]   丟棄：含具體傷亡/災損數字「${text.slice(0, 30)}…」`); return null; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(u.date || ''))) {
    console.error(`[followup]   丟棄：date 格式非法（${u.date}）`); return null;
  }
  const d = Date.parse(u.date);
  if (!Number.isFinite(d)) { console.error(`[followup]   丟棄：date 無法解析（${u.date}）`); return null; }
  if (d > Date.parse(today)) { console.error(`[followup]   丟棄：date 為未來（${u.date}）`); return null; }
  if (d < eventStart(item) - 1 * DAY) {
    console.error(`[followup]   丟棄：date 早於事件發生期間（${u.date} < ${item.time ?? item.since}）`); return null;
  }

  const declared = Array.isArray(u.sources) ? u.sources.filter((s) => s && typeof s.url === 'string') : [];
  const httpSrc = declared.filter((s) => /^https?:\/\//i.test(s.url));
  if (httpSrc.length < 1) { console.error('[followup]   丟棄：無 http(s) 來源'); return null; }

  // 逐一 fetch，要求至少 1 個最終 2xx 存活；只保留存活來源。
  const alive = [];
  for (const s of httpSrc) {
    if (await fetchOk(s.url)) alive.push({ ref: s.ref, url: s.url });
  }
  if (alive.length < 1) { console.error('[followup]   丟棄：無存活來源（最終 2xx = 0）'); return null; }

  // 去重：hash = sha1(正規化(sources url 集) + 正規化(text)).slice(0,12)。
  const urlKey = [...new Set(alive.map((s) => normUrl(s.url)))].sort().join('|');
  const hash = createHash('sha1').update(urlKey + '::' + normText(text)).digest('hex').slice(0, 12);
  if (existingHashes.has(hash)) {
    console.error(`[followup]   丟棄：hash 已存在（${hash}）`); return null;
  }
  for (const s of alive) {
    if (existingUrls.has(normUrl(s.url))) {
      console.error(`[followup]   丟棄：來源 url 已見於既有 update（${s.url}）`); return null;
    }
  }

  console.error(`[followup]   ✓ 通過複驗：存活來源 ${alive.length}，hash=${hash}`);
  return { date: u.date, text, sources: alive, added: new Date().toISOString(), hash };
}

// ── 主流程 ────────────────────────────────────────────────────────────────
async function main() {
  const list = JSON.parse(readFileSync(TOPICAL, 'utf8'));
  let changed = false;

  const targets = list.filter(isTracked);
  console.error(`[followup] 追蹤對象 ${targets.length} 件：${targets.map((t) => t.id).join(', ') || '（無）'}`);

  for (const item of targets) {
    console.error(`\n[followup] === ${item.id}（${item.title}）===`);
    item.updates = Array.isArray(item.updates) ? item.updates : [];

    // 既有 updates 的 hash / url 集（去重基準）
    const existingHashes = new Set(item.updates.map((x) => x.hash).filter(Boolean));
    const existingUrls = new Set();
    for (const x of item.updates) {
      for (const s of (x.sources ?? [])) if (s?.url) existingUrls.add(normUrl(s.url));
    }

    const cand = scanFollowup(item);
    const fresh = [];
    for (const u of cand) {
      const v = await verifyUpdate(item, u, existingHashes, existingUrls);
      if (!v) continue;
      // 同一輪內也去重（避免 LLM 一次回兩筆相同）
      existingHashes.add(v.hash);
      for (const s of v.sources) existingUrls.add(normUrl(s.url));
      fresh.push(v);
    }

    // (5) append + 升態
    const pageUrl = `https://folk.tw/qiugian/blessing/${item.id}/`;
    if (fresh.length > 0) {
      for (const v of fresh) {
        item.updates.push(v);
        console.log(`UPDATED\t${item.id}\t${item.title}\t${v.text}\t${pageUrl}`);
      }
      item.updates.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
      changed = true;
    }

    // archived + 非範例 + 有 updates → 升 memorial（不動 active→archived）
    if (item.status === 'archived' && !item.example && item.updates.length > 0) {
      item.status = 'memorial';
      item.memorial_at = today;
      console.log(`MEMORIAL\t${item.id}\t${item.title}\t${pageUrl}`);
      changed = true;
    }

    // (6) followup 中繼
    const prev = item.followup ?? {};
    const empty_runs = fresh.length > 0 ? 0 : ((prev.empty_runs || 0) + 1);
    const ageDays = (Date.parse(today) - Date.parse(item.since)) / DAY;
    const sealed = empty_runs >= 14 || ageDays > 90;
    item.followup = { sealed, last_checked: today, empty_runs };
    if (JSON.stringify(prev) !== JSON.stringify(item.followup)) changed = true;
    console.error(`[followup] ${item.id} → 新增 ${fresh.length} 筆；followup=${JSON.stringify(item.followup)}`);
  }

  if (changed && !DRY) {
    writeFileSync(TOPICAL, JSON.stringify(list, null, 2) + '\n');
    console.error('[followup] 已寫回 topical.json');
  } else if (DRY) {
    console.error('[followup] --dry：不寫檔');
  } else {
    console.error('[followup] 無變更');
  }
}

await main();
