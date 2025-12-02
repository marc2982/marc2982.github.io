import { renderPage } from "./year.js";
import { loadData } from "./csvProcessor.js";
export async function render(year) {
    const data = await loadData(year);
    renderPage(data);
}
