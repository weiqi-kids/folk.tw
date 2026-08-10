#!/usr/bin/env node
// 台灣端投遞收件處理：驗證 inbox 的檔 → 原子上位 → 舊版進 archive。
//
// 背景：一批資料只能從台灣 IP 取得（內政部全國宗教資訊網擋境外），故台灣主機跑定時腳本
// 照 docs/intake-manifest.json 抓取、把**原始 bytes 原封不動**（不解析）rsync 進本機 inbox。
// 解析與查證全在本機做——因為慶典查詢是網頁 UI，境外看不到，parser 不能寫在台灣端。
// 完整架構與台灣端交接說明：docs/taiwan-host-handoff.md
//
// ⚠️ 為什麼要驗證後才「上位」而不是直接讓台灣端寫到目標路徑：
//   `/root/.config/folk-tw/temple.xml` 被 /root/folk-outreach/outreach-daily.mjs 每日讀取
//   （台北 04:30 推播宮廟開發名單）。若讓 rsync 直接寫該路徑，讀到半個檔就會產生錯誤名單。
//   故：台灣端只能寫 inbox（rrsync -wo -no-del 限制），本腳本驗 sha256＋expect 後
//   寫暫存檔再 rename()（同檔案系統＝原子）上位。驗不過就**完全不動上位檔**。
//
// ⚠️ 個資邊界：temple.xml 含 12,419 間廟的電話與負責人，而 folk.tw 是 public repo、
//   每日 seo cron 會 commit 整個工作區。故 intake 全程在 /root/.config/folk-tw/ 底下，
//   **絕不寫進 repo 工作區**。本腳本不碰 git。
//
// 用法：
//   node scripts/intake-ingest.mjs            # 處理 inbox，通過者上位
//   node scripts/intake-ingest.mjs --dry      # 只驗證與報告，不上位
//   node scripts/intake-ingest.mjs --status   # 只印各 job 的新鮮度（給過期提醒用）
//
// 結束碼：0＝正常（含「沒有新檔」）；1＝有檔驗證失敗；2＝本腳本自己壞了（不是資料問題）。
//
// 🔴 為什麼 1 和 2 一定要分開（2026-08-10 事故，五天的靜默）：
//   v16 起有 5 個 url_list job 沒有 `dest` 欄位，而本檔兩處都直接 `join(INBOX, j.dest)`
//   → TypeError、exit 1。呼叫端 intake-watch-cron.sh 只看 rc≠0 就發「投遞收件驗證失敗」，
//   於是崩潰**偽裝成台灣端的資料問題**每小時發一次，害台灣端去逐檔複驗 8,008 個檔（資料全乾淨）。
//   更嚴重的是 --status 走同一個地雷，而 cron 的 --stale 分支用 `|| true` 吞掉錯誤 →
//   「台灣端沒在跑」與「抓到了但檔沒送達」兩道警報從 2026-08-06 起靜默失效。
//   教訓：**崩潰不可以長得像資料問題**，而「沒收到警報」不等於「一切正常」。

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// 崩潰一律 exit 2，且印出可辨識的前綴——呼叫端據此把文案切成「腳本壞了」而非「資料壞了」。
const crash = (e) => {
  console.error(`\n💥 intake-ingest 崩潰（本腳本的 bug，不是台灣端的資料問題）：\n${e?.stack ?? e}`);
  process.exit(2);
};
process.on('uncaughtException', crash);
process.on('unhandledRejection', crash);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const INTAKE = '/root/.config/folk-tw/intake';
const INBOX = join(INTAKE, 'inbox');
const ARCHIVE = join(INTAKE, 'archive');
const MANIFEST = join(repoRoot, 'docs', 'intake-manifest.json');

const DRY = process.argv.includes('--dry');
const STATUS_ONLY = process.argv.includes('--status');

/** 每個 job 的 dest（inbox 內相對路徑）→ 上位後的絕對路徑。 */
const PROMOTE_TO = {
  'temple-xml/temple.xml': '/root/.config/folk-tw/temple.xml',
};

/** 驗不過的目錄型檔案搬來這裡，離開匯入器的視線（見 verifyDir 的說明）。 */
const QUARANTINE = join(INTAKE, 'quarantine');

/**
 * manifest 有三種形態的 job，路徑欄位**完全不同**——混著看就是 2026-08-10 事故的成因。
 *   ① file     ：`url` ＋ `dest`（單一檔，會上位到 PROMOTE_TO）
 *   ② url_list ：`url_list` ＋ `dest_dir` ＋ `dest_template` ＋ `expect_per_item`（**無 dest**）
 *   ③ paginate ：`paginate.dest_template` 逐頁落檔（`dest` 只是宣告用，那個路徑永遠不存在）
 * 🔴 判斷順序不可調：religion-foundation-list **同時有 dest 與 paginate**，先看 dest 會判成 ①，
 *    然後去找一個從來不存在的 recon-service/foundation-list.html，把 200 頁真檔全部漏掉。
 */
function jobKind(j) {
  if (j.url_list) return 'url_list';
  if (j.paginate) return 'paginate';
  if (j.dest) return 'file';
  return 'unknown'; // 契約錯誤：往下一定會炸，所以在這裡就點名（不要再讓它變成 TypeError）
}

/** 目錄型 job（②③）的落點目錄；① 回 null。 */
function jobDir(j) {
  const k = jobKind(j);
  if (k === 'url_list') return join(INBOX, j.dest_dir ?? '');
  if (k === 'paginate') return join(INBOX, dirname(j.paginate.dest_template));
  return null;
}

/** 目錄裡的「資料檔」＝排除兩個側檔。台灣端每項固定投三件套（URLLIST-SPEC）。 */
const dataFiles = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => !f.endsWith('.sha256') && !f.endsWith('.meta.json')) : [];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
const ageDays = (p) => (existsSync(p) ? (Date.now() - statSync(p).mtimeMs) / 864e5 : Infinity);
/** 目錄型 job 的資料齡＝目錄裡最新那個**資料檔**的齡（目錄 mtime 只反映最後一次增刪檔名）。 */
const dirNewestAgeDays = (dir) => {
  let newest = 0;
  for (const f of dataFiles(dir)) newest = Math.max(newest, statSync(join(dir, f)).mtimeMs);
  return newest ? (Date.now() - newest) / 864e5 : Infinity;
};
const hoursSince = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 36e5 : Infinity);
const tpe = (iso) =>
  iso
    ? new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
    : '從未';
const fileSha = (p) => (existsSync(p) ? sha256(readFileSync(p)) : null);

/**
 * 收下的檔（含 .sha256／.meta.json 側檔）清出 inbox，避免下輪重複處理。
 * `archiveDir` 有給＝這一版有上位，meta.json 跟著進 archive 供日後對帳；
 * 沒給＝內容與現有上位檔相同、根本沒歸檔，meta 一併刪掉（不留空殼目錄）。
 */
function clearInbox(src, archiveDir = null) {
  rmSync(src, { force: true });
  rmSync(`${src}.sha256`, { force: true });
  const metaPath = `${src}.meta.json`;
  if (!existsSync(metaPath)) return;
  if (archiveDir) {
    mkdirSync(archiveDir, { recursive: true });
    renameSync(metaPath, join(archiveDir, basename(metaPath)));
  } else {
    rmSync(metaPath, { force: true });
  }
}

/** 台灣端每輪回傳的進度檔。判「誰壞了」全靠它，不能只看本地檔案 mtime。 */
function loadRemoteState() {
  const p = join(INBOX, 'state.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function loadManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch (e) {
    // exit 2 不是 1：讀不到自己 repo 裡的清單是**我們這端壞了**，
    // 與「台灣端送來的檔驗不過」是兩件事，通報文案也該不同。
    console.error(`💥 讀不到 manifest（${MANIFEST}）：${e.message}`);
    process.exit(2);
  }
}

/**
 * manifest 的 expect 檢查（與台灣端同一份規則，雙重把關）。回違規字串陣列。
 *
 * ⚠️ 2026-07-30 實測踩到的坑：光有 `min_bytes` 絕對下限**擋不住殘檔**。
 * 當時投一個 5 MB 的截斷檔（真檔 6.27 MB），`min_bytes: 4000000` 通過、前 2MB 也含
 * `<OpenData_3>`，於是**覆蓋掉完整的上位檔**（12,419 筆 → 只剩前 5 MB）。
 * 靠 archive 才救回來。故新增兩道相對檢查——它們才是真正擋殘檔的：
 *   ① `not_smaller_than_current_pct`：新檔不得比現有上位檔小超過 N%
 *      （MOI 月更是增修，正常不會驟減；驟減＝傳輸截斷或來源出錯）
 *   ② `min_occurrences`：記錄筆數下限（整檔計數，例如 `<OpenData_3>` 至少 12,000 筆）
 *
 * `meta` ＝該檔的 .meta.json（台灣端記的 HTTP 狀態）。給了才驗 `http_status`／`http_status_any_of`；
 * 沒給就跳過——側檔不是每個檔都有，缺側檔另有專門的判定，不在這裡當成內容錯誤。
 * 🔴 `magic_any_of` 是 v17 為 photos job 加的，**只能在這裡實作、不能只信台灣端**：
 *    它擋的是「302 導回 200 的 HTML 頁被當成合格圖片」，而 header 是來源說了算、bytes 不會騙人。
 */
function checkExpect(buf, expect, currentPath, meta = null) {
  const bad = [];
  if (!expect) return bad;

  // `record_status_only`：這個 job 的目的是「記錄那邊回什麼」，不是取得特定內容。
  // 例：religion.moi.gov.tw/robots.txt 實回 404——404 本身是有效答案（未宣告抓取限制），
  // 不該當失敗。故跳過所有內容檢查，由呼叫端把 meta.json 的狀態印出來供人判讀。
  if (expect.record_status_only) return bad;

  if (expect.min_bytes != null && buf.length < expect.min_bytes) {
    bad.push(`大小 ${buf.length}B < 絕對下限 ${expect.min_bytes}B（疑為錯誤頁）`);
  }

  // 台灣端記的 HTTP 狀態（有 meta 才驗）。同一份規則兩端各驗一次＝本檔的「雙重把關」前提。
  const okStatus = expect.http_status_any_of ?? (expect.http_status != null ? [expect.http_status] : null);
  if (okStatus && meta?.http_status != null && !okStatus.includes(meta.http_status)) {
    bad.push(`HTTP ${meta.http_status} 不在預期 ${okStatus.join('／')} 內`);
  }

  // 檔案開頭實際 bytes（JPEG FFD8FF／PNG 89504E470D0A1A0A），命中任一即過。二進位檔專用。
  if (expect.magic_any_of?.length) {
    const head = buf.subarray(0, 32).toString('hex').toUpperCase();
    if (!expect.magic_any_of.some((m) => head.startsWith(String(m).toUpperCase()))) {
      bad.push(`檔頭 ${head.slice(0, 16)}… 不符 magic ${expect.magic_any_of.join('／')}（疑為錯誤頁冒充二進位檔）`);
    }
  }

  // 🔴 magic 之後才轉字串：二進位檔轉 utf8 是垃圾，contains 一定失敗——
  //    但那類 job 本來就不該宣告 contains（v17 photos 用 magic_any_of 取代），這裡只是不浪費。
  if (expect.contains == null && !expect.min_occurrences && expect.not_smaller_than_current_pct == null) return bad;

  const text = buf.toString('utf8');

  if (expect.contains && !text.includes(expect.contains)) {
    bad.push(`找不到預期字串「${expect.contains}」`);
  }

  // ① 相對現有檔不得驟減（擋截斷；現有檔不存在則跳過＝首次收件）
  const pct = expect.not_smaller_than_current_pct;
  if (pct != null && currentPath && existsSync(currentPath)) {
    const cur = statSync(currentPath).size;
    const floor = Math.floor(cur * (pct / 100));
    if (buf.length < floor) {
      bad.push(
        `大小 ${buf.length}B 比現有 ${cur}B 少於 ${pct}%（下限 ${floor}B）＝疑為傳輸截斷，拒收以保護現有資料`,
      );
    }
  }

  // ② 記錄筆數下限（整檔計數，比「前 2MB 含某字串」可靠得多）
  if (expect.min_occurrences) {
    for (const [needle, min] of Object.entries(expect.min_occurrences)) {
      const n = text.split(needle).length - 1;
      if (n < min) bad.push(`「${needle}」只出現 ${n} 次 < 下限 ${min}（疑為殘檔）`);
    }
  }

  return bad;
}

/**
 * 目錄型 job（url_list／paginate）的收件處理。回 { total, bad[], quarantined }。
 *
 * 🔴 這類 job **沒有上位目標，也不該有**：匯入器直接讀 inbox
 *    （import-photos.mjs → inbox/photos／import-temple-history.mjs → inbox/religion-yange
 *     ＋ inbox/religion-jianzhu ＋ inbox/recon-service/foundation-list／
 *     import-knowledge-deities.mjs → inbox/knowledge-deities）。
 *    所以這裡只做「驗 ＋ 隔離壞檔」，**不上位、不清 inbox**——清掉匯入器就再也讀不到，
 *    而 inbox 是 write-only，台灣端補不回來（只有整個 key 重抓才會重送）。
 *
 * ⚠️ 目錄裡會有「不在現行清單上」的檔（母體變動後清單重產，舊 key 的檔刪不掉，
 *    2026-08-10 時 religion-yange 有 164 個）。那些**照樣驗**——它們是真資料、匯入器也讀得到——
 *    只是不計入清單覆蓋率。判定以磁碟為準，與台灣端 URLLIST-SPEC 的「進度以磁碟為準」同一原則。
 *
 * ⚠️ 隔離**不會**讓通報停下來，別誤會它的用途：台灣端每輪 rsync 整個 `out/`，
 *    我們這邊少了哪個檔它就補送哪個。所以隔離的兩個實際作用是——
 *    ① 壞檔立刻離開匯入器的視線（匯入器直接讀 inbox，這才是真正的風險）；
 *    ② **傳輸途中壞掉的檔會自己痊癒**：台灣端 out/ 那份是好的，下一輪補送就驗得過。
 *    真正每小時重報不停的情況是「台灣端 out/ 那份本身驗不過」——那代表兩端規則不一致，
 *    本來就該吵到有人來看，不該被靜音。
 *
 * 🔴 隔離的安全閥：驗不過的比例過高時**一個檔都不搬**。
 *    理由：搬檔是破壞性操作，而「整批驗不過」遠比「整批真的壞了」更可能是本規則寫錯
 *    （台灣端驗不過時連側檔都不會產生，壞檔本來就進不了 inbox）。寧可只報不動手，讓人來看。
 */
function verifyDir(j) {
  const dir = jobDir(j);
  const expect = j.expect_per_item ?? j.paginate?.expect_per_page ?? null;
  const files = dataFiles(dir);
  const bad = [];

  for (const f of files) {
    const p = join(dir, f);
    const shaPath = `${p}.sha256`;

    // 缺 .sha256 只報不隔離：可能只是 rsync 這一輪還沒把側檔送完（三件套不是原子送達）。
    if (!existsSync(shaPath)) {
      bad.push({ f, why: `缺 ${basename(shaPath)}（側檔未到或未產生）`, move: false });
      continue;
    }

    const buf = readFileSync(p);
    const want = readFileSync(shaPath, 'utf8').trim().split(/\s+/)[0].toLowerCase();
    const got = sha256(buf);
    if (want !== got) {
      bad.push({ f, why: `sha256 不符（預期 ${want.slice(0, 12)}… 實得 ${got.slice(0, 12)}…）`, move: true });
      continue;
    }

    let meta = null;
    if (existsSync(`${p}.meta.json`)) {
      try { meta = JSON.parse(readFileSync(`${p}.meta.json`, 'utf8')); } catch { /* 側檔壞掉不擋內容判定 */ }
    }

    const problems = checkExpect(buf, expect, null, meta);
    if (problems.length) bad.push({ f, why: problems.join('；'), move: true });
  }

  // 安全閥：超過 20%（且至少 5 個）驗不過 → 判定為「規則可疑」，只報不搬。
  const movable = bad.filter((b) => b.move);
  const tooMany = movable.length >= 5 && movable.length > files.length * 0.2;
  let quarantined = 0;

  if (!DRY && !tooMany) {
    for (const b of movable) {
      const to = join(QUARANTINE, j.id, todayIso());
      mkdirSync(to, { recursive: true });
      for (const suffix of ['', '.sha256', '.meta.json']) {
        const from = join(dir, `${b.f}${suffix}`);
        if (existsSync(from)) renameSync(from, join(to, `${b.f}${suffix}`));
      }
      quarantined++;
    }
  }

  return { dir, total: files.length, bad, quarantined, tooMany };
}

/** url_list job 的清單覆蓋率：清單在我們自己的 repo，拿來對帳「該有幾個、實收幾個」。 */
function listCoverage(j) {
  if (jobKind(j) !== 'url_list' || !j.url_list) return null;
  const local = join(repoRoot, 'docs', basename(new URL(j.url_list).pathname));
  if (!existsSync(local)) return null;
  try {
    const items = JSON.parse(readFileSync(local, 'utf8'));
    if (!Array.isArray(items)) return null;
    const dir = jobDir(j);
    const have = items.filter((it) => existsSync(join(dir, (j.dest_template ?? '{key}').replace('{key}', it.key))));
    return { list: basename(local), total: items.length, have: have.length };
  } catch {
    return null;
  }
}

const manifest = loadManifest();
const jobs = manifest.jobs ?? [];

// ── --status：新鮮度診斷（供 cron 的過期提醒使用）────────────────────────────
//
// ⚠️ 2026-08-03 改寫，起因是一則假警報：crgis 從未收到 → Slack 發「台灣主機的抓取腳本
// 可能沒在跑」，但同一時間 state.json 寫著台灣端**前一晚才剛跑過**、crgis 重試 6 次
// 皆 `fetch failed`，且台灣端自己註明母站 rchss.sinica.edu.tw 一併 HTTP 000＝中研院站掛了。
// 舊版只做 `ageDays(檔案)`，完全沒讀台灣端回傳的 state.json，所以分不出三件事——
// 而其中只有兩件該叫人：
//   ① pipeline：台灣端沒在跑（state.json 本身老了或不存在）        → 要人管，發 Slack
//   ② transport：台灣端抓成功、內容也與我們手上的不同，但檔沒進來  → 要人管，發 Slack
//   ③ source：來源掛了／來源沒更新（sha 與我們手上這份相同）       → 不是我們的事，只記錄
// 另有 `_alert: false` 的 job（已知來源停擺，如 crgis）一律靜音，只印一行。
// ⚠️ 欄位名**必須底線開頭**：台灣端遇到不認得的 manifest 欄位會整個停擺（docs/taiwan-host-handoff.md
// 步驟 3 的紅字），而底線欄位是約定的「境外端專用、台灣端忽略」。
//
// 「來源沒更新」是常態，不是故障——用戶原話：「台灣端資料不一定會有更新，主要還是看資料來源」。
const PIPELINE_MAX_HOURS = 36; // 台灣端每日跑；連兩輪沒動靜才算沒在跑

/** 目錄型 job 在台灣端「已無待抓項目」：斷點清空、數量到齊、且沒有失敗紀錄（URLLIST-SPEC 的進度契約）。 */
function progressDone(js) {
  const p = js?.items ?? js?.pages;
  if (!p) return false;
  return p.next == null && (p.done ?? 0) >= (p.total ?? Infinity) && !Object.keys(p.failed ?? {}).length;
}

if (STATUS_ONLY) {
  const st = loadRemoteState();
  const remoteAgeH = hoursSince(st?.updated);
  const pipelineDown = !st || !(remoteAgeH < PIPELINE_MAX_HOURS);

  const transport = [];
  for (const j of jobs) {
    const kind = jobKind(j);
    if (kind === 'unknown') {
      console.log(`⁉️ ${j.id.padEnd(23)} manifest 契約錯誤：既無 url_list／paginate 也無 dest，無從觀測`);
      continue;
    }
    // 觀測點依 job 形態而異：單檔看那個檔，目錄型看目錄裡**最新的資料檔**
    // （目錄自己的 mtime 只反映最後一次增刪檔名，不反映內容更新）。
    const watch = kind === 'file' ? PROMOTE_TO[j.dest] ?? join(INBOX, j.dest) : jobDir(j);
    const age = kind === 'file' ? ageDays(watch) : dirNewestAgeDays(watch);
    const limit = j.max_age_days ?? Infinity;
    const ageTxt = age === Infinity ? '不存在' : `${age.toFixed(1)} 天`;
    const head = `${j.id.padEnd(23)} 資料齡 ${ageTxt.padStart(9)}（上限 ${limit} 天）`;

    if (!(age > limit)) {
      console.log(`   ${head}  ${watch}`);
      continue;
    }

    const js = st?.jobs?.[j.id];
    if (j._alert === false) {
      console.log(`🔇 ${head}  已靜音：${j._alert_note ?? 'manifest 設 _alert:false'}`);
    } else if (pipelineDown) {
      console.log(`⚠️ ${head}  （台灣端沒在跑，不逐項判讀）`);
    } else if (!js) {
      console.log(`🛈 ${head}  台灣端 state.json 沒有這個 job（清單版本可能還沒同步過去）`);
    } else if (!js.last_ok) {
      console.log(`🛈 ${head}  來源問題：台灣端從未抓成功（重試 ${js.attempts ?? '?'} 次｜${js.last_error ?? '無錯誤訊息'}）`);
    } else if (kind === 'file' && js.sha256 && js.sha256 === fileSha(watch)) {
      console.log(`🛈 ${head}  來源沒更新：台灣端 ${tpe(js.last_ok)} 抓到的內容與我們手上這份相同`);
    } else if (kind !== 'file' && progressDone(js)) {
      // 目錄型 job 沒有單一 sha 可比，改看台灣端的進度：清單／頁面全抓完且無失敗
      // ＝「沒有新項目」，與單檔的「來源沒更新」是同一件事，同樣不該叫人。
      const p = js.items ?? js.pages;
      console.log(`🛈 ${head}  來源沒更新：台灣端 ${tpe(js.last_ok)} 已全部抓完（${p.done}/${p.total}），無待抓項目`);
    } else if (hoursSince(js.last_ok) < PIPELINE_MAX_HOURS) {
      transport.push(`${j.id}（台灣端 ${tpe(js.last_ok)} 抓取成功，但檔案沒進來／資料齡 ${ageTxt}）`);
      console.log(`⚠️ ${head}  傳輸斷線：台灣端 ${tpe(js.last_ok)} 抓成功但我們沒收到`);
    } else {
      console.log(`🛈 ${head}  來源問題：台灣端最後成功 ${tpe(js.last_ok)}，之後沒有新的成功（${js.last_error ?? '無錯誤訊息'}）`);
    }
  }

  // 機器可讀的通報行。只有 ① ② 會出現——「來源沒更新／來源掛了」永遠不發 Slack。
  if (pipelineDown) {
    console.log(
      `\nALERT_PIPELINE\t台灣端進度檔${
        !st ? '不存在或解析失敗' : `最後更新 ${tpe(st.updated)}，已 ${remoteAgeH.toFixed(0)} 小時沒動靜`
      }`,
    );
  } else if (transport.length) {
    console.log(`\nALERT_TRANSPORT\t${transport.join('、')}`);
  }
  process.exit(0);
}

// ── 處理 inbox ────────────────────────────────────────────────────────────
let promoted = 0;
let rejected = 0;
let skipped = 0;
const problems = [];

for (const j of jobs) {
  const kind = jobKind(j);

  // 契約錯誤先擋下來。2026-08-10 之前這裡直接 join(INBOX, undefined) → TypeError →
  // 整支腳本死在第 14 個 job，後面 6 個 job（含 200 頁的 foundation-list）一輪都沒跑過。
  if (kind === 'unknown') {
    problems.push(`${j.id}：manifest 契約錯誤——既無 url_list／paginate 也無 dest，本 job 無從處理`);
    rejected++;
    continue;
  }

  // 目錄型 job：逐檔驗證、壞檔隔離，不上位也不清 inbox（理由見 verifyDir）。
  if (kind !== 'file') {
    const r = verifyDir(j);
    if (!r.total) { skipped++; continue; }

    const cov = listCoverage(j);
    const covTxt = cov ? `｜清單 ${cov.list} ${cov.have}/${cov.total} 項已到` : '';
    if (!r.bad.length) {
      console.log(`✓ ${j.id} 逐檔驗證通過（${r.total} 個檔${covTxt}）；此類 job 由匯入器直接讀 inbox，不上位`);
      continue;
    }

    if (r.tooMany) {
      problems.push(
        `${j.id}：${r.bad.length}/${r.total} 個檔驗不過（超過 20%）→ **一個都沒隔離**，` +
          `這種比例比較像 expect_per_item 規則寫錯，請人工確認：${r.bad.slice(0, 3).map((b) => `${b.f}（${b.why}）`).join('、')}`,
      );
    } else {
      problems.push(
        `${j.id}：${r.bad.length}/${r.total} 個檔驗不過${r.quarantined ? `，已隔離 ${r.quarantined} 個到 ${QUARANTINE}/${j.id}/` : ''}` +
          `${covTxt} → ${r.bad.slice(0, 5).map((b) => `${b.f}（${b.why}）`).join('、')}` +
          `${r.bad.length > 5 ? `、另有 ${r.bad.length - 5} 個` : ''}`,
      );
    }
    rejected++;
    continue;
  }

  const src = join(INBOX, j.dest);
  if (!existsSync(src)) { skipped++; continue; }

  const buf = readFileSync(src);

  // 1) sha256 側檔必須存在且相符——這是「檔有沒有完整傳完」的唯一判準。
  const shaPath = `${src}.sha256`;
  if (!existsSync(shaPath)) {
    problems.push(`${j.id}：缺 ${basename(shaPath)}（無法確認傳輸完整，不上位）`);
    rejected++;
    continue;
  }
  // 接受 "  <hex>  " 或 "<hex>  <filename>"（sha256sum 格式）
  const want = readFileSync(shaPath, 'utf8').trim().split(/\s+/)[0].toLowerCase();
  const got = sha256(buf);
  if (want !== got) {
    problems.push(`${j.id}：sha256 不符（預期 ${want.slice(0, 12)}… 實得 ${got.slice(0, 12)}…）→ 不上位`);
    rejected++;
    continue;
  }

  // 台灣端記的 HTTP 狀態：既要印出來給人判讀（`record_status_only` 類全靠它），
  // 也餵給 checkExpect 驗 `http_status`，所以要在 expect 之前讀。
  const metaFile = `${src}.meta.json`;
  let meta = null;
  let metaNote = '';
  if (existsSync(metaFile)) {
    try {
      meta = JSON.parse(readFileSync(metaFile, 'utf8'));
      metaNote = `｜HTTP ${meta.http_status ?? '?'}｜抓取於 ${meta.fetched_at ?? '?'}`;
    } catch { metaNote = '｜meta.json 解析失敗'; }
  }

  // 2) manifest 的 expect（台灣端也該擋，這裡再擋一次：別讓錯誤頁或殘檔覆蓋好資料）
  const bad = checkExpect(buf, j.expect, PROMOTE_TO[j.dest], meta);
  if (bad.length) {
    problems.push(`${j.id}：${bad.join('；')} → 不上位`);
    rejected++;
    continue;
  }

  const dest = PROMOTE_TO[j.dest];
  if (!dest) {
    console.log(`✓ ${j.id} 驗證通過（${buf.length}B）${metaNote}；此 job 無上位目標，留在 inbox 供後續解析`);
    continue;
  }

  // 內容與現有上位檔完全相同 → 不重寫、不歸檔，只把 inbox 清乾淨。
  //
  // 2026-08-03 加。台灣端每輪都重送同一份 temple.xml（`fetched_at` 五天來都停在 07-30），
  // 而舊版無條件「歸檔＋重寫」→ archive 每天多一份 6.27 MB 的**完全相同**副本
  // （實測 5 個日期目錄只有 2 種內容、30 MB 裡 18 MB 是重複），而且會一直長下去。
  // 同時也省掉對 temple.xml 的無謂重寫——那個檔被 folk-outreach 每日讀。
  // ⚠️ 配套：略過上位後檔案 mtime 就不再更新，新鮮度提醒**必須**靠 state.json 的 sha 判讀，
  //    否則會誤報「資料過期」。那正是 --status 的「來源沒更新」分支（見本檔上方）。
  const unchanged = existsSync(dest) && fileSha(dest) === got;

  if (DRY) {
    console.log(
      unchanged
        ? `（乾跑）${j.id} 內容與現有上位檔相同 → 會略過上位、只清 inbox`
        : `（乾跑）${j.id} 驗證通過 ${buf.length}B → 會上位到 ${dest}`,
    );
    continue;
  }

  if (unchanged) {
    console.log(`＝ ${j.id} 內容與現有上位檔相同（sha ${got.slice(0, 12)}…）→ 略過上位，不歸檔`);
    clearInbox(src);
    skipped++;
    continue;
  }

  // 3) 舊版進 archive（保留可 diff；同時是回退路徑）
  if (existsSync(dest)) {
    const dir = join(ARCHIVE, j.id, todayIso());
    mkdirSync(dir, { recursive: true });
    copyFileSync(dest, join(dir, basename(dest)));
  }

  // 4) 原子上位：先寫同目錄暫存檔，再 rename（同檔案系統，rename 是原子操作）。
  //    這樣 outreach-daily.mjs 任何時刻讀到的都是完整檔，不會是半個。
  const tmp = `${dest}.intake-tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, dest);
  promoted++;
  console.log(`✓ ${j.id} 已上位 → ${dest}（${(buf.length / 1048576).toFixed(2)} MB，sha ${got.slice(0, 12)}…）`);

  // 5) 收下的檔清出 inbox，避免下輪重複處理（meta.json 跟著這一版進 archive）
  clearInbox(src, join(ARCHIVE, j.id, todayIso()));
}

// ── 偵察類檔案（不在 manifest 的 job，如慶典查詢頁）：只點名，不動它們 ──────
for (const sub of ['religion-festival', 'misc']) {
  const dir = join(INBOX, sub);
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir).filter((f) => !f.endsWith('.sha256') && !f.endsWith('.meta.json'));
  if (files.length) {
    console.log(`\n📥 ${sub}/ 有 ${files.length} 個檔待人工/後續解析：`);
    for (const f of files.slice(0, 20)) {
      const p = join(dir, f);
      const shaOk = existsSync(`${p}.sha256`)
        ? readFileSync(`${p}.sha256`, 'utf8').trim().split(/\s+/)[0].toLowerCase() === sha256(readFileSync(p))
          ? 'sha ✓'
          : 'sha ✗'
        : 'sha 缺';
      console.log(`   ${f}  ${statSync(p).size}B  ${shaOk}`);
    }
    if (files.length > 20) console.log(`   …另有 ${files.length - 20} 個`);
  }
}

// ── 台灣端進度檔（順手回報，方便看那邊卡在哪）────────────────────────────
const statePath = join(INBOX, 'state.json');
if (existsSync(statePath)) {
  try {
    const st = JSON.parse(readFileSync(statePath, 'utf8'));
    const n = Object.keys(st.jobs ?? st).length;
    console.log(`\n🛈 台灣端進度檔：${n} 個 job；最後更新 ${st.updated ?? '未記'}`);
  } catch {
    console.log('\n🛈 台灣端進度檔存在但解析失敗（格式待對齊，不影響本次收件）');
  }
}

console.log(`\n── 收件摘要：上位 ${promoted}、拒收 ${rejected}、無新檔 ${skipped} ──`);
if (promoted && PROMOTE_TO['temple-xml/temple.xml']) {
  console.log('提醒：temple.xml 已更新 → 可跑 `pnpm data:temple-coords /root/.config/folk-tw/temple.xml`（乾跑）看能補幾筆座標。');
}
if (problems.length) {
  console.error('\n✗ 驗證失敗（上位檔維持原狀、未被覆蓋）：');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
