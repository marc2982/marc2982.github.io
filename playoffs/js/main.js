import { renderPage } from './year.js';
import { fetchText } from './httpUtils.js';
import { showGlobalError } from './errorOverlay.js';
import {
	Round,
	YearlySummary,
	SCORING,
	ALL_SERIES,
	TiebreakInfo,
	Team,
	Series,
	PickResult,
	Pick,
	PersonPointsSummary,
	RoundSummary,
	Scoring,
	ProjectionCell,
} from './models.js';
import { DataLoader } from './dataLoader.js';
import { NhlApiHandler, NhlSeriesRepository, NhlTeamRepository } from './nhlApiHandler.js';
import { PicksImporter } from './picksImporter.js';
import { PickResultCalculator } from './pickResultCalculator.js';
import { Summarizer } from './summarizer.js';
import { ProjectionCalculator } from './projectionCalculator.js';
import { fetchJson } from './httpUtils.js';

export async function render(year) {
	try {
		const data = await loadData(year);
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
		const urlParams = new URLSearchParams(window.location.search);
		const branch = urlParams.get('branch');

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

	const dataLoader = new DataLoader(year, archiveBasePath);
	const api = new NhlApiHandler(year, dataLoader);
	await api.load();

	// Fetch schedules for all known series so startTimeUTC is available
	const allLetters = ALL_SERIES.flat();
	const knownLetters = api.getSeriesList()
		.filter(s => s.topSeed && s.topSeed !== 'undefined' && s.topSeed.toUpperCase() !== 'TBD')
		.map(s => s.letter);
	const lettersToFetch = allLetters.filter(l => knownLetters.includes(l));
	if (lettersToFetch.length > 0) {
		await api.fetchSchedules(lettersToFetch);
	}

	const seriesRepo = new NhlSeriesRepository(api.getSeriesList());
	const teamRepo = new NhlTeamRepository(api.getTeams());

	const picksImporter = new PicksImporter(seriesRepo, teamRepo);
	const calculator = new PickResultCalculator();
	const summarizer = new Summarizer(year, teamRepo);
	const projector = new ProjectionCalculator(seriesRepo, teamRepo);

	// Get expected participants from last year's round 1
	const expectedParticipants = await getLastYearParticipants(year, archiveBasePath);

	const rounds = [];

	for (let roundNum = 1; roundNum <= 4; roundNum++) {
		const scoring = SCORING[roundNum - 1];
		const seriesLetters = ALL_SERIES[roundNum - 1];
		const serieses = seriesLetters.map((letter) => seriesRepo.getSeries(letter));
		const picks = await picksImporter.readCsv(dataPath, roundNum);
		const pickResults = calculator.buildPickResults(scoring, seriesRepo, picks);
		const summary = summarizer.summarizeRound(pickResults);

		// Determine if this round has started (any game 1 has begun)
		const earliestStart = serieses
			.filter(s => s.startTimeUTC)
			.map(s => new Date(s.startTimeUTC))
			.sort((a, b) => a - b)[0];
		const roundStarted = earliestStart ? new Date() >= earliestStart : false;

		rounds.push(
			Round.create({
				number: roundNum,
				serieses: serieses,
				pickResults: pickResults,
				scoring: scoring,
				summary: summary,
				roundStarted: roundStarted,
				expectedParticipants: expectedParticipants,
			}),
		);
	}

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
