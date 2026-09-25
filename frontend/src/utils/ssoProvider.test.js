import { emailDomainFrom, pickSsoProvider } from './ssoProvider';

const VENWIND = { id: 'venwind', label: 'Venwind Refex Power Ltd', email_domains: ['venwindrefex.com'] };
const EXTROVIS = { id: 'extrovis', label: 'Extrovis', email_domains: ['extrovis.com'] };
const REFEX = { id: 'refex', label: 'Refex', email_domains: ['refex.co.in'] };

describe('pickSsoProvider', () => {
  it('reads the domain from a work email', () => {
    expect(emailDomainFrom('ajjusyed@extrovis.com')).toBe('extrovis.com');
  });

  it('does not send Extrovis users to Venwind Refex when email is missing', () => {
    const hit = pickSsoProvider([VENWIND, EXTROVIS, REFEX], '');
    expect(hit.provider).toBeNull();
    expect(hit.reason).toBe('need_email');
  });

  it('routes @extrovis.com to the Extrovis Azure config', () => {
    const hit = pickSsoProvider([VENWIND, EXTROVIS, REFEX], 'ajjusyed@extrovis.com');
    expect(hit.provider).toBe(EXTROVIS);
    expect(hit.reason).toBe('domain');
  });

  it('does not fall back to a label containing Refex', () => {
    const hit = pickSsoProvider([VENWIND, EXTROVIS], 'ajjusyed@extrovis.com');
    expect(hit.provider?.id).toBe('extrovis');
  });

  it('returns no_match when the domain is not on any config', () => {
    const hit = pickSsoProvider([VENWIND, REFEX], 'ajjusyed@extrovis.com');
    expect(hit.provider).toBeNull();
    expect(hit.reason).toBe('no_match');
    expect(hit.domain).toBe('extrovis.com');
  });
});
