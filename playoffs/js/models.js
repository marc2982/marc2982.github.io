import { Data } from 'https://cdn.skypack.dev/dataclass';

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

// dataclass library requires default values for some reason
const DEFAULT_STRING = 'DEFAULT_STRING';
const DEFAULT_NUMBER = -9999;

export class Pick extends Data {
	constructor() {
		super(...arguments);
		this.team = DEFAULT_STRING;
		this.games = DEFAULT_NUMBER;
	}
}

export class PickResult extends Data {
	constructor() {
		super(...arguments);
		this.pick = Pick.create({});
		this.teamStatus = PickStatus.UNKNOWN;
		this.gamesStatus = PickStatus.UNKNOWN;
		this.points = DEFAULT_NUMBER;
		this.possiblePoints = DEFAULT_NUMBER;
		this.earnedBonusPoints = false;
	}
}

export class Series extends Data {
	constructor() {
		super(...arguments);
		this.letter = DEFAULT_STRING;
		this.topSeed = undefined;
		this.bottomSeed = undefined;
		this.topSeedWins = DEFAULT_NUMBER;
		this.bottomSeedWins = DEFAULT_NUMBER;
		this.startTimeUTC = undefined;
	}
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
		return this.topSeedWins + this.bottomSeedWins;
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

export class Team extends Data {
	constructor() {
		super(...arguments);
		this.name = DEFAULT_STRING;
		this.short = DEFAULT_STRING;
		this.logo = DEFAULT_STRING;
		this.rank = DEFAULT_STRING;
	}
}

export class Winner extends Data {
	constructor() {
		super(...arguments);
		this.team = DEFAULT_STRING;
		this.games = DEFAULT_NUMBER;
	}
}

export class ProjectionCell extends Data {
	constructor() {
		super(...arguments);
		this.first = [];
		this.second = [];
		this.third = [];
		this.losers = [];
		this.isPossible = undefined;
		this.isOver = undefined;
	}
}

export class Scoring extends Data {
	constructor() {
		super(...arguments);
		this.team = DEFAULT_NUMBER;
		this.games = DEFAULT_NUMBER;
		this.bonus = DEFAULT_NUMBER;
	}
}

export class PersonPointsSummary extends Data {
	constructor() {
		super(...arguments);
		this.person = DEFAULT_STRING;
		this.points = DEFAULT_NUMBER;
		this.possiblePoints = DEFAULT_NUMBER;
		this.rank = DEFAULT_NUMBER;
		this.teamsCorrect = DEFAULT_NUMBER;
		this.gamesCorrect = DEFAULT_NUMBER;
		this.bonusEarned = DEFAULT_NUMBER;
	}
}

export class RoundSummary extends Data {
	constructor() {
		super(...arguments);
		this.summaries = {};
		this.winners = [];
		this.losers = [];
	}
}

export class Round extends Data {
	constructor() {
		super(...arguments);
		this.number = DEFAULT_NUMBER;
		this.serieses = [];
		this.pickResults = {};
		this.scoring = Scoring.create({});
		this.summary = RoundSummary.create({});
	}
}

export class TiebreakInfo extends Data {
	constructor() {
		super(...arguments);
		this.leaders = [];
		this.winner = undefined;
	}
}

export class YearlySummary extends Data {
	constructor() {
		super(...arguments);
		this.year = DEFAULT_NUMBER;
		this.rounds = [];
		this.personSummaries = {};
		this.winners = [];
		this.losers = [];
		this.tiebreakInfo = TiebreakInfo.create({});
		this.projections = {};
		this.teams = {};
	}
}

export const SCORING = [
	Scoring.create({ team: 1, games: 2, bonus: 3 }),
	Scoring.create({ team: 2, games: 3, bonus: 4 }),
	Scoring.create({ team: 3, games: 4, bonus: 5 }),
	Scoring.create({ team: 4, games: 5, bonus: 6 }),
];
