// 原不變量 12（2026-08-08 加）：生肖頁「太歲殿」區塊的**措辭界線**。
//
// 🔴 這條守的是一句話，而那句話是整段的存在前提：
//    資料說的是「這間廟登記資料裡提到太歲殿／太歲星君」，
//    **不是**「這間廟提供安太歲服務」。少了那句 caveat，整段就變成替廟方宣稱他們有在辦。
//    原訂計畫是等參拜流程到齊後抽「安太歲」關鍵字——到齊後實測 0 筆，假設是錯的，
//    才退到這個較弱但有源的事實（見 src/lib/zodiac.ts 的 taisuiShrineTemples 檔頭）。
// ⚠️ 同時雙向驗名單：該出現的廟都在、不該出現的（已列在「祭典登記有安太歲」那批的）不重複。
// ⚠️ 篩選規則與 src/lib/zodiac.ts 的 taisuiShrineTemples／antaisuiTemples 是**同一套**，
//    但這裡沒有 import 它——2026-08-19 實測：`src/lib/zodiac.ts` 用的是 Astro 風格的
//    無副檔名 import（`./almanac/ganzhi`），node 的 --experimental-strip-types 解析不到，
//    直接 ERR_MODULE_NOT_FOUND。**這是「不能 import」而不是「懶得 import」**，
//    所以正則留在這裡並標明對應位置；改任何一邊都要同時改另一邊（src/lib/zodiac.ts:130/143）。
import { escAttr } from '../lib/astro-escape.mjs';
import { num } from '../../src/lib/format.ts';

// 認「太歲殿／太歲星君／太歲君／太歲廳」，**不認單獨的「太歲」**——
// 「犯太歲」「太歲頭上動土」是詞語不是設施，收進來就是假資料。（＝zodiac.ts 的 TAISUI_SHRINE_RE）
const SHRINE_RE = /太歲殿|太歲星君|太歲君|太歲廳/;
// 同時認「安奉太歲」寫法；認 festivals[] 的 name 與 desc 兩欄。（＝zodiac.ts 的 ANTAISUI_RE）
const ANTAISUI_RE = /安太歲|安奉[^，。、]{0,6}太歲/;

const CAVEAT = '不代表該廟目前有提供安太歲服務';
const BLOCK_MARK = '登記資料提到太歲殿或太歲星君的宮廟';

export const zodiacTaisuiShrine = {
  id: 'zodiac/taisui-shrine',
  legacyIds: ['12'],
  title: '生肖頁太歲殿名單必附措辭界線那句，且名單雙向相符、不與祭典那批重複',
  source: 'zodiac',
  initAcc(acc, ctx) {
    {
      const shrineIds = ctx.data.temples
        .filter((t) => SHRINE_RE.test(`${t.history ?? ''}${t.architecture ?? ''}${t.worship_flow ?? ''}${t.intro ?? ''}`))
        .map((t) => t.id);
      acc.state.festIds = new Set(
        ctx.data.temples.filter((t) => (t.festivals ?? []).some(
          (f) => ANTAISUI_RE.test(String(f?.name ?? '')) || ANTAISUI_RE.test(String(f?.desc ?? '')),
        )).map((t) => t.id),
      );
      acc.state.want = shrineIds.filter((id) => !acc.state.festIds.has(id));
    }
  },
  check(dir, page, ctx, acc) {
    const { festIds, want } = acc.state;
    if (!page.html.includes(BLOCK_MARK)) return;
    acc.count('pages');
    if (!page.html.includes(CAVEAT)) {
      acc.violate(`生肖頁 ${dir} 有太歲殿名單卻缺措辭界線那句「${CAVEAT}」（等於替廟方宣稱有在辦）`);
    }
    // 雙向：該在的都在
    const missing = want.filter((id) => !page.html.includes(escAttr(`/temples/${id}/`)));
    if (missing.length) {
      acc.violate(`生肖頁 ${dir} 太歲殿名單少了 ${missing.length} 間（如 ${missing[0]}）`);
    }
    // 不該在的：已列在「祭典登記有安太歲」那批的不得在本段重複出現
    const shrineBlock = page.html.slice(page.html.indexOf(BLOCK_MARK));
    const dup = [...festIds].filter((id) => shrineBlock.includes(escAttr(`/temples/${id}/`)));
    if (dup.length) {
      acc.violate(`生肖頁 ${dir} 太歲殿名單重複列出了已在「祭典登記有安太歲」那批的 ${dup.length} 間`);
    }
    if (!new RegExp(`另有\\s*${num(want.length)}\\s*間宮廟`).test(page.html)) {
      acc.violate(`生肖頁 ${dir} 太歲殿間數敘述與資料不符（資料 ${want.length} 間）`);
    }
  },
  summary: (acc) =>
    `另 ${acc.get('pages')} 個生肖頁的太歲殿名單（各 ${acc.state.want.length} 間）**措辭界線那句在**、`
    + `名單雙向比對相符、且未與「祭典登記有安太歲」那批重複`,
};
