import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Define the threshold for a round being "complete"
const ROUND_SERIES_COUNT = { 1: 8, 2: 4, 3: 2, 4: 1 };
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Parse command line args: --start=YYYY --end=YYYY or --year=YYYY
function parseArgs() {
    const args = process.argv.slice(2);
    const result = {};
    for (const arg of args) {
        const [key, value] = arg.split('=');
        result[key.replace('--', '')] = value !== undefined ? value : true;
    }
    return result;
}

let apiCallsMade = 0;
const MAX_API_CALLS = parseInt(process.env.MAX_API_CALLS || '15');

async function run() {
    if (!GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY is not set. Skipping LLM summary generation.");
        return;
    }

    const cwd = process.cwd();
    const playoffsDir = cwd.endsWith('playoffs') ? cwd : path.join(cwd, 'playoffs');
    const args = parseArgs();

    // Determine which years to process
    let yearsToProcess = [];
    if (args.year) {
        // Single year mode
        yearsToProcess = [parseInt(args.year)];
    } else if (args.start && args.end) {
        // Range mode
        const start = parseInt(args.start);
        const end = parseInt(args.end);
        for (let y = start; y <= end; y++) {
            yearsToProcess.push(y);
        }
    } else {
        // Default: current year only
        const yearsPath = path.join(playoffsDir, 'data', 'years.json');
        if (!fs.existsSync(yearsPath)) {
            console.warn(`years.json not found at ${yearsPath}`);
            return;
        }
        const years = JSON.parse(fs.readFileSync(yearsPath, 'utf8'));
        yearsToProcess = [years[0]];
    }

    console.log(`Processing years: ${yearsToProcess.join(', ')}`);

    for (const currentYear of yearsToProcess) {
        if (apiCallsMade >= MAX_API_CALLS) {
            console.log(`\nReached max API calls (${MAX_API_CALLS}), stopping.`);
            break;
        }
        await processYear(currentYear, playoffsDir);
    }

    console.log(`\nDone. API calls made this run: ${apiCallsMade}/${MAX_API_CALLS}`);
}

async function commitYear(year, playoffsDir) {
    try {
        const archiveDir = path.join(playoffsDir, 'data', 'archive', year.toString());
        const summariesPath = path.join(archiveDir, 'summaries.json');
        if (!fs.existsSync(summariesPath)) return;

        execSync('git add playoffs/data/archive/ playoffs/data/summaries/yearly_index.json', { cwd: path.join(playoffsDir, '..') });
        execSync(`git commit -m "[Auto] Round summaries for ${year}"`, { cwd: path.join(playoffsDir, '..'), stdio: 'pipe' });
        execSync('git push', { cwd: path.join(playoffsDir, '..'), stdio: 'pipe' });
        console.log(`Committed and pushed summaries for ${year}`);
    } catch (e) {
        // commit fails if no changes — that's fine
    }
}

async function processYear(currentYear, playoffsDir) {
    console.log(`\n=== Processing ${currentYear} ===`);
    const archiveDir = path.join(playoffsDir, 'data', 'archive', currentYear.toString());

    // Check if archive directory exists
    if (!fs.existsSync(archiveDir)) {
        console.log(`No archive directory for ${currentYear}, skipping.`);
        return;
    }

    const apiJsonPath = path.join(archiveDir, 'api.json');
    if (!fs.existsSync(apiJsonPath)) {
        console.log(`No api.json for ${currentYear}, skipping.`);
        return;
    }

    const apiData = JSON.parse(fs.readFileSync(apiJsonPath, 'utf8'));
    if (!apiData.series) {
        console.log(`No series data for ${currentYear}, skipping.`);
        return;
    }

    // Load or initialize summaries
    const summariesPath = path.join(archiveDir, 'summaries.json');
    let summaries = {};
    if (fs.existsSync(summariesPath)) {
        summaries = JSON.parse(fs.readFileSync(summariesPath, 'utf8'));
    }

    for (let roundNum = 1; roundNum <= 4; roundNum++) {
        if (apiCallsMade >= MAX_API_CALLS) {
            console.log(`Reached max API calls (${MAX_API_CALLS}), stopping. Re-run to continue.`);
            return;
        }

        const roundKey = `round${roundNum}`;
        if (summaries[roundKey]) {
            console.log(`Round ${roundNum} already summarized, skipping.`);
            continue; // Already summarized
        }

        const roundSeries = apiData.series.filter(s => s.playoffRound === roundNum);
        if (roundSeries.length === 0 || roundSeries.length < ROUND_SERIES_COUNT[roundNum]) {
            continue; // Not fully populated
        }

        const allFinished = roundSeries.every(s => s.topSeedWins === 4 || s.bottomSeedWins === 4);
        if (!allFinished) {
            continue; // Round still in progress
        }

        // Round just finished! Let's generate a summary.
        console.log(`Generating summary for Round ${roundNum} (${currentYear})...`);

        let picksData = "Picks data not found.";
        const csvPath = path.join(archiveDir, `round${roundNum}.csv`);
        if (fs.existsSync(csvPath)) {
            picksData = fs.readFileSync(csvPath, 'utf8');
        }

        const seriesInfo = roundSeries.map(s => {
            const winner = s.topSeedWins === 4 ? s.topSeedTeam.abbrev : s.bottomSeedTeam.abbrev;
            const games = s.topSeedWins + s.bottomSeedWins;
            return `${s.topSeedTeam.abbrev} vs ${s.bottomSeedTeam.abbrev}: ${winner} won in ${games} games.`;
        }).join('\n');

        const prompt = `You are a brutally honest hockey fan and commentator for a family playoff pool. 
The NHL playoffs Round ${roundNum} of ${currentYear} has just finished!

Here are the series results:
${seriesInfo}

Here are the raw CSV picks submitted by the pool participants (columns are Name, Team, Games, Team, Games, etc.):
${picksData}

Write a short, punchy 1 to 3 line summary of the round. 
Highlight any exciting or interesting outcomes (e.g. an unlikely pick paid off, someone completely blew it, or everyone agreed on a series). 
Keep it dry, witty, and highly roast-oriented for anyone who completely blew their picks. Skip the cringey enthusiasm, and deliver a sharp summary of the human participants' performance compared to the real results.
Do not output markdown bolding, just plain text.`;

        const summary = await generateGeminiResponse(prompt);
        if (summary) {
            apiCallsMade++;
            summaries[roundKey] = summary.trim();
            fs.writeFileSync(summariesPath, JSON.stringify(summaries, null, 2));
            console.log(`Saved summary for Round ${roundNum}:`, summary.trim());
            // Delay to stay under Gemini free tier rate limit (5 RPM)
            await new Promise(r => setTimeout(r, 20000));
        } else {
            console.error(`Failed to generate summary for Round ${roundNum} (${currentYear}).`);
        }
    }

	// Generate overall summary after all rounds are complete
	if (!summaries.overall || (args['regenerate-overall'] && summaries.overall_version !== 2)) {
		if (apiCallsMade >= MAX_API_CALLS) {
			console.log(`Reached max API calls (${MAX_API_CALLS}), stopping. Re-run to continue.`);
			return;
		}

		const allRoundsComplete = [1, 2, 3, 4].every(r => summaries[`round${r}`]);
		if (allRoundsComplete) {
			console.log(`Generating overall summary for ${currentYear}...`);

			// Calculate standings dynamically from csv files and apiData
			const standings = calculateStandings(apiData, archiveDir);
			const sortedPeople = Object.entries(standings)
				.sort(([, a], [, b]) => b.points - a.points);

			if (sortedPeople.length === 0) {
				console.error("Error: Standings could not be calculated (no participants found).");
				return;
			}

			// Find winner and loser
			const maxPoints = sortedPeople[0][1].points;
			const leaders = sortedPeople.filter(([, data]) => data.points === maxPoints).map(([name]) => name);

			let winnerName = leaders[0];
			let tiebreakerInfo = null;

			if (leaders.length > 1) {
				// Tiebreaker 1: games correct
				const maxGames = Math.max(...leaders.map(name => standings[name].gamesCorrect));
				const gamesLeaders = leaders.filter(name => standings[name].gamesCorrect === maxGames);
				if (gamesLeaders.length === 1) {
					winnerName = gamesLeaders[0];
				} else {
					// Tiebreaker 2: teams correct
					const maxTeams = Math.max(...gamesLeaders.map(name => standings[name].teamsCorrect));
					const teamsLeaders = gamesLeaders.filter(name => standings[name].teamsCorrect === maxTeams);
					if (teamsLeaders.length === 1) {
						winnerName = teamsLeaders[0];
					} else {
						// Joint winners
						winnerName = teamsLeaders.join(', ');
					}
				}
				tiebreakerInfo = {
					leaders: leaders,
					winner: winnerName
				};
			}

			const minPoints = sortedPeople[sortedPeople.length - 1][1].points;
			const losers = sortedPeople.filter(([, data]) => data.points === minPoints).map(([name]) => name);
			const loserName = losers.join(', ');

			// Get Cup winner
			const scfSeries = apiData.series.find(s => s.seriesLetter === 'O');
			let cupWinner = 'Unknown';
			if (scfSeries && (scfSeries.topSeedWins === 4 || scfSeries.bottomSeedWins === 4)) {
				cupWinner = scfSeries.topSeedWins === 4 ? scfSeries.topSeedTeam.abbrev : scfSeries.bottomSeedTeam.abbrev;
			}

			// Load historical index for context and updating
			const yearlyIndexPath = path.join(playoffsDir, 'data', 'summaries', 'yearly_index.json');
			let yearlyIndex = {};
			let historicalContext = "";
			if (fs.existsSync(yearlyIndexPath)) {
				yearlyIndex = JSON.parse(fs.readFileSync(yearlyIndexPath, 'utf8'));
				historicalContext = getHistoricalContext(yearlyIndex, currentYear);
			}

			const overallPrompt = `You are a brutally honest hockey fan and commentator for a family playoff pool. 
The ${currentYear} NHL playoffs have concluded!

Stanley Cup Champion: ${cupWinner}

Final Pool Standings:
${sortedPeople.map(([name, data], i) => `${i + 1}. ${name}: ${data.points} pts (${data.teamsCorrect} teams, ${data.gamesCorrect} games correct)`).join('\n')}

Pool Winner: ${winnerName} with ${maxPoints} points
Pool Loser: ${loserName} with ${minPoints} points
${historicalContext}
Write a 3-5 sentence summary of the entire playoffs. Tell the story of the winner's dominant performance, roast the loser, and highlight anyone else who stood out (great picks, terrible picks, close races, etc.). Keep it dry, witty, and highly roast-oriented. Do not output markdown bolding, just plain text.`;

			const overallSummary = await generateGeminiResponse(overallPrompt);
			if (overallSummary) {
				apiCallsMade++;
				summaries.overall = overallSummary.trim();
				summaries.overall_version = 2;
				fs.writeFileSync(summariesPath, JSON.stringify(summaries, null, 2));
				console.log(`Saved overall summary for ${currentYear}:`, overallSummary.trim());

				// Update yearly_index.json
				const pointsMap = {};
				for (const [name, data] of Object.entries(standings)) {
					pointsMap[name] = data.points;
				}

				yearlyIndex[currentYear.toString()] = {
					year: currentYear,
					poolWinner: winnerName,
					poolLoser: losers.length === 1 ? losers[0] : losers,
					cupWinner: cupWinner,
					tiebreaker: tiebreakerInfo,
					points: pointsMap
				};
				fs.writeFileSync(yearlyIndexPath, JSON.stringify(yearlyIndex, null, 2));
				console.log(`Updated yearly_index.json with ${currentYear} results.`);

				// Update api.json status
				apiData.status = 'complete';
				fs.writeFileSync(apiJsonPath, JSON.stringify(apiData, null, 2));
				console.log(`Updated api.json status to 'complete'.`);

				await new Promise(r => setTimeout(r, 20000));
			} else {
				console.error(`Failed to generate overall summary for ${currentYear}.`);
			}
		} else {
			console.log(`Not all rounds have summaries for ${currentYear}, skipping overall.`);
		}
	} else {
		console.log(`Overall summary already exists for ${currentYear}, skipping.`);
	};

    await commitYear(currentYear, playoffsDir);
}

async function generateGeminiResponse(prompt, retries = 3) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.7 }
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                if ((response.status === 429 || response.status === 503) && attempt < retries) {
                    const retryDelay = response.status === 429 ? 60000 : 5000;
                    console.error(`Gemini API ${response.status} on attempt ${attempt}/${retries}, retrying in ${retryDelay / 1000}s...`);
                    await new Promise(r => setTimeout(r, retryDelay));
                    continue;
                }
                console.error("Gemini API Error:", response.status, errorBody);
                return null;
            }

            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
        } catch (e) {
            console.error("Fetch error:", e);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }
            return null;
        }
    }
}

// Map to standardize names
function standardizeName(name) {
    if (!name) return '';
    const lowerName = name.trim().toLowerCase();
    switch (lowerName) {
        case 'dad':
            return 'Derrick';
        case 'mom':
        case 'chris':
            return 'Chrissy';
        case 'steph':
            return 'Stephanie';
        case 'm.c.b.':
            return 'Marc';
        default:
            return lowerName.charAt(0).toUpperCase() + lowerName.slice(1);
    }
}

// Minimal CSV line parser handling quotes
function parseCsvLine(line) {
    const row = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            row.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    row.push(current.trim());
    return row;
}

// Calculates standings from csv files and apiData
function calculateStandings(apiData, archiveDir) {
    const SCORING = [
        { team: 1, games: 2, bonus: 3 },  // Round 1
        { team: 2, games: 3, bonus: 4 },  // Round 2
        { team: 3, games: 4, bonus: 5 },  // Round 3
        { team: 4, games: 5, bonus: 6 },  // Round 4
    ];

    const ALL_ROUNDS_SERIES = [
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
        ['I', 'J', 'K', 'L'],
        ['M', 'N'],
        ['O']
    ];

    const standings = {};

    for (let roundNum = 1; roundNum <= 4; roundNum++) {
        const csvPath = path.join(archiveDir, `round${roundNum}.csv`);
        if (!fs.existsSync(csvPath)) continue;

        const csvContent = fs.readFileSync(csvPath, 'utf8');
        const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length <= 1) continue;

        const seriesLetters = ALL_ROUNDS_SERIES[roundNum - 1];
        const scoring = SCORING[roundNum - 1];

        for (let i = 1; i < lines.length; i++) {
            const row = parseCsvLine(lines[i]);
            if (row.length < 2) continue;
            const person = standardizeName(row[1]);
            if (!person) continue;

            if (!standings[person]) {
                standings[person] = { points: 0, teamsCorrect: 0, gamesCorrect: 0 };
            }

            for (let sIdx = 0; sIdx < seriesLetters.length; sIdx++) {
                const letter = seriesLetters[sIdx];
                const series = apiData.series.find(s => s.seriesLetter === letter);
                if (!series) continue;

                const pickTeamRaw = row[2 + sIdx * 2];
                const pickGamesRaw = row[3 + sIdx * 2];
                if (!pickTeamRaw || !pickGamesRaw) continue;

                const pickGames = parseInt(pickGamesRaw, 10);
                if (isNaN(pickGames)) continue;

                const isOver = series.topSeedWins === 4 || series.bottomSeedWins === 4;
                if (!isOver) continue;

                const actualWinner = series.topSeedWins === 4 ? series.topSeedTeam.abbrev : series.bottomSeedTeam.abbrev;
                const actualGames = series.topSeedWins + series.bottomSeedWins;

                const topAbbrev = series.topSeedTeam?.abbrev || '';
                const topName = series.topSeedTeam?.name?.default || '';
                const bottomAbbrev = series.bottomSeedTeam?.abbrev || '';
                const bottomName = series.bottomSeedTeam?.name?.default || '';

                const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                let cleanPick = pickTeamRaw.trim();
                const parenIdx = cleanPick.indexOf('(');
                if (parenIdx !== -1) {
                    cleanPick = cleanPick.substring(0, parenIdx).trim();
                }

                const cleanPickNorm = norm(cleanPick);
                const topAbbrevNorm = norm(topAbbrev);
                const topNameNorm = norm(topName);
                const bottomAbbrevNorm = norm(bottomAbbrev);
                const bottomNameNorm = norm(bottomName);

                let pickedAbbrev = null;
                if (cleanPickNorm === topAbbrevNorm || cleanPickNorm === topNameNorm) {
                    pickedAbbrev = topAbbrev;
                } else if (cleanPickNorm === bottomAbbrevNorm || cleanPickNorm === bottomNameNorm) {
                    pickedAbbrev = bottomAbbrev;
                } else if (topNameNorm && (topNameNorm.includes(cleanPickNorm) || cleanPickNorm.includes(topNameNorm))) {
                    pickedAbbrev = topAbbrev;
                } else if (bottomNameNorm && (bottomNameNorm.includes(cleanPickNorm) || cleanPickNorm.includes(bottomNameNorm))) {
                    pickedAbbrev = bottomAbbrev;
                }

                if (!pickedAbbrev) continue;

                const correctTeam = pickedAbbrev === actualWinner;
                const correctGames = pickGames === actualGames;

                let pointsEarned = 0;
                if (correctTeam) {
                    pointsEarned += scoring.team;
                    standings[person].teamsCorrect++;
                }
                if (correctGames) {
                    pointsEarned += scoring.games;
                    standings[person].gamesCorrect++;
                }
                if (correctTeam && correctGames) {
                    pointsEarned += scoring.bonus;
                }
                standings[person].points += pointsEarned;
            }
        }
    }

    return standings;
}

// Extracts historical win/loss/points stats from yearly_index.json
function getHistoricalContext(yearlyIndex, currentYear) {
    const playerStats = {};

    const years = Object.keys(yearlyIndex)
        .map(y => parseInt(y, 10))
        .filter(y => y < currentYear && y !== 3000 && y !== 2005)
        .sort((a, b) => a - b);

    for (const y of years) {
        const data = yearlyIndex[y.toString()];
        if (!data) continue;

        const winners = Array.isArray(data.poolWinner) 
            ? data.poolWinner 
            : (data.poolWinner ? [data.poolWinner] : []);
        for (const w of winners) {
            if (w === "In Progress" || w === "TBD") continue;
            if (!playerStats[w]) playerStats[w] = { wins: [], losses: [], pointsByYear: {} };
            playerStats[w].wins.push(y);
        }

        const losers = Array.isArray(data.poolLoser)
            ? data.poolLoser
            : (data.poolLoser ? [data.poolLoser] : []);
        for (const l of losers) {
            if (!playerStats[l]) playerStats[l] = { wins: [], losses: [], pointsByYear: {} };
            playerStats[l].losses.push(y);
        }

        if (data.points) {
            for (const [player, pts] of Object.entries(data.points)) {
                if (!playerStats[player]) playerStats[player] = { wins: [], losses: [], pointsByYear: {} };
                playerStats[player].pointsByYear[y] = pts;
            }
        }
    }

    let contextStr = "\nHistorical Pool Stats and Context (use these to make the summary interesting, e.g. pointing out long droughts, back-to-back winners, total championships, or historical rivalries):\n";
    for (const [player, stats] of Object.entries(playerStats)) {
        const winCount = stats.wins.length;
        const lossCount = stats.losses.length;
        
        let playerStr = `- ${player}: `;
        if (winCount > 0) {
            playerStr += `Has won ${winCount} championship${winCount > 1 ? 's' : ''} (${stats.wins.join(', ')}). `;
        } else {
            playerStr += `Has never won a championship. `;
        }

        if (lossCount > 0) {
            playerStr += `Has finished in last place ${lossCount} time${lossCount > 1 ? 's' : ''} (${stats.losses.join(', ')}). `;
        }

        const lastYear = currentYear - 1;
        if (stats.pointsByYear[lastYear] !== undefined) {
            playerStr += `Last year (${lastYear}), they scored ${stats.pointsByYear[lastYear]} points.`;
        }

        contextStr += playerStr + "\n";
    }

    return contextStr;
}

run().catch(console.error);
