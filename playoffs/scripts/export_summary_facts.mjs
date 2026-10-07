// Prints the fact sheet (pre-scored results + verified trends) used to write round/overall roasts.
//   node scripts/export_summary_facts.mjs --year=2024 [--round=1|2|3|4|overall]
import path from 'path';
import { buildFactsText } from './lib/summaryFacts.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const playoffsDir = process.cwd().endsWith('playoffs') ? process.cwd() : path.join(process.cwd(), 'playoffs');
const year = Number(args.year);
const which = args.round ?? 'all';
const targets = which === 'all' ? [1, 2, 3, 4, 'overall'] : [which === 'overall' ? 'overall' : Number(which)];
for (const t of targets) {
	console.log(`\n######## ${year} ${t === 'overall' ? 'OVERALL' : 'ROUND ' + t} ########`);
	console.log(await buildFactsText(playoffsDir, year, t, { compact: 'compact' in args }));
}
