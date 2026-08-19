#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// gate：來源掛得住嗎。四條規則，全部是 2026-08-19 兩次查證換來的。
// ═══════════════════════════════════════════════════════════════════════════
//
// 本站第一紅線是「絕不杜撰，所有事實逐筆掛源，**來源要能被機器複驗**」。
// 這支就是那句話的機械層——它擋的是四種「掛了源但其實掛不住」的情形：
//
// ① **caseId 掛到不存在的個案**（實際發生過，2026-08-19 修）
//    `src/data/festivals.json` 三頁掛了四個不存在的 nchdb caseId，撐了約四個月。
//    nchdb 前台是 SPA，不同 caseId 回傳的 HTML 位元組數完全相同、robots.txt 404
//    → **HTTP 層驗不出來**，只有拿官方名錄比對才抓得到。名錄快照在
//    `src/data/nchdb-folklore-index.json`（產生器 scripts/refresh-nchdb-index.mjs）。
//    ⚠️ 兩種書寫形式都要驗：個案網址 `…/folklore/<14 位>`，以及
//    `events.json` 的 `heritage.authority_ref` 那種「府文資字第…號（nchdb <14 位>）」。
//    先前只驗網址形式，非網址形式漏在外面。
//
// ② **逐字引用掛到沒有授權的來源**
//    本站有兩批「逐字引用、不改寫」的內容，各自綁著一次明確授權：
//      ・`religion.moi.gov.tw`（內政部，2026-08-06，條件＝標示資料來源連結）
//      ・`nchdb.boch.gov.tw`／`data.boch.gov.tw`（文化部，2026-08-09，條件＝掛個案網址）
//    逐字引用是**授權範圍最窄的用法**，所以來源網域用白名單制：不在名單上就擋。
//    現況實測全部合規（religion.moi 5,553 筆＋nchdb 1 筆），所以這條訂得硬也不誤擋。
//
// ③ **未授權來源的引用數只能降不能升**（grandfather）
//    兩個站被大量引用，但授權狀態有問題：
//      ・`taiwangods.moi.gov.tw`（內政部臺灣宗教文化地圖）版權宣告逐字寫
//        「限於個人及非商業目的」「任何商業機構或團體，非經內政部以及各版面著作人
//        書面同意，不得以任何形式轉載、重製、散布」。**它不在 2026-08-06 那份同意書
//        列舉的範圍內**（那份只列 religion.moi 的 IndexID=2|3|4 與 ci=2），
//        而站主 2026-08-12 已定案不排除廣告投放 → 「非商業」這個前提對本站不成立。
//      ・`th.gov.tw`（國史館臺灣文獻館）**未查到明示授權**：主站著作權聲明抓不到
//        （SPA＋常見路徑 404，Wayback 同樣），子站只有「版權所有」。
//    為什麼是「只能降不能升」而不是直接禁：現況已有數百處，一刀切會讓所有部署紅燈，
//    那不是擋錯誤、那是擋工作。基準值凍在下面的 BASELINE，**新增引用會被擋、
//    改寫掉的可以順手把基準調降**。等洽詢有結論再決定是全禁或放行。
//
// ④ **名錄快照的新鮮度**：只 WARN，不擋。
//    🔴 刻意不擋：gate 一旦因為「外部名錄過期」而紅燈，等於把別人的更新頻率
//    綁進本站的發佈路徑。過期的實際影響只有「新登錄的個案還不能引用」，那可以等。
//
// 用法：pnpm check:source-refs
// ⚠️ 失敗一律 process.exit(1)（本 repo 明列的坑：process.exitCode 可被後續程式覆寫）。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const INDEX = 'src/data/nchdb-folklore-index.json';
const STALE_DAYS = 120;

// 逐字引用可用的來源網域＝有明確授權的那些。加任何一個進來之前，
// 先確認拿到的授權**逐字寫了什麼**，並把出處寫進註解——不要用「政府資料通常可以」推論。
const VERBATIM_ALLOW = new Set([
  'religion.moi.gov.tw', // 內政部全國宗教資訊網，2026-08-06 同意（docs/taiwan-intake-status.md）
  'nchdb.boch.gov.tw', // 文化部國家文化資產網，2026-08-09 同意（docs/decisions/festivals-and-intent.md:146-158）
  'data.boch.gov.tw', // 同上，開放資料端點
  // 內政部臺灣宗教文化地圖，2026-08-19 站主回報**已取得內政部確認授權**。
  // ⚠️ 條件比照內政部 2026-08-06 那次＝**標示資料來源連結**（本 repo 對前一次的落實方式是
  //    逐筆掛回原始網址、文字逐字不改寫）。若實際條件與此不同，改這裡並同步 /about/。
  'taiwangods.moi.gov.tw',
]);

// 已知授權有問題的站（規則 ③ 的計數對象，也是規則 ② 的明確拒絕理由）。
const UNLICENSED = {
  // 2026-08-19：taiwangods.moi.gov.tw 已移出本表——站主回報內政部已確認授權。
  // 它的 grandfather 上限一併移除（那條規則的用途是「未授權來源不得再擴散」，
  // 前提消失了，留著只會擋住正常使用）。歷史脈絡見 docs/decisions/festivals-and-intent.md。
  'th.gov.tw': '國史館臺灣文獻館未查到明示授權（主站著作權聲明抓不到，子站僅「版權所有」）',
};

// 🔴 grandfather 基準（2026-08-19 實測值）。**只能往下調，不可往上調。**
//    往上調等於把「又多引用了一處未授權來源」正常化——那正是這條要擋的事。
const BASELINE = {
  // 其中 1 處在 scripts/check-anchor-text.mjs:5 的註解範例（不是實際引用，但仍是網址形式，照算）。
  'th.gov.tw': 146,
};

// 規則 ① 的例外：（caseId, 檔案）配對。目前刻意留空。
// 只有一種正當用途：文件要記錄「某個 id 曾經掛錯」這件事故本身。加的時候寫明理由與日期。
const CASE_ID_EXEMPT = [];

const errors = [];
const warnings = [];

// ── 掃描範圍：git 追蹤中的文字檔（不掃 dist／node_modules，且結果可重現）──────
const tracked = execFileSync('git', ['ls-files', 'src', 'docs', 'scripts', 'CLAUDE.md'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
})
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((f) => /\.(json|md|mdx|ts|tsx|astro|mjs|js|svelte)$/.test(f))
  .filter((f) => f !== INDEX); // 名錄本身當然含 266 個 id，不是引用

// ── 規則 ①：nchdb caseId 必須存在於名錄快照 ──────────────────────────────
if (!existsSync(INDEX)) {
  errors.push(`找不到名錄快照 ${INDEX}——先跑 node scripts/refresh-nchdb-index.mjs --write`);
} else {
  const idx = JSON.parse(readFileSync(INDEX, 'utf8'));
  const known = new Map((idx.items ?? []).map((x) => [x.case_id, x]));

  // 兩種書寫形式：個案網址、以及「nchdb <id>」這種行內註記。
  const patterns = [/folklore\/(\d{14})/g, /nchdb[^0-9A-Za-z]{0,3}(\d{14})/g];
  let checked = 0;
  for (const file of tracked) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('nchdb') && !text.includes('folklore/')) continue;
    const seen = new Set();
    for (const re of patterns) {
      for (const m of text.matchAll(re)) seen.add(m[1]);
    }
    for (const id of seen) {
      checked += 1;
      if (known.has(id)) continue;
      if (CASE_ID_EXEMPT.some(([exId, exFile]) => exId === id && exFile === file)) continue;
      errors.push(
        `${file}：nchdb caseId ${id} 不在名錄快照的 ${known.size} 筆民俗個案內。`
          + '掛源掛到不存在的個案＝那筆事實無法被複驗（nchdb 前台是 SPA，HTTP 層驗不出來）。'
          + '請用 src/data/nchdb-folklore-index.json 查正確 id；名錄過期就先跑 refresh-nchdb-index.mjs。',
      );
    }
  }

  // 規則 ④：新鮮度（只 WARN）
  const fetched = String(idx.fetched_on ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fetched)) {
    errors.push(`${INDEX} 的 fetched_on 不是 YYYY-MM-DD：${fetched || '(空)'}`);
  } else {
    const days = Math.floor((Date.now() - Date.parse(`${fetched}T00:00:00Z`)) / 86_400_000);
    if (days > STALE_DAYS) {
      warnings.push(
        `名錄快照是 ${fetched} 抓的（${days} 天前，超過 ${STALE_DAYS} 天）。`
          + '新登錄的個案會被誤判為不存在 → 跑 node scripts/refresh-nchdb-index.mjs --write。'
          + '（刻意只 WARN：不讓外部名錄的更新頻率擋住本站部署）',
      );
    }
  }
  console.log(`規則①：${checked} 處 caseId 引用，全部比對名錄 ${known.size} 筆`);
}

// ── 規則 ②：逐字引用的來源網域白名單 ──────────────────────────────────────
const hostOf = (s) => {
  const m = String(s ?? '').match(/https?:\/\/([^/\s)）"']+)/);
  return m ? m[1] : null;
};
const walk = (node, cb) => {
  if (Array.isArray(node)) node.forEach((x) => walk(x, cb));
  else if (node && typeof node === 'object') {
    cb(node);
    Object.values(node).forEach((v) => walk(v, cb));
  }
};
/**
 * 這段 note 是不是在**宣稱逐字引用**。
 * 含「逐字」但同時出現否定語（非逐字／不逐字／未逐字／只可摘述／只能摘述／摘述自）的，
 * 是在描述「本站沒有逐字用它」——那不是要擋的對象。
 */
const claimsVerbatim = (note) => note.includes('逐字') && !/非逐字|不逐字|未逐字|不可逐字|摘述/.test(note);

const verbatimReject = (file, what, host) => {
  const why = UNLICENSED[host] ?? Object.entries(UNLICENSED).find(([h]) => host.endsWith(h))?.[1];
  errors.push(
    `${file}：${what} 標為逐字引用，但來源網域 ${host} 不在逐字白名單內`
      + (why ? `（已知問題：${why}）` : '（未確認授權）')
      + '。逐字引用是授權範圍最窄的用法：要嘛改成自行改寫並掛源，要嘛先取得該站的明確同意再把網域加進 VERBATIM_ALLOW。',
  );
};

let verbatimChecked = 0;
for (const file of tracked.filter((f) => f.startsWith('src/data/') && f.endsWith('.json'))) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    continue; // JSON 壞掉是別的 gate 的事
  }
  walk(data, (o) => {
    // 2a：sources[] 裡**宣稱自己是逐字引用**的
    //     🔴 判準不能只看有沒有「逐字」兩個字：實測誤擋過三筆，它們的 note 是在
    //     **說明自己不是逐字**（「非逐字引用授權來源…只能摘述」）。那種註記正是我們
    //     希望有人寫的東西，擋掉它等於懲罰把授權界線寫清楚的人。
    if (typeof o.ref === 'string' && claimsVerbatim(String(o.note ?? ''))) {
      const host = hostOf(o.ref);
      if (host) {
        verbatimChecked += 1;
        if (!VERBATIM_ALLOW.has(host)) verbatimReject(file, `來源「${o.note}」`, host);
      }
    }
    // 2b：deities 的 moi_knowledge（欄位語意本身就是逐字引文）
    if (Array.isArray(o.excerpt) && typeof o.url === 'string') {
      const host = hostOf(o.url);
      if (host) {
        verbatimChecked += 1;
        if (!VERBATIM_ALLOW.has(host)) verbatimReject(file, '逐字引文欄位 excerpt', host);
      }
    }
    // 2c：events 的 heritage 逐字欄位必須有可複驗的 case_id
    //     （register_reason／history／notices 是文化部 2026-08-09 授權的三個逐字欄位，
    //      授權條件就是「每筆掛回個案公開網址」——沒有 case_id 就掛不回去）
    if (o.register_reason || o.history || (Array.isArray(o.notices) && o.notices.length)) {
      const hasVerbatim = Boolean(o.register_reason || o.history || o.notices?.length);
      if (hasVerbatim && 'case_id' in o && !o.case_id) {
        errors.push(`${file}：heritage 有逐字欄位但 case_id 為空——逐字引用的授權條件是每筆掛回個案網址`);
      }
    }
  });
}
console.log(`規則②：${verbatimChecked} 處逐字來源，網域皆須屬於 ${[...VERBATIM_ALLOW].join('／')}`);

// ── 規則 ⑤：`note` 是錨文字，不能塞查證備註 ───────────────────────────────
//   🔴 2026-08-19 加，成因是燒掉一輪 CI：`sources[].note` 會被 src/lib/sources.ts 拿去當
//   `<a>` 的可見文字，而 check:anchor-text 的判準是 `/\bhttp/i`——我在 note 裡寫
//   「（實測 HTTP 200）」就被判成裸露網址，**而那道 gate 吃 dist、要等 20 分鐘 build 才報**。
//   同一批還有 57 筆 note 超過 SOURCE_LABEL_MAX_WIDTH（40 全形字）而會退化成截斷標籤。
//   這條在來源層跑，秒級回饋。
const NOTE_WIDTH_MAX = 40;
const fullWidthLen = (s) => [...s].reduce((n, c) => n + (/[\x00-\x7F]/.test(c) ? 0.5 : 1), 0);
let noteChecked = 0;
let wideNotes = 0;
for (const file of tracked.filter((f) => f.startsWith('src/data/') && f.endsWith('.json'))) {
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
  walk(data, (o) => {
    if (typeof o.ref !== 'string' || typeof o.note !== 'string' || !o.note) return;
    // ⚠️ `note` 只有在 `ref` 是**純網址**時才會被 parseSourceRef 拿去當錨文字；
    //    `ref` 本身帶名稱（「文化部國家文化資產網 https://…」）時，錨文字用的是那個名稱，
    //    note 只是補充。第一版沒分這兩種，誤擋了 temples.json 兩筆本來不會渲染成錨文字的。
    if (!/^https?:\/\/\S+$/.test(o.ref.trim())) return;
    noteChecked += 1;
    if (/\bhttp/i.test(o.note)) {
      errors.push(`${file}：來源 note「${o.note.slice(0, 30)}…」含 http 字樣。note 會被拿去當 <a> 的可見文字，`
        + 'check:anchor-text 會把它判成裸露網址（那道吃 dist，要等完整 build 才報）。把網址與實測備註拿掉，只留來源單位名稱。');
    }
    if (fullWidthLen(o.note) > NOTE_WIDTH_MAX) wideNotes += 1;
  });
}
// 🔴 寬度只能降不能升（grandfather）：2026-08-19 實測全 repo 有 41 筆既有 note 超寬
//    （收窄成「ref 是純網址」後為 41 筆）。硬擋會讓所有部署紅燈——那不是擋錯誤、
//    是擋工作，同 taiwangods 那條的理由。含 http 的則是硬擋，因為那會真的讓
//    check:anchor-text 紅燈，且目前是 0 筆、沒有既存包袱。
const WIDE_NOTE_BASELINE = 36;
if (wideNotes > WIDE_NOTE_BASELINE) {
  errors.push(`來源 note 超過 ${NOTE_WIDTH_MAX} 全形字的有 ${wideNotes} 筆，超過基準 ${WIDE_NOTE_BASELINE}`
    + `（+${wideNotes - WIDE_NOTE_BASELINE}）。note 是 <a> 的可見文字，太長會被截斷；`
    + '查證備註不該放在 note。改短了就把基準往下調。');
} else if (wideNotes < WIDE_NOTE_BASELINE) {
  warnings.push(`來源 note 超寬數已降到 ${wideNotes}（基準 ${WIDE_NOTE_BASELINE}）→ 請把 WIDE_NOTE_BASELINE 調降，鎖住成果`);
}
console.log(`規則⑤：${noteChecked} 筆來源 note（錨文字）皆不含網址；超寬 ${wideNotes}/${WIDE_NOTE_BASELINE}`);

// ── 規則 ③：未授權來源的引用數只能降不能升 ────────────────────────────────
const counts = Object.fromEntries(Object.keys(UNLICENSED).map((h) => [h, 0]));
// 🔴 只數**網址形式**（真正的引用），不數散文裡的 bare 提及。
//    第一版數字面出現次數，結果「在 docs 裡記錄這個授權風險」本身就被算成一次引用而擋下
//    （2026-08-19 實測，寫這一節的同一回合就撞到）。那會讓「記錄風險」與「製造風險」同罰，
//    把文件寫清楚變成有代價的事——規則要擋的是引用，不是討論。
//    網址形式＝ `https://` ＋（可有子網域）＋ host；子網域 `www.` 與 `dict.` 那些
//    都算在同一個 host 名下，那正是要一起算的。
//    ⚠️ 這段刻意**不寫出完整示例網址**——寫了就會被自己這條規則數進去（實測 +2）。
//    要驗行為請跑反例，不要在註解裡放可被計數的字串。
const urlRe = (host) => new RegExp(`https?://(?:[a-z0-9-]+\\.)*${host.replace(/\./g, '\\.')}`, 'g');
for (const file of tracked) {
  const text = readFileSync(file, 'utf8');
  for (const host of Object.keys(UNLICENSED)) {
    const n = (text.match(urlRe(host)) ?? []).length;
    if (n) counts[host] += n;
  }
}
for (const [host, base] of Object.entries(BASELINE)) {
  const now = counts[host];
  if (now > base) {
    errors.push(
      `${host} 的引用數 ${now} 超過 grandfather 基準 ${base}（+${now - base}）。`
        + `原因：${UNLICENSED[host]}。`
        + '新頁面不要再引用它——可用的替代來源是 nchdb 開放資料（民俗 266 筆有登錄理由／歷史沿革／儀式特色）'
        + '與觀光署 data.gov.tw 資料集 7778「活動」（OGDL 1.0，可商用）。'
        + '若這次是改寫掉了舊引用，請把 BASELINE 往下調到新數字。',
    );
  } else if (now < base) {
    warnings.push(`${host} 引用數已降到 ${now}（基準 ${base}）→ 請把 check-source-refs.mjs 的 BASELINE 調降，鎖住成果`);
  }
}
console.log(
  `規則③：未授權來源引用數 ${Object.entries(counts).map(([h, n]) => `${h} ${n}/${BASELINE[h]}`).join('｜')}`,
);

// ── 收尾 ────────────────────────────────────────────────────────────────
for (const w of warnings) console.log(`⚠️  ${w}`);
if (errors.length) {
  console.error(`\n✗ check:source-refs 有 ${errors.length} 個錯誤：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('✓ check:source-refs 通過：caseId 皆可複驗、逐字引用皆在授權範圍、未授權來源未增加');
