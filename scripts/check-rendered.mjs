#!/usr/bin/env node
// 部署 gate：對「渲染輸出」逐頁比對資料的不變量檢查（非抽驗，全量）。
//
// 本檔現在只是**進入點**：不變量本身在 scripts/invariants/（一條＝一個物件），
// 走訪／快取／摘要組裝在 scripts/lib/invariant-runner.mjs，
// 資料與共享索引在 scripts/lib/render-context.mjs。
//
// 背景：feature 正確性不能靠人工抽驗幾間廟；此檢查跑在 build 後，發現不符即 exit 1
//       → deploy.yml build job 失敗 → 不部署。
//
// 用法：
//   pnpm build:release 之後 `pnpm check:rendered`
//   node --experimental-strip-types scripts/check-rendered.mjs --list          看登錄表
//   node --experimental-strip-types scripts/check-rendered.mjs --only 1b,5d    只跑指定條（吃舊編號）
import { runInvariants } from './lib/invariant-runner.mjs';
import { REGISTRY } from './invariants/index.mjs';

process.exit(await runInvariants(REGISTRY, process.argv.slice(2)));
