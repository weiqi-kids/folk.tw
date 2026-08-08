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
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const INBOX = '/root/.config/folk-tw/intake/inbox';
const ARCHIVE = '/root/.config/folk-tw/intake/archive';
const BRIEF = process.argv.includes('--brief');

const j = (p) => JSON.parse(readFileSync(p, 'utf8'));
const hours = (t) => (t ? Math.floor((Date.now() - new Date(t).getTime()) / 3600000) : null);
const days = (t) => { const h = hours(t); return h == null ? null : Math.floor(h / 24); };
const fileAge = (p) => (existsSync(p) ? days(statSync(p).mtime) : null);
const size = (p) => (existsSync(p) ? statSync(p).size : 0);
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
/** 空陣列／空字串／null 一律算「沒有」。見下方 iconography 的註解。 */
const nonEmpty = (v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== '');
// 🔴 只數主檔，不數側檔。台灣端每個檔都附 `<主檔>.sha256` 與 `<主檔>.meta.json`，
// 而 `f.endsWith('.json')` 會把 `12345-2.json.meta.json` 也算進去 → **筆數剛好變兩倍**。
// 2026-08-06 實測：yange 收了 1,362 項卻報「已收 2724」。狀態報告寧可少報也不能虛報。
const MAIN_JSON = /^\d+-\d+\.json$/;
/** 不足一天就報小時——「今天」會讓昨晚 20:22 的更新在今早看起來像剛剛發生。 */
const agoT = (t) => { const h = hours(t); return h == null ? '—' : h < 24 ? `${h} 小時前` : `${Math.floor(h / 24)} 天前`; };
const ago = (d) => (d == null ? '—' : d === 0 ? '不到 1 天' : `${d} 天前`);

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
    how: '站上所有廟頁的底層（名稱/地址/主祀神/教別）＋座標回填＋每日五間外撥名單（電話與負責人僅存 repo 外）',
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
    stage: 'recon', id: 'knowledge-zaoshen',
    verdict:
      '**灶神 iconography 這條結案了，結論是「來源裡沒有」**（2026-08-06，96 篇全跑過）。' +
      '內政部條目寫的是源流敘事，不是造型描述——對得上站上節點的 34 尊裡，' +
      '**一尊都切不出乾淨的造型短語**（規則：≤16 字、無書名號／引號／冒號／逗號、括號成對）。' +
      '⚠️ 那些漂亮的短語（「手持三叉戟」「手持豎琴」）全在**我們沒有節點的 62 篇**裡（希臘羅馬神祇那批）。' +
      '🔴 **不要為了讓數字好看去放寬規則**：放寬到能收「手持權杖」的同時，' +
      '也會收進「後面則能帶來健康」（那個「面」是方位不是臉）。' +
      '改走的是逐字引文 `moi_knowledge`——34 尊全部有，那才是這批語料真正有的東西。',
    upstream: join(INBOX, 'misc/knowledge-zaoshen-cid265.html'),
  },
  {
    stage: 'pending', id: 'knowledge-deities-list',
    goal: '用 96 個神祇條目擴充 iconography',
    blocker:
      '✅ 授權已解（條件＝標示來源連結）。⛔ 等條目全文：列表頁只有**截斷摘要**，' +
      'iconography 的敘述在條目內頁，已用 `knowledge-deity-entries`（第一個 url_list 型 job）逐條抓，' +
      '清單 docs/intake-urls-knowledge.json 由 scripts/gen-intake-urls-knowledge.mjs 產生。',
    metric: () => {
      const dir = join(INBOX, 'knowledge-deities');
      const got = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.html')).length : 0;
      return `全 ${M.deities} 尊中有 iconography 者 ${M.iconography}｜條目已收 ${got}/96`;
    },
    upstream: join(INBOX, 'misc/knowledge-deities-list-cid3.html'),
    covers: ['knowledge-deity-entries'],
    coversDir: ['knowledge-deities'],
  },
  {
    stage: 'pending', id: 'religion-foundation-list',
    goal: '收 UploadFileID（沿革 idx=2／建築特色 idx=3／參拜流程 idx=4 的內容都靠它定位）→ 產 url_list 清單 → 才輪到內容 job',
    blocker:
      '✅ **收齊了**：來源自報共 137 頁，1..137 全部到齊（2026-08-06 台灣端一輪交付）。' +
      '清單 docs/intake-urls-yange.json 已產出並 push，沿革 4,325／參拜流程 828 與台灣端偵察數字完全吻合。' +
      '⚠️ 下一輪還會多抓 1 頁（p200）撞 max_pages 停住，那是護欄失效的殘尾，無害。' +
      '🔴 抓回來的列含電話與負責人＝個資，只留 inbox；產出的清單檔只准有 key 與 url 兩欄。',
    // ⚠️ 只數**有資料**的頁。2026-08-06 因 total_pages_re 沒對上，多抓了 62 頁空結果頁，
    // 而 inbox 是 write-only 刪不掉——照檔案數報會說「已收 199 頁」，但來源只有 137 頁，
    // 讀的人會以為資料變多了。有資料的判準＝頁面含 `main=`（UploadFileID 連結）。
    metric: () => {
      const dir = join(INBOX, 'recon-service/foundation-list');
      if (!existsSync(dir)) return '尚未收到任何頁';
      const all = readdirSync(dir).filter((f) => f.endsWith('.html'));
      const withData = all.filter((f) => readFileSync(join(dir, f), 'utf8').includes('main='));
      const empty = all.length - withData.length;
      return `已收 ${all.length} 頁，其中 ${withData.length} 頁有附件連結` +
        (empty ? `（${empty} 頁是 2026-08-06 護欄失效時多抓的空頁，刪不掉，忽略即可）` : '');
    },
    upstream: join(INBOX, 'recon-service/FOUNDATION-FORM-PAYLOAD.md'),
    coversDir: ['recon-service/foundation-list'],
  },
  {
    stage: 'recon', id: 'religion-jianzhu-sample',
    verdict:
      '建築特色（IndexID=3）抽樣 30 筆的評估**已完成，結論是「收」**（2026-08-06）。' +
      '分布：「略」等敷衍 3 筆／極短無資訊（4–17 字，如「一般建築」「寺廟前景照片」）11 筆／' +
      '**有實質內容（≥20 字）16 筆＝53%**，最長 485 字。全量 3,623 項照此比例約一半可用，' +
      '已開 `religion-jianzhu` 全量 job（排在 yange 之後）。沒用的那半由 isPlaceholder 與 check:integrity 各擋一次。',
    upstream: join(INBOX, 'recon-service/getuploadfile-74678-idx3-jianzhu.json'),
    coversDir: ['religion-jianzhu-sample'],
  },
  {
    stage: 'live', id: 'religion-photos',
    what: '神明代表圖（內政部宗教知識+ 條目照，manifest v14／2026-08-07 開 job）',
    how:
      '神明頁代表圖＋卡片底圖。🔴 **每一張都必須在頁面上印署名**——內政部圖說寫了著作人（如「（楊仁澂攝）」），' +
      '那是著作人格權的姓名表示，不是可選的；渲染走 src/lib/image-credit.ts，check:rendered 驗。' +
      '署名存在候選檔與匯入後的資料，**不寫進清單檔**（清單是抓取設定，寫兩份必漂）。' +
      '⚠️ 只收站上還沒有圖的對象；已有 Commons 授權圖者不覆蓋，那些授權更明確且已在 /about 標示。' +
      '⚠️ 這批是二進位檔，expect_per_item 不可用 contains（文字比對必失敗），用 http_status ＋ min_bytes。' +
      '🔴 **廟宇照片這半邊是死的**：GetUploadFile 的 pic 附件，其 JSON 自報的 `URL` 是 ' +
      '`/ReligionSys/FileStore/<GUID>.<EXT>`，該路徑一族**來源本身 404**（646 B 的 IIS 錯誤頁；' +
      '2026-08-07 台灣端 22:05／22:12 兩次複驗，非暫時性）。那網址不是我們拼的，' +
      '**沒有別的網址可以產**，所以 gen-intake-urls-photos.mjs 直接濾掉這一族——' +
      '沿革／參拜流程／建築特色全量到齊後這族候選會長到數百筆，濾在產生器才擋得住整批。' +
      '之後若確認來源修好，把 DEAD_PATH 那段拿掉即可（候選檔本身完整保留，沒有資料被丟棄）。' +
      '📌 2026-08-07 踩到的坑：圖說在條目頁是 `<img/><br/><span>…（○○攝）</span>`＝**在 img 之後**，' +
      '原本擷取只掃 img 前 600 字 → 署名全空 → 19 張抓回來的圖被「無署名不採用」全數安靜略過。' +
      '實測 96 個有圖條目：署名在圖後 83 筆、在圖前 0 筆。',
    metric: () => {
      const dir = join(INBOX, 'photos');
      const got = existsSync(dir) ? readdirSync(dir).filter((f) => !/\.(sha256|meta\.json)$/.test(f)).length : 0;
      const want = existsSync('docs/intake-urls-photos.json') ? j('docs/intake-urls-photos.json').length : 0;
      const onsite = existsSync('src/data/deities.json')
        ? j('src/data/deities.json').filter((d) => /^\/moi\//.test(d.image?.src ?? '')).length : 0;
      return `已收 ${got}/${want} 項｜已掛上神明頁 ${onsite} 尊`;
    },
    upstream: 'docs/intake-urls-photos.json',
    coversDir: ['photos'],
  },
  {
    stage: 'pending', id: 'religion-jianzhu',
    goal: '建築特色（IndexID=3）全量 → 廟宇頁「建築特色」區塊',
    blocker:
      '⏳ 等台灣端抓（2026-08-06 加進 manifest v12，排在 yange 之後）。抽樣評估結論見上方 recon 段。',
    metric: () => {
      const dir = join(INBOX, 'religion-jianzhu');
      const got = existsSync(dir) ? readdirSync(dir).filter((f) => MAIN_JSON.test(f)).length : 0;
      const want = existsSync('docs/intake-urls-jianzhu.json') ? j('docs/intake-urls-jianzhu.json').length : 0;
      return `已收 ${got}/${want} 項`;
    },
    upstream: join(INBOX, 'recon-service/getuploadfile-74678-idx3-jianzhu.json'),
    coversDir: ['religion-jianzhu'],
  },
  {
    stage: 'pending', id: 'religion-yange',
    goal: '寺廟歷史沿革（IndexID=2）＋參拜流程（IndexID=4）→ 廟宇頁內容。受益面是站上絕大多數只有名稱/地址/主祀神的廟頁',
    blocker:
      '⏳ 等台灣端抓（2026-08-06 加進 manifest v9）。清單 docs/intake-urls-yange.json 已產出並 push。' +
      '🔴 **清單預設只收站上有頁面的廟**（2026-08-07 起，gen-intake-urls-yange.mjs 的 ONLY_ONSITE）：' +
      '在那之前有 34% 的抓取落在站上沒有頁面的廟，抓回來只能丟掉。同日把母體從 7,891 擴到 9,111 間' +
      '（補神明別名＋王爺歸總論節點，救回 1,220 間，神明仍 76 尊未新增），剩下對不上的才從清單濾掉。' +
      '要重新評估全量加 --include-offsite。⚠️ 母體變動後**清單要重產**，否則新收的廟不會被抓。' +
      '✅ **IndexID=3 建築特色已改為收**（2026-08-06 定案；此前這裡寫的是「刻意不收」，' +
      '依據是 2026-08-05 只取樣一筆、內容就是廟名本身）。2026-08-06 補抽 30 筆評估，' +
      '有實質內容者過半 → 改為收，全量走獨立 job `religion-jianzhu`（排在本 job 之後），' +
      '結論全文見下方 recon 段的 religion-jianzhu-sample。沒用的那些仍由 isPlaceholder 擋一次。' +
      '⚠️ 同輪把 max_requests_per_run 由 200 提到 1500（間隔仍 1 秒不變），否則一天 200 項要跑 26 天。',
    metric: () => {
      // 🔴 不可以拿「目錄檔案數 / 清單長度」當進度（2026-08-08 修）：
      //    inbox 是 write-only 刪不掉，清單重產過（ONLY_ONSITE 濾掉站上沒有頁面的廟）之後，
      //    舊清單抓回來的檔還留在目錄裡 → 分子被灌水。實測當時顯示「已收 4353/4351」＝看起來收完了，
      //    但拆開看 IndexID=4（參拜流程）其實只有 589/706。
      //    **而「參拜流程到齊」正是生肖頁第三段的解鎖條件**，誤判成到齊會讓人以為可以動手了。
      //    正確作法：拿清單裡的 key 逐一去磁碟上找，只算「清單要的」那些，並分 IndexID 報。
      const dir = join(INBOX, 'religion-yange');
      if (!existsSync('docs/intake-urls-yange.json')) return '清單尚未產出';
      const have = existsSync(dir) ? new Set(readdirSync(dir).filter((f) => MAIN_JSON.test(f))) : new Set();
      const list = j('docs/intake-urls-yange.json');
      const LABEL = { 2: '沿革', 4: '參拜流程', 3: '建築特色' };
      const per = new Map();
      for (const it of list) {
        const idx = String(it.key ?? '').match(/-(\d)$/)?.[1] ?? '?';
        const cur = per.get(idx) ?? { got: 0, want: 0 };
        cur.want++;
        if (have.has(`${it.key}.json`)) cur.got++;
        per.set(idx, cur);
      }
      const parts = [...per.entries()].sort()
        .map(([idx, c]) => `${LABEL[idx] ?? `idx=${idx}`} ${c.got}/${c.want}${c.got >= c.want ? ' ✅' : ''}`);
      const got = [...per.values()].reduce((n, c) => n + c.got, 0);
      const want = [...per.values()].reduce((n, c) => n + c.want, 0);
      const stale = have.size - got;
      return `已收 ${got}/${want} 項（${parts.join('｜')}）` +
        (stale > 0 ? `；另有 ${stale} 個舊清單留下的檔（inbox 刪不掉，不計入進度）` : '');
    },
    upstream: join(INBOX, 'recon-service/getuploadfile-63443-idx2-yange.json'),
    coversDir: ['religion-yange'],
  },
  {
    stage: 'live', id: 'local-celebration',
    what: '內政部「地方宗教慶典」＝**縣市層級**登錄的慶典清單（縣市＋曆別＋月日＋活動名稱四欄）',
    how:
        '2026-08-06 上線 /festivals/local/，並回灌節日頁（同一天登錄者）與廟宇頁（名稱以該廟為名者）。' +
        '匯入器 scripts/import-local-celebrations.mjs；6 頁皆為一般 job → 這條線全自動。' +
        '⚠️ 配廟**不可用樸素字串比對**：實測「東隆宮迎王」會被配到潮州鎮東隆宮（正主是東港東隆宮），' +
        '「臺北保安宮」會被配到臺中市北區。規則＝廟名唯一→縣市→鄉鎮（詞幹≥2字），' +
        '不唯一就留空。授權只涵蓋這四欄，詳情頁的簡介與照片不取。',
    metric: () => {
      const lc = j('src/data/local-celebrations.json');
      return `${lc.items.length} 項｜${new Set(lc.items.map((x) => x.county)).size} 縣市｜` +
        `可唯一對映到廟 ${lc.items.filter((x) => x.temple_ref).length} 項（其餘留空＝寧缺勿假）`;
    },
    upstream: join(INBOX, 'misc/local-celebration-ci96.html'),
    covers: [
      ...[2, 3, 4, 5, 6].map((p) => `local-celebration-p${p}`),
      ...[2, 3, 4, 5, 6].map((p) => `misc/local-celebration-ci96-p${p}.html`),
    ],
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
    covers: ['recon-service/temple-export.ods', 'recon-service/foundation-temple-entry.html',
      'recon-service/search-country-C-pagesize20-p1.html', 'recon-service/search-country-C-pagesize100-p1.html',
      'recon-service/search-name-zhenlangong.html', 'recon-service/getuploadfile-63443-idx2-yange.json',
      'recon-service/getuploadfile-70281-idx4-canbai.json', 'recon-service/getuploadfile-74678-idx3-jianzhu.json',
      'misc/religion-copyright.html'],
  },
  {
    stage: 'infra', id: 'religion-robots',
    verdict: '抓取前的禮貌檢查（該站 robots.txt 回 404＝未宣告任何限制）。不是資料，不進站。',
    upstream: join(INBOX, 'misc/religion-robots.txt'),
  },
  {
    stage: 'dropped', id: 'crgis-folk-customs',
    verdict: '中研院文化資源地理資訊系統。自 2026-07-30 起站台本身停擺（台灣端亦不通＝非境內外差異）。已設 `_alert: false` 靜音，每輪仍重試。🔴 **是連不上，不是沒有資料——不得據此判定該來源無效或刪掉 job。**',
  },
  {
    stage: 'dropped', id: 'culture-collections-guanyin / qianshi / qianbu',
    verdict: '觀音籤第一輪偵察抓回的三個檔**都是網站外殼**（各 99,414 bytes，「觀音」「籤詩」在內容出現 0 次）——collections.culture.tw 不吃 `?keyword=` GET 參數，真正的搜尋是 ASP.NET POST 表單。三個檔無用，已由 RECON-guanyin-qian.md 取代。',
    upstream: join(INBOX, 'misc/culture-collections-guanyin.html'),
    covers: ['culture-collections-guanyin', 'culture-collections-qianshi', 'culture-collections-qianbu',
      'misc/culture-collections-qianshi.html', 'misc/culture-collections-qianbu.html'],
  },
  {
    stage: 'dropped', id: '南海觀音籤譜掃描圖（tcmb 26000234013）',
    verdict: '**不要抓**。理由不是版本錨定是**授權**——該詮憬頁授權條款寫「受著作權法保護－僅限於本平台有限度公開瀏覽」，抓回來也不能用。🔑 **通則：政府典藏 ≠ 可自由使用，要看授權條款**——PDM／CC0／OGDL 可用，「僅限本平台瀏覽」「保留所有權利」不可轉載。（藥籤那批能用是因為藥方 PDM、說明 OGDL 1.0，授權狀態完全不同。）',
  },
  {
    stage: 'dropped', id: '觀音廟官網逐間查籤文',
    verdict: '**結案，不做**。站上主祀觀世音菩薩的廟有 848 間，**其中有官網的只有 1 間**（艋舺龍山寺，已確認官網無籤文）。母體本身不存在，丟 848 個廟名給台灣端等於叫人漫遊搜尋引擎。',
  },
  {
    stage: 'dropped', id: '臺史博籤詩藏品再翻 97 頁',
    verdict: '**不要**。瓶頸已換位置：限制不是「找不到還有哪些廟有籤版」，而是「找到了要有人去問廟方」＝打電話的量能。現有 33 筆已超過能消化的量，再翻只會讓待辦更長。被排除的 15 筆純器物（不帶籤文）也不用補。',
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

// ── LEDGER 結構自驗（2026-08-06 加）────────────────────────────────────────
// 對帳段只擋「忘了把某個 job 加進 LEDGER」，擋不掉「加了但寫壞」。這一段補結構層：
// stage 值合法、id 不重複、各 stage 必要欄位齊全、upstream 指到的檔真的存在。
// 內容正不正確（描述有沒有寫錯）機器驗不了，那只能靠 review——但至少不該有壞掉的條目。
const STAGES = { live: ['what', 'how', 'metric'], pending: ['goal', 'blocker', 'metric'],
                 recon: ['verdict'], dropped: ['verdict'], infra: ['verdict'] };
const ledgerErrors = [];
const seenIds = new Set();
for (const e of LEDGER) {
  const at = `LEDGER「${e.id ?? '(無 id)'}」`;
  if (!e.id) ledgerErrors.push(`${at}：缺 id`);
  else if (seenIds.has(e.id)) ledgerErrors.push(`${at}：id 重複`);
  else seenIds.add(e.id);
  if (!STAGES[e.stage]) { ledgerErrors.push(`${at}：stage「${e.stage}」不合法（可用：${Object.keys(STAGES).join('／')}）`); continue; }
  for (const f of STAGES[e.stage]) if (!e[f]) ledgerErrors.push(`${at}（stage=${e.stage}）：缺必要欄位 ${f}`);
  if (e.upstream && !existsSync(e.upstream)) {
    // 檔案可能已被 ingest 上位並清空 inbox，那是正常的——只在「該檔從未出現過」時才提醒。
    ledgerErrors.push(`${at}：upstream 不存在（${e.upstream}）——若已被 ingest 上位屬正常，可把該欄拿掉或改指上位路徑`);
  }
}

// ── 輸出 ────────────────────────────────────────────────────────────────────
const jobState = (id) => state.jobs?.[id] ?? {};
function jobLine(id) {
  const s = jobState(id);
  if (s.last_ok) return `台灣端最後成功 ${agoT(s.last_ok)}`;
  if (s.attempts) return `⚠️ 連續失敗 ${s.attempts} 次：${String(s.last_error ?? '').slice(0, 40)}`;
  return '—';
}

const line = (n = 74) => console.log('─'.repeat(n));
console.log(`\n台灣端投遞管道現況　（manifest v${manifest.version}／${manifest.updated}）`);
console.log(`state.json 更新於 ${agoT(state.updated)}（${String(state.updated).slice(0, 19)}）`);
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
  const arrived = existsSync(e.upstream) ? statSync(e.upstream).mtime.toISOString().slice(0, 10) : '—';
  console.log(`\n  ● ${e.id}　（投遞 ${arrived}，已擱置 ${age == null ? '—' : `${age} 天`}${age != null && age > 3 ? ' ⚠️' : ''}）`);
  console.log(`    目標：${e.goal}`);
  console.log(`    卡點：${e.blocker}`);
  console.log(`    現況：${e.metric()}`);
}

// 🔴 已靜音（manifest `_alert: false`）的 job 不能跟真正卡住的並列。
// 2026-08-06：我把 crgis 當成「唯一還在壞、該去修的東西」推薦給用戶，
// 但 manifest 早就寫明那是上游站台停擺、失敗屬預期、且不得刪 job——
// 把它印在「抓取一直失敗」底下，等於每次都邀請下一個人重犯同一個誤判。
const silenced = new Set(manifest.jobs.filter((x) => x._alert === false).map((x) => x.id));
const failed = Object.entries(state.jobs ?? {}).filter(([, s]) => !s.last_ok && s.attempts > 0);
const stuck = failed.filter(([id]) => !silenced.has(id));
const watching = failed.filter(([id]) => silenced.has(id));
if (stuck.length) {
  console.log('\n  ● 抓取一直失敗的 job');
  for (const [id, s] of stuck) console.log(`    ${id}：連續 ${s.attempts} 次｜${String(s.last_error ?? '').slice(0, 50)}`);
}
if (watching.length) {
  console.log('\n  ● 上游停擺，監看中（失敗屬預期，沒有事情要做）');
  for (const [id, s] of watching) {
    const note = manifest.jobs.find((x) => x.id === id)?._alert_note ?? '';
    console.log(`    ${id}：連續 ${s.attempts} 次｜${String(s.last_error ?? '').slice(0, 40)}`);
    if (note) console.log(`      ↳ ${note}`);
  }
}

if (!BRIEF) {
  line();
  console.log('■ 三、偵察結論（別重做一遍）');
  for (const e of LEDGER.filter((x) => x.stage === 'recon')) console.log(`\n  ● ${e.id}\n    ${e.verdict}`);
  line();
  console.log('■ 四、放棄／暫停');
  for (const e of LEDGER.filter((x) => x.stage === 'dropped')) console.log(`\n  ● ${e.id}\n    ${e.verdict}`);
}

// ── 對帳：LEDGER 沒涵蓋到的東西一律列出來 ────────────────────────────────────
// 🔴 這一段是必要的，不是裝飾。LEDGER 是**手維護**的表，新增 job 或新收到檔案時若忘了補，
// 報告會「看起來完整其實漏掉」——那比沒有報告更危險。實例：初版 LEDGER 漏了
// religion-robots 與 crgis-folk-customs 兩個 manifest job，以及 26 個 inbox 檔。
line();
console.log('■ 對帳（LEDGER 未涵蓋者，看到就該補進 LEDGER 或確認可忽略）');
if (ledgerErrors.length) {
  console.log(`  ⚠️ LEDGER 結構問題 ${ledgerErrors.length} 處：`);
  for (const e of ledgerErrors) console.log(`    · ${e}`);
} else {
  console.log('  LEDGER 結構自驗：✅ stage 合法、id 不重複、必要欄位齊全、upstream 檔案存在');
}
const ledgerIds = new Set(LEDGER.flatMap((e) => [e.id, ...(e.covers ?? [])]));
const orphanJobs = manifest.jobs.map((x) => x.id).filter((id) => !ledgerIds.has(id));
const orphanState = Object.keys(state.jobs ?? {}).filter((id) => !ledgerIds.has(id) && !orphanJobs.includes(id));
// inbox 檔：LEDGER 的 upstream 已指到的、以及純文件（.md）之外的
const covered = new Set(LEDGER.flatMap((e) => [e.upstream, ...(e.covers ?? [])]).filter(Boolean).map((p2) => String(p2).replace(`${INBOX}/`, '')));
// `coversDir`：整個目錄都歸這筆 LEDGER 管。批次型 job（沿革 5,153 項、查詢結果 137 頁）
// 沒辦法逐檔列進 covers——2026-08-06 第一次收到 199 頁時，對帳把 199 個檔名逐一印出來，
// 那份報告就沒人看得下去了。目錄前綴一條頂一批。
const coveredDirs = LEDGER.flatMap((e) => e.coversDir ?? []);
const orphanFiles = inboxFiles.filter(
  (f) =>
    !covered.has(f) &&
    !coveredDirs.some((d) => f.startsWith(d.endsWith('/') ? d : `${d}/`)) &&
    !f.endsWith('.md') &&
    f !== 'state.json',
);
console.log(`  manifest 有但 LEDGER 無：${orphanJobs.length ? orphanJobs.join('、') : '無'}`);
console.log(`  state.json 有但兩邊都無：${orphanState.length ? orphanState.join('、') : '無'}`);
console.log(`  inbox 檔未被 LEDGER 指到：${orphanFiles.length ? `${orphanFiles.length} 個` : '無'}`);
if (orphanFiles.length && !BRIEF) for (const f of orphanFiles) console.log(`    · ${f}`);
console.log(`  inbox 內的說明文件（.md，不需 LEDGER）：${inboxFiles.filter((f) => f.endsWith('.md')).length} 份`);

line();
// ── 待匯入：「收到了」與「進站了」之間的落差 ──────────────────────────────────
// 🔴 為什麼要有這段（2026-08-08 加）：本報告原本只講「台灣端送來多少」，
//    完全沒有「送來了但還沒匯入」這個欄位。實際後果：inbox 裡躺著 773 筆沿革＋526 筆參拜流程
//    沒進站，而報告看起來一切正常——要有人**記得**去手動跑一次匯入器乾跑才會發現。
//    「報現況一律用指令查」的前提是那個指令真的算得出現況；算不出來的欄位等於不存在。
//    故改由本報告直接去跑三支匯入器的乾跑（實測合計約 1.6 秒），拿它們的 --json 輸出。
// ⚠️ 契約：匯入器的 `--json` 回 `{read, pending:{欄位:筆數}, blocked?:{原因:筆數}}`。
//    改那邊的鍵名要同步改這裡（見 import-temple-history.mjs 的 --json 註解）。
{
  const IMPORTERS = [
    { label: '廟宇沿革／參拜流程／建築特色', script: 'scripts/import-temple-history.mjs' },
    { label: '神明條目（造型・引文・照片候選）', script: 'scripts/import-knowledge-deities.mjs' },
    { label: '照片代表圖', script: 'scripts/import-photos.mjs' },
  ];
  console.log('');
  console.log('─'.repeat(74));
  console.log('■ 待匯入（inbox 已收到、但還沒寫進 src/data 的）');
  let anyPending = false;
  for (const im of IMPORTERS) {
    let r;
    try {
      r = JSON.parse(execFileSync(process.execPath, [im.script, '--json'], { encoding: 'utf8' }).trim());
    } catch (e) {
      console.log(`  ⚠️ ${im.label}：乾跑失敗（${String(e.message).split('\n')[0]}）——這本身就是要處理的事`);
      anyPending = true;
      continue;
    }
    const pend = Object.entries(r.pending ?? {}).filter(([, n]) => n > 0);
    const blocked = Object.entries(r.blocked ?? {}).filter(([, n]) => n > 0);
    if (!pend.length && !blocked.length) { console.log(`  ✅ ${im.label}：無待匯入（讀 ${r.read}）`); continue; }
    if (pend.length) {
      anyPending = true;
      console.log(`  ● ${im.label}：${pend.map(([k, n]) => `${k} ${n} 筆`).join('｜')}`);
      console.log(`      → 跑 \`node ${im.script} --write\``);
    }
    if (blocked.length) {
      console.log(`  ⚠️ ${im.label} 收到但用不了：${blocked.map(([k, n]) => `${k} ${n}`).join('｜')}`);
    }
  }
  if (!anyPending) console.log('  （全部到站的資料都已匯入。）');
}

console.log('');
console.log(`站上相關資料：沿革 ${M.history}／簡介 ${M.intro}／開放時間 ${M.openTime}　（共 ${M.temples} 間廟）`);
console.log(`archive 保留版本數：${existsSync(ARCHIVE) ? readdirSync(ARCHIVE, { recursive: true }).filter((f) => String(f).endsWith('.xml')).length : 0}\n`);
