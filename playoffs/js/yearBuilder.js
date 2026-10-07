import { ALL_SERIES, SCORING, WINNER_MAP, Round, isTeamKnown } from './models.js';
import { NhlApiHandler, NhlSeriesRepository, NhlTeamRepository } from './nhlApiHandler.js';
import { PicksImporter } from './picksImporter.js';
import { PickResultCalculator } from './pickResultCalculator.js';
import { Summarizer } from './summarizer.js';

function swapSeeds(series) {
	[series.topSeed, series.bottomSeed] = [series.bottomSeed, series.topSeed];
	[series.topSeedWins, series.bottomSeedWins] = [series.bottomSeedWins, series.topSeedWins];
}

/**
 * Populates possibleTopSeeds / possibleBottomSeeds for unresolved series and fixes the
 * NHL API assigning top/bottom by clinch order instead of bracket position.
 */
export function resolveSeriesSeeds(api) {
	for (const series of api.getSeriesList()) {
		const parents = WINNER_MAP[series.letter];
		if (!parents) continue;

		series.possibleTopSeeds = api.getPossibleWinners(parents[0]);
		series.possibleBottomSeeds = api.getPossibleWinners(parents[1]);

		if (
			isTeamKnown(series.topSeed) &&
			!series.possibleTopSeeds.includes(series.topSeed) &&
			series.possibleBottomSeeds.includes(series.topSeed)
		) {
			swapSeeds(series);
		}
		if (
			isTeamKnown(series.bottomSeed) &&
			!series.possibleBottomSeeds.includes(series.bottomSeed) &&
			series.possibleTopSeeds.includes(series.bottomSeed)
		) {
			swapSeeds(series);
		}
	}
}

/**
 * Builds every round's series, picks and scores for a year. This is the single source of
 * truth for scoring: the site, the "Build Year" tool and the Node scripts all go through it.
 *
 * @param {object} options
 * @param {number|string} options.year
 * @param {object} options.dataLoader  { load(), fetchSeriesSchedule(year, letter) }
 * @param {(round:number) => Promise<string|null>} options.readRoundCsv  returns CSV text, or null if missing
 * @param {string[]|null} [options.expectedParticipants]
 * @param {Date} [options.now]
 */
export async function buildYearData({ year, dataLoader, readRoundCsv, expectedParticipants = null, now = new Date() }) {
	const api = new NhlApiHandler(year, dataLoader);
	await api.load();

	// Schedules for all known series so startTimeUTC is available
	const knownLetters = api
		.getSeriesList()
		.filter((s) => isTeamKnown(s.topSeed))
		.map((s) => s.letter);
	if (knownLetters.length > 0) {
		await api.fetchSchedules(knownLetters);
	}

	const seriesRepo = new NhlSeriesRepository(api.getSeriesList());
	resolveSeriesSeeds(api);
	const teamRepo = new NhlTeamRepository(api.getTeams());

	const picksImporter = new PicksImporter(seriesRepo, teamRepo);
	const calculator = new PickResultCalculator();
	const summarizer = new Summarizer(year, teamRepo);

	const rounds = [];
	for (let roundNum = 1; roundNum <= ALL_SERIES.length; roundNum++) {
		const scoring = SCORING[roundNum - 1];
		const serieses = ALL_SERIES[roundNum - 1].map((letter) => seriesRepo.getSeries(letter));
		const csv = await readRoundCsv(roundNum);
		const picks = csv ? picksImporter.processRows(csv, roundNum) : {};
		const pickResults = calculator.buildPickResults(scoring, seriesRepo, picks);
		const summary = summarizer.summarizeRound(pickResults);

		// A round has started once any series' game 1 has begun
		const earliestStart = serieses
			.filter((s) => s.startTimeUTC)
			.map((s) => new Date(s.startTimeUTC))
			.sort((a, b) => a - b)[0];

		rounds.push(
			Round.create({
				number: roundNum,
				serieses,
				pickResults,
				scoring,
				summary,
				roundStarted: earliestStart ? now >= earliestStart : false,
				expectedParticipants,
			}),
		);
	}

	return { api, seriesRepo, teamRepo, rounds, summarizer };
}
