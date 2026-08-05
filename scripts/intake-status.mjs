#!/usr/bin/env node
// 台灣端投遞管道的現況報告。**所有數值即時計算，不寫死在任何文件裡。**
//
// 為什麼要這支：inbox 是 write-only 的暫存區（台灣端只能寫、不能刪，`rrsync -wo -no-del`），
// 檔案驗過就被 intake-ingest.mjs 原子上位並清空。所以「哪些收到了、哪些處理過了」
// 光看目錄看不出來，得同時對照 manifest、state.json、站上實際資料三邊。
//
// 用法：
//   node scripts/intake-status.mjs          # 四段報告
//   node scripts/intake-status.mjs --brief  # 只印「待處理」與「異常」
//
// 搭配文件：docs/taiwan-intake-status.md（講每一份資料的整合方式與決策脈絡，不放數字）。
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const INBOX = '/root/.config/folk-tw/intake/inbox';
const ARCHIVE = '/root/.config/folk-tw/intake/archive';
const BRIEF = process.argv.includes('--brief');

const j = (p) => JSON.parse(readFileSync(p, 'utf8'));
const days = (t) => (t ? Math.floor((Date.now() - new Date(t).getTime()) / 86400000) : null);
const fileAge = (p) => (existsSync(p) ? days(statSync(p).mtime) : null);
const size = (p) => (existsSync(p) ? statSync(p).size : 0);
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
/** 空陣列／空字串／null 一律算「沒有」。見下方 iconography 的註解。 */
const nonEmpty = (v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== '');
const ago = (d) => (d == null ? '—' : d === 0 ? '今天' : `${d} 天前`);

// ── 讀三個來源 ──────────────────────────────────────────────────────────────
const manifest = j('docs/intake-manifest.json');
const state = existsSync(join(INBOX, 'state.json')) ? j(join(INBOX, 'state.json')) : { jobs: {} };
const temples = j('src/data/temples.json');
const deities = j('src/data/deities.json');

const inboxFiles = existsSync(INBOX)
  ? readdirSync(INBOX, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => join(String(e.parentPath ?? e.path).replace(INBOX, '').replace(/^\//, ''), e.name))
      .filter((f) => !/\.(sha256|meta\.json)$/.test(f))
  : [];

// ── 站上實際數字（即時算）──────────────────────────────────────────────────
const M = {
  temples: temples.length,
  withCoords: temples.filter((t) => t.lat != null && t.lng != null).length,
  noCoords: temples.filter((t) => t.lat == null || t.lng == null).length,
  festTemples: temples.filter((t) => (t.festivals ?? []).length > 0).length,
  festRows: temples.reduce((n, t) => n + (t.festivals ?? []).length, 0),
  history: temples.filter((t) => t.history).length,
  intro: temples.filter((t) => t.intro).length,
  openTime: temples.filter((t) => t.open_time).length,
  deities: deities.length,
  // 🔴 `iconography` 是**陣列**，空陣列在 JS 是 truthy（Python 的 bool([]) 才是 False）。
  // 初版寫 `d.iconography` → 76 尊全部算成「有」、灶神也被報成「已有」＝報告在騙人。
  // 狀態報告寧可少報也不能虛報，故一律用 nonEmpty()。
  iconography: deities.filter((d) => nonEmpty(d.iconography)).length,
  zaojunIcon: nonEmpty(deities.find((d) => d.id === 'zaojun')?.iconography),
  outreach: (() => {
    const p = '/root/.config/folk-tw/outreach-sent.json';
    if (!existsSync(p)) return '—';
    const o = j(p);
    // 結構是 { version, updatedAt, sent }——初版數外層鍵得到 3，不是推播廟數。
    if (Array.isArray(o)) return o.length;
    const sent = o.sent ?? o;
    return Array.isArray(sent) ? sent.length : Object.keys(sent).length;
  })(),
};

// ── 帳本：脈絡是穩定的（寫在這），數字是活的（上面算）────────────────────────
// 新增／改變一份資料的處置時，改這張表，不要改 docs 裡的數字。
const LEDGER = [
  {
    stage: 'live', id: 'temple-xml',
    what: '內政部寺廟開放資料（data.gov.tw 8203，OGDL 1.0）',
    how: '站上 7,891 間廟頁的底層（名稱/地址/主祀神/教別）＋座標回填＋每日五間外撥名單（電話與負責人僅存 repo 外）',
    metric: () => `站上 ${M.temples} 間廟｜有座標 ${M.withCoords}（缺 ${M.noCoords}）｜外撥已推播 ${M.outreach} 間`,
    upstream: '/root/.config/folk-tw/temple.xml',
  },
  {
    stage: 'live', id: 'religion-festival-entry',
    what: '慶(祭)典查詢網頁（網站 UI，非開放資料；曆別只有這份有）',
    how: '廟宇頁「年度祭典」區塊、OG 卡第三行、/festivals/<slug>/ 的「當天有登記祭典的宮廟」名單',
    metric: () => `${M.festTemples} 間廟／${M.festRows} 筆慶典`,
    upstream: join(INBOX, 'religion-festival/festival-entry.html'),
  },
  {
    stage: 'live', id: 'religion-festival-ods',
    what: '慶典官方 ODS 匯出',
    how: '只當對帳用、不進站——ODS 的日期欄沒有農曆／國曆標記（見 docs/festival-data-import.md 陷阱一）',
    metric: () => '直接使用 0 筆（刻意）',
    upstream: join(INBOX, 'religion-festival/festival-export.ods'),
  },
  {
    stage: 'pending', id: 'knowledge-zaoshen',
    goal: '補灶神的 iconography（CLAUDE.md 長期欠帳之一）',
    blocker: '⛔ 授權：knowledge-* 屬「網站內容」不是開放資料，與沿革同一封洽詢函，未獲同意前不處理',
    metric: () => `灶神 iconography：${M.zaojunIcon ? '✅ 已有' : '❌ 仍空白'}`,
    upstream: join(INBOX, 'misc/knowledge-zaoshen-cid265.html'),
  },
  {
    stage: 'pending', id: 'knowledge-deities-list',
    goal: '用 96 個神祇條目擴充 iconography',
    blocker: '⛔ 授權：同上',
    metric: () => `全 ${M.deities} 尊中有 iconography 者 ${M.iconography}`,
    upstream: join(INBOX, 'misc/knowledge-deities-list-cid3.html'),
  },
  {
    stage: 'pending', id: 'local-celebration',
    goal: '（用途未定）地方宗教慶典行政成果',
    blocker: '⚠️ 尚未定義要拿它做什麼——決定用途前不要動手',
    metric: () => '未使用',
    upstream: join(INBOX, 'misc/local-celebration-ci96.html'),
  },
  {
    stage: 'recon', id: 'Festival.xml',
    verdict: '評估完成 → **不換來源**。開放資料 8209（OGDL 1.0）但日期是裸 MM/DD、**沒有曆別**，且是 HTML 那份的子集。獨有「地址」欄，留作將來同名廟消歧的第三把鑰匙。',
    upstream: join(INBOX, 'religion-festival/Festival.xml'),
  },
  {
    stage: 'recon', id: 'RECON-guanyin-qian',
    verdict: '觀音一百籤：線上無可用權威全文。唯一線索＝國立臺灣文學館藏「觀音籤譜」NMTL20060200544，著錄明寫「第1-100首**龍山寺**籤詩」＝完整且版本錨定，**但未數位化**。要用得另外向該館申請。',
  },
  {
    stage: 'recon', id: 'TEMPLE-QIANBAN-LIST',
    verdict: '臺史博 33 件籤詩藏品清單（宜蘭城隍廟101首、碧霞宮64張、廣濟宮藥籤149首…）＝將來擴籤系的線索池。',
  },
  {
    stage: 'recon', id: 'FOUNDATION-FORM-PAYLOAD / URLLIST-SPEC',
    verdict: '寺廟查詢表單 payload（兩版實測 byte-identical）與 url_list 型 job 規格（台灣端已實作自測 67/67）。**目前無 job 使用**，將來要開直接拿。',
  },
  {
    stage: 'dropped', id: 'collections.culture.tw',
    verdict: '結案。17 組查詢跑完，該平台每一筆籤詩藏品都是「描述文字僅限公開瀏覽、圖像另需個案申請」＝看得到、抓得到、**不能轉載**。',
  },
  {
    stage: 'dropped', id: 'religion 沿革／建築特色／參拜流程',
    verdict: '暫停（非永久）。不在任何開放資料集裡，屬語文著作；站台版權宣告第三條明禁轉載重製散布。2026-08-05 已寄洽詢函，等回覆。',
  },
  {
    stage: 'dropped', id: 'FoundationOdsReport（寺廟 ODS 13,608 筆）',
    verdict: '不開 job。比 temple.xml 多出的部分多是法人教會／基金會／宗祠，各自都有開放資料集（8204/8205/8206/8208）。',
  },
];

// ── 輸出 ────────────────────────────────────────────────────────────────────
const jobState = (id) => state.jobs?.[id] ?? {};
function jobLine(id) {
  const s = jobState(id);
  if (s.last_ok) return `台灣端最後成功 ${ago(days(s.last_ok))}`;
  if (s.attempts) return `⚠️ 連續失敗 ${s.attempts} 次：${String(s.last_error ?? '').slice(0, 40)}`;
  return '—';
}

const line = (n = 74) => console.log('─'.repeat(n));
console.log(`\n台灣端投遞管道現況　（manifest v${manifest.version}／${manifest.updated}）`);
console.log(`state.json 更新於 ${ago(days(state.updated))}（${String(state.updated).slice(0, 19)}）`);
console.log(`inbox 現有 ${inboxFiles.length} 個檔（不計側檔）`);

if (!BRIEF) {
  line();
  console.log('■ 一、已經在站上發揮作用');
  for (const e of LEDGER.filter((x) => x.stage === 'live')) {
    console.log(`\n  ● ${e.id}　${e.what}`);
    console.log(`    整合方式：${e.how}`);
    console.log(`    現況：${e.metric()}`);
    console.log(`    來源檔：${e.upstream ? `${mb(size(e.upstream))}，${ago(fileAge(e.upstream))}` : '—'}｜${jobLine(e.id)}`);
  }
}

line();
console.log('■ 二、還沒處理好（待處理清單）');
for (const e of LEDGER.filter((x) => x.stage === 'pending')) {
  const age = fileAge(e.upstream);
  console.log(`\n  ● ${e.id}`);
  console.log(`    目標：${e.goal}`);
  console.log(`    卡點：${e.blocker}`);
  console.log(`    現況：${e.metric()}`);
  console.log(`    檔案已躺 ${ago(age)}${age != null && age > 3 ? '（超過 3 天未處理）' : ''}`);
}

const stuck = Object.entries(state.jobs ?? {}).filter(([, s]) => !s.last_ok && s.attempts > 0);
if (stuck.length) {
  console.log('\n  ● 抓取一直失敗的 job');
  for (const [id, s] of stuck) console.log(`    ${id}：連續 ${s.attempts} 次｜${String(s.last_error ?? '').slice(0, 50)}`);
}

if (!BRIEF) {
  line();
  console.log('■ 三、偵察結論（別重做一遍）');
  for (const e of LEDGER.filter((x) => x.stage === 'recon')) console.log(`\n  ● ${e.id}\n    ${e.verdict}`);
  line();
  console.log('■ 四、放棄／暫停');
  for (const e of LEDGER.filter((x) => x.stage === 'dropped')) console.log(`\n  ● ${e.id}\n    ${e.verdict}`);
}

line();
console.log(`站上相關資料：沿革 ${M.history}／簡介 ${M.intro}／開放時間 ${M.openTime}　（共 ${M.temples} 間廟）`);
console.log(`archive 保留版本數：${existsSync(ARCHIVE) ? readdirSync(ARCHIVE, { recursive: true }).filter((f) => String(f).endsWith('.xml')).length : 0}\n`);
