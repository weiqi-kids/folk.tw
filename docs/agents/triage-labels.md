# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## 本 repo 的現況（2026-08-20 設定時查證）

- **`triage` skill 目前沒有啟用**（mattpocock-skills 這個 plugin 只啟用了一部分 skill，不含 triage）。
  這份對照表是先備著的；要真的用 triage，先確認它出現在可用 skills 清單裡。
- **上表五個標籤裡，GitHub 上目前只有 `wontfix` 真的存在。**
  其餘四個尚未建立——`triage` 第一次要套用時 `gh label create` 建即可，
  **不要**因為套不上就改去套既有的 `question`／`help wanted`（語意不同，會汙染既有分類）。
  標籤現況一律用指令查，別讀這行：`gh label list`
- 既有標籤 `weekly-report` 屬於自動化週報，與 triage 無關，別納入這套詞彙。
