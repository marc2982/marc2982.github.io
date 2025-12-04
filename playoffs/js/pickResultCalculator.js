import { PickResult, PickStatus } from './models.js';

export class PickResultCalculator {
	buildPickResults(scoring, seriesRepo, picks) {
		const pickResults = {};
		for (const [person, picksBySeries] of Object.entries(picks)) {
			for (const [seriesLetter, pick] of Object.entries(picksBySeries)) {
				const series = seriesRepo.getSeries(seriesLetter);
				const winner = series.getWinner();
				const teamStatus = this.getTeamStatus(pick, winner);
				const gamesStatus = this.getGamesStatus(pick, winner, series);
				const points = this.getPoints(scoring, teamStatus, gamesStatus);
				const possiblePoints = winner
					? points
					: this.calculatePossiblePoints(pick, series, scoring, teamStatus, gamesStatus);
				if (!pickResults[person]) {
					pickResults[person] = {};
				}
				pickResults[person][series.letter] = PickResult.create({
					pick: pick,
					teamStatus: teamStatus,
					gamesStatus: gamesStatus,
					points: points,
					possiblePoints: possiblePoints,
				});
			}
		}
		return pickResults;
	}

	getPickStatus(pick, winner, predicate) {
		if (!winner) {
			return PickStatus.UNKNOWN;
		}
		return predicate(pick, winner) ? PickStatus.CORRECT : PickStatus.INCORRECT;
	}

	getTeamStatus(pick, winner) {
		return this.getPickStatus(pick, winner, (p, w) => p.team === w.team);
	}

	getGamesStatus(pick, winner, series) {
		if (winner === null) {
			const gamesPlayed = series.totalGames();
			if (gamesPlayed === 6 && pick.games === 7) {
				return PickStatus.CORRECT;
			}
			if (gamesPlayed >= pick.games) {
				return PickStatus.INCORRECT;
			}
			const minGamesForWinner = Math.min(series.topSeedWins, series.bottomSeedWins) + 4;
			if (pick.games < minGamesForWinner) {
				return PickStatus.INCORRECT;
			}
		}
		return this.getPickStatus(pick, winner, (p, w) => p.games === w.games);
	}

	getPoints(scoring, teamStatus, gamesStatus) {
		const correctTeam = teamStatus === PickStatus.CORRECT;
		const correctGames = gamesStatus === PickStatus.CORRECT;
		let points = 0;
		points += correctTeam ? scoring.team : 0;
		points += correctGames ? scoring.games : 0;
		points += correctTeam && correctGames ? scoring.bonus : 0;
		return points;
	}

	calculatePossiblePoints(pick, series, scoring, teamStatus, gamesStatus) {
		const possibleFromTeam = [PickStatus.CORRECT, PickStatus.UNKNOWN].includes(teamStatus) ? scoring.team : 0;
		const possibleFromGames = [PickStatus.CORRECT, PickStatus.UNKNOWN].includes(gamesStatus) ? scoring.games : 0;
		const possibleFromBonus = possibleFromTeam > 0 && possibleFromGames > 0 ? scoring.bonus : 0;
		return possibleFromTeam + possibleFromGames + possibleFromBonus;
	}
}
