// 站內搜尋需求的 GA4 唯讀彙整。前端只會把明確的公開民俗詞送出字面；
// 其他自由文字一律變成 [redacted:<topic>]，本工具不得嘗試還原或繞過該界線。

export function summarizeSearchDemand(rows = []) {
  const normalized = rows.map((row) => ({
    event: row.dimensionValues?.[0]?.value ?? '',
    term: row.dimensionValues?.[1]?.value || '(not set)',
    events: Number(row.metricValues?.[0]?.value ?? 0),
    users: Number(row.metricValues?.[1]?.value ?? 0),
  }));
  const sortRows = (items) => items.sort((a, b) => b.events - a.events || b.users - a.users || a.term.localeCompare(b.term, 'zh-Hant'));
  return {
    zeroResults: sortRows(normalized.filter((x) => x.event === 'search_zero_results')),
    searches: sortRows(normalized.filter((x) => x.event === 'view_search_results')),
    resultClicks: sortRows(normalized.filter((x) => x.event === 'search_result_click')),
  };
}

export async function fetchSearchDemand(ga4RunReport, propertyId, {
  startDate = '7daysAgo', endDate = 'yesterday', limit = 1000,
} = {}) {
  const response = await ga4RunReport(propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'eventName' }, { name: 'searchTerm' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: {
      values: ['view_search_results', 'search_zero_results', 'search_result_click'],
    } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit,
  });
  return { range: `${startDate}..${endDate}`, ...summarizeSearchDemand(response.rows ?? []) };
}

export function searchDemandMarkdown(report, { maxRows = 10 } = {}) {
  const lines = ['## 站內搜尋需求（近 7 天）'];
  if (!report.zeroResults.length && !report.searches.length) {
    lines.push('', '- 尚無新版搜尋事件資料；部署後開始累積。');
    return lines.join('\n');
  }
  lines.push('', '### 找不到結果');
  if (!report.zeroResults.length) lines.push('- 無');
  else for (const row of report.zeroResults.slice(0, maxRows)) {
    lines.push(`- ${row.term}：${row.events} 次（${row.users} 位使用者）`);
  }
  lines.push('', '### 有結果的熱門搜尋');
  if (!report.searches.length) lines.push('- 無');
  else for (const row of report.searches.slice(0, maxRows)) {
    lines.push(`- ${row.term}：${row.events} 次（${row.users} 位使用者）`);
  }
  lines.push('', '_`[redacted:*]` 代表查詢未通過公開民俗詞與個資格式安全閘，只保留分類，不保存原文。_');
  return lines.join('\n');
}
