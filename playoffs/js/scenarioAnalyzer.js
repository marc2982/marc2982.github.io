import { isTeamKnown, selectActivePick } from './models.js';

export class ScenarioAnalyzer {
	constructor() {
		// round -> { permutations, totalsByPerson } so each person's scenario
		// totals are computed once per round instead of once per pair of people.
		this.scenarioCache = new WeakMap();
	}

	/** A series is "determined" once both of its teams are known. */
	isDetermined(series) {
		return isTeamKnown(series.topSeed) && isTeamKnown(series.bottomSeed);
	}

	/** True if any unfinished series in the round still has an unknown team. */
	hasUndeterminedSeries(round) {
		return round.serieses.some((s) => !s.isOver() && !this.isDetermined(s));
	}

	/**
	 * For each person, calculate their current overall points and their potential max/min points.
	 * Returns a map of person -> { current, min, max, rankRange: [best, worst] }
	 *
	 * Series whose teams are still unknown can't be enumerated, so they are bounded
	 * conservatively: 0 points at worst, the pick's remaining possible points at best.
	 */
	analyzeRankVolatility(round, priorOverall) {
		const people = Object.keys(round.pickResults);
		const scoring = round.scoring;
		const activeSeries = round.serieses.filter((s) => !s.isOver());
		const completedSeries = round.serieses.filter((s) => s.isOver());
		const maxForSeries = scoring ? scoring.team + scoring.games + scoring.bonus : 0;

		// 1. Calculate constant points (already earned or locked in)
		const baseOverallPoints = {};
		for (const person of people) {
			let pts = (priorOverall && priorOverall[person]) || 0;
			// Points from completed series in current round
			for (const series of completedSeries) {
				const result = round.pickResults[person][series.letter];
				if (result) {
					pts += result.points;
				}
			}
			baseOverallPoints[person] = pts;
		}

		// 2. Calculate potential points for each remaining series
		const potentials = {}; // person -> seriesLetter -> { min, max }
		for (const person of people) {
			potentials[person] = {};
			for (const series of activeSeries) {
				const picks = round.pickResults[person][series.letter];

				if (!this.isDetermined(series)) {
					potentials[person][series.letter] = { min: 0, max: picks?.possiblePoints ?? maxForSeries };
					continue;
				}

				const outcomes = this.getPossibleOutcomes(series);
				const activePick = selectActivePick(this.getPickArray(picks), series);
				let maxPts = 0;
				let minPts = 0;
				if (outcomes.length > 0) {
					const pts = outcomes.map((outcome) => this.calculatePointsForOutcome(scoring, activePick, outcome));
					maxPts = Math.max(...pts);
					minPts = Math.min(...pts);
				}
				potentials[person][series.letter] = { min: minPts, max: maxPts };
			}
		}

		// 3. Calculate Global Min/Max for each person
		const results = {};
		for (const person of people) {
			let min = baseOverallPoints[person];
			let max = baseOverallPoints[person];
			for (const series of activeSeries) {
				min += potentials[person][series.letter].min;
				max += potentials[person][series.letter].max;
			}
			results[person] = { current: baseOverallPoints[person], min, max };
		}

		// 4. Calculate Rank Ranges
		// For Best Rank of Person P: Assume P gets MAX and everyone else gets MIN.
		// For Worst Rank of Person P: Assume P gets MIN and everyone else gets MAX.
		for (const person of people) {
			const myMax = results[person].max;
			const myMin = results[person].min;

			let bestRank = 1;
			let worstRank = 1;

			for (const other of people) {
				if (person === other) continue;
				if (results[other].min > myMax) bestRank++;
				if (results[other].max > myMin) worstRank++;
			}
			results[person].rankRange = [bestRank, worstRank];
		}

		return results;
	}

	getCurrentGap(person, target, round, priorOverall) {
		const total = (name) => ((priorOverall && priorOverall[name]) || 0) + (round.summary.summaries[name]?.points || 0);
		return total(target) - total(person);
	}

	/** Permutations of the remaining outcomes plus per-person point totals for each, cached per round. */
	getScenarioData(round, activeSeries) {
		let data = this.scenarioCache.get(round);
		if (!data) {
			const seriesOutcomes = activeSeries.map((s) => this.getPossibleOutcomes(s));
			data = { permutations: this.getPermutations(seriesOutcomes), totalsByPerson: new Map() };
			this.scenarioCache.set(round, data);
		}
		return data;
	}

	getPersonTotals(person, round, activeSeries, data) {
		let totals = data.totalsByPerson.get(person);
		if (!totals) {
			const picks = round.pickResults[person] || {};
			const activePicks = activeSeries.map((s) => selectActivePick(this.getPickArray(picks[s.letter]), s));
			totals = data.permutations.map((scenario) =>
				scenario.reduce((sum, outcome, i) => sum + this.calculatePointsForOutcome(round.scoring, activePicks[i], outcome), 0),
			);
			data.totalsByPerson.set(person, totals);
		}
		return totals;
	}

	/**
	 * Brute-forces all possible outcomes for active series and returns statistical insights.
	 * Every outcome (team + series length) is weighted equally, so "successCount / totalCount"
	 * is a share of scenarios, not a probability.
	 */
	analyzeAllScenarios(person, target, round, priorOverall) {
		const activeSeries = round.serieses.filter((s) => !s.isOver());
		const currentGap = this.getCurrentGap(person, target, round, priorOverall);

		if (activeSeries.length === 0) {
			return { successCount: 0, totalCount: 1, canCatch: false, highImpact: [], bestPath: null, worstPath: null, currentGap };
		}
		if (activeSeries.some((s) => !this.isDetermined(s))) {
			// Matchups still unknown: outcomes can't be enumerated yet
			return {
				undetermined: true,
				successCount: 0,
				totalCount: 0,
				canCatch: false,
				highImpact: [],
				conservativePath: null,
				aggressivePath: null,
				currentGap,
			};
		}

		const scoring = round.scoring;
		const personPicks = round.pickResults[person] || {};
		const targetPicks = round.pickResults[target] || {};

		const data = this.getScenarioData(round, activeSeries);
		const { permutations } = data;
		const personTotals = this.getPersonTotals(person, round, activeSeries, data);
		const targetTotals = this.getPersonTotals(target, round, activeSeries, data);
		const totalCount = permutations.length;

		let successCount = 0;
		const outcomeFrequencies = {}; // "L:EDM:6" -> count
		const teamFrequencies = {}; // "L:EDM" -> count
		let bestRelGain = -Infinity;
		let worstRelGain = Infinity;
		let bestScenario = null;
		let worstScenario = null;

		for (let n = 0; n < totalCount; n++) {
			const relGain = personTotals[n] - targetTotals[n];
			if (relGain < currentGap) continue;

			const scenario = permutations[n];
			successCount++;
			// Track frequencies for successful paths
			for (let i = 0; i < scenario.length; i++) {
				const outcome = scenario[i];
				const outcomeKey = `${activeSeries[i].letter}:${outcome.team}:${outcome.games}`;
				const teamKey = `${activeSeries[i].letter}:${outcome.team}`;
				outcomeFrequencies[outcomeKey] = (outcomeFrequencies[outcomeKey] || 0) + 1;
				teamFrequencies[teamKey] = (teamFrequencies[teamKey] || 0) + 1;
			}

			if (relGain > bestRelGain) {
				bestRelGain = relGain;
				bestScenario = scenario;
			}
			if (relGain < worstRelGain) {
				worstRelGain = relGain;
				worstScenario = scenario;
			}
		}

		// Calculate high impact outcomes (those that appear in > 75% of successful scenarios)
		const highImpact = [];
		if (successCount > 0) {
			// Check teams first
			for (const [key, count] of Object.entries(teamFrequencies)) {
				const frequency = count / successCount;
				if (frequency >= 0.75) {
					const [letter, team] = key.split(':');
					highImpact.push({ letter, team, type: 'TEAM', frequency });
				}
			}
			// Check specific outcomes
			for (const [key, count] of Object.entries(outcomeFrequencies)) {
				const frequency = count / successCount;
				if (frequency >= 0.75) {
					const [letter, team, games] = key.split(':');
					highImpact.push({ letter, team, games: parseInt(games), type: 'OUTCOME', frequency });
				}
			}
		}

		return {
			successCount,
			totalCount,
			canCatch: successCount > 0,
			highImpact: highImpact.sort((a, b) => b.frequency - a.frequency),
			conservativePath: successCount > 0 ? this.buildPath(activeSeries, worstScenario, personPicks, targetPicks, scoring) : null,
			aggressivePath: successCount > 0 ? this.buildPath(activeSeries, bestScenario, personPicks, targetPicks, scoring) : null,
			currentGap,
		};
	}

	getPermutations(arrays) {
		if (arrays.length === 0) return [[]];
		const result = [];
		const remainder = this.getPermutations(arrays.slice(1));
		for (const item of arrays[0]) {
			for (const rem of remainder) {
				result.push([item, ...rem]);
			}
		}
		return result;
	}

	getPickArray(picks) {
		return Array.isArray(picks?.conditionalPicks) ? picks.conditionalPicks : [picks?.pick].filter(Boolean);
	}

	buildPath(seriesList, scenario, personPicks, targetPicks, scoring) {
		let totalRelGain = 0;
		const path = seriesList.map((series, i) => {
			const outcome = scenario[i];
			const pPick = this.findActivePick(this.getPickArray(personPicks[series.letter]), series);
			const tPick = this.findActivePick(this.getPickArray(targetPicks[series.letter]), series);
			const pPts = this.calculatePointsForOutcome(scoring, pPick, outcome);
			const tPts = this.calculatePointsForOutcome(scoring, tPick, outcome);
			const relGain = pPts - tPts;
			totalRelGain += relGain;
			return {
				seriesLetter: series.letter,
				seriesDesc: series.getShortDesc(),
				outcome,
				personPoints: pPts,
				targetPoints: tPts,
				relativeGain: relGain,
			};
		});
		return { path, totalRelativeGain: totalRelGain };
	}

	getPossibleOutcomes(series) {
		const outcomes = [];
		const teams = [series.topSeed, series.bottomSeed].filter(isTeamKnown);

		if (teams.length < 2) return [];

		const topWins = series.topSeedWins || 0;
		const botWins = series.bottomSeedWins || 0;

		for (const team of teams) {
			const currentWins = team === series.topSeed ? topWins : botWins;
			const oppWins = team === series.topSeed ? botWins : topWins;

			// A team needs 4 wins to win the series.
			// They can win in 4, 5, 6, or 7 games total.
			for (let totalGames = 4; totalGames <= 7; totalGames++) {
				// To win in 'totalGames', the opponent must have exactly (totalGames - 4) wins.
				const requiredOppWins = totalGames - 4;

				// This outcome is possible if:
				// 1. The opponent hasn't already won more games than allowed for this outcome.
				// 2. The team hasn't already won 4 games (should be covered by isOver check, but good to be safe).
				// 3. The current total games played is less than the target totalGames.
				if (oppWins <= requiredOppWins && currentWins < 4 && topWins + botWins < totalGames) {
					outcomes.push({ team, games: totalGames });
				}
			}
		}
		return outcomes;
	}

	/** Which of a person's picks applies to this series (depends on the matchup, not the outcome). */
	findActivePick(pickArray, series) {
		return selectActivePick(pickArray, series);
	}

	calculatePointsForOutcome(scoring, pick, outcome) {
		if (!pick || !outcome) return 0;
		const correctTeam = pick.team === outcome.team;
		const correctGames = pick.games === outcome.games;

		let pts = 0;
		if (correctTeam) pts += scoring.team;
		if (correctGames) pts += scoring.games;
		if (correctTeam && correctGames) pts += scoring.bonus;
		return pts;
	}
}
