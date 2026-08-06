#!/usr/bin/env node
// 地方宗教慶典匯入：內政部全國宗教資訊網「地方宗教慶典」→ src/data/local-celebrations.json。
//
// 為什麼要這支：站上原本只有兩種慶典事實——
//   ① `temples.json` 的 `festivals[]`＝**廟方自己**向內政部登記的年度祭典（主體是廟）
//   ② `festivals.json` 的 10 個節日頁＝**全台性節俗**（中元、清明…，主體是節日本身）
// 這批是第三種：**縣市層級、政府登錄的地方宗教慶典**（主體是縣市）。三者不可混為一談。
//
// 🔴 授權（與慶(祭)典那批不同，別套錯）：
//   慶(祭)典能發佈，是因為同一批事實另有開放資料 8209（OGDL 1.0）背書。
//   **地方宗教慶典沒有對應的 data.gov.tw 資料集**，站得住的只有
//   「縣市＋曆別＋月日＋活動名稱」這層純事實。詳情頁（Content?ci=96&cid=N）
//   只有簡介與照片＝語文／攝影著作，**一個字都不取**。
//   （2026-08-06 台灣端實看兩筆確認：詳情頁沒有主辦單位／地點／廟宇／聯絡方式欄位。）
//
// 🔴 配廟只能用規則消歧，對不上就留空——這裡有一個實測會出錯的陷阱：
//   「東隆宮迎王平安祭典」用樸素字串比對會配到**潮州鎮東隆宮**，
//   正主是**東港東隆宮**（`donggang_dongling`）。標題裡沒有鄉鎮線索，
//   屏東縣又有兩間叫「東隆宮」→ **本檔的規則會判定無法消歧而留空，這是正確行為**。
//   別為了讓數字好看去放寬規則；寧缺勿假（總紅線第 1 條）。
//
// 消歧規則（三段，與 import-festivals.mjs 同精神，全部零猜測）：
//   1. 活動名稱裡出現的廟名，在 temples.json 全站唯一 → 命中
//   2. 同名 → 用該慶典的**縣市**過濾，唯一才採用
//   3. 仍同名 → 若活動名稱本身含**鄉鎮名**，再過濾一次，唯一才採用
//   以上都不唯一 → `temple_ref: null`（連同原因記在 `--verbose` 輸出裡）
//
// ⚠️ 節日頁的關聯**不寫進本檔輸出**：哪個節日頁「擁有」某個農曆日期，
//   唯一真實來源是 `src/lib/temple-festival.ts` 的 `festivalOwnerByLunarDate()`
//   （廟宇頁與節日頁都走它）。在這裡另存一份就是第二個真實來源＝必然漂移。
//
// 用法：
//   node scripts/import-local-celebrations.mjs            # 乾跑（預設）：只印統計與樣本
//   node scripts/import-local-celebrations.mjs --write    # 實際寫 src/data/local-celebrations.json
//   node scripts/import-local-celebrations.mjs --verbose  # 逐筆印出配廟判定過程

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const INBOX = '/root/.config/folk-tw/intake/inbox/misc';
const PAGES = [
  'local-celebration-ci96.html',
  ...[2, 3, 4, 5, 6].map((p) => `local-celebration-ci96-p${p}.html`),
];
const TEMPLES = 'src/data/temples.json';
const OUT = 'src/data/local-celebrations.json';
const FETCHED_ON = '2026-08-06'; // 台灣端補齊 6 頁的日期

const SOURCE_REF =
  '內政部全國宗教資訊網・地方宗教慶典 https://religion.moi.gov.tw/LocalCelebration/Index?ci=96';
const SOURCE_NOTE = `縣市、曆別與月日、活動名稱；抓取日 ${FETCHED_ON}`;

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const VERBOSE = args.includes('--verbose');

// ── 解析 ────────────────────────────────────────────────────────────────────
// 每一列的形狀（2026-08-06 實測）：
//   <a href="/LocalCelebration/Content?ci=96&cid=N" title="活動名稱" class="habox">
//     …<div class="loc_left">縣市</div><div class="loc_right">曆別 MM月DD日</div>…
// 曆別有三種：農曆 57／國曆 6／回曆 2（開齋節）。回曆**不換算**，見下方 CAL。
const ROW = /<a href="\/LocalCelebration\/Content\?ci=96&(?:amp;)?cid=(\d+)" title="([^"]*)" class="habox">([\s\S]*?)<\/a>/g;

const CAL = { 農曆: 'lunar', 國曆: 'solar', 回曆: 'hijri' };

const unescapeHtml = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const pad = (n) => String(n).padStart(2, '0');

function parsePage(file) {
  const html = readFileSync(`${INBOX}/${file}`, 'utf8');
  const out = [];
  let m;
  ROW.lastIndex = 0;
  while ((m = ROW.exec(html))) {
    const [, cid, rawTitle, block] = m;
    const name = unescapeHtml(rawTitle).trim();
    const county = (block.match(/class="loc_left">([^<]*)</) ?? [])[1]?.trim() ?? '';
    const right = (block.match(/class="loc_right">([\s\S]*?)<\/div>/) ?? [])[1] ?? '';
    const text = right.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const calCn = (text.match(/(農曆|國曆|回曆)/) ?? [])[1];
    const md = text.match(/(\d{1,2})月(\d{1,2})日/);
    out.push({
      cid: Number(cid),
      name,
      county,
      calendar: CAL[calCn] ?? null,
      calendarCn: calCn ?? '',
      date: md ? `${pad(Number(md[1]))}-${pad(Number(md[2]))}` : null,
      _file: file,
    });
  }
  return out;
}

const missing = PAGES.filter((f) => !existsSync(`${INBOX}/${f}`));
if (missing.length) {
  console.error(`✗ inbox 缺檔：${missing.join('、')}`);
  console.error('  這批由 manifest 的 local-celebration[-p2..p6] job 每輪抓取，跑 node scripts/intake-status.mjs 看現況。');
  process.exit(1);
}

const rows = PAGES.flatMap(parsePage);

// 品質閘：來源自報「共 6 頁，65 筆」。cid 去重後不符就是漏頁或重複抓，寧可停手。
const byCid = new Map(rows.map((r) => [r.cid, r]));
if (byCid.size !== rows.length) {
  console.error(`✗ cid 有重複：解析 ${rows.length} 列，去重後 ${byCid.size}`);
  process.exit(1);
}
const bad = rows.filter((r) => !r.calendar || !r.date || !/[一-鿿]/.test(r.name) || !r.county);
if (bad.length) {
  console.error(`✗ ${bad.length} 筆欄位不完整（曆別／日期／名稱漢字／縣市），不寫檔：`);
  for (const b of bad.slice(0, 5)) console.error(`   cid=${b.cid} ${JSON.stringify(b)}`);
  process.exit(1);
}

// ── 配廟消歧 ────────────────────────────────────────────────────────────────
// 臺／台 正規化：來源用「臺北市」，temples.json 兩種都有（MOI 原始欄位很髒）。
const norm = (s) => String(s ?? '').replace(/台/g, '臺');

const temples = JSON.parse(readFileSync(TEMPLES, 'utf8'));
// 只拿「看得出是廟」的名稱當比對候選：兩字名（如「天宮」）當子字串會亂命中。
const TEMPLE_SUFFIX = /(宮|寺|廟|壇|殿|祠|堂|府)$/;
const byName = new Map();
for (const t of temples) {
  if (!t.name || t.name.length < 3 || !TEMPLE_SUFFIX.test(t.name)) continue;
  const k = norm(t.name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(t);
}
const templeNames = [...byName.keys()];

const stat = { unique: 0, by_county: 0, by_township: 0, no_temple_in_name: 0, unresolved: 0 };

/** 一筆地方宗教慶典 → 廟 id（對不上回 null，**絕不猜**）。 */
function resolveTemple(r) {
  const title = norm(r.name);
  // 取最長匹配：「東隆福安宮」與「東隆宮」同時可能命中時，長的才是真的那間。
  const hits = templeNames.filter((n) => title.includes(n)).sort((a, b) => b.length - a.length);
  if (!hits.length) {
    stat.no_temple_in_name++;
    return { id: null, why: '活動名稱裡沒有廟名' };
  }
  const cands = byName.get(hits[0]);
  if (cands.length === 1) {
    stat.unique++;
    return { id: cands[0].id, why: `廟名「${hits[0]}」全站唯一` };
  }
  const county = norm(r.county);
  const inCounty = cands.filter((t) => norm(t.district).startsWith(county));
  // 🔴 縣市不符就到此為止，**絕不擴大到全國找**。
  // 這條是實測換來的：初版在 inCounty 為空時退回全國候選，
  // 於是「臺北保安宮—保生文化祭」（臺北市）被配到**臺中市北區**的保安宮。
  // 縣市是我們手上的權威欄位，它說臺北市而站上臺北市沒有那間廟，答案就是「我們沒有」。
  if (inCounty.length === 0) {
    stat.unresolved++;
    return {
      id: null,
      why: `⚠️ ${r.county}沒有叫「${hits[0]}」的廟（全站他縣 ${cands.length} 間）→ 留空，不跨縣市配`,
    };
  }
  if (inCounty.length === 1) {
    stat.by_county++;
    return { id: inCounty[0].id, why: `廟名「${hits[0]}」在${r.county}唯一（全站 ${cands.length} 間）` };
  }
  // 鄉鎮消歧：活動名稱本身帶鄉鎮（「**花壇**文德宮白沙坑迎燈排」）才有得比。
  // 🔴 鄉鎮名去掉後綴後**至少 2 字**才拿來比對——同一個實測事故的另一半：
  // 「北區」去掉「區」只剩「北」，而「臺北保安宮」裡就有個「北」＝一定命中，且必然是錯的。
  const inTown = inCounty.filter((t) => {
    const town = norm(t.district).slice(county.length).match(/^[^0-9]{1,4}?[鄉鎮市區]/)?.[0];
    const stem = town?.replace(/[鄉鎮市區]$/, '') ?? '';
    return stem.length >= 2 && title.includes(stem);
  });
  if (inTown.length === 1) {
    stat.by_township++;
    return { id: inTown[0].id, why: `廟名「${hits[0]}」＋活動名稱裡的鄉鎮消歧（縣內 ${inCounty.length} 間）` };
  }
  stat.unresolved++;
  return {
    id: null,
    why: `⚠️ 無法消歧：${r.county}有 ${inCounty.length} 間「${hits[0]}」，活動名稱也沒有可用的鄉鎮線索 → 留空`,
  };
}

const CAL_ORDER = { lunar: 0, solar: 1, hijri: 2 };
const out = rows
  .map((r) => {
    const { id, why } = resolveTemple(r);
    if (VERBOSE) console.log(`  cid=${String(r.cid).padStart(3)} ${r.county} ${r.name}\n      → ${id ?? '（留空）'}　${why}`);
    return {
      id: `lc_${r.cid}`,
      name: r.name,
      county: r.county,
      calendar: r.calendar,
      date: r.date,
      temple_ref: id,
    };
  })
  // 固定排序（縣市→曆別→日期→cid）＝每次執行輸出一致，diff 才有意義。
  .sort(
    (a, b) =>
      a.county.localeCompare(b.county, 'zh-Hant') ||
      CAL_ORDER[a.calendar] - CAL_ORDER[b.calendar] ||
      a.date.localeCompare(b.date) ||
      a.id.localeCompare(b.id),
  );

const payload = {
  _readme: [
    '內政部全國宗教資訊網「地方宗教慶典」＝**縣市層級**政府登錄的宗教慶典，',
    '與 temples.json 的 festivals[]（廟方自己登記的年度祭典）、',
    'festivals.json（全台性節俗）是三種不同的東西，勿混用。',
    '本檔由 scripts/import-local-celebrations.mjs 產生，**不要手改**；',
    'temple_ref 為 null 者是規則消歧失敗（寧缺勿假），不是漏填。',
  ],
  source: { ref: SOURCE_REF, note: SOURCE_NOTE },
  fetched_on: FETCHED_ON,
  items: out,
};

console.log(`\n地方宗教慶典：解析 ${rows.length} 筆（${PAGES.length} 頁）`);
const cal = {};
for (const r of rows) cal[r.calendarCn] = (cal[r.calendarCn] ?? 0) + 1;
console.log(`  曆別　　　　　　　${Object.entries(cal).map(([k, v]) => `${k} ${v}`).join('｜')}`);
console.log(`  縣市數　　　　　　${new Set(rows.map((r) => r.county)).size}`);
console.log('  ── 配廟 ──');
console.log(`  廟名唯一命中　　　${stat.unique}`);
console.log(`  縣市消歧命中　　　${stat.by_county}`);
console.log(`  鄉鎮消歧命中　　　${stat.by_township}`);
console.log(`  無法消歧(留空)　　${stat.unresolved}`);
console.log(`  名稱無廟名　　　　${stat.no_temple_in_name}`);
console.log(`  → 有 temple_ref 者 ${out.filter((x) => x.temple_ref).length} 筆`);

if (!WRITE) {
  console.log('\n（乾跑，未寫檔。加 --write 才寫入。樣本：）');
  for (const x of out.slice(0, 6)) console.log('   ', JSON.stringify(x));
  process.exit(0);
}
writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
console.log(`\n✓ 已寫入 ${OUT}`);
