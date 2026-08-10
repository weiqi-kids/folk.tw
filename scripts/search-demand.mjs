#!/usr/bin/env node
// 唯讀列出近 7 天站內搜尋需求；不寫檔、不發通知。
import { ga4RunReport, loadConfig } from './lib/google-data.mjs';
import { fetchSearchDemand, searchDemandMarkdown } from './lib/search-demand.mjs';

const { ga4PropertyId } = loadConfig();
const report = await fetchSearchDemand(ga4RunReport, ga4PropertyId);
console.log(process.argv.includes('--json') ? JSON.stringify(report, null, 2) : searchDemandMarkdown(report));
