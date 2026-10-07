/** Collapsible sections, expand/collapse all, and the sticky jump bar for year.html. */

const SECTIONS = [
	{ id: 'standings', label: 'Standings', collapsible: false },
	{ id: 'summary', label: 'Overall', collapsible: true },
	{ id: 'round1', label: 'Round 1', collapsible: true },
	{ id: 'round2', label: 'Round 2', collapsible: true },
	{ id: 'round3', label: 'Round 3', collapsible: true },
	{ id: 'round4', label: 'Round 4', collapsible: true },
	{ id: 'projections', label: 'Projection', collapsible: true },
];

function adjustTables() {
	// Tables initialised while hidden need their column widths recalculated.
	if ($.fn.dataTable?.tables) $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
}

function setCollapsed(el, collapsed) {
	el.classList.toggle('collapsed', collapsed);
	el.querySelector(':scope > h2')?.setAttribute('aria-expanded', String(!collapsed));
	if (!collapsed) adjustTables();
}

export function setupYearLayout() {
	const present = SECTIONS.filter((s) => document.getElementById(s.id));
	const collapsible = present.filter((s) => s.collapsible).map((s) => document.getElementById(s.id));

	collapsible.forEach((el) => {
		const h2 = el.querySelector(':scope > h2');
		if (!h2) return;
		h2.classList.add('collapse-toggle');
		h2.tabIndex = 0;
		h2.setAttribute('role', 'button');
		const toggle = () => setCollapsed(el, !el.classList.contains('collapsed'));
		h2.addEventListener('click', toggle);
		h2.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggle();
			}
		});
		setCollapsed(el, true);
	});

	const bar = document.getElementById('jumpBar');
	if (!bar) return;
	bar.innerHTML =
		present.map((s) => `<a href="#${s.id}" data-target="${s.id}">${s.label}</a>`).join('') +
		'<button type="button" id="toggleAll" class="jump-all">Expand all</button>';
	bar.hidden = false;

	const toggleAll = document.getElementById('toggleAll');
	const refreshToggle = () => {
		toggleAll.textContent = collapsible.every((el) => !el.classList.contains('collapsed')) ? 'Collapse all' : 'Expand all';
	};
	toggleAll.addEventListener('click', () => {
		const expand = toggleAll.textContent === 'Expand all';
		collapsible.forEach((el) => setCollapsed(el, !expand));
		refreshToggle();
	});
	collapsible.forEach((el) => el.querySelector(':scope > h2')?.addEventListener('click', refreshToggle));

	const jump = (id) => {
		const el = document.getElementById(id);
		if (!el) return;
		if (collapsible.includes(el)) setCollapsed(el, false);
		refreshToggle();
		const offset = bar.offsetHeight + 8;
		window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
	};
	bar.addEventListener('click', (e) => {
		const a = e.target.closest('a[data-target]');
		if (!a) return;
		e.preventDefault();
		history.replaceState(null, '', `#${a.dataset.target}`);
		jump(a.dataset.target);
	});

	// Highlight the section currently in view.
	if ('IntersectionObserver' in window) {
		const links = new Map([...bar.querySelectorAll('a')].map((a) => [a.dataset.target, a]));
		const visible = new Set();
		const io = new IntersectionObserver(
			(entries) => {
				entries.forEach((en) => (en.isIntersecting ? visible.add(en.target.id) : visible.delete(en.target.id)));
				const current = present.find((s) => visible.has(s.id));
				links.forEach((a, id) => a.classList.toggle('active', id === current?.id));
			},
			{ rootMargin: '-80px 0px -55% 0px' },
		);
		present.forEach((s) => io.observe(document.getElementById(s.id)));
	}

	const hash = location.hash.slice(1);
	if (hash && document.getElementById(hash)) setTimeout(() => jump(hash), 300);
}
