// Branch names we're willing to interpolate into URLs and the page: letters, digits, . _ - /
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/;

/** Returns the branch if it looks like a plain git branch name, otherwise null. */
export function parseBranch(raw) {
	if (!raw || !BRANCH_PATTERN.test(raw) || raw.includes('..')) return null;
	return raw;
}

/** The validated ?branch= preview parameter of the current page, or null. */
export function getBranchParam(search = window.location.search) {
	return parseBranch(new URLSearchParams(search).get('branch'));
}
