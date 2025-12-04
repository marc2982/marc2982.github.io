import { TEAMS } from './constants.js';
import { fetchJson } from './httpUtils.js';

export async function yearlyResults(resultsTable) {
	// Load yearly index
	const yearlyIndex = await fetchJson('./data/summaries/yearly_index.json');

	// Convert to array and sort by year descending
	const years = Object.entries(yearlyIndex)
		.map(([year, data]) => ({ year: parseInt(year), ...data }))
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

		const poolWinners = Array.isArray(poolWinner) ? poolWinner : [poolWinner];
		const poolLosers = Array.isArray(poolLoser) ? poolLoser : [poolLoser];

		var row = tbody.insertRow();
		const hasLink = yearData.year >= 1997 && yearData.year !== 2005 && yearData.year !== 2013;
		var innerHtml = hasLink
			? '<a href="year.html?year=' + yearData.year + '">' + yearData.year + ' </a>'
			: yearData.year;
		row.insertCell().outerHTML = '<td>' + innerHtml + '</td>';
		row.insertCell().outerHTML = '<td>' + poolWinners.join(', ') + '</td>';
		row.insertCell().outerHTML = '<td>' + poolLosers.join(', ') + '</td>';
		row.insertCell().outerHTML = '<td>' + (TEAMS[cupWinner] || cupWinner) + '</td>';
	});

	resultsTable.DataTable({
		info: false,
		order: [[1, 'desc']],
		ordering: false,
		paging: false,
		searching: false,
	});
}
