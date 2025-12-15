import { PEOPLE } from './constants.js';
import { loadYearlyIndex, calculateCareerStats } from './common.js';
import { createSection } from './tableUtils.js';

export async function headToHead(container) {
	// Load yearly index for stats
	const yearlyIndex = await loadYearlyIndex();
	const years = Object.values(yearlyIndex).sort((a, b) => a.year - b.year);
	container.empty();

	// Build UI
	const $section = createSection(container, 'Head-to-Head Comparison');

	// Controls
	const $controls = $('<div style="display: flex; gap: 20px; margin-bottom: 20px; align-items: center;"></div>');

	const $select1 = $('<select class="person-select" id="h2h-p1"></select>');
	const $select2 = $('<select class="person-select" id="h2h-p2"></select>');

	PEOPLE.forEach((p) => {
		$select1.append(`<option value="${p}">${p}</option>`);
		$select2.append(`<option value="${p}">${p}</option>`);
	});

	// Set defaults (first two people)
	if (PEOPLE.length > 1) {
		$select2.val(PEOPLE[1]);
	}

	$controls.append('<label>Person 1:</label>');
	$controls.append($select1);
	$controls.append('<span class="text-bold">VS</span>');
	$controls.append('<label>Person 2:</label>');
	$controls.append($select2);

	$section.append($controls);

	// Comparison Container
	const $comparison = $('<div id="h2h-stats"></div>');
	$section.append($comparison);

	container.append($section);

	// Add Competition Margins section (not person-specific)
	const marginsSection = buildCompetitionMargins(years);
	container.append(marginsSection);

	const careerStats = calculateCareerStats(years);

	// Event Listeners
	const updateStats = () => {
		const p1 = $select1.val();
		const p2 = $select2.val();
		// We pass the pre-calculated careerStats to avoid re-calculating on every change
		renderComparison($comparison, p1, p2, years, careerStats);
	};

	$select1.on('change', updateStats);
	$select2.on('change', updateStats);

	// Initial render
	updateStats();
}

function renderComparison(container, p1, p2, years, careerStats) {
	if (p1 === p2) {
		container.html('<p class="text-danger">Please select two different people.</p>');
		return;
	}

	const s1 = careerStats[p1];
	const s2 = careerStats[p2];

	// Prepare simple stats object for renderRow
	// calculateCareerStats returns detailed objects, we just need summary scalar values
	const stats1 = {
		wins: s1 ? s1.wins : 0,
		avgPoints: s1 && s1.yearsParticipated > 0 ? (s1.totalPoints / s1.yearsParticipated).toFixed(1) : '0.0',
		bestScore: s1 ? s1.bestScore : 0,
		yearsPlayed: s1 ? s1.yearsParticipated : 0,
	};

	const stats2 = {
		wins: s2 ? s2.wins : 0,
		avgPoints: s2 && s2.yearsParticipated > 0 ? (s2.totalPoints / s2.yearsParticipated).toFixed(1) : '0.0',
		bestScore: s2 ? s2.bestScore : 0,
		yearsPlayed: s2 ? s2.yearsParticipated : 0,
	};

	const headToHead = calculateHeadToHead(p1, p2, years);
	const closestFinishes = calculateClosestFinishes(p1, p2, years);
	const tiebreakerRecord = calculateTiebreakerRecord(p1, p2, years);

	const p1H2HClass =
		headToHead.p1Wins > headToHead.p2Wins ? 'stat-win' : headToHead.p1Wins < headToHead.p2Wins ? 'stat-loss' : '';
	const p2H2HClass =
		headToHead.p2Wins > headToHead.p1Wins ? 'stat-win' : headToHead.p2Wins < headToHead.p1Wins ? 'stat-loss' : '';

	const p1TieClass =
		tiebreakerRecord.p1Wins > tiebreakerRecord.p2Wins
			? 'stat-win'
			: tiebreakerRecord.p1Wins < tiebreakerRecord.p2Wins
			? 'stat-loss'
			: '';
	const p2TieClass =
		tiebreakerRecord.p2Wins > tiebreakerRecord.p1Wins
			? 'stat-win'
			: tiebreakerRecord.p2Wins < tiebreakerRecord.p1Wins
			? 'stat-loss'
			: '';

	let html = `
		<p class="helper-text">
			Comparing career stats and direct matchups between ${p1} and ${p2}.
		</p>
		<table class="stripe" style="width: 100%; margin-top: 20px;">
			<thead>
				<tr>
					<th class="centered-cell" style="width: 33%;">${p1}</th>
					<th class="centered-cell" style="width: 33%;">Metric</th>
					<th class="centered-cell" style="width: 33%;">${p2}</th>
				</tr>
			</thead>
			<tbody>
				${renderRow('Total Wins', stats1.wins, stats2.wins)}
				${renderRow('Avg Points', stats1.avgPoints, stats2.avgPoints)}
				${renderRow('Best Score', stats1.bestScore, stats2.bestScore)}
				${renderRow('Years Played', stats1.yearsPlayed, stats2.yearsPlayed)}
				<tr>
					<td colspan="3" class="table-section-header">Head-to-Head Record</td>
				</tr>
				<tr>
					<td class="centered-cell emphasized-cell ${p1H2HClass}">${headToHead.p1Wins}</td>
					<td class="centered-cell">Wins Against Each Other</td>
					<td class="centered-cell emphasized-cell ${p2H2HClass}">${headToHead.p2Wins}</td>
				</tr>
				<tr>
					<td class="centered-cell">${headToHead.ties}</td>
					<td class="centered-cell">Ties</td>
					<td class="centered-cell">${headToHead.ties}</td>
				</tr>
				<tr>
					<td colspan="3" class="table-section-header">Tiebreaker Record</td>
				</tr>
				<tr>
					<td class="centered-cell ${p1TieClass}">${tiebreakerRecord.p1Wins}</td>
					<td class="centered-cell">Tiebreaker Wins</td>
					<td class="centered-cell ${p2TieClass}">${tiebreakerRecord.p2Wins}</td>
				</tr>
			</tbody>
		</table>
		
		${
			closestFinishes.length > 0
				? `
			<h3 style="margin-top: 30px;">Closest Finishes</h3>
			<p class="helper-text">
				Years where ${p1} and ${p2} had the smallest point differentials.
			</p>
			<table class="stripe" style="width: 100%;">
				<thead>
					<tr>
						<th class="centered-cell">Year</th>
						<th class="centered-cell">${p1} Score</th>
						<th class="centered-cell">${p2} Score</th>
						<th class="centered-cell">Difference</th>
					</tr>
				</thead>
				<tbody>
					${closestFinishes
						.map(
							(f) => `
						<tr>
							<td class="centered-cell">${f.year}</td>
							<td class="centered-cell ${f.p1Score > f.p2Score ? 'stat-win' : f.p1Score < f.p2Score ? 'stat-loss' : ''}">${
								f.p1Score
							}</td>
							<td class="centered-cell ${f.p2Score > f.p1Score ? 'stat-win' : f.p2Score < f.p1Score ? 'stat-loss' : ''}">${
								f.p2Score
							}</td>
							<td class="centered-cell">${f.diff} pts</td>
						</tr>
					`,
						)
						.join('')}
				</tbody>
			</table>
		`
				: ''
		}
	`;

	container.html(html);
}

function renderRow(label, v1, v2) {
	const val1 = parseFloat(v1) || 0;
	const val2 = parseFloat(v2) || 0;

	let color1 = '';
	let color2 = '';

	if (val1 > val2) {
		color1 = 'stat-win';
		color2 = 'stat-loss';
	} else if (val2 > val1) {
		color1 = 'stat-loss';
		color2 = 'stat-win';
	}

	return `
		<tr>
			<td class="centered-cell ${color1}">${v1}</td>
			<td class="metric-label">${label}</td>
			<td class="centered-cell ${color2}">${v2}</td>
		</tr>
	`;
}

function calculateHeadToHead(p1, p2, years) {
	let p1Wins = 0;
	let p2Wins = 0;
	let ties = 0;

	years.forEach((y) => {
		const s1 = y.points?.[p1];
		const s2 = y.points?.[p2];

		if (s1 !== undefined && s2 !== undefined) {
			if (s1 > s2) p1Wins++;
			else if (s2 > s1) p2Wins++;
			else ties++;
		}
	});

	return { p1Wins, p2Wins, ties };
}

function calculateClosestFinishes(p1, p2, years) {
	const finishes = [];

	years.forEach((y) => {
		const s1 = y.points?.[p1];
		const s2 = y.points?.[p2];

		if (s1 !== undefined && s2 !== undefined) {
			finishes.push({
				year: y.year,
				p1Score: s1,
				p2Score: s2,
				diff: Math.abs(s1 - s2),
			});
		}
	});

	// Sort by difference and return top 5
	return finishes.sort((a, b) => a.diff - b.diff).slice(0, 5);
}

function calculateTiebreakerRecord(p1, p2, years) {
	let p1Wins = 0;
	let p2Wins = 0;

	years.forEach((y) => {
		if (y.tiebreaker && y.tiebreaker.leaders) {
			const leaders = y.tiebreaker.leaders;
			const winner = y.tiebreaker.winner;

			// Check if both were in the tiebreaker
			const p1InTiebreaker = leaders.includes(p1);
			const p2InTiebreaker = leaders.includes(p2);

			if (p1InTiebreaker && p2InTiebreaker) {
				if (winner === p1) p1Wins++;
				else if (winner === p2) p2Wins++;
			}
		}
	});

	return { p1Wins, p2Wins };
}

function buildCompetitionMargins(years) {
	const margins = [];

	years.forEach((y) => {
		const scores = Object.entries(y.points || {})
			.map(([name, score]) => ({ name, score }))
			.sort((a, b) => b.score - a.score);

		if (scores.length >= 2 && scores[0].score > 0) {
			// Filter out years with missing data (0 points)
			const first = scores[0];
			const second = scores[1];
			const margin = first.score - second.score;

			margins.push({
				year: y.year,
				winner: first.name,
				winnerScore: first.score,
				runnerUp: second.name,
				runnerUpScore: second.score,
				margin,
			});
		}
	});

	// Sort by margin
	const biggestMargins = [...margins].sort((a, b) => b.margin - a.margin).slice(0, 3);
	const smallestMargins = [...margins].sort((a, b) => a.margin - b.margin).slice(0, 3);

	const $section = $('<div class="section-card" style="margin-top: 20px;"><h2>Competition Margins</h2></div>');

	$section.append('<p class="table-explanation">Biggest and smallest gaps between 1st and 2nd place finishers.</p>');

	// Biggest Margins
	$section.append('<h3>Biggest Blowouts</h3>');
	const $bigTable = $('<table class="stripe" style="width: 100%; margin-bottom: 30px;"></table>');
	$bigTable.append(`
		<thead>
			<tr>
				<th class="centered-cell">Year</th>
				<th class="centered-cell">Winner</th>
				<th class="centered-cell">Score</th>
				<th class="centered-cell">Runner-Up</th>
				<th class="centered-cell">Score</th>
				<th class="centered-cell">Margin</th>
			</tr>
		</thead>
	`);
	const $bigBody = $('<tbody></tbody>');
	biggestMargins.forEach((m) => {
		$bigBody.append(`
			<tr>
				<td class="centered-cell">${m.year}</td>
				<td class="centered-cell stat-win">${m.winner}</td>
				<td class="centered-cell">${m.winnerScore}</td>
				<td class="centered-cell">${m.runnerUp}</td>
				<td class="centered-cell">${m.runnerUpScore}</td>
				<td class="centered-cell text-bold">${m.margin} pts</td>
			</tr>
		`);
	});
	$bigTable.append($bigBody);
	$section.append($bigTable);

	// Smallest Margins
	$section.append('<h3>Closest Finishes</h3>');
	const $smallTable = $('<table class="stripe" style="width: 100%;"></table>');
	$smallTable.append(`
		<thead>
			<tr>
				<th class="centered-cell">Year</th>
				<th class="centered-cell">Winner</th>
				<th class="centered-cell">Score</th>
				<th class="centered-cell">Runner-Up</th>
				<th class="centered-cell">Score</th>
				<th class="centered-cell">Margin</th>
			</tr>
		</thead>
	`);
	const $smallBody = $('<tbody></tbody>');
	smallestMargins.forEach((m) => {
		$smallBody.append(`
			<tr>
				<td class="centered-cell">${m.year}</td>
				<td class="centered-cell stat-win">${m.winner}</td>
				<td class="centered-cell">${m.winnerScore}</td>
				<td class="centered-cell">${m.runnerUp}</td>
				<td class="centered-cell">${m.runnerUpScore}</td>
				<td class="centered-cell text-bold">${m.margin} pts</td>
			</tr>
		`);
	});
	$smallTable.append($smallBody);
	$section.append($smallTable);

	return $section;
}
