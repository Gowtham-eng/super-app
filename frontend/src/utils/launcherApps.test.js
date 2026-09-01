import {
  isNeEmbedApp,
  isItsmNamedApp,
  shouldHijackItsmLaunch,
  resolveKissflowLaunchApp,
  isKissflowApiOk,
  itsmKissflowFallbackReason,
} from './launcherApps';

const EMS = {
  id: 'saml-ems',
  name: 'Expense Management',
  type: 'saml',
  has_access: true,
  home_url: 'https://refexgroup.kissflow.com/view/application/EMS_001_A00',
};

const ITSM_SAML = {
  id: 'saml-itsm',
  name: 'IT Service Management',
  type: 'saml',
  has_access: true,
  home_url: 'https://refexgroup.kissflow.com/view/application/IT_Service_Management_A00',
};

const ITSM_OIDC = {
  id: 'oidc-itsm',
  name: 'IT Service Management',
  type: 'oidc',
  has_access: true,
  home_url: 'https://refex-admin-ui-dhwffeu7pq-el.a.run.app/applications/production-IT_Service_Management_A00?tab=dashboard&embed=1',
};

const VIRTUAL = {
  id: 'itsm-inapp',
  name: 'ITSM',
  type: 'internal',
  has_access: true,
};

describe('launcher ITSM vs Reports vs EMS', () => {
  it('treats the Reports OIDC tile as an NE embed, not Kissflow ITSM', () => {
    expect(isNeEmbedApp(ITSM_OIDC)).toBe(true);
    expect(isItsmNamedApp(ITSM_OIDC)).toBe(false);
    expect(shouldHijackItsmLaunch(ITSM_OIDC)).toBe(false);
  });

  it('runs Kissflow-status for All-tab SAML IT Service Management, not Reports OIDC', () => {
    expect(shouldHijackItsmLaunch(ITSM_SAML)).toBe(true);
    expect(isItsmNamedApp(ITSM_SAML)).toBe(true);
    expect(shouldHijackItsmLaunch(ITSM_OIDC)).toBe(false);
  });

  it('treats Kissflow status_code outside 2xx as unavailable (open in-app /itsm)', () => {
    const down = { status: 200, data: { ok: false, status_code: 502, user_in_kissflow: true } };
    expect(isKissflowApiOk(down)).toBe(false);
    expect(itsmKissflowFallbackReason(down, true)).toBe('kissflow_unavailable');
  });

  it('allows Kissflow SSO only when the probe is 2xx and the user is in Kissflow', () => {
    const up = { status: 200, data: { ok: true, status_code: 200, user_in_kissflow: true } };
    expect(isKissflowApiOk(up)).toBe(true);
    expect(itsmKissflowFallbackReason(up, false)).toBe('not_in_kissflow');
  });

  it('also probes Kissflow for the virtual in-app ITSM tile', () => {
    expect(shouldHijackItsmLaunch(VIRTUAL)).toBe(true);
  });

  it('does not open EMS when ITSM is tapped and EMS is first in the SAML list', () => {
    const hit = resolveKissflowLaunchApp([EMS, ITSM_SAML], ITSM_SAML);
    expect(hit).toBe(ITSM_SAML);
    expect(hit.home_url).toContain('IT_Service_Management_A00');
  });

  it('virtual ITSM tile prefers the ITSM Kissflow app over EMS', () => {
    const hit = resolveKissflowLaunchApp([EMS, ITSM_SAML], VIRTUAL);
    expect(hit).toBe(ITSM_SAML);
    expect(hit.home_url).not.toContain('EMS_001_A00');
  });
});
