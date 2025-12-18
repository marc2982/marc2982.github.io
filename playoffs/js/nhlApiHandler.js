import { Series, Team, ALL_SERIES } from './models.js';
import { DataLoader } from './dataLoader.js';
import { SeriesRepository, TeamRepository } from './repositories.js';

const TOP = 'top';
const BOTTOM = 'bottom';

export class NhlApiHandler {
	constructor(year, dataLoader) {
		this.year = year;
		this.dataLoader = dataLoader;
		this.teams = {};
		this.series = [];
	}

	async load() {
		// Use the injected DataLoader to fetch data
		const data = await this.dataLoader.load();

		if (!data || !data.series) {
			throw new Error('PLAYOFFS_NOT_STARTED');
		}

		// Process the data
		for (const series of data.series) {
			if (!series.seriesUrl) {
				continue; // series not fully set yet
			}
			const topSeed = this.buildTeam(series, TOP);
			const bottomSeed = this.buildTeam(series, BOTTOM);
			this.series.push(
				Series.create({
					letter: series.seriesLetter,
					topSeed: topSeed.short,
					bottomSeed: bottomSeed.short,
					topSeedWins: series.topSeedWins,
					bottomSeedWins: series.bottomSeedWins,
				}),
			);
			if (series.seriesTitle === 'Stanley Cup Final') {
				break;
			}
		}
		// add future series to the list
		const existingLetters = this.series.map((s) => s.letter);
		for (let i = 0; i < ALL_SERIES.length; i++) {
			const round = ALL_SERIES[i];
			for (const seriesLetter of round) {
				if (existingLetters.includes(seriesLetter)) {
					continue; // already have a record of it
				}
				this.series.push(
					Series.create({
						letter: seriesLetter,
						topSeed: undefined,
						bottomSeed: undefined,
						topSeedWins: 0,
						bottomSeedWins: 0,
					}),
				);
			}
		}
	}

	async fetchSchedules(seriesLetters) {
		const promises = seriesLetters.map(async (letter) => {
			const index = this.series.findIndex((s) => s.letter === letter);
			if (index !== -1) {
				const series = this.series[index];
				const schedule = await this.dataLoader.fetchSeriesSchedule(this.year, letter);
				if (schedule && schedule.games && schedule.games.length > 0) {
					// Series objects are immutable (dataclass), so we must create a copy
					this.series[index] = series.copy({ startTimeUTC: schedule.games[0].startTimeUTC });
				}
			}
		});
		await Promise.all(promises);
	}

	getTeams() {
		return this.teams;
	}

	getSeriesList() {
		return this.series;
	}

	buildTeam(series, topOrBottom) {
		const seed = series[`${topOrBottom}SeedTeam`];
		const short = seed.abbrev;
		// only need to load each team once
		if (this.teams[short]) {
			return this.teams[short];
		}
		const team = Team.create({
			name: seed.name.default,
			short: short,
			logo: seed.logo,
			rank: series[`${topOrBottom}SeedRankAbbrev`],
		});
		this.teams[team.short] = team;
		return team;
	}
}

export class NhlTeamRepository extends TeamRepository {
	constructor(teams) {
		super();
		this.teams = teams;
	}

	getAllTeams() {
		return this.teams;
	}

	// teamPickStr matches the full name of the team in picks.csv
	getTeam(teamPickStr) {
		// handle team discrepancies between picks and api
		// also handle older years when picks were only shorthand
		const conversionMap = {
			BUFF: 'BUF',
			CAL: 'CGY',
			CLB: 'CBJ',
			LA: 'LAK',
			LV: 'VGK',
			MON: 'MTL',
			'Montreal Canadiens': 'Montréal Canadiens',
			NAS: 'NSH',
			NASH: 'NSH',
			NJ: 'NJD',
			PHE: 'PHX',
			PHO: 'PHX',
			PITT: 'PIT',
			SJ: 'SJS',
			'St Louis Blues': 'St. Louis Blues',
			TB: 'TBL',
			WAS: 'WSH',
			WASH: 'WSH',
		};
		teamPickStr = conversionMap[teamPickStr] || teamPickStr;
		const foundTeam = Object.values(this.teams).find(
			(team) => teamPickStr === team.name || teamPickStr === team.short,
		);
		if (!foundTeam) {
			throw new Error(`Could not find ${teamPickStr}`);
		}
		return foundTeam;
	}
}

export class NhlSeriesRepository extends SeriesRepository {
	constructor(series) {
		super();
		this.series = series;
	}

	getSeries(letter) {
		const foundSeries = this.series.find((series) => series.letter === letter);
		if (!foundSeries) {
			throw new Error(`Series ${letter} not found`);
		}
		return foundSeries;
	}

	getSeriesOrNone(letter) {
		try {
			return this.getSeries(letter);
		} catch {
			return null;
		}
	}

	getScfSeries() {
		return this.getSeries(ALL_SERIES[ALL_SERIES.length - 1][0]);
	}
}
