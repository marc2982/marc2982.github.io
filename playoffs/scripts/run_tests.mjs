import { runTests } from '../js/tests/logic.test.js';
import { runStatsTests } from '../js/tests/stats.test.js';
import { runImporterTests } from '../js/tests/importer.test.js';
import { runTests as runViewModelTests } from '../js/tests/yearViewModel.test.js';
import { runTests as runScenarioTests } from '../js/tests/scenarioAnalyzer.test.js';
import { runRegressionTests } from '../js/tests/regressions.test.js';
import { runBackendTests } from '../js/tests/backend.test.js';

async function main() {
	console.log('🏒 Running Playoff Unit Tests...\n');
	let results = await runTests();
	results = results.concat(await runStatsTests());
	results = results.concat(runImporterTests());
	results = results.concat(await runViewModelTests());
	results = results.concat(await runScenarioTests());
	results = results.concat(await runRegressionTests());
	results = results.concat(await runBackendTests());
	
	let passed = 0;
	let failed = 0;

	results.forEach(r => {
		if (r.status === 'PASS') {
			console.log(`✅ [PASS] ${r.group} - ${r.name}`);
			passed++;
		} else {
			console.error(`❌ [FAIL] ${r.group} - ${r.name}`);
			console.error(`   Reason: ${r.error}`);
			failed++;
		}
	});

	console.log(`\n📊 Results: ${passed} passed, ${failed} failed.`);
	if (failed > 0) {
		process.exit(1);
	}
}

main();
