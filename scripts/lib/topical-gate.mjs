// 時事祈福 · 正向議題閘＋莊重中文框架（P1 orchestrate 與 P2 news-scan 的唯一入口）。
//
// ⚠️ 這支的輸出直接變成**上線祈福頁的標題與祈福語**，是全管線後果最重的一段。
// 判定門檻與紅線見 docs/topical-blessing.md §0（紅線）、§3.7（颱風名）、§3.8（沒有災害就不用祈福）。
//
// ── 為什麼在 2026-08-19 抽成一份 ────────────────────────────────────────────
// 原本 orchestrate.mjs:162 與 news-scan.mjs:162 各有一份 `gateAndFrame`，附註解說「複製自
// orchestrate.mjs 精神」，理由是「orchestrate.mjs 在 import 時即執行 top-level 偵測/寫檔流程」。
// 那是 seam 缺失造成的複製，不是設計；seam 已修（三支都改成 main() ＋ 被直接執行才跑）。
//
// 複製的代價已經發生——兩份 prompt 漂移了，且**漂移的方向對兩邊都有害**：
//   ・orchestrate 版有 GDACS 推估值警語（2026-07-27 野火事故的修正）、行政區改名規則、
//     「絕不自創或套大陸譯名」、2026-07-27 杜撰案例——news-scan 版全部沒有；
//   ・news-scan 版才有「從中文新聞抽颱風名」的那條路——orchestrate 版只查 GDACS 的國際命名，
//     直接拿去用會讓 P2 的颱風頁**再也寫不出「紅霞」**（實測：同一則新聞候選，
//     orchestrate 版產出的標籤退回「熱帶氣旋」、名字段整段消失）。
// 故合併規則是：**規則文字一律以 orchestrate 版為準**（它是實際發佈那條路徑，且帶著後補的修正），
// 但**取名字的來源改成三段 fallback**（兩邊各自的來源都留著，互為補位），
// 且 nameLine 的「國際命名 X」只在真的有國際命名時才寫（否則 P2 會印出「國際命名 undefined」）。
//
// 唯一一處**不取** orchestrate 版的措辭：「名字只准照抄上面那三個字」→ 改用 news-scan 版的
// 「那幾個字」。理由是 CWA 正式名單的中文名有 2 字也有 3 字（紅霞／杜蘇芮，見 docs §3.5），
// 寫死「三個字」與事實矛盾，會誘導 LLM 把 2 字名字湊成 3 字。
//
// 兩支呼叫端的差異全部收斂成三個「呼叫端身分」參數（logTag／cadenceNote／srcFallback），
// **不是規則**——規則只有一份。新增偵測產線時照樣傳這三個就好。
import { spawnSync } from 'node:child_process';
import { findMainlandTerms, replaceMainlandTerms } from './topical-guard.mjs';
import { typhoonZhName, officialCycloneName, eventText } from './topical-dedup.mjs';
import { typeLabel, zh } from './topical-text.mjs';

/**
 * 解析候選的颱風中文名（只查 CWA 對照表／正式名單，**永遠不讓 LLM 音譯**——紅線：絕不杜撰）。
 * 三段 fallback 依權威性排序，涵蓋兩條產線各自拿得到的線索：
 *   1. 條目已存的中文名（P1 偵測時就查好了）；
 *   2. 國際命名 → CWA 對照表（GDACS 只給得出這個）；
 *   3. 事件文字裡的正式中文名（新聞只給得出這個，且要求恰好命中一個）。
 * 非氣旋事件一律 null。
 */
export function resolveCycloneZhName(c) {
  if (c?.eventType !== 'cyclone' && !c?.cycloneNameZh && !c?.cycloneName) return null;
  return c.cycloneNameZh
    || typhoonZhName(c.cycloneName)
    || (c.eventType === 'cyclone' ? officialCycloneName(eventText(c)) : null);
}

/**
 * 正向議題閘＋莊重中文框架（型別無關）。失敗一律保守 block。
 *
 * @param {object} c 統一候選：{ eventType, place, time, sources[], summary?, mag?, severity?,
 *                              cycloneName?, cycloneNameZh?, adminRegion?, adminCountry? }
 * @param {object} opt 呼叫端身分（**不是規則**）
 * @param {string} opt.logTag      console.error 前綴，如 '[topical]'／'[news-scan]'
 * @param {string} opt.cadenceNote 「下一輪會再掃到」那句的節奏，如 'P1 每 20 分跑一次'
 * @param {string} opt.srcFallback sources[0].ref 缺漏時的來源代稱
 * @returns {{ verdict: 'pass'|'block', title?: string, event?: string, reason?: string }}
 */
export function gateAndFrame(c, { logTag = '[topical]', cadenceNote = 'P1 每 20 分跑一次', srcFallback = '來源' } = {}) {
  // 颱風有名字時，標籤改用台灣慣稱「颱風」而非學術詞「熱帶氣旋」。
  // 查無中文名（大西洋颶風等）則維持 TYPE_LABEL，標題退回無名寫法——絕不讓 LLM 自創音譯。
  const zhName = resolveCycloneZhName(c);
  const label = zhName ? '颱風' : typeLabel(c.eventType);
  const src = c.sources?.[0]?.ref || srcFallback;
  const fact = c.mag != null ? `規模 ${c.mag}` : (c.severity || '');
  // 名字必須明白餵進 prompt：GDACS 摘要裡只有英文代號（NOUL-26），LLM 依「不得自創譯名」的規矩
  // 只能略去不寫 → 標題長成「為中國熱帶氣旋平安祈福」這種沒有主角的樣子（2026-07-23 紅霞實例）。
  // 出處說法依名字哪來而變：有國際命名就報它（P1／GDACS），沒有就只說是 CWA 正式譯名（P2／新聞）。
  const nameOrigin = c.cycloneName
    ? `國際命名 ${c.cycloneName}，中文名出自中央氣象署對照表`
    : '中央氣象署正式中文譯名';
  const nameLine = zhName ? `\n${label}名稱：「${zhName}」（${nameOrigin}，直接照抄勿改）` : '';
  // ⚠️ 2026-08-19 用戶裁示：措辭用「那三個字」（orchestrate 的原始寫法）。
  //    保留紀錄：CWA 正式中文譯名並非一律三字（docs/topical-blessing.md §3.5 明載
  //    「紅霞」＝2 字、「杜蘇芮」＝3 字），所以遇到 2 字名時這句與事實不符，
  //    LLM 可能因此改寫或補字。要改回不預設字數的寫法，把「三個字」換成「幾個字」即可，
  //    不影響其他任何邏輯。
  const nameRule = zhName
    ? `\n  - **標題必須寫出${label}名「${zhName}」**：形如「為${label}${zhName}祈福」或「為○○${label}${zhName}平安祈福」（○○＝受影響地區）；event 也要提到名字。名字只准照抄上面那三個字，不得改寫或自創其他譯名。`
    : '';
  // 地震來源的 place 是「距震央最近的城市」，常是無辨識度的小鎮（熊本 7.1 → Uki 宇城市）。
  // 反查到的上級行政區一併提供，讓標題選台灣人真的會用的地名。
  const regionLine = c.adminRegion
    ? `\n所在行政區（由座標反查 OpenStreetMap，非自創）：「${c.adminCountry ?? ''}${c.adminRegion}」`
    : '';
  const PROMPT = `你是台灣民俗祈福站的守門與編輯。以下是來自「${src}」的災難事實：
類型：${label}
地點：「${c.place}」${regionLine}
日期：${c.time}${nameLine}${fact ? `\n嚴重度：${fact}` : ''}${c.summary ? `\n事件摘要：${c.summary}` : ''}
任務(1) 相關性＋正向議題判定，pass 需同時滿足：
  a. 值得集體祈福——事件發生在有人居住/會受影響之地、有集體關切必要（**全球皆可，台灣人也會為國際重大災難如日本地震、中國山崩祈福**）；若在**無人或極少人受影響之處、無集體關切必要**，判 block（不必為每個事件都開頁）。
  b. 正向框——做「為平安／復原祈福」（集體平安、非政治、非爭議對立、非消費痛苦、非對災難算吉凶）。
  c. **災害已經實際發生在人身上，不是只發生在地圖上**——**沒有災害就不用祈福**。兩類分開看：
     ・地震、山崩、橋樑坍塌、氣爆、建物火災這種「發生即是災害」者：事件本身就直接作用在人與房舍上，天然符合本條。
     ・颱風、洪水、**森林野火**這種「先發生在自然環境、之後才知道有沒有傷到人」者：必須有
       **人員傷亡／住宅或村落被燒毀淹沒／居民撤離安置／聚落交通中斷**等**已經發生的事實**才算；
       若只有路徑預測、警報發布、防災整備，或「燒了多少林地、淹了多少面積」而未提到人，判 block，
       等真的傷到人了再開（${cadenceNote}，下一輪會再掃到，不會漏）。
     ⚠️ **GDACS 的數字全是推估，一律不得當成災情**：
       ・「Population affected by … wind speeds」＝模式推算「可能會被吹到的人有多少」；
       ・「forestfire in N ha」＝燒掉多少公頃**林地**（山林燒起來是常態，不等於有人受災）；
       ・「N people affected in the area」＝該**區域裡住了多少人**，不是受災人數。
       摘要只有這幾種數字、沒有一句寫到人或房舍實際受害時，判 **block**。
  任一不符即 block。
任務(2) 若 pass，產生莊重的**台灣繁體中文**：title 形如「為○○${label}平安祈福」或「為○○祈福」，event 為一到兩句。硬性要求：${nameRule}
  - **台灣慣用語＋全形標點**（，。、；「」），**禁半形逗號句號、禁大陸用語**。
  - **地名以上述來源「${c.place}」為準**：有通用台灣譯名才用（如「土耳其」「日本能登」），**沒有就保留原名或用保守描述（如「墨西哥外海」）——絕不自創或套大陸譯名**；若來源本為中文地名（如「重慶市彭水縣」）則**直接沿用原漢字、不另譯不改**。數字一律照來源，勿改。${
    c.adminRegion
      ? `\n  - ⚠️ **本則有「所在行政區」可用**：地震來源的地點是「距震央最近的城市」，常是台灣人沒聽過的小鎮。
    若「${c.place}」的城市名不具辨識度，**改用上面那個行政區名**（2026-07-30 實例：USGS 給「4 km SE of Uki, Japan」＝宇城市，
    但台灣人搜的、新聞寫的都是「熊本」；標題寫成「宇城地震」等於沒人找得到）。兩者皆為查得之事實，擇辨識度高者，仍不得自創。`
      : ''
  }
  - **event 只能寫上面事實真的說了的事**：來源沒提到的影響（「波及當地居民」「居民生活受到影響」這類）
    **不得自行推導補上**——2026-07-27 四則野火頁就是這樣把「燒了 N 公頃林地」腦補成「波及居民」（違反絕不杜撰）。
    來源沒說影響到人，就只寫「發生森林野火，延燒林地」加祝願，不要替它加戲。
  - 只依上述事實，不誇大。**event 不要寫出任何具體傷亡／失聯／疏散人數或金額**（這些數字未經機器複驗、且常隨救援變動；具體數字留給有逐筆掛源的後續發展時間軸）。event 只做莊重的事件描述＋祈福祝願，可用「造成傷亡」「多人失聯」等不帶數字的概述。
只輸出單行 JSON：{"verdict":"pass"|"block","title":"…","event":"…"}。`;
  const r = spawnSync('claude', ['-p', PROMPT, '--model', 'claude-sonnet-5'],
    { encoding: 'utf8', timeout: 120000, env: { ...process.env, IS_SANDBOX: '1' } });
  if (r.status !== 0 || !r.stdout) return { verdict: 'block', reason: 'claude 執行失敗' };
  const m = r.stdout.match(/\{[\s\S]*\}/);
  if (!m) return { verdict: 'block', reason: '無 JSON 輸出' };
  try {
    const g = JSON.parse(m[0]);
    // 大陸用語機械替換（見 lib/topical-guard.mjs）：prompt 的「禁大陸用語」是軟約束，這裡才是強制層。
    const tw = (s) => {
      const hits = findMainlandTerms(s);
      if (!hits.length) return s;
      console.error(`${logTag} ⚑ 陸用語替換：${hits.map((h) => `${h.term}→${h.tw}`).join('、')}`);
      return replaceMainlandTerms(s);
    };
    // 全形標點保底（lib/topical-text.mjs zh）先跑，再過陸用語替換——順序與兩支原實作一致。
    g.title = tw(zh(g.title)); g.event = tw(zh(g.event));
    return g;
  } catch { return { verdict: 'block', reason: 'JSON 解析失敗' }; }
}
