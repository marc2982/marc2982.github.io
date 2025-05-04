import { DATA, TEAMS } from './constants';
export function yearlyResults(resultsTable) {
    let thead = document.createElement('thead');
    resultsTable.append(thead);
    let headerRow = thead.insertRow();
    headerRow.insertCell().outerHTML = "<th>Year</th>";
    headerRow.insertCell().outerHTML = "<th>Pool Winner(s)</th>";
    headerRow.insertCell().outerHTML = "<th>Pool Loser(s)</th>";
    headerRow.insertCell().outerHTML = "<th>Cup Winner</th>";
    let tbody = document.createElement('tbody');
    resultsTable.append(tbody);
    let winners = {};
    let losers = {};
    DATA.forEach((year) => {
        let poolWinners = Array.isArray(year.poolWinners) ? year.poolWinners : [year.poolWinners];
        let poolLosers = Array.isArray(year.poolLosers) ? year.poolLosers : [year.poolLosers];
        var row = thead.insertRow(1); // insert in reverse order
        var innerHtml = year.link ? `<a href="${year.year}.html">${year.year}</a>` : `${year.year}`;
        row.insertCell().outerHTML = `<td>${innerHtml}</td>`;
        row.insertCell().outerHTML = `<td>${poolWinners.join(', ')}</td>`;
        row.insertCell().outerHTML = `<td>${poolLosers.join(', ')}</td>`;
        row.insertCell().outerHTML = `<td>${TEAMS[year.cupWinner]}</td>`;
        poolWinners.forEach((winner) => {
            var _a;
            let name = winner.replace("*", "");
            winners[name] = ((_a = winners[name]) !== null && _a !== void 0 ? _a : 0) + 1;
        });
        poolLosers.forEach((loser) => {
            var _a;
            let name = loser.replace("*", "");
            losers[name] = ((_a = losers[name]) !== null && _a !== void 0 ? _a : 0) + 1;
        });
    });
    $(resultsTable).DataTable({
        paging: false,
        searching: false,
        info: false,
    });
    return { winners, losers };
}
