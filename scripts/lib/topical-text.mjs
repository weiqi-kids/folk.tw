// 時事祈福 · 文字層共用詞彙與正規化（純函式、無副作用，可被 orchestrate/news-scan/followup 安全 import）。
//
// 抽出的理由：這四樣東西原本在三支腳本裡各有一份，而且**已經漂移過**——
//   `TYPE_LABEL` 在 orchestrate.mjs 與 news-scan.mjs 逐字複製，還附註解請人類自己保持同步；
//   `stripHtml`／`normText` 在 news-scan 與 followup 各一份；`zh`（全形標點保底）三份。
// 複製的根因是「腳本一 import 就會跑起來」，那個 seam 已於 2026-08-19 修掉（三支都改成
//   `main()` ＋ 被直接執行才跑），所以這裡可以只留一份。**新增事件類型只改本檔。**

/**
 * 事件類型 → 中文標籤。
 * 用途有二：(1) 正向閘產文案時的「類型」欄；(2) P2 新聞掃描的合法 eventType 白名單。
 * 🔴 新增類型＝在此登記一列即可，三支腳本自動跟上；別再回頭在腳本裡自己開一份表。
 */
export const TYPE_LABEL = {
  // 天災
  quake: '地震', cyclone: '熱帶氣旋', flood: '水災', volcano: '火山活動', wildfire: '野火',
  landslide: '山崩', storm: '風災',
  // 人為重大意外（2026-08-22 補；在此之前整族缺席，見下方註記）
  'bridge-collapse': '橋樑坍塌', fire: '火災', 'gas-explosion': '氣爆',
  aviation: '航空事故', rail: '鐵路事故', maritime: '海難',
  'building-collapse': '建物倒塌', 'crowd-crush': '踩踏事故', industrial: '工安事故',
  other: '重大事件',
};

// 🔴 2026-08-22 為什麼補「人為重大意外」那一族：
// 2026-08-15 越南航空 VN34 在慕尼黑機尾觸地、返場衝出跑道，P2 掃描 log（seo-ops/logs/
// folk.tw-topical-news.log）8/15–8/20 整段**沒有出現任何航空事故候選**——不是被正向閘擋下，
// 是根本沒進入視野：本表原本只有天災＋火災／氣爆／橋垮，而 news-scan 的偵察 prompt 又照著
// 本表逐一列舉類型，於是空難／鐵路／海難／建物倒塌／踩踏／工安這一整族從來不會被搜。
// ⚠️ 補進來**不代表這些事件就會開頁**：是否值得集體祈福仍由 topical-gate.mjs 的正向閘判定
// （docs/topical-blessing.md §3.8「沒有災害就不用祈福」——VN34 無人罹難，補了類型它照樣該被擋）。
// 這裡修的是「看不見」，不是「該不該開」。
// 🔴 **改本表就要同步改 topical-gate.mjs 的 (c) 條**（2026-08-22 稽核抓到：首版只補了表與
//    偵察 prompt，閘裡那份「哪些事件發生即是災害」的列舉沒跟上，等於新類型可能被 LLM
//    歸進「天然符合」那一類直接放行）。閘裡已把這一族明列為「必須有人員傷亡或失聯」。
// ⚠️ 標籤用台灣媒體的說法：`crowd-crush` 是「踩踏事故」不是「群眾推擠事故」——
//    標籤會逐字進標題模板（「為○○踩踏事故平安祈福」）。

/** 合法 eventType 集合（P2 用來丟棄 LLM 亂回的類型）。 */
export const VALID_EVENT_TYPES = new Set(Object.keys(TYPE_LABEL));

/** 類型標籤查表；未登記的類型退回「重大事件」。 */
export const typeLabel = (eventType) => TYPE_LABEL[eventType] ?? '重大事件';

/** 去掉 script/style/標籤/實體，留下可供關鍵詞比對的純文字（不做正規化，接 normText）。 */
export function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
}

/** 比對用正規化：小寫、去所有空白（含全形）、去中英文標點。 */
export const normText = (s) => String(s || '').toLowerCase()
  .replace(/[\s　]+/g, '').replace(/[，,、。.；;：:「」『』（）()\-—－]/g, '');

/**
 * 全形標點機械保底：緊鄰中文字的半形逗號／分號轉全形。
 * 由來 2026-07-19 墨西哥頁事故——prompt 寫了「禁半形逗號句號」，claude 偶爾仍吐半形。
 * 刻意只碰逗號與分號：英文語境（「Madero, Mexico」）左側是拉丁字母故不動；
 * **不碰句號**，免誤傷「7.3」這種小數。
 */
export const zh = (s) => typeof s === 'string'
  ? s.replace(/([一-鿿])\s*,/g, '$1，').replace(/([一-鿿])\s*;/g, '$1；')
  : s;
