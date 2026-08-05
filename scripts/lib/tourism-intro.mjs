// 觀光署景點介紹（intro／open_time）的採用規則 —— **匯入器與 check:integrity 共用的唯一入口**。
//
// 為什麼要抽成 lib：規則若只寫在匯入器裡，gate 就擋不住「日後有人手改 temples.json 塞一段
// 行銷腔進去」。站上既有慣例同理（temple-festival.ts 被廟宇頁／OG 卡／check:rendered 三處共用）。
// 改規則只改這裡，兩端同時生效。
//
// 資料來源：交通部觀光署「觀光資訊資料庫－景點」（政府資料開放平臺 dataset 7777），
// 授權「政府資料開放授權條款－第1版」（OGDL 1.0）＝可再散布、可商用，**需標示出處**。
// 下載（免金鑰、每日更新）：
//   https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip
//
// 🔴 這批文字是**觀光宣傳文案**，不是廟方沿革。實測 843 筆中 20% 帶行銷腔
// （「充滿美感的宗教、藝術之旅！」這種），而站上 check:copy-voice／check:content
// 擋的正是這類語氣。故採用前一律過濾，**只收嚴不放寬**（同 check-copy-voice.mjs 的慣例）。

/** 來源標註字串。有 intro／open_time 的廟，sources 必須含這個 ref（check:integrity 硬驗）。 */
export const TOURISM_SOURCE = '交通部觀光署觀光資訊資料庫・景點';

/**
 * 觀光行銷／旅遊指南腔詞表。命中任一即整筆不採用。
 * 收錄標準：**該詞在客觀敘述宮廟沿革時不會用到**，一出現就代表這段是寫給遊客的推薦文案
 * 或交通指南。踩到新的往這裡加一列，不要放寬。
 *
 * 🔴 **刻意只擋語氣，不用正向白名單猜內容**（2026-08-05 實測換來的）：
 * 初版另加了一道「必須含創建／奉祀／年代等字」的正向要求，結果 11 筆被剔的裡面約 8 筆是誤殺——
 * 廣濟宮（「村民乃奉迎褒忠義民爺，設廟祈求平安」）、內門紫竹寺（「因觀音佛祖『飛爐』顯靈…
 * 由庄民共同建寺」）、清濟宮（直接引碑記原文）都是紮實沿革，只因用詞不在表內就被丟掉。
 * 那種表永遠補不完。實測顯示觀光署對宮廟的描述幾乎都帶宮廟資訊，真正的問題只有語氣。
 *
 * ⚠️ 刻意**不收**「人潮／景點／周邊／搭乘」等詞：它們會出現在事實敘述裡
 * （外武廟「廣場上擠滿看戲人潮」是廟會實況，不是推薦）。收了就會誤殺。
 */
export const MARKETING_TELLS = [
  // 行銷腔
  '之旅', '必訪', '必去', '必遊', '走訪', '不妨', '來到', '讓人', '令人',
  '美不勝收', '值得', '風光', '景緻', '絕美', '熱門景點', '打卡',
  '悠遊', '體驗', '驚豔', '嘆為觀止', '別具', '洗滌', '心靈',
  '好去處', '口耳相傳', '奇蹟', '適合來', '適合前往', '推薦',
  // 旅遊指南腔（2026-08-05 加：昭應宮／三清宮整段只講交通與停車，沒有廟的資訊）
  '交通便利', '交通便捷', '交通方便', '遊客', '觀光客', '旅人', '旅遊',
  '停車場', '伴手禮', '美食', '遊憩', '自駕', '車程',
];

/**
 * 內容雜訊：來源自帶的圖片出處註記、裸網址、以及基隆那批的結構化標記殘留
 * （`-景點簡介-`／`-景點特色-`／tab）。標記在段落中間，機械去除會把兩段接在一起，
 * 故整筆不採用——實測只有 1 筆會因此損失，不值得為單一案例造清洗機制。
 */
const NOISE = ['照片來源', 'http', '-景點簡介-', '-景點特色-', '\t'];

/** 太短的沒有資訊量（實測 <40 字者多半只有一句「主祀○○」）。 */
export const MIN_LEN = 40;

/**
 * 判斷一段觀光署 Description 能不能採用。
 * @returns {{ ok: true, text: string } | { ok: false, why: string }}
 */
export function acceptIntro(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, why: '空白' };
  if (text.length < MIN_LEN) return { ok: false, why: '太短' };
  const mk = MARKETING_TELLS.find((k) => text.includes(k));
  if (mk) return { ok: false, why: `行銷腔（${mk}）` };
  const nz = NOISE.find((k) => text.includes(k));
  if (nz) return { ok: false, why: `含雜訊（${nz}）` };
  return { ok: true, text };
}

/** 名稱結尾是廟宇字才算宮廟實體——用「含」會把「蓮花寺步道」這種步道也收進來（實測 843→678）。 */
export const TEMPLE_NAME_END = /(宮|寺|廟|壇|祠|殿|巖|巌|岩|庵|府|堂)$/;

/** 臺→台等正規化，與 src/lib/temple-region.ts 的慣例一致。 */
export const tw = (s) => String(s ?? '').replace(/臺/g, '台');

/** 廟名核心（去法人前綴與空白括號），用於縣市內唯一比對。 */
export const coreName = (s) =>
  tw(s).replace(/財團法人|社團法人|台灣省/g, '').replace(/[\s()（）]/g, '');

/** 地址正規化：去空白、樓層、「之N」，全形數字轉半形。地址比廟名可靠，優先用。 */
export const normAddr = (s) =>
  tw(s)
    .replace(/[\s　]/g, '')
    .replace(/[0-9０-９]+樓/g, '')
    .replace(/之[0-9０-９]+/g, '')
    .replace(/台灣/g, '')
    .replace(/[０-９]/g, (c) => String('０１２３４５６７８９'.indexOf(c)));
