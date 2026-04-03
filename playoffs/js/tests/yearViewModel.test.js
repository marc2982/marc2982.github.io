import { prepareRoundViewModel } from '../yearViewModel.js';

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
				{ letter: 'A', topSeed: 'BOS', bottomSeed: 'TOR' },
				{ letter: 'B', topSeed: 'FLA', bottomSeed: 'TBL' },
				{ letter: 'C', topSeed: 'NYR', bottomSeed: 'WSH' },
				{ letter: 'D', topSeed: 'CAR', bottomSeed: 'NYI' }
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
				{ letter: 'A', topSeed: 'BOS', bottomSeed: 'TOR' },
				{ letter: 'B', topSeed: 'FLA', bottomSeed: 'TBL' },
				{ letter: 'C', topSeed: 'NYR', bottomSeed: 'WSH' },
				{ letter: 'D', topSeed: 'CAR', bottomSeed: 'NYI' },
				{ letter: 'I', topSeed: undefined, bottomSeed: undefined } // Contingency Pick
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

	return results;
}
