// Manually add (late) picks for someone straight into a round CSV.
//   node scripts/add_picks.mjs --year=2026 --round=2 --name=Jake MTL:6 CAR:5 COL:6 VGK:7
//   Contingency picks: NYR@BOS:7  ->  "NYR (vs BOS)"
// Then commit and push the changed CSV; the site picks it up on the next load.
import fs from 'fs';
import path from 'path';
import { appendPicksRow } from './lib/picksCsv.mjs';

const cwd = process.cwd();
const playoffsDir = cwd.endsWith('playoffs') ? cwd : path.join(cwd, 'playoffs');
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const specs = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const year = arg('year');
const round = arg('round');
const name = arg('name');
if (!/^\d{4}$/.test(year) || !/^[1-4]$/.test(round) || !name || !specs.length) {
	console.error('Usage: node scripts/add_picks.mjs --year=2026 --round=2 --name=Jake TEAM:games [TEAM:games ...]');
	process.exit(1);
}

const file = path.join(playoffsDir, 'data', 'archive', year, `round${round}.csv`);
const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
try {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, appendPicksRow(existing, name, specs));
	console.log(`Added ${name}'s round ${round} picks to ${path.relative(process.cwd(), file)}. Commit and push to publish.`);
} catch (e) {
	console.error(e.message);
	process.exit(1);
}
