import { PEOPLE } from './constants.js';
import { loadYearlyIndex } from './common.js';
import { createSection, createTable, initDataTable } from './tableUtils.js';

export async function performanceStats(container) {
	// Load yearly index
	const yearlyIndex = await loadYearlyIndex();
	const years = Object.values(yearlyIndex).sort((a, b) => a.year - b.year);
	container.empty();

	// Initialize stats object for each person
	const stats = {};
	PEOPLE.forEach((person) => {
		stats[person] = {
			name: person,
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
	});

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
			if (!stats[person]) return;
			if (points === undefined || points === null || points === 0) return;

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
				// Winner is at index 0
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

		// Process Wins/Losses (Independent of points for years with missing data)
		// Reset standard flags
		Object.values(stats).forEach((s) => {
			const isWinner = winners.includes(s.name);
			const isLoser = losers.includes(s.name);

			if (isWinner) {
				// Only increment if not already counted (though we iterate years once so it should be fine)
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

	// Calculate standard deviation for consistency
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

	// Filter to only people who have participated
	const activeStats = Object.values(stats).filter((s) => s.yearsParticipated > 0);

	// Build tables in order: Achievements first, then Overall, then Advanced
	buildAchievementsTable(container, activeStats);
	buildOverallPerformanceTable(container, activeStats);
	buildScoreDistributionChart(container, activeStats);
	buildScoreHistoryChart(container, years);
	buildHeartbreakTable(container, activeStats);
	buildAdvancedMetricsTable(container, activeStats);
}

function buildHeartbreakTable(container, stats) {
	const $section = createSection(
		container,
		'Heartbreak Index (Agony of Defeat)',
		'<strong>Silver/Bronze Medals:</strong> 2nd and 3rd place finishes. <strong>Closest Loss:</strong> Smallest point margin between you and the winner (2nd place finishes only).',
	);

	const { $table, $tbody } = createTable(['Person', 'Silver Medals', 'Bronze Medals', 'Closest Loss']);
	$section.append($table);

	stats.forEach((s) => {
		let closestLossDisplay = '-';
		let closestLossValue = 9999; // For sorting

		if (s.closestLossMargin !== Infinity) {
			closestLossValue = s.closestLossMargin;
			closestLossDisplay = `${s.closestLossMargin} pts`;
			if (s.closestLossCount > 1) {
				closestLossDisplay += ` (${s.closestLossCount}x)`;
			}
		}

		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${s.silverMedals}</td>`);
		$row.append(`<td>${s.bronzeMedals}</td>`);
		$row.append(`<td data-order="${closestLossValue}">${closestLossDisplay}</td>`);
		$tbody.append($row);
	});

	initDataTable($table, { order: [[1, 'desc']] });
}

const PERSON_COLORS = {
	Benedict: '#FF6B6B',
	Chrissy: '#4ECDC4',
	Derrick: '#45B7D1',
	Glenda: '#96CEB4',
	Jaclyn: '#FFEEAD',
	Jake: '#FFD93D',
	Jamie: '#FF9F1C',
	Kiersten: '#E056FD',
	Marc: '#686DE0',
	Nathan: '#30336B',
	Nickall: '#22A6B3',
	Robin: '#BE2EDD',
	Ryan: '#F0932B',
	Sophie: '#EB4D4B',
	Stephanie: '#6AB04C',
	Theodore: '#7ED6DF',
};

function buildScoreDistributionChart(container, stats) {
	const $section = createSection(
		container,
		'Score Distribution',
		'Histogram of point totals across all years. Each color represents a different person. Hover to see the breakdown.',
	);

	// Container for Chart.js
	const $canvasContainer = $('<div style="position: relative; height:500px; width:100%"></div>');
	const $canvas = $('<canvas></canvas>');
	$canvasContainer.append($canvas);
	$section.append($canvasContainer);
	container.append($section);

	// 1. Gather all scores to determine global range
	let allScores = [];
	stats.forEach((p) => {
		allScores = allScores.concat(p.yearlyScores);
	});

	if (allScores.length === 0) return;

	// 2. Determine bins
	const minScore = Math.min(...allScores);
	const maxScore = Math.max(...allScores);
	const binSize = 10;

	const startBin = Math.floor(minScore / binSize) * binSize;
	const endBin = Math.ceil(maxScore / binSize) * binSize;

	const labels = [];
	for (let i = startBin; i < endBin; i += binSize) {
		labels.push(`${i}-${i + binSize}`);
	}

	// 3. Populate datasets (one per person)
	const datasets = [];

	stats.forEach((personStats) => {
		// Initialize this person's bins with 0s
		const personBins = new Array(labels.length).fill(0);

		personStats.yearlyScores.forEach((score) => {
			let binIndex = Math.floor((score - startBin) / binSize);
			if (binIndex >= personBins.length) binIndex = personBins.length - 1;
			if (binIndex < 0) binIndex = 0;
			personBins[binIndex]++;
		});

		// Only add dataset if they have data
		if (personBins.some((v) => v > 0)) {
			datasets.push({
				label: personStats.name,
				data: personBins,
				backgroundColor: PERSON_COLORS[personStats.name] || '#999999',
				borderColor: 'rgba(255,255,255,0.5)', // Subtle border to separate stacks
				borderWidth: 1,
			});
		}
	});

	// 4. Render Chart
	new Chart($canvas[0], {
		type: 'bar',
		data: {
			labels: labels,
			datasets: datasets,
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					display: true, // Show legend so users can identify colors
					position: 'bottom',
					labels: {
						boxWidth: 12,
						font: {
							size: 10,
						},
					},
				},
				tooltip: {
					mode: 'index', // Shows all items in the stack
					intersect: false,
					itemSort: (a, b) => b.raw - a.raw, // Sort tooltip by count descending
					callbacks: {
						title: (items) => `Score Range: ${items[0].label}`,
						label: (item) => {
							if (item.raw > 0) {
								return `${item.dataset.label}: ${item.raw}`;
							}
							return null; // Hide from tooltip if 0
						},
					},
				},
			},
			scales: {
				x: {
					stacked: true,
					title: {
						display: true,
						text: 'Points Scored',
					},
				},
				y: {
					stacked: true,
					beginAtZero: true,
					title: {
						display: true,
						text: 'Frequency',
					},
					ticks: {
						stepSize: 1,
					},
				},
			},
		},
	});
}

function buildScoreHistoryChart(container, years) {
	const $section = createSection(
		container,
		'Score History',
		'Line graph of point totals over time. Click on names in the legend to toggle lines on/off.',
	);

	// Container for Chart.js
	const $canvasContainer = $('<div style="position: relative; height:500px; width:100%"></div>');
	const $canvas = $('<canvas></canvas>');
	$canvasContainer.append($canvas);
	$section.append($canvasContainer);
	container.append($section);

	const labels = years.map((y) => y.year);
	const datasets = [];

	// Get all unique people who have ever participated
	const allPeople = new Set();
	years.forEach((y) => {
		if (y.points) {
			Object.keys(y.points).forEach((p) => allPeople.add(p));
		}
	});

	Array.from(allPeople)
		.sort()
		.forEach((person) => {
			const data = years.map((y) => {
				if (y.points && y.points[person] !== undefined && y.points[person] > 0) {
					return y.points[person];
				}
				return null; // Gap in data
			});

			// Only add if they have at least one data point
			if (data.some((d) => d !== null)) {
				const color = PERSON_COLORS[person] || '#999999';
				datasets.push({
					label: person,
					data: data,
					borderColor: color,
					backgroundColor: color,
					borderWidth: 2,
					tension: 0.1, // Smooth lines slightly
					pointRadius: 4,
					pointHoverRadius: 6,
					fill: false,
					spanGaps: false, // Don't connect lines across gaps
				});
			}
		});

	new Chart($canvas[0], {
		type: 'line',
		data: {
			labels: labels,
			datasets: datasets,
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			interaction: {
				mode: 'nearest',
				axis: 'x',
				intersect: false,
			},
			plugins: {
				legend: {
					display: true,
					position: 'bottom',
					labels: {
						boxWidth: 12,
						font: {
							size: 10,
						},
						usePointStyle: true,
					},
				},
				tooltip: {
					callbacks: {
						title: (items) => `Year: ${items[0].label}`,
					},
				},
			},
			scales: {
				y: {
					beginAtZero: true,
					title: {
						display: true,
						text: 'Points',
					},
				},
				x: {
					title: {
						display: true,
						text: 'Year',
					},
				},
			},
		},
	});
}

function buildAchievementsTable(container, stats) {
	const $section = createSection(
		container,
		'Achievements & Streaks',
		'Career accomplishments including wins, losses, podium finishes (top 3), and consecutive year streaks.',
	);

	const { $table, $tbody } = createTable([
		'Person',
		'Total Wins',
		'Total Losses',
		'Podium Finishes',
		'Longest Win Streak',
		'Longest Losing Streak',
	]);
	$section.append($table);

	stats.forEach((s) => {
		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${s.wins}</td>`);
		$row.append(`<td>${s.losses}</td>`);
		$row.append(`<td>${s.podiumFinishes}</td>`);
		$row.append(`<td>${s.longestWinStreak || '-'}</td>`);
		$row.append(`<td>${s.longestLoseStreak || '-'}</td>`);
		$tbody.append($row);
	});

	// Initialize DataTable
	initDataTable($table, { order: [[1, 'desc']] });
}

function buildOverallPerformanceTable(container, stats) {
	const $section = createSection(
		container,
		'Overall Performance',
		'Summary of scoring statistics across all years of participation.',
	);

	const { $table, $tbody } = createTable(['Person', 'Avg Points', 'Best Score', 'Worst Score', 'Years Played']);
	$section.append($table);

	stats.forEach((s) => {
		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${(s.totalPoints / s.yearsParticipated).toFixed(1)}</td>`);
		$row.append(`<td>${s.bestScore} (${s.bestYear})</td>`);
		$row.append(`<td>${s.worstScore} (${s.worstYear})</td>`);
		$row.append(`<td>${s.yearsParticipated}</td>`);
		$tbody.append($row);
	});

	// Initialize DataTable
	initDataTable($table, { order: [[1, 'desc']] });
}

function buildAdvancedMetricsTable(container, stats) {
	const $section = createSection(
		container,
		'Advanced Metrics',
		'<strong>Consistency Score:</strong> Lower is better - measures how much your yearly scores vary (standard deviation). ' +
			'<strong>Win Rate:</strong> Percentage of years you finished in 1st place.',
	);

	const { $table, $tbody } = createTable(['Person', 'Consistency Score', 'Win Rate']);
	$section.append($table);

	stats.forEach((s) => {
		const winRate = s.yearsParticipated > 0 ? ((s.wins / s.yearsParticipated) * 100).toFixed(1) : '0.0';
		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${s.consistencyScore.toFixed(1)}</td>`);
		$row.append(`<td>${winRate}%</td>`);
		$tbody.append($row);
	});

	// Initialize DataTable
	initDataTable($table, { order: [[2, 'desc']] });
}
