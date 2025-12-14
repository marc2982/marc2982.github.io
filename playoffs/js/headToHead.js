import { PEOPLE } from './constants.js';
import { loadYearlyIndex } from './common.js';
import { createSection } from './tableUtils.js';

export async function headToHead(container) {
	// Load yearly index for stats
	const yearlyIndex = await loadYearlyIndex();
	const years = Object.values(yearlyIndex).sort((a, b) => a.year - b.year);

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
	$controls.append('<span style="font-weight: bold;">VS</span>');
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

	// Event Listeners
	const updateStats = () => {
		const p1 = $select1.val();
		const p2 = $select2.val();
		renderComparison($comparison, p1, p2, years);
	};

	$select1.on('change', updateStats);
	$select2.on('change', updateStats);

	// Initial render
	updateStats();
}

function renderComparison(container, p1, p2, years) {
	if (p1 === p2) {
		container.html('<p style="color: red;">Please select two different people.</p>');
		return;
	}

	const stats1 = calculateStats(p1, years);
	const stats2 = calculateStats(p2, years);
	const headToHead = calculateHeadToHead(p1, p2, years);
	const closestFinishes = calculateClosestFinishes(p1, p2, years);
	const tiebreakerRecord = calculateTiebreakerRecord(p1, p2, years);

	let html = `
		<p class="helper-text">
			Comparing career stats and direct matchups between ${p1} and ${p2}.
		</p>
		<table class="stripe" style="width: 100%; margin-top: 20px;">
			<thead>
				<tr>
					<th style="width: 33%; text-align: center;">${p1}</th>
					<th style="width: 33%; text-align: center;">Metric</th>
					<th style="width: 33%; text-align: center;">${p2}</th>
				</tr>
			</thead>
			<tbody>
				${renderRow('Total Wins', stats1.wins, stats2.wins)}
				${renderRow('Avg Points', stats1.avgPoints, stats2.avgPoints)}
				${renderRow('Best Score', stats1.bestScore, stats2.bestScore)}
				${renderRow('Years Played', stats1.yearsPlayed, stats2.yearsPlayed)}
				<tr>
					<td colspan="3" style="text-align: center; font-weight: bold; background-color: #f8f9fa;">Head-to-Head Record</td>
				</tr>
				<tr>
					<td style="text-align: center; font-size: 1.2em; font-weight: ${
						headToHead.p1Wins > headToHead.p2Wins ? 'bold' : 'normal'
					}; color: ${
		headToHead.p1Wins > headToHead.p2Wins ? 'green' : headToHead.p1Wins < headToHead.p2Wins ? 'red' : ''
	}">${headToHead.p1Wins}</td>
					<td style="text-align: center;">Wins Against Each Other</td>
					<td style="text-align: center; font-size: 1.2em; font-weight: ${
						headToHead.p2Wins > headToHead.p1Wins ? 'bold' : 'normal'
					}; color: ${
		headToHead.p2Wins > headToHead.p1Wins ? 'green' : headToHead.p2Wins < headToHead.p1Wins ? 'red' : ''
	}">${headToHead.p2Wins}</td>
				</tr>
				<tr>
					<td style="text-align: center;">${headToHead.ties}</td>
					<td style="text-align: center;">Ties</td>
					<td style="text-align: center;">${headToHead.ties}</td>
				</tr>
				<tr>
					<td colspan="3" style="text-align: center; font-weight: bold; background-color: #f8f9fa;">Tiebreaker Record</td>
				</tr>
				<tr>
					<td style="text-align: center; font-weight: ${
						tiebreakerRecord.p1Wins > tiebreakerRecord.p2Wins ? 'bold' : 'normal'
					}; color: ${
		tiebreakerRecord.p1Wins > tiebreakerRecord.p2Wins
			? 'green'
			: tiebreakerRecord.p1Wins < tiebreakerRecord.p2Wins
			? 'red'
			: ''
	}">${tiebreakerRecord.p1Wins}</td>
					<td style="text-align: center;">Tiebreaker Wins</td>
					<td style="text-align: center; font-weight: ${
						tiebreakerRecord.p2Wins > tiebreakerRecord.p1Wins ? 'bold' : 'normal'
					}; color: ${
		tiebreakerRecord.p2Wins > tiebreakerRecord.p1Wins
			? 'green'
			: tiebreakerRecord.p2Wins < tiebreakerRecord.p1Wins
			? 'red'
			: ''
	}">${tiebreakerRecord.p2Wins}</td>
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
						<th style="text-align: center;">Year</th>
						<th style="text-align: center;">${p1} Score</th>
						<th style="text-align: center;">${p2} Score</th>
						<th style="text-align: center;">Difference</th>
					</tr>
				</thead>
				<tbody>
					${closestFinishes
						.map(
							(f) => `
						<tr>
							<td style="text-align: center;">${f.year}</td>
							<td style="text-align: center; font-weight: ${f.p1Score > f.p2Score ? 'bold' : 'normal'}; color: ${
								f.p1Score > f.p2Score ? 'green' : f.p1Score < f.p2Score ? 'red' : ''
							}">${f.p1Score}</td>
							<td style="text-align: center; font-weight: ${f.p2Score > f.p1Score ? 'bold' : 'normal'}; color: ${
								f.p2Score > f.p1Score ? 'green' : f.p2Score < f.p1Score ? 'red' : ''
							}">${f.p2Score}</td>
							<td style="text-align: center;">${f.diff} pts</td>
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
		color1 = 'green';
		color2 = 'red';
	} else if (val2 > val1) {
		color1 = 'red';
		color2 = 'green';
	}

	return `
		<tr>
			<td style="text-align: center; font-weight: ${color1 === 'green' ? 'bold' : 'normal'}; color: ${color1}">${v1}</td>
			<td style="text-align: center; color: #6c757d;">${label}</td>
			<td style="text-align: center; font-weight: ${color2 === 'green' ? 'bold' : 'normal'}; color: ${color2}">${v2}</td>
		</tr>
	`;
}

function calculateStats(person, years) {
	let wins = 0;
	let totalPoints = 0;
	let yearsPlayed = 0;
	let bestScore = 0;

	years.forEach((y) => {
		const score = y.points?.[person];
		if (score !== undefined) {
			yearsPlayed++;
			totalPoints += score;
			if (score > bestScore) bestScore = score;

			// Calculate rank to check for wins
			// A win is if they have the highest score (ties included)
			const maxScore = Math.max(...Object.values(y.points));
			if (score === maxScore) wins++;
		}
	});

	return {
		wins,
		avgPoints: yearsPlayed > 0 ? (totalPoints / yearsPlayed).toFixed(1) : '0.0',
		bestScore,
		yearsPlayed,
	};
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
				<th style="text-align: center;">Year</th>
				<th style="text-align: center;">Winner</th>
				<th style="text-align: center;">Score</th>
				<th style="text-align: center;">Runner-Up</th>
				<th style="text-align: center;">Score</th>
				<th style="text-align: center;">Margin</th>
			</tr>
		</thead>
	`);
	const $bigBody = $('<tbody></tbody>');
	biggestMargins.forEach((m) => {
		$bigBody.append(`
			<tr>
				<td style="text-align: center;">${m.year}</td>
				<td style="text-align: center; font-weight: bold; color: green;">${m.winner}</td>
				<td style="text-align: center;">${m.winnerScore}</td>
				<td style="text-align: center;">${m.runnerUp}</td>
				<td style="text-align: center;">${m.runnerUpScore}</td>
				<td style="text-align: center; font-weight: bold;">${m.margin} pts</td>
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
				<th style="text-align: center;">Year</th>
				<th style="text-align: center;">Winner</th>
				<th style="text-align: center;">Score</th>
				<th style="text-align: center;">Runner-Up</th>
				<th style="text-align: center;">Score</th>
				<th style="text-align: center;">Margin</th>
			</tr>
		</thead>
	`);
	const $smallBody = $('<tbody></tbody>');
	smallestMargins.forEach((m) => {
		$smallBody.append(`
			<tr>
				<td style="text-align: center;">${m.year}</td>
				<td style="text-align: center; font-weight: bold; color: green;">${m.winner}</td>
				<td style="text-align: center;">${m.winnerScore}</td>
				<td style="text-align: center;">${m.runnerUp}</td>
				<td style="text-align: center;">${m.runnerUpScore}</td>
				<td style="text-align: center; font-weight: bold;">${m.margin} pts</td>
			</tr>
		`);
	});
	$smallTable.append($smallBody);
	$section.append($smallTable);

	return $section;
}
