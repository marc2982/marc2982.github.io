import { PEOPLE } from './constants.js';
import { fetchJson } from './httpUtils.js';

export async function performanceStats(container) {
	// Load yearly index
	const yearlyIndex = await fetchJson('./data/summaries/yearly_index.json');
	const years = Object.values(yearlyIndex).sort((a, b) => a.year - b.year);

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
			timesLedRound1: 0,
			yearlyScores: [],
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

			// Win/Loss tracking
			const isWinner = winners.includes(person);
			const isLoser = losers.includes(person);

			if (isWinner) {
				stats[person].wins++;
				stats[person].currentWinStreak++;
				stats[person].currentLoseStreak = 0;
				stats[person].longestWinStreak = Math.max(
					stats[person].longestWinStreak,
					stats[person].currentWinStreak,
				);
			} else {
				stats[person].currentWinStreak = 0;
			}

			if (isLoser) {
				stats[person].losses++;
				stats[person].currentLoseStreak++;
				stats[person].longestLoseStreak = Math.max(
					stats[person].longestLoseStreak,
					stats[person].currentLoseStreak,
				);
			} else {
				stats[person].currentLoseStreak = 0;
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
	buildAdvancedMetricsTable(container, activeStats);
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
	const $section = $('<div class="section-card"><h2>Score Distribution</h2></div>');
	const $explanation = $(
		'<p class="table-explanation">' +
			'Histogram of point totals across all years. Each color represents a different person. Hover to see the breakdown.' +
			'</p>',
	);
	$section.append($explanation);

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

function buildAchievementsTable(container, stats) {
	const $section = $('<div class="section-card"><h2>Achievements & Streaks</h2></div>');

	const $explanation = $(
		'<p class="table-explanation">' +
			'Career accomplishments including wins, losses, podium finishes (top 3), and consecutive year streaks.' +
			'</p>',
	);
	$section.append($explanation);

	const $table = $('<table class="stripe"></table>');

	// Header
	const $thead = $('<thead></thead>');
	const $headerRow = $('<tr></tr>');
	$headerRow.append('<th>Person</th>');
	$headerRow.append('<th>Total Wins</th>');
	$headerRow.append('<th>Total Losses</th>');
	$headerRow.append('<th>Podium Finishes</th>');
	$headerRow.append('<th>Longest Win Streak</th>');
	$headerRow.append('<th>Longest Losing Streak</th>');
	$thead.append($headerRow);
	$table.append($thead);

	// Body
	const $tbody = $('<tbody></tbody>');
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
	$table.append($tbody);

	$section.append($table);
	container.append($section);

	// Initialize DataTable
	$table.DataTable({
		info: false,
		paging: false,
		searching: false,
		order: [[1, 'desc']],
	});
}

function buildOverallPerformanceTable(container, stats) {
	const $section = $('<div class="section-card"><h2>Overall Performance</h2></div>');

	const $explanation = $(
		'<p class="table-explanation">' + 'Summary of scoring statistics across all years of participation.' + '</p>',
	);
	$section.append($explanation);

	const $table = $('<table class="stripe"></table>');

	// Header
	const $thead = $('<thead></thead>');
	const $headerRow = $('<tr></tr>');
	$headerRow.append('<th>Person</th>');
	$headerRow.append('<th>Avg Points</th>');
	$headerRow.append('<th>Best Score</th>');
	$headerRow.append('<th>Worst Score</th>');
	$headerRow.append('<th>Years Played</th>');
	$thead.append($headerRow);
	$table.append($thead);

	// Body
	const $tbody = $('<tbody></tbody>');
	stats.forEach((s) => {
		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${(s.totalPoints / s.yearsParticipated).toFixed(1)}</td>`);
		$row.append(`<td>${s.bestScore} (${s.bestYear})</td>`);
		$row.append(`<td>${s.worstScore} (${s.worstYear})</td>`);
		$row.append(`<td>${s.yearsParticipated}</td>`);
		$tbody.append($row);
	});
	$table.append($tbody);

	$section.append($table);
	container.append($section);

	// Initialize DataTable
	$table.DataTable({
		info: false,
		paging: false,
		searching: false,
		order: [[1, 'desc']],
	});
}

function buildAdvancedMetricsTable(container, stats) {
	const $section = $('<div class="section-card"><h2>Advanced Metrics</h2></div>');

	// Add explanatory text
	const $explanation = $(
		'<p class="table-explanation">' +
			'<strong>Consistency Score:</strong> Lower is better - measures how much your yearly scores vary (standard deviation). ' +
			'<strong>Win Rate:</strong> Percentage of years you finished in 1st place.' +
			'</p>',
	);
	$section.append($explanation);

	const $table = $('<table class="stripe"></table>');

	// Header
	const $thead = $('<thead></thead>');
	const $headerRow = $('<tr></tr>');
	$headerRow.append('<th>Person</th>');
	$headerRow.append('<th>Consistency Score</th>');
	$headerRow.append('<th>Win Rate</th>');
	$thead.append($headerRow);
	$table.append($thead);

	// Body
	const $tbody = $('<tbody></tbody>');
	stats.forEach((s) => {
		const winRate = s.yearsParticipated > 0 ? ((s.wins / s.yearsParticipated) * 100).toFixed(1) : '0.0';
		const $row = $('<tr></tr>');
		$row.append(`<td>${s.name}</td>`);
		$row.append(`<td>${s.consistencyScore.toFixed(1)}</td>`);
		$row.append(`<td>${winRate}%</td>`);
		$tbody.append($row);
	});
	$table.append($tbody);

	$section.append($table);
	container.append($section);

	// Initialize DataTable
	$table.DataTable({
		info: false,
		paging: false,
		searching: false,
		order: [[2, 'desc']],
	});
}
