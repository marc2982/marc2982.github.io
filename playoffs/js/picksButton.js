import { getPicksStatus } from './picksStatus.js';

function formatUnlock(d) {
	const day = d.toLocaleString('default', { weekday: 'short', month: 'short', day: 'numeric' });
	return day;
}

/** Updates the Make Picks button on the home page to reflect whether picks can be submitted. */
export async function updatePicksButton(btn) {
	if (!btn) return;
	const status = await getPicksStatus();
	if (status.state === 'open') {
		btn.textContent = `🏒 Make Round ${status.round} Picks!`;
		btn.classList.add('picks-open');
	} else if (status.state === 'locked') {
		btn.textContent = `🔒 Round ${status.round} locked · view results`;
		btn.href = `year.html?year=${status.year}`;
		btn.classList.add('picks-closed');
	} else if (status.state === 'not-open') {
		btn.textContent = status.unlockDate ? `🔒 Picks open ${formatUnlock(status.unlockDate)}` : '🔒 Picks not open yet';
		btn.classList.add('picks-closed');
	}
}

updatePicksButton(document.querySelector('.picks-btn'));
