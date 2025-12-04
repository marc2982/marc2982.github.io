import { PEOPLE } from './constants.js';
import { fetchJson } from './httpUtils.js';

export async function winsLosses(winsLossesTable) {
	// Load yearly index
	const yearlyIndex = await fetchJson('./data/summaries/yearly_index.json');

	// Convert to array
	const years = Object.values(yearlyIndex);

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
		const poolWinner = yearData.poolWinner;
		const poolLoser = yearData.poolLoser;

		const poolWinners = Array.isArray(poolWinner) ? poolWinner : [poolWinner];
		const poolLosers = Array.isArray(poolLoser) ? poolLoser : [poolLoser];

		poolWinners.forEach((winner) => {
			if (!winner || winner === '-') return;
			let name = winner.replace('*', '');
			winners[name] = (winners[name] ?? 0) + 1;
		});

		poolLosers.forEach((loser) => {
			if (!loser || loser === '-') return;
			let name = loser.replace('*', '');
			losers[name] = (losers[name] ?? 0) + 1;
		});
	});

	PEOPLE.forEach((person) => {
		var row = tbody.insertRow(); // insert in reverse order
		row.insertCell().outerHTML = '<td>' + person + '</td>';
		row.insertCell().outerHTML = '<td>' + (winners[person] ?? 0) + '</td>';
		row.insertCell().outerHTML = '<td>' + (losers[person] ?? 0) + '</td>';
	});

	winsLossesTable.DataTable({
		info: false,
		order: [[1, 'desc']],
		paging: false,
		searching: false,
		// stripeClasses: ['stripe-1', 'stripe-2']
	});
}
