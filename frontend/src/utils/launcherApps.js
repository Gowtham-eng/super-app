/** Pure launcher routing helpers — keep Reports OIDC and All-tab SAML from sharing one click path. */

export const NE_EMBED_HOST = 'refex-admin-ui';
export const ITSM_VIRTUAL_ID = 'itsm-inapp';

export function isNeEmbedApp(app = {}) {
  const url = String(app.home_url || '');
  return url.includes(NE_EMBED_HOST) && (url.includes('embed=1') || url.includes('/applications/') || url.includes('/dashboard'));
}

export function isKissflowApp(app = {}) {
  const blob = `${app.name || ''} ${app.description || ''} ${app.home_url || ''} ${app.acs_url || ''} ${app.entity_id || ''}`.toLowerCase();
  return /kissflow/.test(blob);
}

/** Named ITSM / helpdesk tiles. Never NE embed Reports. */
export function isItsmNamedApp(app = {}) {
  if (isNeEmbedApp(app)) return false;
  const name = (app.name || '').toLowerCase();
  const desc = (app.description || '').toLowerCase();
  const id = (app.id || '').toLowerCase();
  return (
    id === ITSM_VIRTUAL_ID ||
    /itsm|tech support|it support|helpdesk|it helpdesk|it service/.test(name) ||
    /itsm|tech support|it helpdesk|helpdesk/.test(desc)
  );
}

/**
 * Only the in-app virtual ITSM tile should run Kissflow-status + first-SAML fallback.
 * Reports OIDC and All-tab SAML must use their own home_url from settings.
 */
export function shouldHijackItsmLaunch(app = {}) {
  if (!app || isNeEmbedApp(app)) return false;
  if (app.type === 'saml' || app.type === 'oidc') return false;
  return isItsmNamedApp(app);
}

function usableLauncherApp(app) {
  return Boolean(
    app
    && app.has_access !== false
    && !app.policy_blocked
    && !app.is_placeholder
    && app.id !== ITSM_VIRTUAL_ID,
  );
}

/**
 * Resolve which Kissflow SAML app the virtual ITSM tile should open.
 * Prefer the tapped app, then an ITSM-named Kissflow SAML row — never the first
 * Kissflow module in the list (that was sending ITSM clicks to EMS_001_A00).
 */
export function resolveKissflowLaunchApp(list, tappedApp) {
  const rows = Array.isArray(list) ? list : [];
  if (tappedApp && usableLauncherApp(tappedApp) && tappedApp.type === 'saml' && isKissflowApp(tappedApp)) {
    return tappedApp;
  }
  const itsmKissflow = rows.find(
    (a) => usableLauncherApp(a) && a.type === 'saml' && isKissflowApp(a) && isItsmNamedApp(a),
  );
  if (itsmKissflow) return itsmKissflow;
  return rows.find((a) => usableLauncherApp(a) && a.type === 'saml' && isKissflowApp(a)) || null;
}
