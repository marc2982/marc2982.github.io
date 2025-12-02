import { DATA, TEAMS } from './constants.js';

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

    DATA.forEach( year => {
        let poolWinners = year.poolWinners instanceof Array ? year.poolWinners : [year.poolWinners];
        let poolLosers = year.poolLosers instanceof Array ? year.poolLosers : [year.poolLosers];

        var row = tbody.insertRow(0); // insert in reverse order
        var innerHtml = year.link ? "<a href=\"year.html?year=" + year.year + "\">" + year.year +" </a>" : year.year;
        row.insertCell().outerHTML = "<td>" + innerHtml + "</td>";
        row.insertCell().outerHTML = "<td>" + poolWinners + "</td>";
        row.insertCell().outerHTML = "<td>" + poolLosers + "</td>";
        row.insertCell().outerHTML = "<td>" + TEAMS[year.cupWinner] + "</td>";
    });

    resultsTable.DataTable({
        info: false,
        order: [[1, 'desc']],
        ordering: false,
        paging: false,
        searching: false,
    });
}
