import { Series, Team, ALL_SERIES } from './models';
const NHL_API_URL = "https://api-web.nhle.com/v1/playoff-bracket/{0}"; // TODO
const TOP = "top";
const BOTTOM = "bottom";
export class NhlApiHandler {
    constructor(year) {
        this.year = year;
        this.url = NHL_API_URL.replace("{0}", year.toString());
        this.teams = {};
        this.series = [];
    }
    async load() {
        console.log(`Calling API: ${this.url}`);
        //const data = await $.get(this.url);
        const data = await $.getJSON("../dist/2025.json");
        for (const series of data.series) {
            if (!series.seriesUrl) {
                continue; // series not fully set yet
            }
            const topSeed = this.buildTeam(series, TOP);
            const bottomSeed = this.buildTeam(series, BOTTOM);
            this.series.push(Series.create({
                letter: series.seriesLetter,
                topSeed: topSeed.short,
                bottomSeed: bottomSeed.short,
                topSeedWins: series.topSeedWins,
                bottomSeedWins: series.bottomSeedWins
            }));
            if (series.seriesTitle === "Stanley Cup Final") {
                break;
            }
        }
        // add future series to the list
        const existingLetters = this.series.map(s => s.letter);
        for (let i = 0; i < ALL_SERIES.length; i++) {
            const round = ALL_SERIES[i];
            for (const seriesLetter of round) {
                if (existingLetters.includes(seriesLetter)) {
                    continue; // already have a record of it
                }
                this.series.push(Series.create({
                    letter: seriesLetter,
                    topSeed: undefined,
                    bottomSeed: undefined,
                    topSeedWins: 0,
                    bottomSeedWins: 0
                }));
            }
        }
    }
    getTeams() {
        return this.teams;
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
            rank: series[`${topOrBottom}SeedRankAbbrev`]
        });
        this.teams[team.short] = team;
        return team;
    }
    // teamPickStr matches the full name of the team in picks.csv
    getTeam(teamPickStr) {
        // handle team discrepancies between picks and api
        // also handle older years when picks were only shorthand
        const conversionMap = {
            "BUFF": "BUF",
            "CAL": "CGY",
            "CLB": "CBJ",
            "LA": "LAK",
            "LV": "VGK",
            "MON": "MTL",
            "Montreal Canadiens": "Montréal Canadiens",
            "NAS": "NSH",
            "NASH": "NSH",
            "NJ": "NJD",
            "PHE": "PHX",
            "PHO": "PHX",
            "PITT": "PIT",
            "SJ": "SJS",
            "St Louis Blues": "St. Louis Blues",
            "TB": "TBL",
            "WAS": "WSH",
            "WASH": "WSH",
        };
        teamPickStr = conversionMap[teamPickStr] || teamPickStr;
        const foundTeam = Object.values(this.teams).find(team => teamPickStr === team.name || teamPickStr === team.short);
        if (!foundTeam) {
            throw new Error(`Could not find ${teamPickStr}`);
        }
        return foundTeam;
    }
    getSeries(letter) {
        const foundSeries = this.series.find(series => series.letter === letter);
        if (!foundSeries) {
            throw new Error(`Series ${letter} not found`);
        }
        return foundSeries;
    }
    getSeriesOrNone(letter) {
        try {
            return this.getSeries(letter);
        }
        catch {
            return null;
        }
    }
    *seriesIter(round) {
        const order = ALL_SERIES[round - 1];
        for (const letter of order) {
            yield this.getSeries(letter);
        }
    }
    getScfSeries() {
        return this.getSeries(ALL_SERIES[ALL_SERIES.length - 1][0]);
    }
    getScfTeams() {
        const teams = [];
        for (const letter of ALL_SERIES[2]) { // round 3 winners
            const series = this.getSeriesOrNone(letter);
            if (!series) {
                continue;
            }
            const winner = series.getWinner();
            if (!winner) {
                continue;
            }
            teams.push(winner.team);
        }
        return teams;
    }
}
