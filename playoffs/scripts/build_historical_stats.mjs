import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const playoffsDir = cwd.endsWith('playoffs') ? cwd : path.join(cwd, 'playoffs');
const summariesDir = path.join(playoffsDir, 'data', 'summaries');
const outputPath = path.join(summariesDir, 'historical_stats.json');

const players = {};

// Scan for year summary files
const files = fs.readdirSync(summariesDir).filter(f => /^\d{4}\.json$/.test(f)).sort();

for (const file of files) {
    const year = parseInt(file.replace('.json', ''), 10);
    if (year === 2005) continue; // lockout

    const summary = JSON.parse(fs.readFileSync(path.join(summariesDir, file), 'utf8'));
    if (!summary.personSummaries) continue;

    // Skip years with no real data (all 0 points)
    const allZero = Object.values(summary.personSummaries).every(p => p.points === 0);
    if (allZero) continue;

    // Build ranked list to find last place
    const entries = Object.entries(summary.personSummaries);
    const ranked = entries
        .filter(([, p]) => p.rank != null)
        .sort(([, a], [, b]) => a.rank - b.rank);

    const lastRank = ranked.length > 0 ? ranked[ranked.length - 1][1].rank : 0;

    for (const [key, person] of entries) {
        const name = person.person || key;
        if (!name || name === 'undefined') continue;

        if (!players[name]) {
            players[name] = {
                wins: [],
                losses: [],
                seconds: [],
                thirds: [],
                yearsPlayed: 0,
                totalPoints: 0,
                pointsByYear: {},
            };
        }

        const p = players[name];
        p.yearsPlayed++;
        p.totalPoints += person.points;
        p.pointsByYear[year] = person.points;

        if (person.rank === 1) p.wins.push(year);
        if (person.rank === 2) p.seconds.push(year);
        if (person.rank === 3) p.thirds.push(year);
        if (person.rank === lastRank && ranked.length > 1) p.losses.push(year);
    }
}

const output = { players };
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

const playerCount = Object.keys(players).length;
const yearCount = files.length - 1; // exclude 2005
console.log(`✅ Generated historical_stats.json: ${playerCount} players across ${yearCount} years`);
