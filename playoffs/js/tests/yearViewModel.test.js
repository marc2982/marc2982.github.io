import { prepareRoundViewModel } from '../yearViewModel.js';
import { Series } from '../models.js';

function mockSeries(data) {
	return Series.create({ topSeedWins: 0, bottomSeedWins: 0, ...data });
}

export async function runTests() {
	const results = [];

	function test(group, name, fn) {
		try {
			fn();
			results.push({ group, name, status: 'PASS' });
		} catch (e) {
			results.push({ group, name, status: 'FAIL', error: e.message });
		}
	}

	function assert(condition, message) {
		if (!condition) throw new Error(message || 'Assertion failed');
	}

	test('Year ViewModel Config', 'Standard Round 2 (4 series) targeting', () => {
		const round = {
			number: 2,
			serieses: [
				mockSeries({ letter: 'A', topSeed: 'BOS', bottomSeed: 'TOR' }),
				mockSeries({ letter: 'B', topSeed: 'FLA', bottomSeed: 'TBL' }),
				mockSeries({ letter: 'C', topSeed: 'NYR', bottomSeed: 'WSH' }),
				mockSeries({ letter: 'D', topSeed: 'CAR', bottomSeed: 'NYI' })
			],
			pickResults: { 'Alice': {} },
			summary: { summaries: { 'Alice': { points: 0 } }, winners: [] }
		};

		const viewModel = prepareRoundViewModel({}, round);
		const config = viewModel.dataTableConfig;

		// With 4 series, orderable disabled for targets 1 to 4
		const unorderableDef = config.columnDefs.find(def => def.orderable === false);
		assert(unorderableDef.targets.join(',') === '1,2,3,4', `Expected targets 1,2,3,4, got ${unorderableDef.targets}`);

		// Points columns should be target 5 and 6
		const pointsDef = config.columnDefs.find(def => def.className && def.className.includes('points'));
		assert(pointsDef.targets.join(',') === '5,6', `Expected points targets 5,6, got ${pointsDef.targets}`);
	});

	test('Year ViewModel Config', 'Contingency Picks Round 2 (5 series) targeting', () => {
		const round = {
			number: 2,
			serieses: [
				mockSeries({ letter: 'A', topSeed: 'BOS', bottomSeed: 'TOR' }),
				mockSeries({ letter: 'B', topSeed: 'FLA', bottomSeed: 'TBL' }),
				mockSeries({ letter: 'C', topSeed: 'NYR', bottomSeed: 'WSH' }),
				mockSeries({ letter: 'D', topSeed: 'CAR', bottomSeed: 'NYI' }),
				mockSeries({ letter: 'I', topSeed: undefined, bottomSeed: undefined }) // Contingency Pick
			],
			pickResults: { 'Alice': {} },
			summary: { summaries: { 'Alice': { points: 0 } }, winners: [] }
		};

		const viewModel = prepareRoundViewModel({}, round);
		const config = viewModel.dataTableConfig;

		// With 5 series, orderable disabled for targets 1 to 5
		const unorderableDef = config.columnDefs.find(def => def.orderable === false);
		assert(unorderableDef.targets.join(',') === '1,2,3,4,5', `Expected targets 1,2,3,4,5, got ${unorderableDef.targets}`);

		// Points columns should be target 6 and 7
		const pointsDef = config.columnDefs.find(def => def.className && def.className.includes('points'));
		assert(pointsDef.targets.join(',') === '6,7', `Expected points targets 6,7, got ${pointsDef.targets}`);
	});

	test('Prior Overall', 'Round 1 has no prior overall', () => {
		const round = {
			number: 1,
			serieses: [
				mockSeries({ letter: 'A', topSeed: 'BOS', bottomSeed: 'TOR' }),
			],
			pickResults: { 'Alice': {} },
			summary: { summaries: { 'Alice': { points: 5 } }, winners: [] }
		};

		const viewModel = prepareRoundViewModel({}, round, null);
		assert(viewModel.hasPriorOverall === false, `Expected hasPriorOverall=false, got ${viewModel.hasPriorOverall}`);
		assert(viewModel.picks[0].priorOverall === null, `Expected priorOverall=null, got ${viewModel.picks[0].priorOverall}`);
	});

	test('Prior Overall', 'Round 2 includes prior overall points', () => {
		const round = {
			number: 2,
			serieses: [
				mockSeries({ letter: 'I', topSeed: 'BOS', bottomSeed: 'TOR' }),
				mockSeries({ letter: 'J', topSeed: 'FLA', bottomSeed: 'TBL' }),
			],
			pickResults: { 'Alice': {}, 'Bob': {} },
			summary: { summaries: { 'Alice': { points: 3 }, 'Bob': { points: 7 } }, winners: ['Bob'] }
		};
		const priorOverall = { 'Alice': 12, 'Bob': 8 };

		const viewModel = prepareRoundViewModel({}, round, priorOverall);
		assert(viewModel.hasPriorOverall === true, `Expected hasPriorOverall=true`);

		const alice = viewModel.picks.find(p => p.person === 'Alice');
		const bob = viewModel.picks.find(p => p.person === 'Bob');
		assert(alice.priorOverall === 12, `Expected Alice priorOverall=12, got ${alice.priorOverall}`);
		assert(bob.priorOverall === 8, `Expected Bob priorOverall=8, got ${bob.priorOverall}`);
	});

	test('Prior Overall', 'Missing person defaults to 0', () => {
		const round = {
			number: 3,
			serieses: [
				mockSeries({ letter: 'M', topSeed: 'BOS', bottomSeed: 'TOR' }),
			],
			pickResults: { 'NewGuy': {} },
			summary: { summaries: { 'NewGuy': { points: 0 } }, winners: [] }
		};
		const priorOverall = { 'Alice': 20 }; // NewGuy not in prior rounds

		const viewModel = prepareRoundViewModel({}, round, priorOverall);
		const newGuy = viewModel.picks.find(p => p.person === 'NewGuy');
		assert(newGuy.priorOverall === 0, `Expected priorOverall=0 for new participant, got ${newGuy.priorOverall}`);
	});

	test('Prior Overall', 'DataTable config unchanged for points targets with prior overall', () => {
		const round = {
			number: 2,
			serieses: [
				mockSeries({ letter: 'I', topSeed: 'BOS', bottomSeed: 'TOR' }),
				mockSeries({ letter: 'J', topSeed: 'FLA', bottomSeed: 'TBL' }),
			],
			pickResults: { 'Alice': {} },
			summary: { summaries: { 'Alice': { points: 0 } }, winners: [] }
		};

		const viewModel = prepareRoundViewModel({}, round, { 'Alice': 10 });
		const config = viewModel.dataTableConfig;

		// Points targets should still be numSeries+1, numSeries+2 (3,4) — not shifted
		const pointsDef = config.columnDefs.find(def => def.className && def.className.includes('points'));
		assert(pointsDef.targets.join(',') === '3,4', `Expected points targets 3,4, got ${pointsDef.targets}`);

		// Small col width should now cover 5 columns (the 4 stats + prior overall)
		const widthDef = config.columnDefs.find(def => def.width === '5%');
		assert(widthDef.targets.length === 5, `Expected 5 small columns, got ${widthDef.targets.length}`);
	});

	return results;
}
