import { escapeHtml as esc } from './html.js';
import { PEOPLE } from './constants.js';
import { fetchJson } from './httpUtils.js';
import { getRealYears, toNameList, IN_PROGRESS } from './common.js';
import { personChip } from './badges.js';
import { findRepeatChampions } from './homeStats.js';

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

	const repeats = findRepeatChampions(years);
	const maxWins = Math.max(1, ...PEOPLE.map((p) => winners[p] ?? 0));
	const maxLosses = Math.max(1, ...PEOPLE.map((p) => losers[p] ?? 0));
	const bar = (value, max, cls) =>
		`<div class="bar-cell"><span class="bar-num">${value}</span><span class="bar-track"><span class="bar-fill ${cls}" style="width:${Math.round((value / max) * 100)}%"></span></span></div>`;
	const runLabel = (r) => (r.start === r.end ? String(r.start) : `${r.start}–${String(r.end).slice(2)}`);

	PEOPLE.forEach((person) => {
		var row = tbody.insertRow(); // insert in reverse order
		const wins = winners[person] ?? 0;
		const lost = losers[person] ?? 0;
		const runs = (repeats[person] || [])
			.map((r) => `<span class="repeat-badge" title="${esc(person)} won ${r.length} in a row (${r.start}–${r.end})">🔥 ${runLabel(r)}</span>`)
			.join('');
		row.insertCell().outerHTML = '<td data-label="Person">' + personChip(person) + runs + '</td>';
		row.insertCell().outerHTML = `<td data-label="Wins" data-order="${wins}">${bar(wins, maxWins, 'bar-win')}</td>`;
		row.insertCell().outerHTML = `<td data-label="Last place" data-order="${lost}">${bar(lost, maxLosses, 'bar-loss')}</td>`;
	});

	winsLossesTable.DataTable({
		info: false,
		order: [[1, 'desc']],
		paging: false,
		searching: false,
		autoWidth: false,
	});
}
