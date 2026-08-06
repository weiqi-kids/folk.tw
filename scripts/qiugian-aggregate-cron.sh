#!/usr/bin/env bash
# 求籤共情層聚合 cron 包裝：同步 → 跑 GA4 聚合 → 有變更才 commit [skip ci] + push。
# 由 /etc/cron.d/folk-qiugian **每 3 小時**（UTC 00/03/06/09/12/15/18/21 的 :07）呼叫
# （2026-08-05 從每日一次改；理由見該 cron 檔註解）；deploy.yml 每日 16:00 UTC 重建套用到站上。
# ⚠️ 頻率提高後本支一天跑 8 次，但「數字無變化就不 commit」的既有判斷仍在，不會多產生空 commit。
#
# 🔴 2026-08-03 修：本支從 2026-07-29 起每天都失敗（`fatal: Cannot rebase onto multiple
# branches.`），src/data/qiugian-stats.json 因此停在 7/29，站上「本週 N 人求籤」是舊數字。
# 根因是**跟 topical cron 搶 FETCH_HEAD**：
#   - topical 三支跑在隔離 worktree `/opt/folk-tw-cron/topical`，但 worktree 共用同一個
#     common git dir，`FETCH_HEAD` 就在 `/root/folk.tw/.git/FETCH_HEAD`＝**兩邊同一個檔**。
#   - `lib/cron-worktree.sh` 會跑 `git fetch -q origin`；本支原本用 `git pull --rebase origin main`
#     （內部也會 fetch 並寫 FETCH_HEAD）。兩個 fetch 交錯寫入 → FETCH_HEAD 出現 2 筆
#     for-merge 條目 → rebase 拒絕執行。
#   - 觸發是必然而非偶然：topical 是 `*/20`（:00/:20/:40），本支原排 **15:00**＝每天固定對撞。
# 兩道修法一起上（缺一都還會再犯）：
#   ① 不再依賴 FETCH_HEAD：改成 `git fetch origin main` 後 rebase 到 **`origin/main`** 這個
#      remote-tracking ref。它是具名的單一 ref，別人同時 fetch 也不會讓它變成「多個分支」。
#   ② cron 分鐘從 :00 移到 :07，避開 `*/20` 的固定重疊（純降低機率，真正的修法是 ①）。
#
# ⚠️ 已知缺口（未修，需另案）：本支仍在**主工作樹**跑並用 `--autostash`，
# 與 2026-07-25 topical 那次「把人手改到一半的檔一起 commit」是同一個風險類別
# （見 lib/cron-worktree.sh 檔頭）。topical 已改成隔離 worktree，本支還沒。
# 要改需把 cw_* 那組 helper 參數化（目前寫死只准動 topical.json）。
set -euo pipefail
cd /root/folk.tw

git fetch -q origin main || { echo "[qiugian-cron] fetch 失敗，跳過"; exit 1; }
git rebase --autostash origin/main || {
  git rebase --abort 2>/dev/null || true
  echo "[qiugian-cron] rebase 失敗，跳過"
  exit 1
}

/usr/bin/node scripts/qiugian-aggregate.mjs

# 🔴 2026-08-06 修：本支同時會寫兩個檔，但原本只 stage 一個。
#   qiugian-aggregate.mjs 除了 qiugian-stats.json，還會把「集氣峰值」回寫
#   src/data/topical.json 的 bless_snapshot（供 archived／memorial 頁顯示「當時共有 N 人集氣」）。
#   原本的 `git add src/data/qiugian-stats.json` **沒有帶到 topical.json** →
#   那個回寫永遠不會進 repo，只在主工作樹留成 WIP，接著被 seo-ops cron 的 stash/reset 掃掉。
#   ＝這個功能從頭到尾沒生效過，而且是靜默的。
#
# ⚠️ 為什麼不能無腦 `git add src/data/topical.json`：
#   本支跑在**主工作樹**（它需要 node_modules 的 GA4 依賴，未納管進隔離 worktree），
#   topical.json 同時也是人手改與 P1/P2/P4 會動的檔。無條件 add 等於重演 2026-07-25
#   「把人改到一半的 WIP 一起 commit」那次事故。
#   故比照 topical cron 的既有作法加**硬檢查**：異動的每一行都必須是 bless_snapshot，
#   只要出現任何其他欄位的變動就整個放棄本次快照（下輪再來，只增不減故不會漏）。
# 🔴 判定改用 node，**不用 grep**（2026-08-06 二次修正）：
#   初版寫 `git diff -U0 … | grep -E '^[+-]' | grep -qv 'bless_snapshot'`，我在互動 shell 測過就上了。
#   但這台的互動 `grep` 是包了 ugrep 的 shim function，`-qv` 語意與 GNU grep **相反**：
#   同一份輸入（一行含 pattern、一行不含），shim 回 1、/usr/bin/grep 回 0。
#   cron 沒有 shim，拿到的是 GNU grep → 守門把 24/25 個項目判成「有其他欄位異動」而擋掉。
#   更糟的是它失敗的方式跟原本的 bug 一樣**靜默**，log 還誤報成「可能是人手 WIP」。
#   ⚠️ 為什麼首次新增會被擋：物件沒有 bless_snapshot 時，新增的 key 會排在尾端，
#   diff 因此連帶前一行的加逗號改動（`-  "status": "active"` / `+  "status": "active",`），
#   那兩行不含 bless_snapshot。**判定必須看「欄位語意」而不是「diff 文字行」。**
#
# 現在的作法：用 node 直接比對 HEAD 版與工作區版的 JSON，逐項確認**除了 bless_snapshot
# 以外沒有任何差異**（含新增/刪除項目）。這與 grep 實作無關，也不受 key 排序影響。
STAGE="src/data/qiugian-stats.json"
if ! git diff --quiet src/data/topical.json; then
  if /usr/bin/node -e '
    const {execSync}=require("child_process"), fs=require("fs");
    const head=JSON.parse(execSync("git show HEAD:src/data/topical.json",{encoding:"utf8"}));
    const work=JSON.parse(fs.readFileSync("src/data/topical.json","utf8"));
    const strip=(a)=>a.map(o=>{const c={...o}; delete c.bless_snapshot; return c;});
    const same=JSON.stringify(strip(head))===JSON.stringify(strip(work));
    process.exit(same?0:1);
  '; then
    STAGE="$STAGE src/data/topical.json"
    echo "[qiugian-cron] topical.json 僅 bless_snapshot 異動，一併提交"
  else
    # 🔴 只是「不 stage」，**絕不 checkout/reset**——那會把人手改到一半的 WIP 直接丟掉。
    echo "[qiugian-cron] ⚠️ topical.json 有 bless_snapshot 以外的異動（人手 WIP 或 topical cron 尚未推送），"
    echo "[qiugian-cron]    本輪不 stage 它、也不動它。快照下輪再補（bless_snapshot 只增不減）。"
  fi
fi

if ! git diff --quiet $STAGE; then
  git add $STAGE
  git commit -q -m "chore(qiugian): 共情數字聚合 $(date -u +%F' '%H:%M)Z [skip ci]"
  git push origin main
  echo "[qiugian-cron] 已更新並推送（$STAGE）"
else
  echo "[qiugian-cron] 數字無變化，不 commit"
fi
