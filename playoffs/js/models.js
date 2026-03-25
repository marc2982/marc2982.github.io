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
export var PickStatus;
(function (PickStatus) {
	PickStatus['CORRECT'] = 'CORRECT';
	PickStatus['INCORRECT'] = 'INCORRECT';
	PickStatus['UNKNOWN'] = 'UNKNOWN';
})(PickStatus || (PickStatus = {}));

class BaseModel {
	static create(data = {}) {
		const instance = new this();
		Object.assign(instance, data);
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
		return this.topSeed ? `${this.topSeed} ${this.topSeedWins}` : `Winner ${WINNER_MAP[this.letter][0]}`;
	}
	getBottomSeedShort() {
		return this.bottomSeed ? `${this.bottomSeed} ${this.bottomSeedWins}` : `Winner ${WINNER_MAP[this.letter][1]}`;
	}
	getSeriesSummary() {
		return `${this.getTopSeedShort()} - ${this.getBottomSeedShort()}`;
	}
	isLocked(now = new Date()) {
		if (!this.startTimeUTC) return false;
		return now >= new Date(this.startTimeUTC);
	}
	static isRoundOpen(leadStartTimeUTC, now = new Date()) {
		if (!leadStartTimeUTC) return false;
		const leadTime = new Date(leadStartTimeUTC);
		const unlockTime = new Date(leadTime.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days before
		return now >= unlockTime;
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
