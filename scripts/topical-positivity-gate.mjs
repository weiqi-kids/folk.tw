#!/usr/bin/env node
// 時事層「正向議題」閘：判定一個時事議題能否立成集體祈福頁。
//
// 定位鐵則（folk＝可查證的民俗數位廟埕）：時事祈福頁只做「為平安／復原／集氣」的正向祈福，
// 絕不對災難算命／解吉凶、不變現、不製造對立、不消費痛苦。此閘就是那道把關。
//
// 用法：
//   node scripts/topical-positivity-gate.mjs "花蓮發生規模6地震，為災區平安祈福"
//   echo "某黨候選人爆料醜聞" | node scripts/topical-positivity-gate.mjs
//   node scripts/topical-positivity-gate.mjs --rules "颱風來襲，為北部平安集氣"   # 只用規則、不呼叫 LLM
//
// 輸出（stdout，永遠是單行 JSON）：{ "verdict": "pass"|"block", "reason": "...", "by": "llm"|"rules" }
// 退出碼：pass → 0；block → 1；用法錯 → 2。之後可接進「偵測暴增→過閘→自動開頁→通知」自動流程。
//
// 判準（同時寫進 LLM prompt 與規則）：
//   pass  = 集體平安／復原／希望／集氣：地震颱風平安、災後重建、為選手集氣、考季加油等正向框。
//   block = 政治／選舉／黨派、爭議對立、個人醜聞八卦、幸災樂禍／仇恨、對災難算吉凶、
//           任何製造對立或消費他人痛苦。就算是真災難，只有「為平安／為重建」的正向框才 pass。

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ── 讀入議題描述：argv（去掉旗標）優先，否則讀 stdin ──
const args = process.argv.slice(2);
let useRulesOnly = false;
const positional = [];
for (const a of args) {
  if (a === '--rules') useRulesOnly = true;
  else positional.push(a);
}
let topic = positional.join(' ').trim();
if (!topic) {
  try {
    topic = readFileSync(0, 'utf8').trim();
  } catch {
    /* no stdin */
  }
}
if (!topic) {
  process.stderr.write('用法：topical-positivity-gate.mjs [--rules] "議題描述"（或用 stdin 餵入）\n');
  process.exit(2);
}

const PROMPT = `你是台灣民俗網站「神酷（folk.tw）」的「正向議題」把關者。這個網站在真實集體焦慮時刻（大地震／颱風／災難／全民關注時刻）會立一個「為○○祈福／集氣」的集體祈福頁。你要判定「以下這個時事議題，適不適合立成一個正向的集體祈福頁」。

網站鐵則：祈福頁只做「為平安／復原／希望／集氣」的正向祈福。沒有求籤、沒有吉凶、不算命、不變現、語氣莊重、不製造對立、不消費他人痛苦。

判準：
- pass（可立祈福頁）＝框架是集體平安／復原／希望／集氣。例：地震後為災區平安祈福、颱風前為平安集氣、災後為家園重建集氣、為出賽選手集氣、考季為考生加油。
- block（不可）＝任何以下情形：政治／選舉／政黨／候選人、爭議對立、個人醜聞八卦、幸災樂禍／仇恨／攻擊、對災難算吉凶或算命、任何製造對立或消費他人痛苦的框架。
- 重要：就算是真實的重大災難，也只有「為平安／為復原」這種正向框才 pass；若框架是究責、對立、看熱鬧、算命，即使事件為真也要 block。
- 若無法明確判定為正向集氣框架，一律 block（寧可保守）。

只輸出一行 JSON，不要任何其他文字、不要 markdown 圍籬：
{"verdict":"pass"或"block","reason":"一句中文理由"}

議題：${topic}`;

// ── 規則版（LLM 不可用或 --rules 時的後備；預設保守，判不出正向框就 block）──
function ruleVerdict(text) {
  const t = text.toLowerCase();
  const blockPatterns = [
    ['政治／選舉／黨派', /(選舉|大選|候選人|投票|政黨|國民黨|民進黨|民眾黨|藍營|綠營|白營|立委|議員|市長選|總統選|罷免|黨主席)/],
    ['爭議對立／究責攻擊', /(爭議|對立|開戰|口水戰|互嗆|嗆聲|甩鍋|究責|下台|抵制|仇恨|嗆|戰翻|炎上|出征)/],
    ['個人醜聞八卦', /(醜聞|八卦|外遇|劈腿|緋聞|爆料|私生活|偷吃|婚變|狗仔)/],
    ['幸災樂禍／消費痛苦', /(幸災樂禍|活該|報應|看笑話|看熱鬧)/],
    ['對災難算吉凶／算命', /(算命|吉凶|運勢|國運籤|預言|命中註定|求籤|問卜|擲筊問)/],
  ];
  for (const [label, re] of blockPatterns) {
    if (re.test(t)) return { verdict: 'block', reason: `命中攔截類別：${label}`, by: 'rules' };
  }
  const passRe = /(祈福|集氣|平安|加油|打氣|復原|重建|救災|援助|挺住|一起撐|為.*平安|為.*祈福|考季|考生|選手|出賽|奪牌)/;
  if (passRe.test(t)) {
    return { verdict: 'pass', reason: '框架為集體平安／復原／集氣，屬正向祈福', by: 'rules' };
  }
  return { verdict: 'block', reason: '無法判定為正向集氣框架，保守攔下', by: 'rules' };
}

// ── LLM 版：headless claude -p（參考 seo-ops/bin/seo-brain.sh 的呼叫方式）──
function llmVerdict(text) {
  const r = spawnSync('claude', ['-p', PROMPT, '--model', 'claude-sonnet-5'], {
    encoding: 'utf8',
    env: { ...process.env, IS_SANDBOX: '1' },
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
  if (r.error || r.status !== 0 || !r.stdout) return null;
  const m = r.stdout.match(/\{[\s\S]*?"verdict"[\s\S]*?\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (o.verdict !== 'pass' && o.verdict !== 'block') return null;
    return { verdict: o.verdict, reason: String(o.reason || '').trim() || '(無理由)', by: 'llm' };
  } catch {
    return null;
  }
}

let result = null;
if (!useRulesOnly) result = llmVerdict(topic);
if (!result) result = ruleVerdict(topic); // LLM 不可用／解析失敗 → 規則後備

process.stdout.write(JSON.stringify(result) + '\n');
process.exit(result.verdict === 'pass' ? 0 : 1);
