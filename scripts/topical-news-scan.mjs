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
import { VALID_EVENT_TYPES, stripHtml, normText, foldHan } from './lib/topical-text.mjs';
import { readFileSync as _readSt, writeFileSync as _writeSt, mkdirSync as _mkdirSt } from 'node:fs';

// 偵測器健康狀態（2026-08-22）。**刻意放 repo 外**：cron 在 sparse worktree 執行，
// 寫進 repo 會被 `git diff --quiet src/data/topical.json` 之外的硬檢查擋下，或被一起 commit。
const HEALTH = '/root/.config/folk-tw/topical-scan-health.json';
const readHealth = () => { try { return JSON.parse(_readSt(HEALTH, 'utf8')); } catch { return { consecutiveFailures: 0 }; } };
const writeHealth = (h) => {
  try { _mkdirSt('/root/.config/folk-tw', { recursive: true }); _writeSt(HEALTH, JSON.stringify(h, null, 2) + '\n'); }
  catch (e) { console.error(`[news-scan] 健康狀態寫入失敗（${e.message}）——告警可能失準`); }
};
import { gateAndFrame } from './lib/topical-gate.mjs';
import { readTopical, writeTopical, makeBlessingRecord } from './lib/topical-record.mjs';
import { reportPublished, reportScanFailed, reportScanRecovered, reportCandidateStuck } from './lib/topical-report.mjs';

// ── 候選連續被丟棄的健康記錄（2026-08-22）────────────────────────────────────
// 🔴 為什麼要有：掃描器好好的、候選也回報了，卻每一輪都被複驗丟掉——而這一路上**完全沒有訊號**。
//    log 實據：`fire@台中市中區（西北大飯店舊址）` 連 3 輪判「存活來源不足 2」，
//    彰化旭光路氣爆、台南關廟、南投竹山同型，全部靜音。整份 log 137 次複驗有 85 次丟棄，
//    人為類通過率 25%（天災 41%）——「人為災害沒有入選」是從這裡漏的，不是類型表。
// ⚠️ 寫在**repo 外**的同一個健康檔（cron 跑在 sparse worktree，寫進 repo 會被硬檢查擋下）。
//    以「正規化地名」為鍵，因為偵察員每輪的 place 字串可能小幅不同。
//    只保留最近 30 天，否則這個檔會無限長大。
const REJ_ALERT_ROUNDS = 3;
function noteRejected(place, reason) {
  if (DRY) return;                       // --dry 一律不寫任何狀態（含 repo 外的健康檔）
  const key = normPlace(String(place ?? '')).slice(0, 24);
  if (!key) return;
  const h = readHealth();
  const rej = h.rejected ?? {};
  const prev = rej[key] ?? { rounds: 0 };
  rej[key] = { rounds: prev.rounds + 1, reason, last: today, alerted: prev.alerted ?? false };
  h.rejected = rej;
  writeHealth(h);
}
/** 複驗通過就把該地名的連續丟棄歸零——否則同一地名的下一個事件會帶著舊帳。 */
function clearRejected(place) {
  if (DRY) return;
  const key = normPlace(String(place ?? '')).slice(0, 24);
  if (!key) return;
  const h = readHealth();
  if (h.rejected?.[key]) { delete h.rejected[key]; writeHealth(h); }
}
/**
 * 掃完一輪後統一報告：達門檻且尚未報過的才印，避免每輪重複刷同一則。
 * ⚠️ **讀與印在 --dry 也照跑**（手動驗證時要看得到有什麼卡住），
 *    但 `alerted` 標記與過期清理只在正式跑時寫回——否則一次 dry 就把告警吃掉。
 */
function reportStuckCandidates() {
  const h = readHealth();
  const rej = h.rejected ?? {};
  const cutoff = new Date(Date.parse(today) - 30 * 86400000).toISOString().slice(0, 10);
  let changed = false;
  for (const [key, v] of Object.entries(rej)) {
    if ((v.last ?? '') < cutoff) { delete rej[key]; changed = true; continue; }
    if (v.rounds >= REJ_ALERT_ROUNDS && !v.alerted) {
      reportCandidateStuck(key, v.rounds, v.reason);
      v.alerted = true; changed = true;
    }
  }
  if (changed && !DRY) { h.rejected = rej; writeHealth(h); }
}

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
- **嚴禁虛構**：不得編造網址、不得編造傷亡數字、不得杜撰不存在的事件。每筆請附 **3–4 個**「彼此獨立」的真實新聞來源網址（不同媒體），且那些網址必須是你搜尋時真的看到的。
  （機器複驗只需要 2 個能抓得到的；多給幾個是因為新聞網站常擋機房 IP 或臨時抓不到，
  只給 2 個時**一個抓不到整筆事件就被丟掉**——這是目前候選被丟棄的最大單一原因。）
- **不要用 ettoday.net 當來源**：該站擋本機的機房 IP，一定抓不到，等於白給一個來源。
  台灣新聞請優先用 cna.com.tw、udn.com、ltn.com.tw、chinatimes.com、setn.com、newtalk.tw（皆實測可抓）。
- 地名用**來源原文**（中文來源如「重慶市彭水縣」直接沿用原漢字，不另譯）。
- placeEn 只在來源本身是外文時填，且**必須照抄來源裡出現的拼法**（如 Geoje、Luzon、Munich）；
  不得自己音譯中文地名，不確定就留空字串——它只用於機器複驗比對，填錯會讓真事件被丟掉。
- summary 只寫一句可查證的事實，勿誇大。

只輸出**嚴格單行 JSON 陣列**，每筆物件格式：
{"eventType":"landslide|bridge-collapse|gas-explosion|fire|flood|storm|volcano|cyclone|wildfire|aviation|rail|maritime|building-collapse|crowd-crush|industrial|other","place":"來源原文地名","placeEn":"來源若為外文，寫該來源使用的英文／羅馬拼音地名；中文來源或不確定就給空字串","time":"YYYY-MM-DD","summary":"一句事實","sources":[{"ref":"媒體名","url":"https://…"},{"ref":"媒體名","url":"https://…"},{"ref":"媒體名","url":"https://…"}]}
除了這行 JSON 陣列外不要輸出任何其他文字。查無則輸出：[]`;

  const r = spawnSync('claude', ['-p', PROMPT, '--model', 'claude-sonnet-5'],
    { encoding: 'utf8', timeout: 180000, env: { ...process.env, IS_SANDBOX: '1' } });
  if (r.status !== 0 || !r.stdout) {
    // 🔴 2026-08-22：這裡原本只 console.error 就 return []，於是腳本 exit 0、cron 印「無變更」，
    // 整條偵測管線可以**完全靜音地停擺好幾天**（實據見 topical-report.mjs 的 reportScanFailed）。
    // 現在把連續失敗次數記在 repo 外的健康檔，並用摘要協定往上報，由 cron 決定要不要告警。
    const h = readHealth();
    h.consecutiveFailures = (h.consecutiveFailures ?? 0) + 1;
    h.lastFailureDetail = `status=${r.status} ${(r.stderr || '').slice(0, 200)}`.trim();
    writeHealth(h);
    console.error(`[news-scan] claude 掃描失敗（status=${r.status}，連續第 ${h.consecutiveFailures} 次）：${(r.stderr || '').slice(0, 300)}`);
    // 門檻 2：每 8 小時一輪，連兩次代表已經瞎了約 16 小時，超過單次網路抖動的範圍。
    if (h.consecutiveFailures >= 2) reportScanFailed(h.consecutiveFailures, h.lastFailureDetail);
    return [];
  }
  {
    const h = readHealth();
    if ((h.consecutiveFailures ?? 0) > 0) {
      if (h.consecutiveFailures >= 2) reportScanRecovered(h.consecutiveFailures);
      writeHealth({ consecutiveFailures: 0 });
    }
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

// 🔴 2026-08-22：對本機**結構性不可達**的來源網域。實測（node fetch＋curl -4／-6 皆試）：
//    ettoday.net 的 DNS 只有 IPv4（219.85.79.131），連首頁都 ECONNRESET／000，
//    ＝對方擋機房 IP，不是偶發、重試也救不回。它是台灣災害新聞最大宗來源之一，
//    偵察員很愛選它，於是**台灣本地災害特別容易死在「存活來源不足 2」**——
//    log 實據：台中西北大飯店舊址火災連 3 輪、彰化旭光路氣爆、台南關廟、南投竹山全是這樣沒的。
//    列在這裡有兩個作用：① prompt 明講不要用 ② log 標成「已知不可達」而不是一般失敗，
//    以免下一個人又把它當偶發網路問題查一次。
//    ⚠️ 這是**觀測清單不是黑名單**：對方哪天放行，把它從這裡拿掉即可，沒有其他地方依賴它。
const UNREACHABLE_HOSTS = ['ettoday.net', 'www.ettoday.net'];

const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };

/**
 * 抓來源頁。**失敗會重試一次**（2026-08-22 加）。
 * 🔴 為什麼要重試：整份 log 137 次複驗裡有 34 次死在「存活來源不足 2」，佔全部丟棄的 40%。
 *    2026-08-22 拿 log 裡失敗過的網址重跑，`bjnews.com.cn` 與 `news.yahoo.co.jp` **當場都回 200**
 *    ——那些是暫時性失敗，而舊版一次失敗就把整個候選判死。
 * ⚠️ 只重試**網路例外**，不重試 4xx／5xx：對方明講拒絕（如 mb.com.ph 常態 403）再打一次
 *    只是多花 15 秒，而 P2 每輪要抓十幾個網址。
 */
async function fetchOk(url) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  const known = UNREACHABLE_HOSTS.includes(hostOf(url));
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!r.ok) { console.error(`[news-scan]   ✗ fetch ${r.status} ${url}`); return null; }
      const html = await r.text();
      console.error(`[news-scan]   ✓ fetch ${r.status} ${url}${attempt > 1 ? '（重試後成功）' : ''}`);
      return html;
    } catch (e) {
      const tag = known ? '已知不可達（擋機房 IP，重試無用）' : e.message;
      if (known || attempt === 2) { console.error(`[news-scan]   ✗ fetch 例外 ${url}：${tag}`); return null; }
      console.error(`[news-scan]   … fetch 例外 ${url}：${e.message}，2 秒後重試`);
      await new Promise((res) => setTimeout(res, 2000));
    }
  }
  return null;
}

// 行政區單位字：地名切段的邊界。缺了它，全漢字長地名會整串當成單一片段。
const ADMIN_UNIT = /[省市縣県区區鄉郷鎮镇村里屯州府道都郡島岛]/;

// 國名／地區前綴。⚠️ 2026-08-22 稽核抓到：`adminPieces('日本千葉縣')` 產不出「千葉縣」
// （整串沒有行政區單位字可切在「千葉縣」之前），而 log 裡被誤殺最多次的正是這種寫法
// （「菲律賓碧瑤市」連四輪）。命中前綴時額外把去掉國名的餘段再切一次。
const COUNTRY_PREFIX = ['日本', '韓國', '南韓', '北韓', '中國', '美國', '菲律賓', '印尼', '印度',
  '越南', '泰國', '緬甸', '寮國', '柬埔寨', '馬來西亞', '新加坡', '尼泊爾', '孟加拉', '巴基斯坦',
  '阿富汗', '伊朗', '土耳其', '俄羅斯', '墨西哥', '巴西', '智利', '秘魯', '義大利', '法國',
  '德國', '西班牙', '希臘', '台灣', '臺灣'];

// 只有一層行政區的裸名稱：太常見，單獨命中不構成「這頁在講這件事」。
// 稽核實測：`新北市中和區` 產出的「新北市」在中時即時新聞首頁就命中，等於守門失效。
const BARE_ADMIN = new Set(['台北市', '臺北市', '新北市', '桃園市', '台中市', '臺中市', '台南市',
  '臺南市', '高雄市', '基隆市', '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '臺東縣', '澎湖縣', '金門縣', '連江縣']);

/**
 * 把一段全漢字地名拆成可比對的行政層級片段。
 * 🔴 2026-08-22 修：原本只做 `place.match(/[一-鿿]{2,}/g)`，那個 regex 對「廣西南丹縣芒場鎮拉麻村
 * 黃祥坡屯」只會吐回**整串**（中間沒有非漢字可切），而新聞寫的是「廣西南丹縣」，於是永遠對不上。
 * 🔴 **原本這裡寫的實據是編的（2026-08-22 稽核打回）**：初版寫「廣西南丹連三輪被丟、第四輪 LLM
 * 把 place 寫短成『廣西南丹縣』才通過」。log 實際上是第 831 行丟過**一次**，第 855 行就用**同一個
 * 長地名**通過（命中整串、來源 ntdtv）並開了頁；877 之後那幾次被丟都發生在頁面開好之後。
 * 站得住的實據只有這句：廣西南丹、韓國巨濟、菲律賓、千葉縣、四川宜賓、河北石家庄**六筆都是
 * 兩個來源 `✓ fetch 200` 之後才被判「無存活來源內容含關鍵詞」**——那才是這個修法要解的問題。
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
    // 🔴 2026-08-22 第二輪修：**單位字不足時，本層段會整串黏在一起**。
    //    實測案例＝`河北石家庄新华区`（燃氣爆燃、有人罹難的人為災害）：整串只有句尾一個「区」，
    //    `石家庄` 沒有「市」字可切，於是只產出「河北石家庄新华区」與「河北石家庄新华」兩個片段，
    //    而新華網／央視寫的是「石家庄市新华区」——兩個來源都 fetch 200、內容也真的在講那件事，
    //    卻被判「無存活來源內容含關鍵詞」而丟棄。
    //    補法：本層段長於 3 時，額外吐出**以單位字收尾的 3～6 字尾段**（新华区／家庄新华区／
    //    石家庄新华区）。多出來的中間切點（家庄新华区）不會在真實文字裡出現，命中不了也無害；
    //    真正要救的是最短的那個行政區名。
    //    ⚠️ 仍受下方 `length >= 2` 與 `BARE_ADMIN` 過濾，且比對端另有 3 字下限——
    //    這裡不放寬任何一道，只是把「切不出來」變成「切得出來」。
    for (let n = 3; n <= 6 && n < seg.length; n++) out.push(seg.slice(seg.length - n));
    start = i + 1;
  }
  if (start > 0 && start < run.length) out.push(run.slice(start));
  // 去掉國名前綴後再切一次（日本千葉縣 → 千葉縣 → 千葉）。
  for (const c of COUNTRY_PREFIX) {
    if (run.startsWith(c) && run.length > c.length) {
      const rest = run.slice(c.length);
      out.push(rest, ...adminPieces(rest));
      break;
    }
  }
  return out.filter((x) => x.length >= 2 && !BARE_ADMIN.has(x));
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
    // ⚠️ 2026-08-22 稽核打回首版：首版是「命中量詞頭就丟掉整段」，而中文摘要寫
    // 「8月15日本州東北部發生規模6山崩」是常態，`日` 在量詞表裡 → 整句地名陪葬
    // （實測 `2026年8月20日台南市永康區發生氣爆` 只剩「波及數棟民宅」）。
    // 改成**只剝掉開頭的量詞字**，剩下的照收：`人死亡`→`死亡`（<3 丟）、
    // `日本州東北部發生規模`→`本州東北部發生規模`（留）。
    const afterDigit = m.index > 0 && /[0-9０-９]/.test(summary[m.index - 1]);
    const seg = afterDigit ? m[0].replace(new RegExp(`^${COUNTER_HEAD.source.slice(1)}+`), '') : m[0];
    if (seg.length < 3) continue;
    kws.add(normText(seg));
  }
  return [...kws].filter((k) => k && !ZH_STOP.has(k));
}

// 外文來源比對用的通用詞，單獨出現不具辨識力。
// ⚠️ 2026-08-22 稽核實測，首版這份名單漏了國名與 `prefecture`，導致
// `placeEn='Chiba Prefecture'` 在 japantimes **首頁**就命中「japan」→ 守門形同關閉。
// normText 會去掉所有空白、比對是子字串，所以無法用單字邊界，只能靠名單與長度下限。
const LATIN_STOP = new Set(['city', 'province', 'prefecture', 'island', 'islands', 'county',
  'region', 'state', 'district', 'town', 'village', 'north', 'south', 'east', 'west', 'central',
  'northern', 'southern', 'eastern', 'western', 'airport', 'national', 'park', 'area', 'areas',
  'mount', 'mountain', 'river', 'valley', 'coast', 'municipality', 'barangay',
  // 國名／大區：出現在任何一篇該國新聞（甚至首頁）都不奇怪，不具辨識力
  'japan', 'china', 'korea', 'taiwan', 'philippines', 'indonesia', 'vietnam', 'thailand',
  'malaysia', 'singapore', 'india', 'nepal', 'myanmar', 'cambodia', 'russia', 'turkey',
  'mexico', 'brazil', 'chile', 'peru', 'italy', 'france', 'germany', 'spain', 'greece',
  'america', 'american', 'asia', 'asian', 'europe']);

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
  // 下限 5：4 字的拉丁片段太容易在無關頁面裡出現。Geoje／Luzon／Chiba／Baguio 皆 ≥5。
  const toks = en.toLowerCase().match(/[a-z]{5,}/g) || [];
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
    console.error(`[news-scan]   丟棄：http(s) 來源不足 2（有 ${httpSrc.length}）`);
    noteRejected(cand.place, 'http(s) 來源不足 2'); return null;
  }

  // 逐一 fetch，保留最終 2xx 者。
  const alive = [];
  const aliveHtml = [];
  for (const s of httpSrc) {
    const html = await fetchOk(s.url);
    if (html != null) { alive.push(s); aliveHtml.push(html); }
  }
  if (alive.length < 2) {
    console.error(`[news-scan]   丟棄：存活來源不足 2（存活 ${alive.length}）`);
    noteRejected(cand.place, '存活來源不足 2'); return null;
  }

  // 內容對得上：至少 1 個存活頁 HTML 含事件關鍵詞（擋「真 URL＋假內容」）。
  // normText 已小寫化並去空白，中文與拉丁字關鍵詞可以掃同一份 body。
  const kws = keywordsOf(cand);
  const latin = latinKeywordsOf(cand);
  let matched = false, matchInfo = '';
  for (let i = 0; i < aliveHtml.length; i++) {
    // 🔴 兩邊都摺過字形再比（2026-08-22）：偵察員常把地名寫成正體，而來源是簡體或日文新字體。
    //    實據＝`靜岡市清水區三保` vs 日文來源的 `静岡市清水区三保`，四個來源全 200、
    //    內容也在講那件事，只因 `靜`≠`静`、`區`≠`区` 就被判「內容對不上」。見 lib/topical-text.mjs。
    //    ⚠️ 摺完只用於比對，`matchInfo` 印的仍是原始關鍵詞，log 才看得懂。
    const body = foldHan(normText(stripHtml(aliveHtml[i])));
    // 門檻 3（2026-08-22 由 2 提高）：2 字片段如「中和」「仁愛」「清水」「三民」
    // 在任何中文頁面都可能出現，稽核實測會讓假內容矇混過關。
    const hit = kws.find((k) => k.length >= 3 && body.includes(foldHan(k)))
      || latin.find((k) => body.includes(k));
    if (hit) { matched = true; matchInfo = `「${hit}」命中 ${alive[i].url}`; break; }
  }
  if (!matched) {
    console.error(`[news-scan]   丟棄：無存活來源內容含關鍵詞（kws=${kws.join('/')}${latin.length ? `｜en=${latin.join('/')}` : '｜en=（無 placeEn）'}）`);
    noteRejected(cand.place, '無存活來源內容含關鍵詞'); return null;
  }
  console.error(`[news-scan]   ✓ 通過複驗：存活來源 ${alive.length}，內容 ${matchInfo}`);
  clearRejected(cand.place);
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
  // 掃完一輪統一報告卡住的候選。--dry 也照跑（只讀不寫，見該函式檔頭）。
  reportStuckCandidates();
}

// 被直接執行才跑；被 import 時只提供上面那些函式、不產生任何副作用
// （這個 seam 就是把 gate/類型表/紀錄形狀抽成共用模組的前提，見檔頭）。
if (import.meta.url === `file://${process.argv[1]}`) await main();
