// 時事祈福 · `src/data/topical.json` 的紀錄形狀（四個寫入端的唯一定義）。
//
// ── 為什麼要有這一份（2026-08-19 抽出）──────────────────────────────────────
// 這個檔的形狀原本由**四個寫入端各自約定**：orchestrate.mjs（開頁／歸檔／集氣降級）、
// topical-news-scan.mjs（開頁）、topical-followup.mjs（升 memorial／後續中繼）、
// qiugian-aggregate.mjs（集氣快照）。四邊都是「照著別人寫過的樣子再寫一次」，
// 沒有任何一處說得出「一筆紀錄長什麼樣」。狀態機（active→archived→memorial）散在四個檔裡，
// 而它同時被 `[slug].astro`、`astro.config.mjs`（mergedInto redirect）、sitemap、
// `/qiugian/` 清單、`check-topical-followup-render.mjs` 消費——形狀漂了不會紅燈，會安靜錯。
//
// 🔴 本檔只管**形狀與狀態轉移**，不管**判準**：
//   ・什麼事件值得開頁 → lib/topical-gate.mjs
//   ・哪些算重複     → lib/topical-dedup.mjs
//   ・文案能不能上線 → lib/topical-guard.mjs
//   ・留幾頁 active（N=5）、寬限幾天 → topical-orchestrate.mjs（用戶 2026-08-12 定案的參數，
//     刻意留在呼叫端，改它要先讀 docs/topical-blessing.md §3.10b）
//
// 🔴 三態的擁有者不可互侵（docs/topical-blessing.md §1）：
//   active→archived 只有 P1 orchestrate 能做；archived→memorial 只有 P4 followup 能做。
//   本檔提供動作，不代表誰都可以呼叫——誰該呼叫哪一支見上述文件。
import { readFileSync, writeFileSync } from 'node:fs';

/** 紀錄檔位置（相對 cwd，與三支腳本原本的寫法一致）。 */
export const TOPICAL_FILE = 'src/data/topical.json';

/** 生命週期三態；其餘值視為非法（P4 的 isTracked 會據此排除）。 */
export const STATUSES = ['active', 'archived', 'memorial'];

/** 讀取全部條目。 */
export const readTopical = (file = TOPICAL_FILE) => JSON.parse(readFileSync(file, 'utf8'));

/**
 * 寫回全部條目。序列化格式（2 空格縮排＋結尾換行）是**四個寫入端共用的不變式**：
 * cron 包裝靠 `git diff --quiet` 判斷「有沒有變」，格式一動就會整檔 diff、天天誤觸發部署。
 */
export const writeTopical = (list, file = TOPICAL_FILE) =>
  writeFileSync(file, JSON.stringify(list, null, 2) + '\n');

/**
 * 組出一筆**新開祈福頁**的紀錄（P1／P2 共用）。
 *
 * 欄位順序刻意固定，且可選欄位「有值才寫」——這樣 P1（有 mag／severity／glide／cycloneName）
 * 與 P2（都沒有）產出的紀錄自然一致，不必兩邊各寫一份物件字面值。
 * 🔴 `lat`／`lon` 要嘛成對寫入、要嘛都不寫：只有單邊時 `km()` 會算出 NaN，去重會安靜失效。
 *
 * place／time／lat／lon／mag／severity 留檔供跨執行的 `sameEvent` 比對；
 * cycloneName（國際命名）與 glide（聯合國災害碼）供跨產線去重，見 lib/topical-dedup.mjs。
 */
export function makeBlessingRecord({
  id, eventType, title, event, sources, place, time,
  cycloneName, cycloneNameZh, glide, mag, severity, lat, lon,
  detector, since, status = 'active',
}) {
  return {
    id, eventType, title,
    event,
    sources,
    place, time,
    ...(cycloneName ? { cycloneName } : {}),
    ...(cycloneNameZh ? { cycloneNameZh } : {}),
    ...(glide ? { glide } : {}),
    ...(mag != null ? { mag } : {}),
    ...(severity ? { severity } : {}),
    ...(lat != null && lon != null ? { lat, lon } : {}),
    detector, since, status,
  };
}

/**
 * active → archived（頁面轉 noindex、從 `/qiugian/` 清單消失，**網址不 404**——紅線 4）。
 *
 * @param {object} it   要歸檔的條目（就地修改）
 * @param {string} today YYYY-MM-DD
 * @param {{ seal?: boolean, reason?: string }} [opt]
 *   seal＝同時封存追蹤（`followup.sealed`）：P4 不再回訪，否則它會掛上 updates 又把頁面
 *   升成 memorial 重新進索引（docs/topical-blessing.md §4）。逾期自然歸檔**不** seal
 *   （那些事件仍該被追蹤）；集氣排序降級與人工撤頁才 seal。
 *   reason＝記一句 `retracted_reason` 供事後回溯。
 */
export function archiveRecord(it, today, { seal = false, reason } = {}) {
  it.status = 'archived';
  it.archived_at = today;
  if (seal) it.followup = { ...(it.followup ?? {}), sealed: true };
  if (reason) it.retracted_reason = reason;
  return it;
}

/**
 * archived → memorial（事件記錄頁：凍結集氣快照＋後續發展時間軸，有 updates 才 index）。
 * 🔴 只有 P4 followup 該呼叫；且**絕不**反向動 active→archived（那是 P1 的職責）。
 */
export function promoteToMemorial(it, today) {
  it.status = 'memorial';
  it.memorial_at = today;
  return it;
}

/**
 * 寫入 P4 的追蹤中繼（`followup`）。回傳是否真的變了——呼叫端據此決定要不要寫檔，
 * 中繼沒變就不寫可以省掉每日無謂 commit。
 */
export function setFollowupMeta(it, { sealed, last_checked, empty_runs }) {
  const prev = it.followup ?? {};
  const next = { sealed, last_checked, empty_runs };
  it.followup = next;
  return JSON.stringify(prev) !== JSON.stringify(next);
}

/**
 * 集氣人數峰值快照（qiugian-aggregate.mjs 用）。**只增不減、真實不灌水**：
 * GA4 的近 7 天集氣數會隨事件老化歸零，快照留下曾達到的真實峰值，供 archived／memorial
 * 頁顯示「當時共有 N 人一起集氣」。回傳是否有更動。
 */
export function setBlessSnapshot(it, weekCount) {
  if (typeof weekCount !== 'number' || weekCount <= 0) return false; // 本週無資料則不動既有快照
  const prev = typeof it.bless_snapshot === 'number' ? it.bless_snapshot : 0;
  const next = Math.max(prev, weekCount);
  if (next === prev) return false;
  it.bless_snapshot = next;
  return true;
}
