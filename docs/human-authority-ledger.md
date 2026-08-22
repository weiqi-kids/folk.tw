# folk.tw 真人背書台帳

> 內部工作台帳，不是公開專家名錄。所有姓名、職稱、機構、聯絡方式與審閱結果預設留空；取得本人／機構明確同意前，不得公開或寫入網站 schema。

## 1. 狀態

```text
blank → candidate → contacted → consent_pending → reviewing → approved
                                           ↘ declined / closed
```

- `candidate` 只表示角色與題材適配，不表示對方已知情或願意合作。
- `approved` 必須有審閱範圍、日期、修訂結果與公開方式同意。
- `closed` 必須留下結束原因；不刪除歷史，避免下次重複打擾或誤以為已合作。

## 2. 候選角色（不填人名）

| role_id | 角色類型 | 適合題材 | 需要核對的身分來源 | 初始狀態 | 姓名／機構 |
|---|---|---|---|---|---|
| local-history | 地方文史工作者 | 地方祭典沿革、地區差異、口述史 | 個人公開履歷／所屬機構／作品 | blank | |
| temple-culture | 廟方文化工作者或祭典主辦 | 該廟／該祭典的年度做法與公告 | 廟方官網／主辦公告／本人確認 | blank | |
| heritage | 博物館／文化資產工作者 | 文資個案、典藏描述、登錄脈絡 | 機構公開頁／職務頁 | blank | |
| scholar | 民俗／宗教／地方史研究者 | 歷史脈絡、術語、跨地區比較 | 學校／研究機構／出版品 | blank | |
| qian-practice | 籤詩與信仰實務工作者 | 求籤語境、儀式差異、使用限制 | 廟方或機構公開資料／本人確認 | blank | |

## 3. 每個合作案的欄位

```text
authority_id
role_id
name
organization
identity_source_url
contact_route
status
topic_scope
geographic_scope
review_scope
requested_at
consent_at
reviewed_at
public_name_consent
public_title_consent
public_org_consent
public_quote_consent
source_or_interview_url
revision_record
expiry_or_recheck_at
withdrawal_note
```

空白不是遺漏，而是「尚未取得權威」。不得用角色名稱代替真人姓名，也不得把邀請寄出寫成審閱完成。

## 4. 合作階梯

1. **指定段落核閱**：只確認某一個 claim packet，不要求公開姓名。
2. **具名審閱**：對方確認姓名、職稱、機構與公開方式，網站才可顯示。
3. **掛名專欄／訪談**：另立編輯與授權紀錄，不能把訪談內容自動當成全臺規則。
4. **一手資料合作**：確認資料所有權、授權、更新責任與撤回流程後，才進入長期資料資產。

## 5. Codex 可準備的邀請包

每個候選角色都可以先產生一份不寄出的草稿，內容只有：

- 找對方的原因與預計題目。
- 希望核閱的具體段落與來源包。
- 所需時間、回覆格式與可拒絕的範圍。
- 姓名／職稱／機構／引言是否公開的選項。
- 不會把地方做法泛化、不會把未核定日期寫成確定資訊的承諾。

寄送、洽談、同意與最終署名由站主或合作方完成。

## 6. 公開前 gate

只有以下條件全部成立，才可在頁面或 JSON-LD 出現 `author`、`reviewedBy`、專家頭銜或「經審閱」字樣：

- 身分可由公開來源或本人／機構確認。
- 審閱範圍與完成日期有紀錄。
- 對外顯示方式有明確同意。
- 文字已依審閱意見修訂，且仍逐句掛權威來源。
- 退出、撤回或來源過期時有下線方案。

在此之前，網站維持既有 Organization author 與來源標示，不新增虛構的個人背書。
