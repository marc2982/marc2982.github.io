/** Tiny shared harness: awaits async tests, records {group, name, status, error}. */
export function createRunner() {
	const results = [];
	const pending = [];

	function test(group, name, fn) {
		pending.push(
			(async () => {
				try {
					await fn();
					results.push({ group, name, status: 'PASS' });
				} catch (e) {
					results.push({ group, name, status: 'FAIL', error: e.message });
				}
			})(),
		);
	}

	function assert(condition, message) {
		if (!condition) throw new Error(message || 'Assertion failed');
	}

	function assertEq(actual, expected, message = '') {
		const a = JSON.stringify(actual);
		const e = JSON.stringify(expected);
		if (a !== e) throw new Error(`${message} expected ${e}, got ${a}`.trim());
	}

	async function finish() {
		await Promise.all(pending);
		return results;
	}

	return { test, assert, assertEq, finish };
}
