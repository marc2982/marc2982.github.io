import { renderPage } from './year.js';
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
	const data = await loadData(year);
	renderPage(data);
}

async function loadData(year) {
	try {
		const dataPath = `./data/summaries/${year}.json`;
		console.log(`Loading summary JSON file: ${dataPath}`);
		const data = await fetchJson(dataPath);
		return yearlySummaryFromJson(year, data);
	} catch (err) {
		console.log('No JSON found, loading from CSVs + API...');
		return await loadAndProcessCsvs(year);
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

export async function loadAndProcessCsvs(year, dataPath = `./data/archive/${year}`) {
	const dataLoader = new DataLoader(year);
	const api = new NhlApiHandler(year, dataLoader);
	await api.load();

	const seriesRepo = new NhlSeriesRepository(api.getSeriesList());
	const teamRepo = new NhlTeamRepository(api.getTeams());

	const picksImporter = new PicksImporter(seriesRepo, teamRepo);
	const calculator = new PickResultCalculator();
	const summarizer = new Summarizer(year, teamRepo);
	const projector = new ProjectionCalculator(seriesRepo, teamRepo);
	const rounds = [];

	for (let roundNum = 1; roundNum <= 4; roundNum++) {
		const scoring = SCORING[roundNum - 1];
		const seriesLetters = ALL_SERIES[roundNum - 1];
		const serieses = seriesLetters.map((letter) => seriesRepo.getSeries(letter));
		const picks = await picksImporter.readCsv(dataPath, roundNum);
		const pickResults = calculator.buildPickResults(scoring, seriesRepo, picks);
		const summary = summarizer.summarizeRound(pickResults);
		rounds.push(
			Round.create({
				number: roundNum,
				serieses: serieses,
				pickResults: pickResults,
				scoring: scoring,
				summary: summary,
			}),
		);
	}

	const projections = projector.calculate(rounds);
	return summarizer.summarizeYear(rounds, projections);
}
