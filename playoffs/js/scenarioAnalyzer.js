import { PickStatus } from './models.js';

export class ScenarioAnalyzer {
	constructor(pickResultCalculator) {
		this.calculator = pickResultCalculator;
	}

	/**
	 * For each person, calculate their current overall points and their potential max/min points.
	 * Returns a map of person -> { current, min, max, rankRange: [best, worst] }
	 */
	analyzeRankVolatility(round, priorOverall) {
		const people = Object.keys(round.pickResults);
		const scoring = round.scoring;
		const activeSeries = round.serieses.filter((s) => !s.isOver());
		const completedSeries = round.serieses.filter((s) => s.isOver());

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
				const outcomes = this.getPossibleOutcomes(series);
				let maxPts = -Infinity;
				let minPts = Infinity;

				const pickArray = Array.isArray(picks?.conditionalPicks) ? picks.conditionalPicks : [picks?.pick].filter(Boolean);
				
				for (const outcome of outcomes) {
					// We need to handle conditional picks logic here too
					const activePick = this.findActivePick(pickArray, series, outcome);
					const pts = this.calculatePointsForOutcome(scoring, activePick, outcome);
					maxPts = Math.max(maxPts, pts);
					minPts = Math.min(minPts, pts);
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

	/**
	 * Brute-forces all possible outcomes for active series and returns statistical insights.
	 */
	analyzeAllScenarios(person, target, round, priorOverall) {
		const activeSeries = round.serieses.filter((s) => !s.isOver());
		if (activeSeries.length === 0) return { successCount: 0, totalCount: 1, highImpact: [], bestPath: null, worstPath: null };

		const scoring = round.scoring;
		const personPicks = round.pickResults[person];
		const targetPicks = round.pickResults[target];
		
		const currentGap = ((priorOverall && priorOverall[target]) || 0) + (round.summary.summaries[target]?.points || 0) - 
						  (((priorOverall && priorOverall[person]) || 0) + (round.summary.summaries[person]?.points || 0));

		const seriesOutcomes = activeSeries.map(s => this.getPossibleOutcomes(s));
		const permutations = this.getPermutations(seriesOutcomes);
		const totalCount = permutations.length;

		let successCount = 0;
		const outcomeFrequencies = {}; // "L:EDM:6" -> count
		const teamFrequencies = {};    // "L:EDM" -> count
		let bestRelGain = -Infinity;
		let worstRelGain = Infinity;
		let bestScenario = null;
		let worstScenario = null;

		for (const scenario of permutations) {
			let pPts = 0;
			let tPts = 0;
			
			for (let i = 0; i < scenario.length; i++) {
				const outcome = scenario[i];
				const seriesLetter = activeSeries[i].letter;
				
				const pPickArr = this.getPickArray(personPicks[seriesLetter]);
				const tPickArr = this.getPickArray(targetPicks[seriesLetter]);
				
				const pPick = this.findActivePick(pPickArr, activeSeries[i], outcome);
				const tPick = this.findActivePick(tPickArr, activeSeries[i], outcome);
				
				pPts += this.calculatePointsForOutcome(scoring, pPick, outcome);
				tPts += this.calculatePointsForOutcome(scoring, tPick, outcome);
			}

			const relGain = pPts - tPts;
			const isSuccess = relGain >= currentGap;

			if (isSuccess) {
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
				if (relGain < worstRelGain || worstRelGain === Infinity) {
					worstRelGain = relGain;
					worstScenario = scenario;
				}
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
			currentGap
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
			const pPick = this.findActivePick(this.getPickArray(personPicks[series.letter]), series, outcome);
			const tPick = this.findActivePick(this.getPickArray(targetPicks[series.letter]), series, outcome);
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
				relativeGain: relGain
			};
		});
		return { path, totalRelativeGain: totalRelGain };
	}

	/**
	 * Finds the specific set of outcomes that allows 'person' to gain the most points relative to 'target'.
	 */
	calculateBestPath(person, target, round, priorOverall) {
		const scoring = round.scoring;
		const activeSeries = round.serieses.filter((s) => !s.isOver());
		const path = [];
		let totalRelativeGain = 0;

		const currentGap = ((priorOverall && priorOverall[target]) || 0) + (round.summary.summaries[target]?.points || 0) - 
						  (((priorOverall && priorOverall[person]) || 0) + (round.summary.summaries[person]?.points || 0));

		for (const series of activeSeries) {
			const personPicks = round.pickResults[person][series.letter];
			const targetPicks = round.pickResults[target][series.letter];
			
			const personPickArr = Array.isArray(personPicks?.conditionalPicks) ? personPicks.conditionalPicks : [personPicks?.pick].filter(Boolean);
			const targetPickArr = Array.isArray(targetPicks?.conditionalPicks) ? targetPicks.conditionalPicks : [targetPicks?.pick].filter(Boolean);

			const outcomes = this.getPossibleOutcomes(series);
			let maxRelGain = -Infinity;
			let bestOutcome = null;
			let personPtsAtBest = 0;
			let targetPtsAtBest = 0;

			for (const outcome of outcomes) {
				const pPick = this.findActivePick(personPickArr, series, outcome);
				const tPick = this.findActivePick(targetPickArr, series, outcome);
				
				const pPts = this.calculatePointsForOutcome(scoring, pPick, outcome);
				const tPts = this.calculatePointsForOutcome(scoring, tPick, outcome);
				
				const relGain = pPts - tPts;
				if (relGain > maxRelGain) {
					maxRelGain = relGain;
					bestOutcome = outcome;
					personPtsAtBest = pPts;
					targetPtsAtBest = tPts;
				}
			}

			if (maxRelGain !== 0 || (bestOutcome && (personPtsAtBest > 0 || targetPtsAtBest > 0))) {
				path.push({
					seriesLetter: series.letter,
					seriesDesc: series.getShortDesc(),
					outcome: bestOutcome,
					personPoints: personPtsAtBest,
					targetPoints: targetPtsAtBest,
					relativeGain: maxRelGain
				});
				totalRelativeGain += maxRelGain;
			}
		}

		return {
			target,
			currentGap,
			totalRelativeGain,
			canCatch: totalRelativeGain >= currentGap,
			path
		};
	}

	getPossibleOutcomes(series) {
		const outcomes = [];
		const teams = [series.topSeed, series.bottomSeed].filter(t => t && t !== 'TBD' && t !== 'undefined');
		
		if (teams.length < 2) return [];

		const topWins = series.topSeedWins || 0;
		const botWins = series.bottomSeedWins || 0;

		for (const team of teams) {
			const currentWins = (team === series.topSeed) ? topWins : botWins;
			const oppWins = (team === series.topSeed) ? botWins : topWins;
			
			// A team needs 4 wins to win the series.
			// They can win in 4, 5, 6, or 7 games total.
			for (let totalGames = 4; totalGames <= 7; totalGames++) {
				// To win in 'totalGames', the opponent must have exactly (totalGames - 4) wins.
				const requiredOppWins = totalGames - 4;
				
				// This outcome is possible if:
				// 1. The opponent hasn't already won more games than allowed for this outcome.
				// 2. The team hasn't already won 4 games (should be covered by isOver check, but good to be safe).
				// 3. The current total games played is less than the target totalGames.
				if (oppWins <= requiredOppWins && currentWins < 4 && (topWins + botWins) < totalGames) {
					outcomes.push({ team, games: totalGames });
				}
			}
		}
		return outcomes;
	}

	findActivePick(pickArray, series, outcome) {
		if (pickArray.length === 0) return null;
		if (pickArray.length === 1) return pickArray[0];
		
		// Match conditional pick logic from PickResultCalculator
		const matchedPick = pickArray.find(p => p.team === outcome.team || p.opponent === outcome.team);
		return matchedPick || pickArray[0];
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
