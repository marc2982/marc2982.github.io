import { DATA, PEOPLE } from './constants.js';

export function winsLosses(winsLossesTable) {
    let thead = document.createElement('thead');
    winsLossesTable.append(thead);

    let headerRow = thead.insertRow();
    headerRow.insertCell().outerHTML = "<th>Person</th>";
    headerRow.insertCell().outerHTML = "<th># Wins</th>";
    headerRow.insertCell().outerHTML = "<th># Losers</th>";

    let tbody = document.createElement('tbody');
    winsLossesTable.append(tbody);

    let winners = {};
    let losers = {};

    DATA.forEach( year => {
        let poolWinners = year.poolWinners instanceof Array ? year.poolWinners : [year.poolWinners];
        let poolLosers = year.poolLosers instanceof Array ? year.poolLosers : [year.poolLosers];

        poolWinners.forEach( winner => {
            let name = winner.replace("*", "");
            winners[name] = (winners[name] ?? 0) + 1;
        });

        poolLosers.forEach( loser => {
            let name = loser.replace("*", "");
            losers[name] = (losers[name] ?? 0) + 1;
        });
    });

    PEOPLE.forEach( person => {
        var row = tbody.insertRow(); // insert in reverse order
        row.insertCell().outerHTML = "<td>" + person + "</td>";
        row.insertCell().outerHTML = "<td>" + (winners[person] ?? 0) + "</td>";
        row.insertCell().outerHTML = "<td>" + (losers[person] ?? 0) + "</td>";
    });

    winsLossesTable.DataTable({
        info: false,
        paging: false,
        searching: false,
        // stripeClasses: ['stripe-1', 'stripe-2']
    });
}
