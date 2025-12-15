import { fetchJson } from './httpUtils.js';

export function excelRank(values, target) {
	const sortedValues = [...values].sort((a, b) => b - a);
	for (let i = 0; i < sortedValues.length; i++) {
		if (sortedValues[i] === target) {
			return i + 1;
		}
	}
	throw new Error('cant calculate excel ranking');
}

export async function loadYearlyIndex() {
	return await fetchJson('./data/summaries/yearly_index.json');
}

export async function loadAllYearsDetailed() {
	const yearlyIndex = await loadYearlyIndex();
	const yearList = Object.keys(yearlyIndex).filter((y) => parseInt(y) > 0);
	const results = [];

	for (const year of yearList) {
		try {
			const summary = await fetchJson(`./data/summaries/${year}.json`);
			results.push({ year, summary, indexData: yearlyIndex[year] });
		} catch (error) {
			console.warn(`Failed to load ${year}.json:`, error);
		}
	}
	return { yearlyIndex, yearList, results };
}

export function isPerfectPick(result) {
	return result.teamStatus === 'CORRECT' && result.gamesStatus === 'CORRECT';
}

export function isBonusEarned(result) {
	// Current rule: Bonus is earned if Team + Games are correct
	return isPerfectPick(result);
}

export function calculateCareerStats(years) {
	const stats = {};

	// Helper to init person if not exists
	const initPerson = (name) => {
		if (!stats[name]) {
			stats[name] = {
				name: name,
				totalPoints: 0,
				yearsParticipated: 0,
				bestScore: -Infinity,
				worstScore: Infinity,
				bestYear: null,
				worstYear: null,
				podiumFinishes: 0,
				wins: 0,
				losses: 0,
				currentWinStreak: 0,
				longestWinStreak: 0,
				currentLoseStreak: 0,
				longestLoseStreak: 0,
				yearlyScores: [],
				silverMedals: 0,
				bronzeMedals: 0,
				closestLossMargin: Infinity,
				closestLossCount: 0,
			};
		}
	};

	// Process each year
	years.forEach((yearData) => {
		if (!yearData.points) return;

		// Track who won and lost this year
		const winners = Array.isArray(yearData.poolWinner) ? yearData.poolWinner : [yearData.poolWinner];
		const losers = Array.isArray(yearData.poolLoser) ? yearData.poolLoser : [yearData.poolLoser];

		// Get all participants sorted by points (for podium)
		const participants = Object.entries(yearData.points)
			.filter(([person, points]) => points > 0)
			.sort((a, b) => b[1] - a[1]);

		// Process points
		Object.entries(yearData.points).forEach(([person, points]) => {
			if (points === undefined || points === null || points === 0) return;
			initPerson(person);

			stats[person].totalPoints += points;
			stats[person].yearsParticipated++;
			stats[person].yearlyScores.push(points);

			// Best/Worst tracking
			if (points > stats[person].bestScore) {
				stats[person].bestScore = points;
				stats[person].bestYear = yearData.year;
			}
			if (points < stats[person].worstScore) {
				stats[person].worstScore = points;
				stats[person].worstYear = yearData.year;
			}

			// Podium finishes (top 3)
			const rank = participants.findIndex(([p]) => p === person);
			if (rank >= 0 && rank < 3) {
				stats[person].podiumFinishes++;
			}

			// Silver Medal (Rank 1 -> 2nd place)
			if (rank === 1) {
				stats[person].silverMedals++;

				// Closest Loss (Only for 2nd place finishes)
				const winnerScore = participants[0][1];
				const myScore = points;
				const diff = winnerScore - myScore;

				if (diff < stats[person].closestLossMargin) {
					stats[person].closestLossMargin = diff;
					stats[person].closestLossCount = 1;
				} else if (diff === stats[person].closestLossMargin) {
					stats[person].closestLossCount++;
				}
			}

			// Bronze Medal (Rank 2 -> 3rd place)
			if (rank === 2) {
				stats[person].bronzeMedals++;
			}
		});

		// Process Wins/Losses for ALL known people (to update streaks correctly even if they missed a year? No, strictly only for participants content)
		// But streaks logic in original code iterated everyone.
		// Let's iterate all people we've seen so far or just the participants + winners/losers.
		// Safe approach: iterate our 'stats' keys which grows as we see people.
		Object.values(stats).forEach((s) => {
			const isWinner = winners.includes(s.name);
			const isLoser = losers.includes(s.name);

			if (isWinner) {
				s.wins++;
				s.currentWinStreak++;
				s.currentLoseStreak = 0;
				s.longestWinStreak = Math.max(s.longestWinStreak, s.currentWinStreak);
			} else {
				s.currentWinStreak = 0;
			}

			if (isLoser) {
				s.losses++;
				s.currentLoseStreak++;
				s.longestLoseStreak = Math.max(s.longestLoseStreak, s.currentLoseStreak);
			} else {
				s.currentLoseStreak = 0;
			}
		});
	});

	// Calculate consistency
	Object.values(stats).forEach((s) => {
		if (s.yearlyScores.length > 1) {
			const mean = s.totalPoints / s.yearsParticipated;
			const variance =
				s.yearlyScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / s.yearlyScores.length;
			s.consistencyScore = Math.sqrt(variance);
		} else {
			s.consistencyScore = 0;
		}
	});

	return stats;
}
