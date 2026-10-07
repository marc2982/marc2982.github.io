// Pure helpers for manually adding a picks row to data/archive/<year>/roundN.csv.

const TEAM_RE = /^[A-Z]{2,3}$/;

/** "TBL:6" or "NYR@BOS:7" (contingency, written "NYR (vs BOS)") -> {winner, games}. Throws on bad input. */
export function parsePickSpec(spec) {
	const m = String(spec).trim().toUpperCase().match(/^([A-Z]{2,3})(?:@([A-Z]{2,3}))?:([4-7])$/);
	if (!m || !TEAM_RE.test(m[1])) throw new Error(`Bad pick "${spec}" (use TEAM:games or TEAM@OPPONENT:games, e.g. TBL:6)`);
	return { winner: m[2] ? `${m[1]} (vs ${m[2]})` : m[1], games: Number(m[3]) };
}

export function formatTimestamp(d = new Date()) {
	return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()} ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
}

/** Returns the new CSV text with the row appended. Throws if the name already has a row. */
export function appendPicksRow(csvText, name, specs, now = new Date()) {
	const cleanName = String(name || '').trim();
	if (!cleanName || /[,\r\n"]/.test(cleanName)) throw new Error('Invalid name');
	if (!specs.length) throw new Error('No picks given');
	const picks = specs.map(parsePickSpec);

	let text = String(csvText || '').replace(/\r\n/g, '\n').trim();
	if (!text) text = 'Timestamp,Your name' + ',Team,Games'.repeat(picks.length);
	const dup = text
		.split('\n')
		.slice(1)
		.some((l) => (l.split(',')[1] || '').trim().toLowerCase() === cleanName.toLowerCase());
	if (dup) throw new Error(`${cleanName} already has a row in this round's CSV`);

	const row = [formatTimestamp(now), cleanName, ...picks.flatMap((p) => [p.winner, p.games])];
	return text + '\n' + row.join(',') + '\n';
}
