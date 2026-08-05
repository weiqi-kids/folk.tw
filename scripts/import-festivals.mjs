#!/usr/bin/env node
// 慶(祭)典匯入：內政部全國宗教資訊網「慶(祭)典查詢」→ temples.json 的 `festivals[]`。
//
// 為什麼要這支：全站 7,891 間廟原本只有 21 間有已查證的 `main_festival`，其餘廟宇頁與
// OG 分享卡的第三行只能退而顯示「主祀神聖誕」（那是**神明的**生日，不是該廟辦的活動）。
// 這批官方資料讓 2,558 間拿到真實的年度祭典。
//
// 🔴 兩個會產生假資料的陷阱（規格與實測見 docs/festival-data-import.md，動手前必讀）：
//   ① **ODS 不能當主來源**：官方 ODS 匯出的日期欄**沒有農曆／國曆標記**，而全量 6,644 筆中
//      農曆 6,365、國曆 279。只用 ODS 會把 6,365 筆農曆當國曆
//      （媽祖聖誕農曆三月廿三 → 被寫成國曆 3/23，正解 4/29）。**HTML 是唯一可用的主來源。**
//   ② **temples.json 的 id 不是 MOI 編號**：`moi_1044_保民廟` 的 1044 是匯入當下的**陣列索引**
//      （import-temples.ts 的迴圈 i），而 temple.xml 的 <編號> 是七位數。
//      用 `moi_<編號>_<名稱>` 去組 id 對映會命中 0。**只能用「廟名＋行政區」對映。**
//
// 對映策略（三段，全部零猜測；對不上就不寫，寧缺勿假）：
//   1. 廟名在 temples.json 唯一 → 直接命中
//   2. 廟名同名 → 用慶典的「行政區」（縣市＋鄉鎮）消歧，唯一才採用
//   3. 仍同名 → **電話橋**：用「廟名＋電話」對 temple.xml（12,419 筆，有電話與完整地址），
//      再用**完整地址完全相符**對回 temples.json。唯一命中才採用。
//      ⚠️ 電話僅用於比對，**絕不寫進 repo**——本 repo 為 public，電話＝個資。
//
// 一廟多祭典（770 間，最多一間 18 筆）：`festivals[]` 全部保留；
// 顯示用的「主要祭典」代表筆由 src/lib/temple-festival.ts 依**農曆日期最早**挑選
// （2026-07-31 用戶裁示：不做語意判斷，最簡單可預測）。本檔不寫任何衍生字串。
//
// 🔴 不覆寫既有 `main_festival`：那 21 間是逐間查證的敘述句（含國家重要民俗等脈絡），
// 品質高於 MOI 的短語。本檔**只寫 `festivals[]`**，`main_festival` 一個字都不碰，
// 顯示層永遠讓已查證的敘述句優先。故本檔可重複執行（idempotent）。
//
// 用法：
//   node scripts/import-festivals.mjs            # 乾跑（預設）：只印統計與樣本，不寫檔
//   node scripts/import-festivals.mjs --write    # 實際寫回 src/data/temples.json
//   node scripts/import-festivals.mjs --sample 20

import { readFileSync, writeFileSync } from 'node:fs';

const HTML = '/root/.config/folk-tw/intake/inbox/religion-festival/festival-entry.html';
const XML = '/root/.config/folk-tw/temple.xml';
const TEMPLES = 'src/data/temples.json';
const FETCHED_ON = '2026-07-30'; // 台灣端投遞管道的抓取日（見 docs/taiwan-host-handoff.md）

const SOURCE_REF = '內政部全國宗教資訊網・慶(祭)典查詢 https://religion.moi.gov.tw/Festival/Festival?ci=1';
const SOURCE_NOTE = `年度慶(祭)典名稱、農曆／國曆日期與說明；抓取日 ${FETCHED_ON}`;

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const SAMPLE = Number(args[args.indexOf('--sample') + 1]) || 8;

// ── 解析 ────────────────────────────────────────────────────────────────────
const stripTags = (s) => s.replace(/<[^>]+>/g, '');
const unescapeHtml = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const COLS = ['name', 'org', 'religion', 'area', 'date', 'phone', 'desc'];

/**
 * 說明欄是否與日期欄互相矛盾。**與 check-integrity.ts 同一套判準**（改一邊要改兩邊；
 * 這裡刻意用純函式、不 import，因為 check-integrity 是 .ts、本檔是 .mjs）。
 * 只有「說明整段短、且恰好解出一個日期、且與日期欄不同」才算矛盾——
 * 說明裡提到別的相關日期（進香日、法會範圍）是補充資訊，不是衝突。
 */
export function contradictsDate(desc, date) {
  const s = String(desc ?? '').trim();
  if (!s || s.length > 16) return false;
  // 「及／或／另／暨」開頭＝補充的第二個日期（武孚廟「及8月23日」），不是衝突。
  if (/^[及或另暨、，,]/.test(s)) return false;
  const [fm, fd] = String(date).split('-').map(Number);
  // 區間「N月A-B日」：日期欄落在區間內就不是衝突（台北湄聖宮「3月21-23日舉辦祝壽大法會」）。
  const rng = s.match(/^(?:農曆|國曆)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[-–~至]\s*(\d{1,2})\s*日?/);
  if (rng) {
    const [m, a, b] = rng.slice(1).map(Number);
    if (m === fm && a <= fd && fd <= b) return false;
  }
  const ms = [...s.matchAll(/(?:農曆|國曆)?\s*(\d{1,2})\s*[月/\-]\s*(\d{1,2})\s*日?/g)];
  if (ms.length !== 1) return false;
  return Number(ms[0][1]) !== fm || Number(ms[0][2]) !== fd;
}

function parseFestivalHtml(html) {
  const body = html.slice(html.indexOf('<tbody'));
  const rows = body.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
  const out = [];
  for (const r of rows) {
    const tds = r.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? [];
    if (tds.length !== COLS.length) continue; // 表頭列（<th>）自然被排除
    const vals = tds.map((td) => unescapeHtml(stripTags(td)).trim());
    out.push(Object.fromEntries(COLS.map((c, i) => [c, vals[i]])));
  }
  return out;
}

/**
 * 日期正規化。**這裡每一條剔除規則都是為了不產生假事實**，不是為了資料好看：
 *   ・無「農曆／國曆」前綴 → 無從判斷曆別，寫下去就是賭（陷阱①）→ 剔除
 *   ・帶絕對年份（國曆 2018/12/22 共 102 筆，58 筆是 2018 年）→ 那是**當年的一次性活動**，
 *     不是年度例祭；寫成年度祭典＝替廟方宣稱一件不存在的事 → 剔除
 *   ・「星期日」「初二,十六」這類非日期 → 無法換算國曆 → 剔除
 *   ・不存在的日子（農曆 07/00、02/31 共 30 筆）→ 明顯的來源髒資料 → 剔除
 */
function normalizeDate(raw) {
  const m = /^(農曆|國曆)\s*(.+)$/.exec(raw ?? '');
  if (!m) return null;
  const calendar = m[1] === '農曆' ? 'lunar' : 'solar';
  const body = m[2].trim();
  if (/\d{4}\s*\//.test(body)) return null; // 一次性的絕對年份日期
  const md = /^(\d{1,2})\/(\d{1,2})$/.exec(body);
  if (!md) return null; // 星期／多日條列等非日期
  const mm = Number(md[1]);
  const dd = Number(md[2]);
  if (mm < 1 || mm > 12 || dd < 1) return null;
  // 農曆一個月最多 30 日；國曆依月份天數（閏年一律放行 2/29）。
  const maxDay = calendar === 'lunar' ? 30 : [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
  if (dd > maxDay) return null;
  return { calendar, date: `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` };
}

// ── 地區解析：一律用頁面同一支 lib，不在本檔重寫規則 ─────────────────────────
// （初版自寫正則曾在桃園區／麻豆區等 12 處對不上——lib 依縣市別區分後綴並做臺→台正規化。）
const { templeCounty, templeTownship } = await import('../src/lib/temple-region.ts');

const norm = (s) => (s ?? '').replace(/臺/g, '台').trim();
const regionKey = (d) => {
  const c = templeCounty(d);
  const t = templeTownship(d);
  return c ? `${c.name}/${t?.name ?? ''}` : null;
};

// ── 主流程 ──────────────────────────────────────────────────────────────────
const recs = parseFestivalHtml(readFileSync(HTML, 'utf8'));
const temples = JSON.parse(readFileSync(TEMPLES, 'utf8'));

const byName = new Map();
for (const t of temples) {
  const k = norm(t.name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(t);
}
// 完整地址 → 廟（電話橋的第二段）。地址去空白後比對，臺→台正規化。
const byAddr = new Map();
for (const t of temples) {
  const k = norm(t.district).replace(/\s/g, '');
  if (!k) continue;
  if (!byAddr.has(k)) byAddr.set(k, []);
  byAddr.get(k).push(t);
}

// temple.xml：僅在記憶體中建「廟名＋電話 → 完整地址」索引，供消歧用；電話不落地。
const digits = (s) => (s ?? '').replace(/\D/g, '');
const byNamePhone = new Map();
{
  const xml = readFileSync(XML, 'utf8');
  const field = (block, tag) => {
    const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
    return m ? unescapeHtml(m[1]).trim() : '';
  };
  for (const block of xml.match(/<OpenData_3>[\s\S]*?<\/OpenData_3>/g) ?? []) {
    const phone = digits(field(block, '電話'));
    if (!phone) continue;
    const k = `${norm(field(block, '寺廟名稱'))}|${phone}`;
    if (!byNamePhone.has(k)) byNamePhone.set(k, []);
    byNamePhone.get(k).push(norm(field(block, '地址')).replace(/\s/g, ''));
  }
}

const stat = {
  rows: recs.length,
  dropped_no_name: 0,
  dropped_bad_date: 0,
  matched_unique_name: 0,
  matched_by_region: 0,
  matched_by_phone: 0,
  unresolved_same_name: 0,
  not_in_our_db: 0,
  duplicate_within_temple: 0,
};

/** 一筆慶典 → 廟 id（對不上回 null，**絕不猜**）。 */
function resolveTemple(r) {
  const cands = byName.get(norm(r.org)) ?? [];
  if (cands.length === 0) {
    stat.not_in_our_db++;
    return null;
  }
  if (cands.length === 1) {
    stat.matched_unique_name++;
    return cands[0];
  }
  const want = regionKey(r.area);
  const narrowed = want ? cands.filter((t) => regionKey(t.district) === want) : [];
  if (narrowed.length === 1) {
    stat.matched_by_region++;
    return narrowed[0];
  }
  // 電話橋：廟名＋電話 → temple.xml 地址 → temples.json 完整地址
  const addrs = byNamePhone.get(`${norm(r.org)}|${digits(r.phone)}`) ?? [];
  const hits = new Map();
  for (const a of addrs) for (const t of byAddr.get(a) ?? []) hits.set(t.id, t);
  if (hits.size === 1) {
    stat.matched_by_phone++;
    return [...hits.values()][0];
  }
  stat.unresolved_same_name++;
  return null;
}

// 祭典名稱至少要有一個漢字：來源有 48 筆名稱是 `.`／`..`／`33333` 這類鍵入殘留，
// 它們有合法日期、會通過其他所有檢查，但渲染出來就是「主要祭典為『.』」＝廢頁面。
const hasCjk = (s) => /[一-鿿]/.test(s);

// 來源的「慶、祭典名稱」欄有 6 筆內含 tab／換行、19 筆內含連續空白（是被塞進名稱欄的整段說明），
// 不正規化就會把版面撐爆——OG 卡只排得下兩行，超長文字會把**日期擠出卡外**（日期才是外撥要傳達的）。
const squash = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

const collected = new Map(); // temple.id -> festivals[]
for (const r of recs) {
  const name = squash(r.name);
  if (!name || !hasCjk(name)) {
    stat.dropped_no_name++; // 236 筆無名稱＋48 筆純符號／數字：無從渲染，也無從查證是什麼活動
    continue;
  }
  const d = normalizeDate(r.date);
  if (!d) {
    stat.dropped_bad_date++;
    continue;
  }
  const t = resolveTemple(r);
  if (!t) continue;
  if (!collected.has(t.id)) collected.set(t.id, []);
  const list = collected.get(t.id);
  // 同一間廟的重複列（來源本身有 21 筆完全重複列）：同曆別＋同日期＋同名稱視為同一筆
  if (list.some((f) => f.calendar === d.calendar && f.date === d.date && f.name === name)) {
    stat.duplicate_within_temple++;
    continue;
  }
  const desc = squash(r.desc);
  // 🔴 來源自身矛盾（2026-08-05 發現）：說明欄整段就只是一個日期、且與日期欄不同。
  // 實例：修悟堂「五府千歲聖誕」日期欄 農曆01-03、說明欄「農曆6月18日」——後者正是
  // 池府千歲聖誕（站上 deities.json 有三個掛源），前者不對應任何一府。
  // 我們**無從判定哪個對，也不該替來源判斷**，而要去拜拜的人拿到錯日期比沒有更糟
  // （同站上「無源不發佈／寧漏不錯」）→ 整筆捨棄。
  // ⚠️ 只擋「說明整段就是一個日期」這種純矛盾；「及8月23日」（第二個日期）、
  // 「3月21-23日舉辦…」（涵蓋日期欄）不算，那是補充不是衝突。實測全量僅 2 筆命中。
  if (desc && contradictsDate(desc, d.date)) {
    stat.dropped_desc_conflict = (stat.dropped_desc_conflict ?? 0) + 1;
    continue;
  }
  list.push({ name, ...d, ...(desc ? { desc } : {}) });
}

// 排序固定＝每次執行結果一致（農曆在前、再依日期、再依名稱），不隨來源列序漂移。
for (const list of collected.values()) {
  list.sort(
    (a, b) =>
      (a.calendar === b.calendar ? 0 : a.calendar === 'lunar' ? -1 : 1) ||
      a.date.localeCompare(b.date) ||
      a.name.localeCompare(b.name),
  );
}

// ── 寫回 ────────────────────────────────────────────────────────────────────
let touched = 0;
let sourcesAdded = 0;
let keptCurated = 0;
for (const t of temples) {
  const list = collected.get(t.id);
  if (!list || list.length === 0) continue;
  touched++;
  t.festivals = list;
  if (t.main_festival) keptCurated++; // 已查證的敘述句保留，本檔不碰
  t.sources = t.sources ?? [];
  if (!t.sources.some((s) => s.ref === SOURCE_REF)) {
    t.sources.push({ type: 'gov', ref: SOURCE_REF, note: SOURCE_NOTE });
    sourcesAdded++;
  }
}

const totalFestivals = [...collected.values()].reduce((n, l) => n + l.length, 0);
const multi = [...collected.values()].filter((l) => l.length > 1).length;

console.log('── 來源解析 ──');
console.log(`  HTML 資料列        ${stat.rows}`);
console.log(`  剔除：無祭典名稱   ${stat.dropped_no_name}`);
console.log(`  剔除：日期不可用   ${stat.dropped_bad_date}（無曆別前綴／一次性絕對年份／非日期／不存在的日子）`);
console.log('── 對映 ──');
console.log(`  廟名唯一命中       ${stat.matched_unique_name}`);
console.log(`  行政區消歧命中     ${stat.matched_by_region}`);
console.log(`  電話橋命中         ${stat.matched_by_phone}`);
console.log(`  同名無法消歧(捨棄) ${stat.unresolved_same_name}`);
console.log(`  本站未收錄此廟     ${stat.not_in_our_db}`);
console.log(`  同廟重複列(去重)   ${stat.duplicate_within_temple}`);
console.log('── 結果 ──');
console.log(`  取得祭典的廟       ${touched} / ${temples.length}`);
console.log(`  祭典筆數           ${totalFestivals}（多筆者 ${multi} 間）`);
console.log(`  新增來源標註       ${sourcesAdded}`);
console.log(`  保留既有 main_festival（不覆寫） ${keptCurated}`);

console.log('\n── 樣本 ──');
for (const t of temples.filter((x) => x.festivals?.length).slice(0, SAMPLE)) {
  console.log(`  ${t.name}（${t.district ?? ''}｜主祀${t.main_deity_raw ?? '—'}）`);
  for (const f of t.festivals) {
    console.log(`      ${f.calendar === 'lunar' ? '農曆' : '國曆'} ${f.date}  ${f.name}${f.desc ? `　— ${f.desc.slice(0, 30)}` : ''}`);
  }
}

if (WRITE) {
  writeFileSync(TEMPLES, `${JSON.stringify(temples, null, 2)}\n`);
  console.log(`\n✅ 已寫回 ${TEMPLES}`);
} else {
  console.log('\n（乾跑，未寫檔。確認上面數字後加 --write）');
}
