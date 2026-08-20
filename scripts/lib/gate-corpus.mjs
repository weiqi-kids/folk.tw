// gate 的「我到底掃了什麼」輸出契約。
//
// 🔴 為什麼要有這支（2026-08-20 建）：本 repo 已經明確認識到
//    **「gate 靜默失效比沒有 gate 更糟」**——`scripts/check-copy-voice.mjs:165-167` 的註解
//    逐字寫著「加了白名單卻什麼都沒掃，比沒加更糟（誤以為有守）」。
//    而且已經做出過機械防線：`scripts/lib/invariant-runner.mjs:288-300` 對
//    「宣告要驗的 section 命中率為 0」直接判違規，還 unshift 排到報告最前面。
//
//    問題是那道防線**只做在一個模組裡**。invariants 家族外的 28 支 check-*.mjs
//    仍然是：白名單檔不存在就 `continue`、JSON 壞掉就 `continue`、
//    成功訊息印一個「掃了 N 個」給人看但**沒有下限斷言**。
//    檔案改名 → 少掃一整檔 → 印綠字通過。
//
//    這支把那個防線變成跨家族可用的 interface：呼叫者宣告「我要掃這個語料、預期至少 N 筆」，
//    掃到 0（或少於下限）就是違規，不是備註。
//
// 用法：
//    import { newCorpus } from './lib/gate-corpus.mjs';
//    const corpus = newCorpus('check:copy-voice');
//    corpus.track('astro 檔', files.length);
//    corpus.track('prose-json 欄位', scanned, { min: 1, why: 'PROSE_JSON 白名單的檔案改名會讓它掃到 0' });
//    corpus.missing('prose-json 檔案', file, '白名單指到不存在的檔');
//    const problems = corpus.problems();   // string[]，空陣列＝語料涵蓋沒問題
//    console.log(corpus.summary());        // 給成功訊息用，逐項列出掃了幾筆

/**
 * @param {string} gateId 這道 gate 的 id（用於錯誤訊息）
 */
export function newCorpus(gateId) {
  /** @type {{name:string,count:number,min:number,why:string}[]} */
  const tracked = [];
  /** @type {string[]} */
  const missing = [];

  return {
    /**
     * 宣告掃過一個語料。
     * @param {string} name 語料名稱（人看的）
     * @param {number} count 實際掃到幾筆
     * @param {{min?:number, why?:string}} [opt] min 預設 1——**宣告要掃就不該掃到 0**
     */
    track(name, count, opt = {}) {
      tracked.push({ name, count, min: opt.min ?? 1, why: opt.why ?? '' });
    },

    /**
     * 宣告一個「本來該存在卻不存在」的輸入。
     * 🔴 這取代 `if (!existsSync(f)) continue;`——那行會讓 gate 少掃一整檔還印綠字。
     */
    missing(kind, path, why = '') {
      missing.push(`${kind}「${path}」不存在${why ? `：${why}` : ''}`);
    },

    /** @returns {string[]} 語料涵蓋的違規清單（空＝沒問題） */
    problems() {
      const out = [];
      for (const m of missing) {
        out.push(`${gateId} 的輸入缺漏：${m}。gate 少掃一份輸入卻通過，比沒有這道 gate 更糟——`
          + '請修正路徑，或把它從白名單移除（移除是明示的決定，跳過不是）。');
      }
      for (const t of tracked) {
        if (t.count >= t.min) continue;
        out.push(`${gateId} 宣告要掃「${t.name}」卻只掃到 ${t.count} 筆（下限 ${t.min}）`
          + `${t.why ? `。${t.why}` : ''}。掃到 0 代表這道 gate 對該語料實際上是關閉的。`);
      }
      return out;
    },

    /** @returns {string} 成功訊息用的語料摘要 */
    summary() {
      return tracked.map((t) => `${t.name} ${t.count}`).join('、');
    },
  };
}
