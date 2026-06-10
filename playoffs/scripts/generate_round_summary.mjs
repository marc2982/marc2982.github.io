import fs from 'fs';
import path from 'path';

// Define the threshold for a round being "complete"
const ROUND_SERIES_COUNT = { 1: 8, 2: 4, 3: 2, 4: 1 };
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Parse command line args: --start=YYYY --end=YYYY or --year=YYYY
function parseArgs() {
    const args = process.argv.slice(2);
    const result = {};
    for (const arg of args) {
        const [key, value] = arg.split('=');
        result[key.replace('--', '')] = value;
    }
    return result;
}

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
        await processYear(currentYear, playoffsDir);
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
            summaries[roundKey] = summary.trim();
            fs.writeFileSync(summariesPath, JSON.stringify(summaries, null, 2));
            console.log(`Saved summary for Round ${roundNum}:`, summary.trim());
            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 1000));
        } else {
            console.error(`Failed to generate summary for Round ${roundNum} (${currentYear}).`);
        }
    }

    // Generate overall summary after all rounds are complete
    if (!summaries.overall) {
        const allRoundsComplete = [1, 2, 3, 4].every(r => summaries[`round${r}`]);
        if (allRoundsComplete) {
            console.log(`Generating overall summary for ${currentYear}...`);

            // Load yearly summary data
            const yearlySummaryPath = path.join(playoffsDir, 'data', 'summaries', `${currentYear}.json`);
            let yearlyData = {};
            if (fs.existsSync(yearlySummaryPath)) {
                yearlyData = JSON.parse(fs.readFileSync(yearlySummaryPath, 'utf8'));
            }

            // Get final standings
            const personSummaries = yearlyData.personSummaries || {};
            const sortedPeople = Object.entries(personSummaries)
                .sort(([, a], [, b]) => b.points - a.points);
            
            const winner = sortedPeople[0];
            const loser = sortedPeople[sortedPeople.length - 1];

            // Get all series results
            const allSeries = [];
            const rounds = yearlyData.rounds || [];
            rounds.forEach(round => {
                (round.serieses || []).forEach(series => {
                    const winTeam = series.topSeedWins === 4 ? series.topSeed : series.bottomSeed;
                    const loseTeam = series.topSeedWins === 4 ? series.bottomSeed : series.topSeed;
                    allSeries.push({
                        round: round.number,
                        winner: winTeam,
                        loser: loseTeam,
                        games: series.topSeedWins + series.bottomSeedWins
                    });
                });
            });

            const cupWinner = allSeries.find(s => s.round === 4)?.winner || 'Unknown';

            const overallPrompt = `You are a brutally honest hockey fan and commentator for a family playoff pool. 
The ${currentYear} NHL playoffs have concluded!

Stanley Cup Champion: ${cupWinner}

Final Pool Standings:
${sortedPeople.map(([name, data], i) => `${i + 1}. ${name}: ${data.points} pts (${data.teamsCorrect} teams, ${data.gamesCorrect} games correct)`).join('\n')}

Pool Winner: ${winner[0]} with ${winner[1].points} points
Pool Loser: ${loser[0]} with ${loser[1].points} points

Write a 3-5 sentence summary of the entire playoffs. Tell the story of the winner's dominant performance, roast the loser, and highlight anyone else who stood out (great picks, terrible picks, close races, etc.). Keep it dry, witty, and highly roast-oriented. Do not output markdown bolding, just plain text.`;

            const overallSummary = await generateGeminiResponse(overallPrompt);
            if (overallSummary) {
                summaries.overall = overallSummary.trim();
                fs.writeFileSync(summariesPath, JSON.stringify(summaries, null, 2));
                console.log(`Saved overall summary for ${currentYear}:`, overallSummary.trim());
                await new Promise(r => setTimeout(r, 1000));
            } else {
                console.error(`Failed to generate overall summary for ${currentYear}.`);
            }
        } else {
            console.log(`Not all rounds have summaries for ${currentYear}, skipping overall.`);
        }
    } else {
        console.log(`Overall summary already exists for ${currentYear}, skipping.`);
    }
}

async function generateGeminiResponse(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
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
            console.error("Gemini API Error:", response.status, await response.text());
            return null;
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } catch (e) {
        console.error("Fetch error:", e);
        return null;
    }
}

run().catch(console.error);
