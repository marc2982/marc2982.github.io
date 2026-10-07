// Shared name / team badges so people and teams look the same on every page.
import { escapeHtml as esc } from './html.js';
import { TEAMS } from './constants.js';

// Hand-picked hues (0-360) so neighbouring names in a list never look alike; unknown names fall back to a hash.
const PERSON_HUES = {
	Benedict: 200,
	Chrissy: 330,
	Derrick: 8,
	Glenda: 280,
	Jaclyn: 165,
	Jake: 45,
	Jamie: 100,
	Kiersten: 305,
	Marc: 225,
	Nathan: 25,
	Nickall: 185,
	Robin: 350,
	Ryan: 70,
	Sophie: 255,
	Stephanie: 130,
	Theodore: 55,
};

export function personHue(name) {
	if (name in PERSON_HUES) return PERSON_HUES[name];
	let h = 0;
	for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
	return h;
}

/**
 * Coloured initial + name. role: 'winner' (gold, trophy), 'loser' (muted, spoon) or omitted.
 */
export function personChip(name, role = null) {
	const icon = role === 'winner' ? '<span class="chip-icon" title="Pool winner">🏆</span>' : role === 'loser' ? '<span class="chip-icon" title="Last place">🥄</span>' : '';
	const cls = role ? ` person-${role}` : '';
	const initial = esc(String(name).charAt(0).toUpperCase());
	return `<span class="person-chip${cls}" style="--h:${personHue(name)}"><span class="avatar">${initial}</span><span class="chip-name">${esc(name)}</span>${icon}</span>`;
}

/** Chips for a list of names (empty list gives an empty string). */
export function personChips(names, role = null) {
	return names.map((n) => personChip(n, role)).join('');
}

// Primary team colours for teams that have won a Cup in the pool era (anything else gets a neutral accent).
const TEAM_COLORS = {
	ANA: '#F47A38',
	BOS: '#FFB81C',
	CAR: '#CE1126',
	CHI: '#CF0A2C',
	COL: '#6F263D',
	DAL: '#006847',
	DET: '#CE1126',
	EDM: '#FF4C00',
	FLA: '#C8102E',
	LAK: '#A2AAAD',
	NJD: '#CE1126',
	PIT: '#FCB514',
	STL: '#002F87',
	TBL: '#002868',
	VGK: '#B4975A',
	WSH: '#C8102E',
	WAS: '#C8102E',
};

/** Team name with a colour accent and (when it loads) the NHL logo. */
export function teamChip(code) {
	if (!code) return '';
	const name = TEAMS[code] || code;
	const color = TEAM_COLORS[code] || '#868e96';
	const logoCode = code === 'WAS' ? 'WSH' : code;
	const logo = `<img class="team-logo" src="https://assets.nhle.com/logos/nhl/svg/${esc(logoCode)}_light.svg" alt="" loading="lazy" onerror="this.remove()">`;
	return `<span class="team-chip" style="--team:${color}">${logo}<span class="chip-name">${esc(name)}</span></span>`;
}
