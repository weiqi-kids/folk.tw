# folk.tw SEO 自動化 — 維運手冊（Runbook）

> 全鏈跑在**這台 server 的 cron**（2026-06-30 起）。雲端 routine 與 GitHub Action 皆已退役。
> 操作可用 `/seo` skill；本檔為完整參考。

## 1. 架構總覽（四段，全本機）

| 段 | 時間（台 / UTC） | 進入點 | 類型 | 產出 |
|----|----------------|--------|------|------|
| ① 收集 | 04:30 / 20:30 | `scripts/seo-collect-cron.sh` | 純 node | 產 `data/seo-daily/<日期>.json`、commit/push、Google index:ping |
| ② 心跳 | 05:00 / 21:00 | `scripts/seo-report-slack.mjs` | 純 node | Slack 純數據 |
| ③ 大腦 | 05:55 / 21:55 | `scripts/seo-brain-cron.sh` | headless `claude -p`（Sonnet） | 自動優化→push→deploy→notify→Slack 分析 |
| ④ 週報 | 週一 09:30 / 01:30 | `scripts/seo-weekly.mjs` | 純 node | 開 GitHub Issue + Slack 重點＋連結 |

排程檔：`/etc/cron.d/folk-tw-seo`（心跳＋大腦）、`folk-tw-seo-collect`（收集）、`folk-tw-seo-weekly`（週報）。
log：`/root/folk.tw/logs/seo-{collect,report,brain,weekly}.log`（已 gitignore）。

## 2. 資料流

```
GA4 + GSC ──①收集(seo-daily.mjs)──→ data/seo-daily/<日期>.json ──┬─②心跳──→ Slack（數據）
                                                                  ├─③大腦──→ 改站+push+deploy+notify → Slack（分析）
                                                                  └─④週報──→ GitHub Issue + Slack（重點+稀釋判讀+連結）
```
心跳/大腦讀「當日」JSON；週報自行抓一次資料（不重用 JSON）並開 Issue。

## 3. Slack 輸出（#神酷-folk-tw，C0BCPHBF1ML）

每天 2 則（心跳 05:00、大腦 05:55），每週一多 1 則（週報）。首行皆為 🚦 行動標籤（🟢 無需動作 / 🟡 看一下 / 🔴 要你決定）。
大腦失敗會發 🔴 保底通知（包裝層補發），不會像 6/26 雲端被停那樣全靜默。

## 4. 憑證與設定

| 用途 | 位置 | 備註 |
|------|------|------|
| Google 服務帳號金鑰 | `scripts/.google-sa-key.json` | 已 gitignore；收集/週報用；SA 須為 GSC 擁有者 |
| Slack bot token | `/root/.config/folk-tw/slack-bot-token` | chmod 600；folk 專屬 bot「好棋寶寶 Claude 助手」，**勿與其他站混用** |
| IndexNow 金鑰 | `public/<key>.txt` | 部署上線供驗證 |
| GitHub 操作 | `gh`（帳號 LightChang）| push / 觸發 deploy / 開 Issue |
| headless 授權 | `.claude/settings.json`（專案層白名單）| 大腦 **不用** `--dangerously-skip-permissions`，改靠此白名單；`IS_SANDBOX=1` 僅供 root 執行 |

## 5. 常用操作（或用 `/seo`）

```bash
cd /root/folk.tw
# 手動收集當日數據
GA4_PROPERTY_ID=542419964 node scripts/seo-daily.mjs
# 手動發數據心跳
node scripts/seo-report-slack.mjs            # 或 --dry 預覽
# 大腦乾跑（讀數據+提案，不 commit/push/發 Slack）
DRY_RUN=1 ./scripts/seo-brain-cron.sh
# 週報乾跑 / 正式
node scripts/seo-weekly.mjs --dry            # 預覽（= pnpm data:weekly）
node scripts/seo-weekly.mjs                   # 開 Issue + 發 Slack
```
> ⚠️ 從 agent session 內直接執行大腦（`claude -p ...`）會被安全守衛擋；請用上面 `!`／終端機跑，或交給 cron。

## 6. 排錯

| 症狀 | 先看 | 常見原因 |
|------|------|---------|
| Slack 沒收到 | `logs/seo-*.log` 當日尾段 | cron 沒跑 / token 失效 / 該段失敗 |
| 大腦沒 push | `logs/seo-brain.log` | gate（check:integrity/build）未過＝設計上不 push；或 rebase 衝突 |
| 數據缺當日 | `ls -t data/seo-daily/*.json` | 收集失敗（Google 金鑰/額度）；心跳會回報 🟡 |
| 部署沒跑 | `gh run list --workflow=deploy.yml` | push main 會自動觸發（on:push），比對 headSha 是否本次 commit。**勿手動補跑**（同 SHA 雙 run 會毒化 Pages build version，2026-07-02 實證，見 CLAUDE.md）；僅在 ~2 分鐘後仍無本 SHA run 才手動觸發一次 |
| deploy job 失敗（build 成功） | `gh run view <run-id>` 看錯誤 | 若為 Pages 服務端暫時性錯誤（`Deployment failed, try again later.`）：`gh run rerun <run-id> --failed` 重跑**同一 run** 一次即可（2026-07-04 實證，不另開 run、無毒化風險）；再失敗交人工。build job 失敗則是程式碼問題，修正或 revert，勿 rerun |

## 7. 回退（rollback）

```bash
git log --oneline | grep auto-claude-seo     # 找大腦的改動
git revert <sha> && git push origin main      # 一鍵回退某次自動優化（push 即自動觸發部署，勿再補跑）
```

## 8. 護欄（大腦鐵則，寫在 seo-brain-cron.sh 的 prompt）

1. **絕不杜撰**：補事實型內容必先 WebSearch 查權威源並寫進來源欄位；查無源就只動內鏈/meta/結構。
2. 每天最多改 **5 個檔**。
3. 改完跑 `pnpm install --frozen-lockfile` →（動到資料/schema）`check:integrity` → `build`；**任一不過一律不 push**。
4. 內容改動集中一個 commit、前綴 `[auto-claude-seo]`，方便辨識與 revert。

## 9. 退役紀錄（已刪/已停，勿復用）

- 雲端 routine（claude.ai）：每日優化 `trig_01HPqQCZ…`、週報稀釋監測 `trig_016aNyp3…` — **已由使用者刪除**。
- GitHub Actions：`seo-daily.yml`、`weekly-report.yml`、`seo-notify.yml` — **已刪除**（功能搬本機）。
- 腳本：`scripts/weekly-data.mjs` — 已刪（由 `seo-weekly.mjs` 取代）。
- 仍保留的 Action：`deploy.yml`（推 main 自動部署，仍在用）。
