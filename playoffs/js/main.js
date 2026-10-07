import { renderPage } from './year.js';
import { fetchText } from './httpUtils.js';
import { showGlobalError } from './errorOverlay.js';
import { Round, YearlySummary, TiebreakInfo, Team, Series, PickResult, Pick, PersonPointsSummary, RoundSummary, Scoring, ProjectionCell } from './models.js';
import { DataLoader } from './dataLoader.js';
import { ProjectionCalculator } from './projectionCalculator.js';
import { buildYearData } from './yearBuilder.js';
import { fetchJson } from './httpUtils.js';
import { getBranchParam } from './urlParams.js';

export async function render(year) {
	try {
		const data = await loadData(year);

		// Load LLM summaries separately
		try {
			const branch = getBranchParam();
			const basePath = branch ? `https://raw.githubusercontent.com/marc2982/marc2982.github.io/${branch}/playoffs/data/archive/` : `./data/archive/`;
			const summaries = await fetchJson(`${basePath}${year}/summaries.json`, true);
			if (summaries) {
				data.rounds.forEach(r => {
					r.llmSummary = summaries[`round${r.number}`];
				});
				data.overallSummary = summaries.overall;
			}
		} catch {
			// ignore if not found
		}

		renderPage(data);
	} catch (err) {
		if (err.message === 'PLAYOFFS_NOT_STARTED') {
			$('#loading').hide();
			$('#main-content').html(
				`<div style="text-align: center; margin-top: 50px;">
					<h2>The ${year} Playoffs have not started yet.</h2>
					<p>Please check back later or click the "Make Picks!" button to participate.</p>
				</div>`
			).fadeIn();
		} else {
			console.error("Critical rendering error:", err);
			showGlobalError(err);
		}
	}
}

async function loadData(year) {
	try {
		// TODO: useful for testing, probably should remove this later
		const branch = getBranchParam();

		if (branch) {
			console.log(`Branch parameter found: ${branch}. Fetching data from GitHub raw...`);
			const rawPath = `https://raw.githubusercontent.com/marc2982/marc2982.github.io/${branch}/playoffs/data/archive/${year}`;
			return await loadAndProcessCsvs(year, rawPath, branch);
		}

		const dataPath = `./data/summaries/${year}.json`;
		console.log(`Loading summary JSON file: ${dataPath}`);
		const data = await fetchJson(dataPath);
		return yearlySummaryFromJson(year, data);
	} catch (err) {
		if (err.message === 'NOT_FOUND') {
			console.log('No JSON found, loading from CSVs + API...');
			return await loadAndProcessCsvs(year);
		} else {
			// This is a corrupt JSON, 500 Network error, or parsing error that should crash explicitly
			console.error("Failed to load historical JSON for " + year, err);
			throw err; 
		}
	}
}

function yearlySummaryFromJson(year, json) {
	// Deserialize teams
	const teams = {};
	for (const [teamShort, teamData] of Object.entries(json.teams || {})) {
		teams[teamShort] = Team.create(teamData);
	}

	// Deserialize rounds
	const rounds = (json.rounds || []).map((roundData) => {
		// Deserialize serieses
		const serieses = (roundData.serieses || []).map((seriesData) => Series.create(seriesData));

		// Deserialize pickResults
		const pickResults = {};
		for (const [person, results] of Object.entries(roundData.pickResults || {})) {
			pickResults[person] = {};
			for (const [seriesLetter, resultData] of Object.entries(results)) {
				pickResults[person][seriesLetter] = PickResult.create({
					pick: Pick.create(resultData.pick),
					teamStatus: resultData.teamStatus,
					gamesStatus: resultData.gamesStatus,
					points: resultData.points,
					possiblePoints: resultData.possiblePoints,
					earnedBonusPoints: resultData.earnedBonusPoints,
				});
			}
		}

		// Deserialize summary
		const summaries = {};
		for (const [person, summaryData] of Object.entries(roundData.summary?.summaries || {})) {
			summaries[person] = PersonPointsSummary.create(summaryData);
		}

		const summary = RoundSummary.create({
			summaries: summaries,
			winners: roundData.summary?.winners || [],
			losers: roundData.summary?.losers || [],
		});

		return Round.create({
			number: roundData.number,
			serieses: serieses,
			pickResults: pickResults,
			scoring: Scoring.create(roundData.scoring),
			summary: summary,
		});
	});

	// Deserialize personSummaries
	const personSummaries = {};
	for (const [person, summaryData] of Object.entries(json.personSummaries || {})) {
		personSummaries[person] = PersonPointsSummary.create(summaryData);
	}

	// Deserialize projections
	const projections = {};
	for (const [games, teamsData] of Object.entries(json.projections || {})) {
		projections[games] = {};
		for (const [team, cellData] of Object.entries(teamsData)) {
			projections[games][team] = ProjectionCell.create(cellData);
		}
	}

	// Deserialize tiebreakInfo
	const tiebreakInfo = TiebreakInfo.create(json.tiebreakInfo || {});

	return YearlySummary.create({
		year: json.year || year,
		rounds: rounds,
		personSummaries: personSummaries,
		winners: json.winners || [],
		losers: json.losers || [],
		tiebreakInfo: tiebreakInfo,
		projections: projections,
		teams: teams,
	});
}

export async function loadAndProcessCsvs(year, dataPath = `./data/archive/${year}`, branch = null) {
	const archiveBasePath = branch
		? `https://raw.githubusercontent.com/marc2982/marc2982.github.io/${branch}/playoffs/data/archive/`
		: `./data/archive/`;

	// Get expected participants from last year's round 1
	const expectedParticipants = await getLastYearParticipants(year, archiveBasePath);

	const { rounds, teamRepo, summarizer, seriesRepo } = await buildYearData({
		year,
		dataLoader: new DataLoader(year, archiveBasePath),
		readRoundCsv: async (roundNum) => {
			try {
				return await fetchText(`${dataPath}/round${roundNum}.csv`);
			} catch (err) {
				if (err.message === 'NOT_FOUND') return null;
				throw err;
			}
		},
		expectedParticipants,
	});

	const projector = new ProjectionCalculator(seriesRepo, teamRepo);
	const projections = projector.calculate(rounds);
	return summarizer.summarizeYear(rounds, projections);
}

/**
 * Fetches last year's round 1 CSV and extracts the unique participant names.
 * Returns null if last year's data isn't available (disabling censoring).
 */
async function getLastYearParticipants(currentYear, archiveBasePath) {
	const lastYear = currentYear - 1;
	const csvPath = `${archiveBasePath}${lastYear}/round1.csv`;
	try {
		const csvText = await fetchText(csvPath);
		const lines = csvText.trim().split('\n');
		// Skip header, extract name column (index 1)
		const names = lines.slice(1)
			.map(line => line.split(',')[1]?.trim())
			.filter(Boolean);
		return [...new Set(names)].sort();
	} catch {
		console.log(`No previous year data found at ${csvPath}, censoring disabled`);
		return null;
	}
}
