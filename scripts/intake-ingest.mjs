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
// 結束碼：0＝正常（含「沒有新檔」）；1＝有檔驗證失敗（呼叫端應發 Slack）。

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
const ageDays = (p) => (existsSync(p) ? (Date.now() - statSync(p).mtimeMs) / 864e5 : Infinity);

function loadManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch (e) {
    console.error(`✗ 讀不到 manifest（${MANIFEST}）：${e.message}`);
    process.exit(1);
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
 */
function checkExpect(buf, expect, currentPath) {
  const bad = [];
  if (!expect) return bad;

  // `record_status_only`：這個 job 的目的是「記錄那邊回什麼」，不是取得特定內容。
  // 例：religion.moi.gov.tw/robots.txt 實回 404——404 本身是有效答案（未宣告抓取限制），
  // 不該當失敗。故跳過所有內容檢查，由呼叫端把 meta.json 的狀態印出來供人判讀。
  if (expect.record_status_only) return bad;

  if (expect.min_bytes != null && buf.length < expect.min_bytes) {
    bad.push(`大小 ${buf.length}B < 絕對下限 ${expect.min_bytes}B（疑為錯誤頁）`);
  }

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

const manifest = loadManifest();
const jobs = manifest.jobs ?? [];

// ── --status：只報新鮮度（供 cron 的過期提醒使用）────────────────────────────
if (STATUS_ONLY) {
  const stale = [];
  for (const j of jobs) {
    const promoted = PROMOTE_TO[j.dest];
    const watch = promoted ?? join(INBOX, j.dest);
    const age = ageDays(watch);
    const limit = j.max_age_days ?? Infinity;
    const over = age > limit;
    if (over) stale.push({ id: j.id, age, limit, path: watch });
    const ageTxt = age === Infinity ? '不存在' : `${age.toFixed(1)} 天`;
    console.log(`${over ? '⚠️' : '  '} ${j.id.padEnd(20)} 資料齡 ${ageTxt.padStart(9)}（上限 ${limit} 天）  ${watch}`);
  }
  if (stale.length) {
    console.log(
      `\nSTALE\t${stale
        .map((s) => `${s.id}（${s.age === Infinity ? '從未收到' : s.age.toFixed(0) + ' 天'}／上限 ${s.limit}）`)
        .join('、')}`,
    );
  }
  process.exit(0);
}

// ── 處理 inbox ────────────────────────────────────────────────────────────
let promoted = 0;
let rejected = 0;
let skipped = 0;
const problems = [];

for (const j of jobs) {
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

  // 2) manifest 的 expect（台灣端也該擋，這裡再擋一次：別讓錯誤頁或殘檔覆蓋好資料）
  const bad = checkExpect(buf, j.expect, PROMOTE_TO[j.dest]);
  if (bad.length) {
    problems.push(`${j.id}：${bad.join('；')} → 不上位`);
    rejected++;
    continue;
  }

  // 把台灣端記的 HTTP 狀態印出來——`record_status_only` 類的 job 全靠這個判讀。
  const metaFile = `${src}.meta.json`;
  let metaNote = '';
  if (existsSync(metaFile)) {
    try {
      const m = JSON.parse(readFileSync(metaFile, 'utf8'));
      metaNote = `｜HTTP ${m.http_status ?? '?'}｜抓取於 ${m.fetched_at ?? '?'}`;
    } catch { metaNote = '｜meta.json 解析失敗'; }
  }

  const dest = PROMOTE_TO[j.dest];
  if (!dest) {
    console.log(`✓ ${j.id} 驗證通過（${buf.length}B）${metaNote}；此 job 無上位目標，留在 inbox 供後續解析`);
    continue;
  }

  if (DRY) {
    console.log(`（乾跑）${j.id} 驗證通過 ${buf.length}B → 會上位到 ${dest}`);
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

  // 5) 收下的檔清出 inbox，避免下輪重複處理
  rmSync(src, { force: true });
  rmSync(shaPath, { force: true });
  const metaPath = `${src}.meta.json`;
  if (existsSync(metaPath)) {
    const dir = join(ARCHIVE, j.id, todayIso());
    mkdirSync(dir, { recursive: true });
    renameSync(metaPath, join(dir, basename(metaPath)));
  }
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
