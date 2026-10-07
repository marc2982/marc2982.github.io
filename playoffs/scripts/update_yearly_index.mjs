// Recomputes a finished year's entry in data/summaries/yearly_index.json from its
// CSV picks + api.json, using the same scoring code as the website.
//   node scripts/update_yearly_index.mjs            (current year from data/years.json)
//   node scripts/update_yearly_index.mjs --year=2026
import fs from 'fs';
import path from 'path';
import { calculateYearSummary, indexEntryFromSummary } from './lib/yearSummary.mjs';

const cwd = process.cwd();
const playoffsDir = cwd.endsWith('playoffs') ? cwd : path.join(cwd, 'playoffs');
const indexPath = path.join(playoffsDir, 'data', 'summaries', 'yearly_index.json');

const yearArg = process.argv.find((arg) => arg.startsWith('--year='));
const year = yearArg
	? yearArg.split('=')[1]
	: JSON.parse(fs.readFileSync(path.join(playoffsDir, 'data', 'years.json'), 'utf8'))[0];

const archiveDir = path.join(playoffsDir, 'data', 'archive', String(year));
const { rounds, summary } = await calculateYearSummary(year, archiveDir);
const entry = indexEntryFromSummary(year, summary, rounds);

if (!entry) {
	console.log(`${year} playoffs aren't finished yet; leaving yearly_index.json alone.`);
	process.exit(0);
}

const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
index[String(year)] = entry;
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
console.log(`Updated ${year}: winner ${entry.poolWinner}, loser ${[].concat(entry.poolLoser).join(', ')}, cup ${entry.cupWinner}`);
