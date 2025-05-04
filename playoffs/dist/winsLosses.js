import { PEOPLE } from './constants';
export function winsLosses(winsLossesTable, winners, losers) {
    let thead = document.createElement('thead');
    winsLossesTable.append(thead);
    let headerRow = thead.insertRow();
    headerRow.insertCell().outerHTML = "<th>Person</th>";
    headerRow.insertCell().outerHTML = "<th># Wins</th>";
    headerRow.insertCell().outerHTML = "<th># Losers</th>";
    let tbody = document.createElement('tbody');
    winsLossesTable.append(tbody);
    PEOPLE.forEach((person) => {
        var _a, _b;
        var row = tbody.insertRow();
        row.insertCell().outerHTML = "<td>" + person + "</td>";
        row.insertCell().outerHTML = "<td>" + ((_a = winners[person]) !== null && _a !== void 0 ? _a : 0) + "</td>";
        row.insertCell().outerHTML = "<td>" + ((_b = losers[person]) !== null && _b !== void 0 ? _b : 0) + "</td>";
    });
    $(winsLossesTable).DataTable({
        paging: false,
        searching: false,
        info: false,
        ordering: false,
    });
}
