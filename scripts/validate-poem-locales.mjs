import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataDir = path.join(root, 'src', 'data');
const localeDir = path.join(dataDir, process.argv.includes('--reviewed') ? 'locales-reviewed' : 'locales');
const expectedLanguages = ['ja', 'ko', 'en', 'vi', 'th', 'fr', 'id'];
const systemFiles = {
  liushi_jiazi: 60,
  guandi_lingqian: 100,
  yuelao_lingqian: 27,
  zizhusi_guanyin: 28,
  baosheng_yaoqian: 330,
};

const poems = JSON.parse(fs.readFileSync(path.join(dataDir, 'poems.json'), 'utf8'));
const medicine = JSON.parse(fs.readFileSync(path.join(dataDir, 'yaoqian.import.json'), 'utf8'));
const sourceIds = new Map([
  ...poems.map((item) => [item.id, { system: item.system, kind: 'literary' }]),
  ...medicine.map((item) => [item.id, { system: 'baosheng_yaoqian', kind: 'medicine' }]),
]);

const failures = [];
const warnings = [];
const report = [];

function readEntries(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.entries)) return value.entries;
  throw new Error(`${file}: expected an array or {entries: []}`);
}

function expectedLines(language) {
  return language === 'ja' || language === 'ko' ? 3 : 4;
}

function vietnameseSyllables(line) {
  return line.trim().split(/\s+/u).filter(Boolean).length;
}

if (!fs.existsSync(localeDir)) {
  failures.push(`missing directory: ${localeDir}`);
} else {
  for (const language of expectedLanguages) {
    const dir = path.join(localeDir, language);
    if (!fs.existsSync(dir)) {
      warnings.push(`${language}: directory not created yet`);
      continue;
    }

    const all = [];
    for (const system of Object.keys(systemFiles)) {
      const file = path.join(dir, `${system}.json`);
      if (!fs.existsSync(file)) {
        warnings.push(`${language}/${system}: file not created yet`);
        continue;
      }
      let entries;
      try {
        entries = readEntries(file);
      } catch (error) {
        failures.push(String(error.message));
        continue;
      }
      const expectedCount = systemFiles[system];
      if (entries.length !== expectedCount) {
        failures.push(`${language}/${system}: expected ${expectedCount}, got ${entries.length}`);
      }
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') {
          failures.push(`${language}/${system}: non-object entry`);
          continue;
        }
        const source = sourceIds.get(entry.sourceId);
        if (!source) failures.push(`${language}/${system}: unknown sourceId ${entry.sourceId}`);
        if (source && source.system !== system) failures.push(`${language}/${system}: system mismatch for ${entry.sourceId}`);
        if (source && source.kind !== entry.kind) failures.push(`${language}/${system}: kind mismatch for ${entry.sourceId}`);
        if (!Array.isArray(entry.lines) || entry.lines.length !== expectedLines(language)) {
          failures.push(`${language}/${system}: ${entry.sourceId ?? '(missing id)'} expected ${expectedLines(language)} lines`);
        }
        if (language === 'vi' && system !== 'baosheng_yaoqian' && Array.isArray(entry.lines)) {
          const meter = entry.lines.map(vietnameseSyllables).join('-');
          if (meter !== '6-8-6-8') failures.push(`${language}/${system}: ${entry.sourceId ?? '(missing id)'} expected Lục bát 6-8-6-8, got ${meter}`);
        }
        if (entry.kind === 'medicine' && entry.safetyLink !== entry.sourceId) {
          failures.push(`${language}/${system}: ${entry.sourceId ?? '(missing id)'} must link safetyLink to itself`);
        }
        if (entry.kind === 'medicine' && /\d|\b(?:mg|ml|kg)\b|\d\s*g|錢|分|毫升|克|煎服|每次|dosage|dosis|liều\s*lượng/i.test((entry.lines ?? []).join(' '))) {
          failures.push(`${language}/${system}: ${entry.sourceId ?? '(missing id)'} contains dosage-like content`);
        }
        all.push(entry);
      }
    }
    const ids = all.map((entry) => entry.sourceId);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length) failures.push(`${language}: duplicate sourceId ${[...new Set(duplicateIds)].join(', ')}`);
    const missingIds = [...sourceIds.keys()].filter((id) => !ids.includes(id));
    if (missingIds.length) failures.push(`${language}: missing ${missingIds.length} sourceId(s)`);
    const textCounts = new Map();
    for (const entry of all) {
      const text = (entry.lines ?? []).join('\n').trim();
      if (!text) continue;
      textCounts.set(text, (textCounts.get(text) ?? 0) + 1);
    }
    const repeated = [...textCounts.values()].filter((count) => count > 1).length;
    if (repeated) warnings.push(`${language}: ${repeated} repeated poem text(s); review for template reuse`);
    report.push({ language, entries: all.length });
  }
}

console.log(JSON.stringify({
  expectedSourceCount: sourceIds.size,
  report,
  warnings,
  failures,
  ok: failures.length === 0,
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
