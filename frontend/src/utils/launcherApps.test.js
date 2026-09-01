import {
  isNeEmbedApp,
  isItsmNamedApp,
  shouldHijackItsmLaunch,
  resolveKissflowLaunchApp,
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

  it('does not hijack All-tab SAML IT Service Management — settings home_url is used', () => {
    expect(shouldHijackItsmLaunch(ITSM_SAML)).toBe(false);
    expect(isItsmNamedApp(ITSM_SAML)).toBe(true);
  });

  it('only hijacks the virtual in-app ITSM tile', () => {
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
