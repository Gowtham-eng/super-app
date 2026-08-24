// Use relative /api in dev (setupProxy -> localhost:8000). Production sets REACT_APP_BACKEND_URL.
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');
const ITSM_BACKEND = (process.env.REACT_APP_ITSM_API_URL || BACKEND_URL || '').replace(/\/$/, '');

export const API = BACKEND_URL ? `${BACKEND_URL}/api` : '/api';
/** ITSM endpoints — same as API unless REACT_APP_ITSM_API_URL overrides the backend host. */
export const ITSM_API = ITSM_BACKEND ? `${ITSM_BACKEND}/api` : '/api';
/** Absolute backend origin for browser redirects (SAML complete). */
export const BACKEND_ORIGIN =
  process.env.REACT_APP_BACKEND_ORIGIN || BACKEND_URL || ITSM_BACKEND || 'http://localhost:8000';

export { BACKEND_URL };
