import { ProjectionCell } from './models.js';
import { excelRank } from './common.js';
export class ProjectionCalculator {
    constructor(nhlApiHandler) {
        this.api = nhlApiHandler;
    }
    calculate(rounds) {
        var _a;
        const scfSeries = rounds[rounds.length - 1].serieses[0];
        const scfTeams = [scfSeries.topSeed, scfSeries.bottomSeed];
        console.log('rounds:', rounds);
        console.log('SCF Series:', scfSeries);
        console.log('SCF Teams:', scfTeams);
        if (scfTeams.includes(undefined)) {
            console.error('SCF Teams are undefined:', scfTeams);
            return this.createEmptyTable();
        }
        console.log('calculate projections for SCF Teams:', scfTeams);
        const thirdRoundPoints = this.calculateThirdRoundPoints(rounds);
        const roundFourPicks = rounds[rounds.length - 1].pickResults;
        const roundFourScoring = rounds[rounds.length - 1].scoring;
        const projections = {};
        for (let games = 4; games <= 7; games++) {
            const cells = {};
            for (const team of scfTeams) {
                const points = { ...thirdRoundPoints };
                for (const person in points) {
                    const roundPick = (_a = roundFourPicks[person]) === null || _a === void 0 ? void 0 : _a['O'];
                    if (roundPick) {
                        points[person] += this.calculateFourthRound(roundFourScoring, roundPick.pick, team, games);
                    }
                    else {
                        points[person] += 0;
                    }
                }
                const allPoints = Object.values(points);
                const rankMap = {};
                for (const [person, score] of Object.entries(points)) {
                    rankMap[person] = excelRank(allPoints, score);
                }
                const loserRank = Math.max(...Object.values(rankMap).filter(rank => rank !== null));
                cells[team] = ProjectionCell.create({
                    first: Object.entries(rankMap)
                        .filter(([_, rank]) => rank === 1)
                        .map(([person]) => `${person} (${points[person]} pts)`),
                    second: Object.entries(rankMap)
                        .filter(([_, rank]) => rank === 2)
                        .map(([person]) => `${person} (${points[person]} pts)`),
                    third: Object.entries(rankMap)
                        .filter(([_, rank]) => rank === 3)
                        .map(([person]) => `${person} (${points[person]} pts)`),
                    losers: Object.entries(rankMap)
                        .filter(([_, rank]) => rank === loserRank)
                        .map(([person]) => `${person} (${points[person]} pts)`),
                    isPossible: this.calculateIsPossible(team, games),
                    isOver: scfSeries.isOver()
                });
            }
            projections[games] = cells;
        }
        return projections;
    }
    calculateIsPossible(team, games) {
        const scfSeries = this.api.getScfSeries();
        if (scfSeries.isOver()) {
            if (scfSeries.totalGames() !== games) {
                return false;
            }
            return scfSeries.isTopSeedWinner()
                ? team === scfSeries.topSeed
                : team === scfSeries.bottomSeed;
        }
        const topSeed = { team: scfSeries.topSeed, wins: scfSeries.topSeedWins };
        const bottomSeed = { team: scfSeries.bottomSeed, wins: scfSeries.bottomSeedWins };
        let seed, otherSeed;
        if (topSeed.team === team) {
            seed = topSeed;
            otherSeed = bottomSeed;
        }
        else {
            seed = bottomSeed;
            otherSeed = topSeed;
        }
        const minGamesToWin = (4 - seed.wins) + seed.wins + otherSeed.wins;
        return games >= minGamesToWin;
    }
    calculateThirdRoundPoints(rounds) {
        const points = {};
        // Initialize all persons with 0 points
        for (const round of rounds.slice(0, 3)) {
            for (const person in round.summary.summaries) {
                points[person] = 0;
            }
        }
        // Accumulate points
        for (const round of rounds.slice(0, 3)) {
            for (const [person, summary] of Object.entries(round.summary.summaries)) {
                points[person] += summary.points;
            }
        }
        return points;
    }
    calculateFourthRound(scoring, pick, team, games) {
        const teamPoints = pick.team === team ? scoring.team : 0;
        const gamePoints = pick.games === games ? scoring.games : 0;
        const bonusPoints = teamPoints > 0 && gamePoints > 0 ? scoring.bonus : 0;
        return teamPoints + gamePoints + bonusPoints;
    }
    createEmptyTable() {
        const result = {};
        for (let games = 4; games <= 7; games++) {
            result[games] = {
                '': ProjectionCell.create({
                    first: ['-'],
                    second: ['-'],
                    third: ['-'],
                    losers: ['-'],
                    isPossible: undefined,
                    isOver: false
                })
            };
        }
        console.log('Empty table:', result);
        return result;
    }
}
