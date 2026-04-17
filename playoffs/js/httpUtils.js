async function fetchWithCacheBusting(url, bustCache) {
	const finalUrl = bustCache ? `${url}?timestamp=${new Date().getTime()}` : url;
	const response = await fetch(finalUrl);

	if (!response.ok) {
		if (response.status === 404 || response.status === 503) {
			throw new Error('NOT_FOUND');
		}
		throw new Error(`HTTP error! status: ${response.status} for ${url}`);
	}

	return response;
}

export async function fetchJson(url, bustCache = false) {
	const response = await fetchWithCacheBusting(url, bustCache);
	return await response.json();
}

export async function fetchText(url, bustCache = false) {
	const response = await fetchWithCacheBusting(url, bustCache);
	return await response.text();
}
