import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = 'docs/topic-articles';

for (const file of readdirSync(dir).filter((name) => /^week-\d{2}\.md$/u.test(name))) {
  const path = `${dir}/${file}`;
  const original = readFileSync(path, 'utf8');
  const frontmatterMatch = /^---\n[\s\S]*?\n---\n/u.exec(original);
  const frontmatter = frontmatterMatch?.[0] ?? '';
  let text = frontmatterMatch ? original.slice(frontmatterMatch[0].length) : original;
  const title = /^title:\s*(.+)$/mu.exec(frontmatter)?.[1]?.trim() ?? '這個主題';

  // Keep frontmatter for the release pipeline; only the rendered article body is rewritten.
  text = text.replace(/^## 這篇文章怎麼讀\n\n本文先處理[^\n]+\n\n/mu,
    `## 先看重點\n\n這篇先回答「${title}」；涉及年度日期、活動時刻、交通、報名或廟方服務時，請以當年度官方公告為準。\n\n`);
  text = text.replace(/^## 文化脈絡與實用說明$/gmu, '## 文化背景與實用資訊');
  text = text.replace(/^## 年度資料怎麼維護\n\n[\s\S]*?(?=^## 常見問題$)/mu,
    '## 最新日期與活動資訊\n\n本文先提供可長期閱讀的文化背景；涉及年度日期、活動時刻、路線、交通、報名或廟方服務時，請以當年度政府、文化資產保存者或主辦單位公告為準。尚未公告的資訊不以往年資料推算。\n\n');
  text = text.replace(/^## 可核對的文化事實$/gmu, '## 文化背景');
  text = text.replace(/^\*\*可核實 facts(?:（\d+）)?\*\*$/gmu, '## 文化背景');
  text = text.replace(/^## 導讀$/gmu, '## 先看重點');
  text = text.replace(/^### 事實組合建議\n?/gmu, '');
  text = text.replace(/^### 建議標題$/gmu, '### 文章標題');
  text = text.replace(/^### 這個主題的地方脈絡$/gmu, '### 地方特色');
  text = text.replace(/^### 閱讀範圍$/gmu, '### 閱讀提示');
  text = text.replace(/^### 七月群 FAQ 草稿$/gmu, '### 七月常見問題');
  text = text.replace(/^### (\d+)\. /gmu, '### ');

  // Remove editorial instructions that were accidentally copied into article bodies.
  text = text.replace(/^\*\*(?:合併[^\n]*|七月群合併檢查)[\s\S]*?(?=\n\n|$)\n?/gmu, '');
  text = text.replace(/^- \*\*(?:既有 canonical(?:／處理方式)?|發布狀態|搜尋意圖)\*\*[^\n]*\n?/gmu, '');
  text = text.replace(/^\*\*([^*\n]+)\*\*$/gmu, '### $1');
  text = text.replace(/^\*\*主文草稿\*\*：/gmu, '');
  text = text.replace(/^來源要求：/gmu, '詳細資訊請以');
  text = text.replace(/年度資料待核對/gu, '尚待當年度官方公告確認');
  text = text.replace(/source_required/gu, '尚待當年度官方公告確認');
  text = text.replace(/研究資料包/gu, '本文整理的資料');
  text = text.replace(/研究包/gu, '本文整理的資料');
  text = text.replace(/下一輪應再補第二個獨立官方來源，避免只有單一頁面來源。/gu,
    '節氣日期請再參考中央氣象署的當年度資料。');
  text = text.replace(/獨有 facts/gu, '獨有事實');
  text = text.replace(/facts/gu, '事實');
  text = text.replace(/\bcanonical\b/gu, '對應頁面');
  text = text.replace(/待評估/gu, '依既有頁面承接');
  text = text.replace(/各\s+對應頁面/gu, '各自的對應頁面');
  text = text.replace(/各自\s+對應頁面/gu, '各自的對應頁面');
  text = text.replace(/`對應頁面`/gu, '對應頁面');
  text = text.replace(/已完成[^；。\n]*本文整理的資料/gu, '本文已整理常年文化脈絡');
  text = text.replace(/\((https?:\/\/[^)\n]+?)[，,]\s*`[^`)]*`?\)/gu, '($1)');
  text = text.replace(/正文要把/gu, '讀者可從本文分辨');
  text = text.replace(/正文要標明這是/gu, '這是');
  text = text.replace(/正文要標族群／地域/gu, '應標示族群與地域');
  text = text.replace(/不新增薄頁/gu, '相關內容集中在本頁或既有對應頁面');
  text = text.replace(/不新增同義頁/gu, '相關內容集中在對應頁面');
  text = text.replace(/不批量生成神明生日薄頁/gu, '神明生日請依個別神明與廟宇公告查閱');
  text = text.replace(/不批量製作「各廟謝太歲大全」/gu, '不同廟宇的服務請依各自公告查閱');
  text = text.replace(/禁止建立「[^」]+」(?:通用頁|大全)/gu, '不同地區請分別查閱各自的主辦資訊');
  text = text.replace(/不要建立「[^」]+」(?:年份頁|新頁)/gu, '相關資訊集中在既有對應頁面');
  text = text.replace(/不要另開「[^」]+」(?:副頁|換詞頁|新頁)/gu, '相關資訊集中在既有對應頁面');
  text = text.replace(/不另開「[^」]+」(?:副頁|換詞頁|新頁)/gu, '相關資訊集中在既有對應頁面');
  text = text.replace(/維持單一([^。；\n]+)對應頁面/gu, '由同一頁集中說明$1');
  text = text.replace(/先補三個逐句掛源 事實，再做年度日期刷新/gu, '發布前先核對三項文化事實與年度日期');
  text = text.replace(/優先合併，不因「[^」]+」另造薄頁/gu, '相關內容集中於三官信仰頁面');
  text = text.replace(/新 URL/gu, '新頁面');
  text = text.replace(/對應頁面 承接/gu, '對應頁面承接');
  text = text.replace(/避免把同義查詢拆成重複頁/gu, '避免讓讀者在相同內容間來回查找');
  text = text.replace(/合併規則/gu, '地方差異');
  text = text.replace(/先合併，不新增薄頁/gu, '下元節與三官信仰的關係');
  text = text.replace(/獨有事實\s+和/gu, '獨有事實和');
  text = text.replace(/不做年末服務大全薄頁/gu, '年末服務依各廟公告查閱');
  text = text.replace(/維持習俗 對應頁面，不另開除夕節日頁/gu, '祭祖步驟集中於習俗對應頁面，日期依年曆查閱');
  text = text.replace(/發布前仍須掛/gu, '發布時請附');
  text = text.replace(/一般元宵問題先研究/gu, '先說明元宵節的共同文化背景');
  text = text.replace(/不建「元宵大全」/gu, '各地活動依主辦公告查閱');
  text = text.replace(/暫相關內容集中在/gu, '相關內容集中在');
  text = text.replace(/發布前不能自行推測/gu, '公告發布前無法提供精確資訊');
  text = text.replace(/發布前重新核對/gu, '發布時重新核對');
  text = text.replace(/抓取公告時要保存發布日期與原始 URL，不以搜尋摘要代替/gu, '查閱公告時請確認發布日期與原始網址，不以搜尋摘要代替');
  text = text.replace(/不批量複製廟頁/gu, '不把不同廟宇資料混為一談');
  text = text.replace(/不新增「鬼門關日期」副頁/gu, '鬼門關日期請在本頁與地藏頁一併查閱');
  text = text.replace(/不新增症狀型薄頁/gu, '若需實際服務，請回到對應頁面查閱');
  text = text.replace(/不另開「秋分日期」頁/gu, '秋分日期集中在節氣頁說明');
  text = text.replace(/發布前先核對/gu, '發布時先核對');
  text = text.replace(/標 `以當年度公告為準`/gu, '以當年度公告為準');
  text = text.replace(/維持 `以當年度公告為準`/gu, '以當年度公告為準');
  text = text.replace(/本站事件資料記錄/gu, '現有資料記錄');
  text = text.replace(/一律標 `以當年度公告為準`/gu, '一律以當年度公告為準');
  text = text.replace(/正文不能用一個/gu, '不能用一個');
  text = text.replace(/事件頁應回答/gu, '本文補充');

  // The lead appears once below the H1; remove an exact copy that the
  // evidence packet may have repeated inside the culture section.
  const leadMatch = /^# .+\n\n([\s\S]*?)(?=\n\n## )/mu.exec(text);
  const cultureMatch = /^(## 文化背景與實用資訊)\n([\s\S]*?)(?=^## 最新日期與活動資訊)/mu.exec(text);
  if (leadMatch && cultureMatch) {
    const lead = leadMatch[1].trim();
    const withoutLead = cultureMatch[2].replace(lead, '').replace(/^\s+|\s+$/gu, '');
    const remainingChars = withoutLead.replace(/[#*\-\s]/gu, '').length;
    if (withoutLead !== cultureMatch[2].trim() && remainingChars > 350) {
      const replacement = `${cultureMatch[1]}\n\n${withoutLead}\n\n`;
      text = text.replace(cultureMatch[0], replacement);
    }
  }
  // Only collapse repeated horizontal spaces; never collapse Markdown newlines.
  text = text.replace(/[ \t]{2,}/gu, ' ');

  // Drop empty duplicate headings left by the evidence-to-article conversion.
  text = text.replace(/^(## [^\n]+)\n\n\1\n?/gmu, '$1\n');
  text = text.replace(/\n{3,}/gu, '\n\n');
  writeFileSync(path, `${frontmatter}${text}`);
}
