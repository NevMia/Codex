const URL_REGEX = /(https?:\/\/\S+|www\.\S+)/gi;

function cleanText(input = '') {
  return String(input).replace(URL_REGEX, '').replace(/\s+/g, ' ').trim();
}

function parseVideoId(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const idPattern = /^[a-zA-Z0-9_-]{11}$/;
  if (idPattern.test(raw)) return raw;

  try {
    const url = new URL(raw);
    if (url.hostname.includes('youtu.be')) {
      const shortId = url.pathname.split('/').filter(Boolean)[0];
      return idPattern.test(shortId) ? shortId : null;
    }
    if (url.hostname.includes('youtube.com')) {
      const v = url.searchParams.get('v');
      if (idPattern.test(v)) return v;
      const parts = url.pathname.split('/').filter(Boolean);
      const embedIndex = parts.findIndex((p) => p === 'embed' || p === 'shorts' || p === 'live');
      if (embedIndex >= 0) {
        const candidate = parts[embedIndex + 1];
        return idPattern.test(candidate) ? candidate : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function csvEscape(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

module.exports = { cleanText, parseVideoId, csvEscape };
