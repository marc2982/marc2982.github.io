// Removed dataclass library. Uses pure vanilla JS classes now.

// prettier-ignore
export const ALL_SERIES = [
	['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
	['I', 'J', 'K', 'L'],
	['M', 'N'], 
	['O']
];
export const WINNER_MAP = {
	I: ['A', 'B'],
	J: ['C', 'D'],
	K: ['E', 'F'],
	L: ['G', 'H'],
	M: ['I', 'J'],
	N: ['K', 'L'],
	O: ['M', 'N'],
};

// enum
export const PickStatus = Object.freeze({
	CORRECT: 'CORRECT',
	INCORRECT: 'INCORRECT',
	UNKNOWN: 'UNKNOWN',
});

/**
 * True when a seed value refers to an actual team (the NHL API / our own
 * placeholders use undefined, 'undefined' and 'TBD' for unresolved seeds).
 */
export function isTeamKnown(seed) {
	return !!seed && seed !== 'undefined' && String(seed).toUpperCase() !== 'TBD';
}

/**
 * Chooses which of a person's (possibly conditional) picks applies to a series.
 *
 * Overlapping rounds let people submit one pick per possible matchup, tagged
 * "TEAM (vs OPP)". Once the matchup is known the pick made for exactly that
 * matchup wins; picks without an opponent tag (older format) fall back to
 * matching on team alone. While the matchup is still unknown the first pick is used.
 */
export function selectActivePick(pickArray, series) {
	if (!pickArray || pickArray.length === 0) return null;
	if (pickArray.length === 1) return pickArray[0];
	const { topSeed, bottomSeed } = series;
	if (!isTeamKnown(topSeed) || !isTeamKnown(bottomSeed)) return pickArray[0];

	const inSeries = (team) => team === topSeed || team === bottomSeed;
	const exact = pickArray.find(
		(p) =>
			p.opponent &&
			((p.team === topSeed && p.opponent === bottomSeed) || (p.team === bottomSeed && p.opponent === topSeed)),
	);
	if (exact) return exact;
	return (
		pickArray.find((p) => !p.opponent && inSeries(p.team)) ||
		pickArray.find((p) => inSeries(p.team)) ||
		pickArray[0]
	);
}

class BaseModel {
	static create(data = {}) {
		const instance = new this();
		Object.assign(instance, data);
		return instance;
	}

	copy(overrides = {}) {
		const instance = new this.constructor();
		Object.assign(instance, this, overrides);
		return instance;
	}
}

export class Pick extends BaseModel {}

export class PickResult extends BaseModel {
	static create(data = {}) {
		const instance = super.create(data);
		if (data.pick) instance.pick = Pick.create(data.pick);
		return instance;
	}
}

export class Series extends BaseModel {
	getShortDesc() {
		return `${this.topSeed} vs ${this.bottomSeed}`;
	}
	isOver() {
		return this.isTopSeedWinner() || this.isBottomSeedWinner();
	}
	isTopSeedWinner() {
		return !!this.topSeed && this.topSeedWins === 4;
	}
	isBottomSeedWinner() {
		return !!this.bottomSeed && this.bottomSeedWins === 4;
	}
	totalGames() {
		return (this.topSeedWins || 0) + (this.bottomSeedWins || 0);
	}
	getWinner() {
		if (this.isTopSeedWinner()) {
			return Winner.create({ team: this.topSeed, games: this.totalGames() });
		}
		if (this.isBottomSeedWinner()) {
			return Winner.create({ team: this.bottomSeed, games: this.totalGames() });
		}
		return null;
	}
	getTopSeedShort() {
		return this.topSeed ? `${this.topSeed} ${this.topSeedWins}` : this.getPlaceholderSeed(0);
	}
	getBottomSeedShort() {
		return this.bottomSeed ? `${this.bottomSeed} ${this.bottomSeedWins}` : this.getPlaceholderSeed(1);
	}
	// Round 1 series have no parents, so an unseeded one is just "TBD"
	getPlaceholderSeed(index) {
		const parents = WINNER_MAP[this.letter];
		return parents ? `Winner ${parents[index]}` : 'TBD';
	}
	getSeriesSummary() {
		return `${this.getTopSeedShort()} - ${this.getBottomSeedShort()}`;
	}
	isLocked(now = new Date()) {
		if (!this.startTimeUTC) return false;
		return now >= new Date(this.startTimeUTC);
	}
	getNextGameDesc() {
		if (this.liveGameState === 'LIVE' || this.liveGameState === 'CRIT') {
			const pNum = this.periodNumber;
			const pType = this.periodType;
			let periodStr = '';
			if (pType === 'REG') {
				periodStr = `P${pNum}`;
			} else if (pType === 'OT') {
				periodStr = pNum > 3 ? `OT${pNum - 3}` : 'OT';
			} else {
				periodStr = pType;
			}
			return `LIVE - ${this.awayTeamAbbrev} ${this.awayTeamScore}, ${this.homeTeamAbbrev} ${this.homeTeamScore} (${periodStr})`;
		}
		if (this.liveGameState === 'FINAL') {
			const pNum = this.periodNumber;
			const pType = this.periodType;
			let periodStr = '';
			if (pType === 'OT') {
				periodStr = pNum > 4 ? ` (${pNum - 3}OT)` : ' (OT)';
			}
			return `FINAL - ${this.awayTeamAbbrev} ${this.awayTeamScore}, ${this.homeTeamAbbrev} ${this.homeTeamScore}${periodStr}`;
		}
		if (!this.nextGameStartTimeUTC) {
			if (this.totalGames() === 0 && !this.isOver()) {
				return 'G1: TBD';
			}
			return null;
		}
		const date = new Date(this.nextGameStartTimeUTC);
		const options = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
		const dateStr = date.toLocaleString('en-US', options);
		return `G${this.nextGameNumber}: ${dateStr}`;
	}
	getScoresTooltip() {
		if (!this.pastGameScores || this.pastGameScores.length === 0) return '';
		return this.pastGameScores.join('<br>');
	}
	static isRoundOpen(leadStartTimeUTC, now = new Date()) {
		if (!leadStartTimeUTC) return false;
		const leadTime = new Date(leadStartTimeUTC);
		const unlockTime = new Date(leadTime.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days before
		return now >= unlockTime;
	}
	static getChronologicalLeadSeries(seriesList) {
		let chronologicalLeadSeries = null;
		let earliestTime = Infinity;

		seriesList.forEach(s => {
			if (s.startTimeUTC) {
				const t = new Date(s.startTimeUTC).getTime();
				if (t < earliestTime) {
					earliestTime = t;
					chronologicalLeadSeries = s;
				}
			}
		});
		return chronologicalLeadSeries;
	}
}

export class Team extends BaseModel {}

export class Winner extends BaseModel {}

export class ProjectionCell extends BaseModel {}

export class Scoring extends BaseModel {}

export class PersonPointsSummary extends BaseModel {}

export class RoundSummary extends BaseModel {}

export class Round extends BaseModel {
	static create(data = {}) {
		const instance = super.create(data);
		if (data.scoring) instance.scoring = Scoring.create(data.scoring);
		if (data.summary) instance.summary = RoundSummary.create(data.summary);
		return instance;
	}
}

export class TiebreakInfo extends BaseModel {}

export class YearlySummary extends BaseModel {
	static create(data = {}) {
		const instance = super.create(data);
		if (data.tiebreakInfo) instance.tiebreakInfo = TiebreakInfo.create(data.tiebreakInfo);
		return instance;
	}
}

export const SCORING = [
	Scoring.create({ team: 1, games: 2, bonus: 3 }),
	Scoring.create({ team: 2, games: 3, bonus: 4 }),
	Scoring.create({ team: 3, games: 4, bonus: 5 }),
	Scoring.create({ team: 4, games: 5, bonus: 6 }),
];
