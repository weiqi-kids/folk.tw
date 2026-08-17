import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reviewed = process.argv.includes('--reviewed');
const localeDir = path.join(root, 'src', 'data', reviewed ? 'locales-reviewed' : 'locales');
const output = path.join(root, 'src', 'data', reviewed ? 'poem-locales.reviewed.json' : 'poem-locales.json');
const languages = ['ja', 'ko', 'en', 'vi', 'th', 'fr', 'id'];
const systems = ['liushi_jiazi', 'guandi_lingqian', 'yuelao_lingqian', 'zizhusi_guanyin', 'baosheng_yaoqian'];
const expected = { liushi_jiazi: 60, guandi_lingqian: 100, yuelao_lingqian: 27, zizhusi_guanyin: 28, baosheng_yaoqian: 330 };

const payload = { version: 1, generatedAt: new Date().toISOString(), languages: {} };
const errors = [];

for (const language of languages) {
  payload.languages[language] = {};
  for (const system of systems) {
    const file = path.join(localeDir, language, `${system}.json`);
    if (!fs.existsSync(file)) {
      errors.push(`missing ${file}`);
      continue;
    }
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    const entries = Array.isArray(value) ? value : value.entries;
    if (!Array.isArray(entries) || entries.length !== expected[system]) {
      errors.push(`${language}/${system}: expected ${expected[system]} entries`);
      continue;
    }
    payload.languages[language][system] = entries;
  }
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}

fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, output, languages, totalPerLanguage: Object.values(expected).reduce((a, b) => a + b, 0) }, null, 2));
