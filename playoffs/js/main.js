import { renderPage } from './year.js';
import { Round, YearlySummary, SCORING, ALL_SERIES, TiebreakInfo } from './models.js';
import { DataLoader } from './dataLoader.js';
import { NhlApiHandler } from './nhlApiHandler.js';
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
		const dataPath = `./data/${year}/overall.json`;
		console.log(`Loading overall json file: ${dataPath}`);
		const data = await fetchJson(dataPath);
		return yearlySummaryFromJson(year, data);
	} catch (err) {
		console.error('Failed to load overall.json, falling back to CSV processing:', err);
		return await loadAndProcessCsvs(year);
	}
}

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
	const calculator = new PickResultCalculator();
	const summarizer = new Summarizer(year, api.getTeams());
	const projector = new ProjectionCalculator(api);
	const rounds = [];

	for (let roundNum = 1; roundNum <= 4; roundNum++) {
		const scoring = SCORING[roundNum - 1];
		const seriesLetters = ALL_SERIES[roundNum - 1];
		const serieses = seriesLetters.map((letter) => api.getSeries(letter));
		const picks = await picksImporter.readCsv(`./data/${year}`, roundNum);
		const pickResults = calculator.buildPickResults(scoring, api, picks);
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
