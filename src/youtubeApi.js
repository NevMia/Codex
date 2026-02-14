const YT_BASE = 'https://www.googleapis.com/youtube/v3';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriable(error) {
  // Network-ish errors
  if (!error || !error.status) return true;

  const status = error.status;
  if (status >= 500) return true;

  const reasons = (error.data?.error?.errors || []).map((e) => e.reason);
  return (
    reasons.includes('rateLimitExceeded') ||
    reasons.includes('quotaExceeded') ||
    reasons.includes('userRateLimitExceeded')
  );
}

async function retryWithBackoff(fn, { maxRetries = 6, baseMs = 500, maxMs = 12000, onRetry } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetriable(error) || attempt >= maxRetries) throw error;
      const exp = Math.min(maxMs, baseMs * 2 ** attempt);
      const jitter = Math.floor(Math.random() * Math.max(50, exp * 0.2));
      const delay = exp + jitter;
      onRetry?.(error, attempt + 1, delay);
      await sleep(delay);
      attempt += 1;
    }
  }
}

async function httpGetJson(url, params) {
  const u = new URL(url);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    u.searchParams.set(k, String(v));
  });

  let res;
  try {
    res = await fetch(u.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
  } catch (e) {
    // Network error: no status/data
    const err = new Error(e.message || 'Network error');
    throw err;
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

async function* paginate({ endpoint, params, apiKey, sleepMs = 50, dryRun = false, requestCounter, logger }) {
  let pageToken;

  do {
    const query = { ...params, key: apiKey, maxResults: 100, pageToken };
    const url = `${YT_BASE}/${endpoint}`;

    const data = await retryWithBackoff(() => module.exports.httpGetJson(url, query), {
      onRetry: (error, attempt, delay) => {
        logger?.(`Retrying ${endpoint} (${attempt}) in ${delay}ms due to: ${error.message}`);
      }
    });

    requestCounter[endpoint] = (requestCounter[endpoint] || 0) + 1;

    yield data;

    pageToken = data.nextPageToken;

    if (dryRun) break;
    if (pageToken) await sleep(sleepMs);
  } while (pageToken);
}

module.exports = { paginate, retryWithBackoff, sleep, httpGetJson };
