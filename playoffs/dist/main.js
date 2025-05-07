import { renderPage } from "./year";
import { loadData } from "./csvProcessor";
export async function render(year) {
    const data = await loadData(year);
    renderPage(data);
}
