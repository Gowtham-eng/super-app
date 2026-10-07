function looksLikeHtml(text) {
  const head = String(text || '').trim().slice(0, 500).toLowerCase();
  return (
    head.startsWith('<!doctype html')
    || head.startsWith('<html')
    || head.includes('just a moment')
    || head.includes('cf-browser-verification')
  );
}

function cleanErrorText(text, fallback) {
  if (looksLikeHtml(text)) {
    return 'Kissflow is temporarily blocking the request. Wait a few seconds and try again.';
  }
  return text || fallback;
}

export function isKissflowChallengeError(error) {
  const status = error?.response?.status;
  if (status === 429 || status === 502 || status === 503) return true;
  const text = getApiErrorMessage(error, '');
  return /temporarily blocking/i.test(text);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry Kissflow Cloudflare / 429 / 502 bursts before showing the banner. */
export async function withKissflowRetry(run, { attempts = 3, onRetry } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const retry = attempt < attempts - 1 && isKissflowChallengeError(error);
      if (!retry) throw error;
      if (typeof onRetry === 'function') onRetry(error, attempt + 1);
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError;
}

/** Normalize FastAPI / axios error payloads into a displayable string. */
export function getApiErrorMessage(error, fallback = 'Something went wrong') {
  if (error?.response?.status === 413) {
    return 'File limit is 1MB only';
  }
  const detail = error?.response?.data?.detail ?? error?.detail ?? error?.message;
  if (!detail) return fallback;
  if (typeof detail === 'string') return cleanErrorText(detail, fallback);
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return cleanErrorText(item, '');
        if (item && typeof item === 'object') return cleanErrorText(item.msg || item.message || '', '');
        return '';
      })
      .filter(Boolean);
    return parts.length ? parts.join('; ') : fallback;
  }
  if (typeof detail === 'object') {
    return cleanErrorText(detail.msg || detail.message || '', fallback);
  }
  return fallback;
}
