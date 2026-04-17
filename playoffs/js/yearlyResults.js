import { TEAMS } from './constants.js';
import { fetchJson, fetchText } from './httpUtils.js';
import { showGlobalError } from './errorOverlay.js';

// Detects current season phase and updates the progress-state span.
async function updateProgressState(year) {
	const el = document.getElementById(`progress-state-${year}`);
	if (!el) return;

	try {
		const api = await fetchJson(`./data/archive/${year}/api.json`);
		const isProjected = api?.bracketTitle?.default?.includes('Started Today');

		if (isProjected || !api?.series) {
			el.textContent = '⏳ Awaiting Matchups';
			return;
		}

		// Check if any picks have been submitted
		let hasPicks = false;
		try {
			await fetchText(`./data/archive/${year}/round1.csv`);
			hasPicks = true;
		} catch (e) {
			if (e.message !== 'NOT_FOUND') throw e;
		}

		if (!hasPicks) {
			el.textContent = '📋 Gathering Picks';
			return;
		}

		// Check if the first game has actually started
		const seriesLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
		let earliestStart = null;
		for (const letter of seriesLetters) {
			try {
				const schedule = await fetchJson(`./data/archive/${year}/schedule_${letter}.json`);
				if (schedule?.games?.[0]?.startTimeUTC) {
					const gameStart = new Date(schedule.games[0].startTimeUTC);
					if (!earliestStart || gameStart < earliestStart) {
						earliestStart = gameStart;
					}
				}
			} catch (e) {
				// Schedule not available yet, skip
			}
		}

		if (earliestStart && new Date() >= earliestStart) {
			el.textContent = '🏒 Watching Hockey';
		} else {
			el.textContent = '📋 Gathering Picks';
		}
	} catch (e) {
		if (e.message === 'NOT_FOUND') {
			el.textContent = '⏳ Awaiting Matchups';
		} else {
			console.warn('Could not determine progress state:', e);
		}
	}
}

export async function yearlyResults(resultsTable) {
	try {
		// Load yearly index
		const yearlyIndex = await fetchJson('./data/summaries/yearly_index.json');

		// Convert to array and sort by year descending
		const years = Object.entries(yearlyIndex)
			.map(([year, data]) => ({ year: parseInt(year), ...data }))
			.filter(data => data.year !== 3000)
			.sort((a, b) => b.year - a.year);

		let thead = document.createElement('thead');
		resultsTable.append(thead);

		let headerRow = thead.insertRow();
		headerRow.insertCell().outerHTML = '<th>Year</th>';
		headerRow.insertCell().outerHTML = '<th>Pool Winner(s)</th>';
		headerRow.insertCell().outerHTML = '<th>Pool Loser(s)</th>';
		headerRow.insertCell().outerHTML = '<th>Cup Winner</th>';

		let tbody = document.createElement('tbody');
		resultsTable.append(tbody);

		years.forEach((yearData) => {
			const poolWinner = yearData.poolWinner || '-';
			const poolLoser = yearData.poolLoser || '-';
			const cupWinner = yearData.cupWinner || '';

			const isCurrentProgress = poolWinner === 'In Progress';
			const poolWinners = Array.isArray(poolWinner) ? poolWinner : [poolWinner];
			const poolLosers = Array.isArray(poolLoser) ? poolLoser : [poolLoser];
			const poolWinnersHtml = isCurrentProgress 
				? `<span id="progress-state-${yearData.year}">In Progress</span>`
				: poolWinners.join(', ');

			var row = tbody.insertRow();
			const hasLink = yearData.year >= 1997 && yearData.year !== 2005 && yearData.year !== 2013;
			var innerHtml = hasLink
				? '<a href="year.html?year=' + yearData.year + '">' + yearData.year + ' </a>'
				: yearData.year;
			row.insertCell().outerHTML = '<td>' + innerHtml + '</td>';
			row.insertCell().outerHTML = '<td>' + poolWinnersHtml + '</td>';
			row.insertCell().outerHTML = '<td>' + poolLosers.join(', ') + '</td>';
			row.insertCell().outerHTML = '<td>' + (TEAMS[cupWinner] || cupWinner) + '</td>';

			if (isCurrentProgress) {
				updateProgressState(yearData.year);
			}
		});

		resultsTable.DataTable({
			info: false,
			order: [[1, 'desc']],
			ordering: false,
			paging: false,
			searching: false,
		});
	} catch (e) {
		console.error("Critical home page rendering error:", e);
		showGlobalError(e);
	}
}
