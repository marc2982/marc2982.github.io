// Merges hand/Claude-written summaries into data/archive/<year>/summaries.json.
//   node scripts/apply_summaries.mjs --year=2024 --file=draft.json
// draft.json: { "round1": "...", "round2": "...", "round3": "...", "round4": "...", "overall": "..." }
import fs from 'fs';
import path from 'path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const playoffsDir = process.cwd().endsWith('playoffs') ? process.cwd() : path.join(process.cwd(), 'playoffs');
const target = path.join(playoffsDir, 'data', 'archive', String(args.year), 'summaries.json');
const draft = JSON.parse(fs.readFileSync(args.file, 'utf8'));
const allowed = ['round1', 'round2', 'round3', 'round4', 'overall'];

const existing = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {};
for (const [key, value] of Object.entries(draft)) {
	if (!allowed.includes(key)) throw new Error(`Unexpected key ${key}`);
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Empty text for ${key}`);
	if (/\*\*/.test(value)) throw new Error(`${key} contains markdown bold`);
	existing[key] = value.trim();
}
// Same shape the Gemini generator writes; version matches so --regenerate-overall leaves it alone.
if (draft.overall) existing.overall_version = 3;
const ordered = {};
for (const key of [...allowed, 'overall_version']) if (key in existing) ordered[key] = existing[key];
fs.writeFileSync(target, JSON.stringify(ordered, null, 2));
console.log(`Wrote ${Object.keys(draft).join(', ')} to ${path.relative(playoffsDir, target)}`);
