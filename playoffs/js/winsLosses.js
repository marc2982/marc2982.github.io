import { escapeHtml as esc } from './html.js';
import { PEOPLE } from './constants.js';
import { fetchJson } from './httpUtils.js';
import { getRealYears, toNameList, IN_PROGRESS } from './common.js';

export async function winsLosses(winsLossesTable) {
	// Load yearly index
	const yearlyIndex = await fetchJson('./data/summaries/yearly_index.json');

	// Convert to array
	const years = getRealYears(yearlyIndex);

	let thead = document.createElement('thead');
	winsLossesTable.append(thead);

	let headerRow = thead.insertRow();
	headerRow.insertCell().outerHTML = '<th>Person</th>';
	headerRow.insertCell().outerHTML = '<th># Wins</th>';
	headerRow.insertCell().outerHTML = '<th># Losers</th>';

	let tbody = document.createElement('tbody');
	winsLossesTable.append(tbody);

	let winners = {};
	let losers = {};

	years.forEach((yearData) => {
		if (yearData.poolWinner === IN_PROGRESS) return;
		toNameList(yearData.poolWinner).forEach((name) => {
			winners[name] = (winners[name] ?? 0) + 1;
		});
		toNameList(yearData.poolLoser).forEach((name) => {
			losers[name] = (losers[name] ?? 0) + 1;
		});
	});

	PEOPLE.forEach((person) => {
		var row = tbody.insertRow(); // insert in reverse order
		row.insertCell().outerHTML = '<td>' + esc(person) + '</td>';
		row.insertCell().outerHTML = '<td>' + (winners[person] ?? 0) + '</td>';
		row.insertCell().outerHTML = '<td>' + (losers[person] ?? 0) + '</td>';
	});

	winsLossesTable.DataTable({
		info: false,
		order: [[1, 'desc']],
		paging: false,
		searching: false,
		autoWidth: false,
	});
}
