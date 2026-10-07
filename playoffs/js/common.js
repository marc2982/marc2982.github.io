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

export const TEST_YEAR = 3000;
export const IN_PROGRESS = 'In Progress';

/** Index entries for real, completed-or-current years (excludes the 3000 test entry). */
export function getRealYears(yearlyIndex) {
	return Object.entries(yearlyIndex)
		.map(([year, data]) => ({ ...data, year: parseInt(year, 10) }))
		.filter((d) => d.year > 0 && d.year !== TEST_YEAR)
		.sort((a, b) => a.year - b.year);
}

/** Normalise "A, B*" / ['A','B'] / null into a clean name array. */
export function toNameList(value) {
	if (value === null || value === undefined) return [];
	const list = Array.isArray(value) ? value : String(value).split(',');
	return list
		.map((n) => String(n).replace(/\*/g, '').trim())
		.filter((n) => n && n !== '-');
}

export async function loadAllYearsDetailed() {
	const yearlyIndex = await loadYearlyIndex();
	const yearList = getRealYears(yearlyIndex).map((y) => String(y.year));
	const loaded = await Promise.all(
		yearList.map(async (year) => {
			try {
				const summary = await fetchJson(`./data/summaries/${year}.json`);
				return { year, summary, indexData: yearlyIndex[year] };
			} catch (error) {
				console.warn(`Failed to load ${year}.json:`, error);
				return null;
			}
		}),
	);
	return { yearlyIndex, yearList, results: loaded.filter(Boolean) };
}

export function isPerfectPick(result) {
	return result.teamStatus === 'CORRECT' && result.gamesStatus === 'CORRECT';
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
		if (!yearData.points || yearData.year === TEST_YEAR || yearData.poolWinner === IN_PROGRESS) return;

		const winners = toNameList(yearData.poolWinner);
		const losers = toNameList(yearData.poolLoser);

		// Deterministic ranking: by points desc; among tied leaders the pool winner (tiebreak) ranks first.
		const participants = Object.entries(yearData.points)
			.filter(([_person, points]) => points > 0)
			.sort((a, b) => b[1] - a[1] || (winners.includes(b[0]) ? 1 : 0) - (winners.includes(a[0]) ? 1 : 0) || a[0].localeCompare(b[0]));

		// Process points
		participants.forEach(([person, points], rank) => {
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
			if (rank < 3) {
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

		// Iterate everyone seen so far so streaks reset for years they miss.
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
