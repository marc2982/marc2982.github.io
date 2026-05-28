import fs from 'fs';
import path from 'path';

// Define the threshold for a round being "complete"
const ROUND_SERIES_COUNT = { 1: 8, 2: 4, 3: 2, 4: 1 };
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function run() {
    if (!GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY is not set. Skipping LLM summary generation.");
        return;
    }

    const cwd = process.cwd();
    const playoffsDir = cwd.endsWith('playoffs') ? cwd : path.join(cwd, 'playoffs');

    const yearsPath = path.join(playoffsDir, 'data', 'years.json');
    if (!fs.existsSync(yearsPath)) {
        console.warn(`years.json not found at ${yearsPath}`);
        return;
    }

    const years = JSON.parse(fs.readFileSync(yearsPath, 'utf8'));
    const currentYear = years[0];
    const archiveDir = path.join(playoffsDir, 'data', 'archive', currentYear);

    const apiJsonPath = path.join(archiveDir, 'api.json');
    if (!fs.existsSync(apiJsonPath)) {
        console.warn("No api.json found yet.");
        return;
    }

    const apiData = JSON.parse(fs.readFileSync(apiJsonPath, 'utf8'));
    if (!apiData.series) return;

    // Load or initialize summaries
    const summariesPath = path.join(archiveDir, 'summaries.json');
    let summaries = {};
    if (fs.existsSync(summariesPath)) {
        summaries = JSON.parse(fs.readFileSync(summariesPath, 'utf8'));
    }

    for (let roundNum = 1; roundNum <= 4; roundNum++) {
        const roundKey = `round${roundNum}`;
        if (summaries[roundKey]) {
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
The NHL playoffs Round ${roundNum} has just finished!

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
        } else {
            console.error("Failed to generate summary from Gemini.");
        }
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
