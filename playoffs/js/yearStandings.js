import { prepareStandingsViewModel } from './yearViewModel.js';
import { personChip } from './badges.js';

/** Standings card: one stacked bar per person, split by round. */
export function renderStandings(data, container) {
	const vm = prepareStandingsViewModel(data);
	if (!vm.rows.length) {
		$(container).empty();
		return;
	}
	const rows = vm.rows
		.map((r) => {
			const segs = r.rounds
				.map((pts, i) => `<i class="r${i}" style="width:${r.total ? (pts / r.total) * 100 : 0}%" title="Round ${i + 1}: ${pts} pts"></i>`)
				.join('');
			return `<div class="st-row${r.rank <= 3 ? ' top' : ''}">
				<span class="st-rank">${r.rank}</span>
				<span class="st-who">${personChip(r.person)}</span>
				<div class="st-bar" style="width:${r.widthPct}%">${segs}</div>
				<span class="st-extra" title="${r.teams} teams correct, ${r.games} games correct, ${r.bonus} perfect-pick bonuses">${r.teams}<small>T</small> ${r.games}<small>G</small> ${r.bonus}<small>B</small></span>
				<span class="st-total">${r.total}</span>
			</div>`;
		})
		.join('');
	const legend = Array.from({ length: vm.roundCount }, (_, i) => `<span><b class="r${i}"></b>R${i + 1}</span>`).join('');
	$(container).html(`<div class="st-card"><h2>Standings</h2>${rows}<div class="st-legend">${legend}<span class="st-key">T = teams · G = games · B = bonus (perfect picks)</span></div></div>`);
}
