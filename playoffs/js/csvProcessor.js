import { parse } from 'https://cdn.skypack.dev/@vanillaes/csv';
import { Round, YearlySummary, SCORING, PickStatus, ALL_SERIES, PickResult, TiebreakInfo } from './models.js';
import { NhlApiHandler } from './nhlApiHandler.js';
import { PicksImporter } from './picksImporter.js';
import { Summarizer } from './summarizer.js';
import { ProjectionCalculator } from './projectionCalculator.js';
import { fetchText } from './httpUtils.js';
import { DataLoader } from './dataLoader.js';

export async function loadData(year) {
	try {
		const dataPath = `./data/${year}/overall.json`;
		console.log(`Loading overall json file: ${dataPath}`);
		const data = await $.getJSON(dataPath);
		return yearlySummaryFromJson(year, data);
	} catch (err) {
		console.error('Failed to load overall.json, falling back to CSV processing:', err);
		return await loadAndProcessCsvs(year);
	}
}

// TODO
function yearlySummaryFromJson(year, json) {
	return YearlySummary.create({
		year: year,
		rounds: [],
		personSummaries: {},
		winners: [],
		losers: [],
		tiebreakInfo: TiebreakInfo.create({}),
		projections: {},
		teams: {},
	});
}

async function loadAndProcessCsvs(year) {
	const dataLoader = new DataLoader(year);
	const api = new NhlApiHandler(year, dataLoader);
	await api.load();

	const picksImporter = new PicksImporter(api);
	const summarizer = new Summarizer(year, api.getTeams());
	const projector = new ProjectionCalculator(api);
	const rounds = [];

	for (let roundNum = 1; roundNum <= 4; roundNum++) {
		// 4 rounds in the playoffs
		const scoring = SCORING[roundNum - 1];
		const seriesLetters = ALL_SERIES[roundNum - 1];
		const serieses = seriesLetters.map((letter) => api.getSeries(letter));
		const picks = await picksImporter.readCsv(`./data/${year}`, roundNum);
		const pickResults = buildPickResults(scoring, api, picks);
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
	console.log('Projections:', projections);
	return summarizer.summarizeYear(rounds, projections);
}

export async function loadCsv(filename) {
	try {
		const data = await fetchText(filename);
		return parse(data);
	} catch (err) {
		console.error(`Failed to load CSV file ${filename}:`, err);
		throw err;
	}
}

function buildPickResults(scoring, api, picks) {
	const pickResults = {};
	for (const [person, picksBySeries] of Object.entries(picks)) {
		for (const [seriesLetter, pick] of Object.entries(picksBySeries)) {
			const series = api.getSeries(seriesLetter);
			const winner = series.getWinner();
			const teamStatus = getTeamStatus(pick, winner);
			const gamesStatus = getGamesStatus(pick, winner, series);
			const points = getPoints(scoring, teamStatus, gamesStatus);
			const possiblePoints = winner
				? points
				: calculatePossiblePoints(pick, series, scoring, teamStatus, gamesStatus);
			if (!pickResults[person]) {
				pickResults[person] = {};
			}
			pickResults[person][series.letter] = PickResult.create({
				pick: pick,
				teamStatus: teamStatus,
				gamesStatus: gamesStatus,
				points: points,
				possiblePoints: possiblePoints,
			});
		}
	}
	return pickResults;
}

function getPickStatus(pick, winner, predicate) {
	if (!winner) {
		return PickStatus.UNKNOWN;
	}
	return predicate(pick, winner) ? PickStatus.CORRECT : PickStatus.INCORRECT;
}

function getTeamStatus(pick, winner) {
	return getPickStatus(pick, winner, (p, w) => p.team === w.team);
}

function getGamesStatus(pick, winner, series) {
	// sometimes we can assign correctness early
	if (winner === null) {
		const gamesPlayed = series.totalGames();
		// since we know the 7th game will be the last we can give points early
		if (gamesPlayed === 6 && pick.games === 7) {
			return PickStatus.CORRECT;
		}
		// if >= games than the guess have been played, it's a bad guess
		if (gamesPlayed >= pick.games) {
			return PickStatus.INCORRECT;
		}
		// certain games become impossible, ie both teams win 1 each so 4 games is impossible
		const minGamesForWinner = Math.min(series.topSeedWins, series.bottomSeedWins) + 4;
		if (pick.games < minGamesForWinner) {
			return PickStatus.INCORRECT;
		}
	}
	return getPickStatus(pick, winner, (p, w) => p.games === w.games);
}

function getPoints(scoring, teamStatus, gamesStatus) {
	const correctTeam = teamStatus === PickStatus.CORRECT;
	const correctGames = gamesStatus === PickStatus.CORRECT;
	let points = 0;
	points += correctTeam ? scoring.team : 0;
	points += correctGames ? scoring.games : 0;
	points += correctTeam && correctGames ? scoring.bonus : 0;
	return points;
}

// this function should ONLY be called when there is no winner
function calculatePossiblePoints(pick, series, scoring, teamStatus, gamesStatus) {
	const possibleFromTeam = [PickStatus.CORRECT, PickStatus.UNKNOWN].includes(teamStatus) ? scoring.team : 0;
	const possibleFromGames = [PickStatus.CORRECT, PickStatus.UNKNOWN].includes(gamesStatus) ? scoring.games : 0;
	const possibleFromBonus = possibleFromTeam > 0 && possibleFromGames > 0 ? scoring.bonus : 0;
	return possibleFromTeam + possibleFromGames + possibleFromBonus;
}
