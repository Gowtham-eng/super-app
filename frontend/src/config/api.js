// Use relative /api in dev (setupProxy -> localhost:8000). Production sets REACT_APP_BACKEND_URL.
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');
export const API = BACKEND_URL ? `${BACKEND_URL}/api` : '/api';
/** Absolute backend origin for browser redirects (SAML complete). */
export const BACKEND_ORIGIN = BACKEND_URL || 'http://localhost:8000';
export { BACKEND_URL };
