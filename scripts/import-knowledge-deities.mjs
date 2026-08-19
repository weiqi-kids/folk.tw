#!/usr/bin/env node
// 內政部「宗教知識+／宗教神祇」條目 → `deities.json` 的 `iconography` 與 `image`。
//
// 授權（2026-08-06 用戶取得內政部同意）：範圍全開、**含照片**，唯一條件是**標示資料來源連結**。
// 落實方式＝每一筆掛回它自己的 `Knowledge/Content?ci=2&cid=<N>`；照片另存攝影者姓名。
// 🔴 **別再去要公文文號**（見 docs/taiwan-intake-status.md §2026-08-06）。
//
// 🔴 這支跟「取欄位」的匯入器不是同一回事，動它之前先懂這件事：
//    `iconography` 是**造型短語**（既有值長這樣：「腳踏龜蛇」「黑臉」「爾來了匾、大算盤」），
//    而來源是一整篇學術體例的敘述文。把敘述「讀成」短語＝改寫＝有杜撰風險。
//    因此本檔的規則是 **只取原文片段，一個字都不改寫**：
//      · 從條目內文切出句子，只留同時滿足「含造型詞」與「夠短」的整句
//      · 存進 iconography 的是**原句 verbatim**，不做摘要、不合併、不補主詞
//      · 一句都沒中就留空（`--verbose` 會印出為什麼），**絕不硬湊**
//    寧可 96 尊裡只補到十幾尊，也不要 96 尊都有一句我編的話。
//
// 🔴 不覆寫既有值（同 import-festivals 對 main_festival 的作法）：
//    `iconography` 已有內容者不動（那 16 尊是逐尊查證的）；
//    `image` 已有者不動（67 尊已有 Commons 授權圖，品質與授權都更明確）。
//    故本檔可重複執行（idempotent），資料分批到齊也能一直重跑。
//
// 用法：
//   node scripts/import-knowledge-deities.mjs             # 乾跑（預設）
//   node scripts/import-knowledge-deities.mjs --verbose   # 逐尊印出判定過程與落選原因
//   node scripts/import-knowledge-deities.mjs --write     # 實際寫回 src/data/deities.json
//   node scripts/import-knowledge-deities.mjs --photos    # 另外印出待抓照片清單（給 gen-intake-urls-photos）

import { readFileSync, existsSync, readdirSync } from 'node:fs';
// 🔴 資料集寫入、旗標解析、來源標註、entity 解碼、合併鍵正規化**一律走這支**（唯一入口）。
import { attachSource, cliFlags, commitDataset, decodeEntities, norm } from './lib/dataset-commit.mjs';

const DIR = '/root/.config/folk-tw/intake/inbox/knowledge-deities';
const DEITIES = 'src/data/deities.json';
const PHOTO_CANDIDATES = 'docs/knowledge-photo-candidates.json';
// 🔴 旗標一律從這裡讀（含 --json）。抽出前 --write/--verbose/--photos 讀切好的 args、
//    而 --json 讀 process.argv，同一支檔案兩種來源，要逐行看才知道吃不吃哪個旗標。
const flags = cliFlags();
const WRITE = flags.write;
const VERBOSE = flags.verbose;
const PHOTOS = flags.photos;

const unescapeHtml = decodeEntities; // lib/dataset-commit.mjs 的唯一一份（另含數值型 entity）
const stripTags = (s) => s.replace(/<[^>]+>/g, '');
// norm 來自 lib/dataset-commit.mjs（統一為「臺→台＋刪全部空白」；方向對相等比對可證明等價，
// 空白處理與本檔原本相同，2026-08-19 實測輸出逐字元不變）。

// ── 造型短語 ────────────────────────────────────────────────────────────────
// 🔴 2026-08-06 實測（灶神那篇）換來的規則。初版只要求「含造型詞且 ≤40 字」，跑出來是：
//      「」灶神的造形雖然始終以人格神為主，似乎是男身但貌似女子」  ← 開頭一個沒配對的 」
//      「《莊子》：「竈有髻」成玄英作疏：「灶神，其狀如美女，著赤衣，名髻也」 ← 引文被切斷
//    那種東西擺在「腳踏龜蛇」「黑臉」旁邊就是垃圾。所以規則改成**寧可零筆**：
//      · 上限壓到 16 全形字（既有值最長的一筆是 27 字，但那是逐尊查證寫的，不是機器切的）
//      · 出現書名號／引號／冒號／逗號一律排除——那代表它是引文或敘述，不是屬性短語
//      · 括號必須成對
//    切不出乾淨短語的，敘述會走下面的 `excerpt`（逐字引文），那才是它該去的地方。
const ICON_WORDS = [
  '面', '臉', '鬚', '髯', '冠', '帽', '巾', '袍', '甲',
  '手持', '手執', '執', '持', '捧', '佩',
  '腳踏', '足踏', '踩', '坐騎', '騎', '乘',
  '身著', '身穿',
];
const ICON_STOP = ['年', '朝', '記載', '文獻', '傳說', '故事', '曰', '云', '參考資料', '關鍵字'];
const ICON_PROSE = /[《》「」『』：；，、（）()？！]/; // 有這些就是敘述／引文，不是短語
const ICON_MAX = 16;

const bracketsBalanced = (s) => {
  const pairs = [['（', '）'], ['(', ')'], ['「', '」'], ['《', '》']];
  return pairs.every(([a, b]) => s.split(a).length === s.split(b).length);
};

/** 條目內文 → verbatim 造型短語（切不出乾淨的就回空陣列，**絕不硬湊**）。 */
function pickIconography(body) {
  const out = [];
  for (const raw of body.split(/[。！？；\n]/)) {
    const s = raw.trim();
    if (!s || [...s].length > ICON_MAX || [...s].length < 3) continue;
    if (ICON_PROSE.test(s)) continue;
    if (!bracketsBalanced(s)) continue;
    if (!ICON_WORDS.some((w) => s.includes(w))) continue;
    if (ICON_STOP.some((w) => s.includes(w))) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

// ── 逐字引文 ────────────────────────────────────────────────────────────────
// 授權條件是「標示資料來源連結」，**沒有要求改寫、也不允許我們改寫**（改寫＝杜撰風險）。
// 所以敘述性內容一律 **verbatim 引用 + 掛源連結**，不摘要、不合併、不補主詞。
// 只取條目開頭連續的中文段落（英譯段與參考書目排除），並在段落邊界截斷——
// ⚠️ **不可在字數上限處硬切**：切一半的句子會產生沒配對的引號，正是上面那個病灶。
// 🔴 2026-08-06 實測踩到的 bug，別改回去：
//    初版寫 `if (used + len > EXCERPT_MAX) break;`——**第一段就超出預算時，迴圈第一輪就 break，
//    回傳空陣列**。而內政部條目的第一段動輒 300–400 字，於是文昌帝君、保生大帝、神農大帝
//    這種大神全部「無合用段落」。灶神那篇剛好 229 字所以測不出來，96 篇跑下去才露餡。
//    正解：**至少取一段**（段落是引用的最小單位，不能切），之後才看預算。
const EXCERPT_TARGET = 260; // 想要的總長；只在「已經有一段」之後才拿來擋
const EXCERPT_HARD_MAX = 700; // 單段超過這個長度就跳過改看下一段——不截斷，寧可不引
const EXCERPT_DROP = /^(首頁|跳到|您的瀏覽器|字體大小|請輸入關鍵字|參考資料|Keywords|關鍵字|臺灣宗教|世界宗教|宗教)/;

function pickExcerpt(body) {
  const out = [];
  let used = 0;
  for (const p of body.split('\n')) {
    const s = p.trim();
    if (!s || EXCERPT_DROP.test(s)) continue;
    const len = [...s].length;
    if (len < 20) continue;
    if (!bracketsBalanced(s)) continue; // 括號不成對＝來源本身就被截斷過，不引
    if (len > EXCERPT_HARD_MAX) continue; // 單段太長，換下一段（不截斷）
    if (out.length > 0 && used + len > EXCERPT_TARGET) break; // 已有內容才受預算限制
    out.push(s);
    used += len;
    if (used >= EXCERPT_TARGET) break;
  }
  return out;
}

/** 一個條目頁 → 結構化欄位（照抄，不解讀）。 */
function parseEntry(file, html) {
  const cid = file.match(/cid-(\d+)\.html$/)?.[1] ?? null;
  const rawTitle = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
  // title 形如「首頁 > 宗教知識+ > 宗教神祇 > 灶神 (Zao shen)」
  const titleTail = unescapeHtml(rawTitle).split('>').pop().trim();
  const name = titleTail.replace(/\s*[(（][^)）]*[)）]\s*$/, '').trim();

  // 照片：條目頁的 CKUpload 圖。
  // 🔴 圖說（含著作人署名）在 **img 之後**（`<img/><br/><span>…（楊仁澂攝）</span>`），
  //    不是之前。2026-08-07 實測 96 個有圖條目：署名在圖後 83 筆、在圖前 0 筆——
  //    原本只掃 img 前 600 字，所以 photographer 全空，19 張抓回來的圖會被
  //    import-photos.mjs 的「無署名不採用」全數擋掉（安靜略過、不報錯）。
  let photo = null;
  const img = html.match(/<img[^>]*src="([^"]*(?:FileStore|CKUpload)[^"]*)"[^>]*>/);
  if (img) {
    const alt = unescapeHtml(img[0].match(/alt="([^"]*)"/)?.[1] ?? '').trim();
    const after = unescapeHtml(stripTags(html.slice(img.index + img[0].length, img.index + img[0].length + 600)))
      .replace(/\s+/g, ' ').trim();
    // 圖說＝圖後第一段以「（○○攝）」或「（○○繪製）」收尾的文字。
    // 🔴 只收「攝／繪製」＝著作人本人的署名。「（○○提供）」是提供者不是著作人，
    //    問不出誰拍的就不算有署名，寧可不採用（見本檔頭與 import-photos.mjs 的紅線）。
    const cap = after.match(/^([^|]{4,80}?（[^）]{2,24}(?:攝|繪製)）)/);
    const caption = cap ? cap[1].trim() : '';
    const m = caption.match(/（([^）]{2,24})(攝|繪製)）$/);
    // 複合圖說：「（禪機山仙佛寺提供／曾文豐攝）」＝提供者／著作人並列。
    // 著作人是分隔符**後面**那個，整串拿去當姓名會把提供者也算進姓名表示。
    const photographer = m ? m[1].split(/[／\/、,，_]/).pop().trim() : '';
    const credit_role = m ? m[2] : '';
    photo = { src: img[1], alt, caption, photographer, credit_role };
  }

  // 內文：去掉 script/style 與導覽，取夠長的段落；英譯段（開頭是 ASCII）排除。
  const text = unescapeHtml(stripTags(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')));
  const body = text
    .split('\n')
    .map((x) => x.trim())
    .filter((x) => x.length > 30 && !/^[\x00-\x7f]/.test(x))
    .join('\n');

  return { cid, name, photo, body, url: `https://religion.moi.gov.tw/Knowledge/Content?ci=2&cid=${cid}` };
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^cid-\d+\.html$/.test(f)) : [];
if (!files.length) {
  console.log('尚未收到任何條目頁。');
  console.log(`  預期落點：${DIR}/cid-<N>.html`);
  console.log('  由 manifest 的 knowledge-deity-entries（url_list 型）抓取，台灣端每日 04:17 台北自動跑。');
  console.log('  跑 `node scripts/intake-status.mjs` 看進度。');
  process.exit(0);
}

const deities = JSON.parse(readFileSync(DEITIES, 'utf8'));
// 對映：條目名稱 → 神明節點。用「名稱或別稱完全相同」，**不做模糊比對**。
const byName = new Map();
for (const d of deities) {
  byName.set(norm(d.name), d);
  for (const a of d.aliases ?? []) if (!byName.has(norm(a))) byName.set(norm(a), d);
}

const stat = { parsed: 0, matched: 0, unmatched: [], iconAdded: 0, iconSkipped: 0, iconEmpty: 0,
  excerptAdded: 0, excerptSkipped: 0, excerptEmpty: 0, photoCand: 0 };
const photoList = [];

for (const f of files.sort()) {
  const e = parseEntry(f, readFileSync(`${DIR}/${f}`, 'utf8'));
  stat.parsed++;
  const d = byName.get(norm(e.name));
  if (!d) {
    stat.unmatched.push(`${e.cid} ${e.name}`);
    if (VERBOSE) console.log(`  cid-${e.cid} ${e.name}\n      → 站上無此神明節點，略過（不新增節點）`);
    continue;
  }
  stat.matched++;

  const picked = pickIconography(e.body);
  if ((d.iconography ?? []).length > 0) {
    stat.iconSkipped++;
    if (VERBOSE) console.log(`  cid-${e.cid} ${e.name} → ${d.id}：已有 iconography，不覆寫`);
  } else if (picked.length === 0) {
    stat.iconEmpty++;
    if (VERBOSE) console.log(`  cid-${e.cid} ${e.name} → ${d.id}：切不出乾淨造型短語 → 留空（敘述改走 excerpt）`);
  } else {
    d.iconography = picked;
    stat.iconAdded++;
    if (VERBOSE) console.log(`  cid-${e.cid} ${e.name} → ${d.id}：iconography +${picked.length} ${JSON.stringify(picked)}`);
  }

  // 逐字引文：不覆寫既有（可重複執行）。
  const excerpt = pickExcerpt(e.body);
  if (!d.moi_knowledge && excerpt.length) {
    d.moi_knowledge = { url: e.url, title: e.name, excerpt };
    stat.excerptAdded++;
    if (VERBOSE) console.log(`      excerpt +${excerpt.length} 段（${excerpt.reduce((n, s) => n + [...s].length, 0)} 字）`);
  } else if (d.moi_knowledge) {
    stat.excerptSkipped++;
  } else {
    stat.excerptEmpty++;
    if (VERBOSE) console.log(`      excerpt：無合用段落 → 留空`);
  }

  // 掛源：授權條件就是「標示資料來源連結」，故 ref 直接放那個公開網址。
  if (picked.length || excerpt.length) {
    // ref 內含每尊各異的 cid → 用 dedupeBy 只比那段（見 lib/dataset-commit.mjs 檔頭 ⑤）。
    attachSource(d, {
      ref: `內政部全國宗教資訊網·宗教知識+·${e.name} ${e.url}`,
      note: '造型・法器與條目引文（逐字擷取，未改寫）；2026-08-06 經內政部同意使用，條件為標示資料來源連結',
    }, { dedupeBy: `cid=${e.cid}` });
  }

  // 照片：只在該尊「還沒有圖」時列為候選。已有 Commons 圖者不動。
  if (e.photo?.src && !(d.image && d.image.src)) {
    stat.photoCand++;
    photoList.push({
      deity_id: d.id, cid: e.cid, name: e.name,
      src: e.photo.src, alt: e.photo.alt,
      caption: e.photo.caption, photographer: e.photo.photographer,
      credit_role: e.photo.credit_role,
      page: e.url,
    });
  }
}

// --json：給 scripts/intake-status.mjs 的「待匯入」段消費（契約見 import-temple-history.mjs）。
if (flags.json) {
  console.log(JSON.stringify({
    read: stat.parsed,
    pending: { iconography: stat.iconAdded, moi_knowledge: stat.excerptAdded, 照片候選: stat.photoCand },
  }));
  process.exit(0);
}
console.log(`\n宗教知識+ 條目：解析 ${stat.parsed} 篇`);
console.log(`  對映到站上神明　　${stat.matched}｜站上無節點 ${stat.unmatched.length}`);
console.log(`  iconography 新增　${stat.iconAdded}｜已有不覆寫 ${stat.iconSkipped}｜切不出短語留空 ${stat.iconEmpty}`);
console.log(`  條目引文 新增　　${stat.excerptAdded}｜已有不覆寫 ${stat.excerptSkipped}｜無合用段落 ${stat.excerptEmpty}`);
console.log(`  照片候選（該尊尚無圖）${stat.photoCand}`);
if (stat.unmatched.length && VERBOSE) console.log(`  站上無節點者：${stat.unmatched.join('、')}`);

if (PHOTOS) {
  // sidecar：縮排 1（沿用現況，見 lib/dataset-commit.mjs 檔頭 ④）；
  // 它是**會自己排空的工作佇列**，逐筆差異量沒有意義故不印（reportDiff: false）。
  commitDataset({
    path: PHOTO_CANDIDATES,
    data: photoList,
    write: true, // 這份與 --write 無關，給了 --photos 就產
    indent: 1,
    reportDiff: false,
    doneNote: `  ✓ 照片候選已寫入 ${PHOTO_CANDIDATES}（${photoList.length} 筆）`,
  });
}

commitDataset({
  path: DEITIES,
  data: deities,
  write: WRITE,
  dryNote: '\n（乾跑，未寫檔。加 --write 才寫回 deities.json；--photos 另寫照片候選清單。）',
  doneNote: `\n✓ 已寫回 ${DEITIES}`,
});
if (!WRITE) process.exit(0);
