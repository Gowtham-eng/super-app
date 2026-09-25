import { emailDomainFrom, pickSsoProvider } from './ssoProvider';

const VENWIND = {
  id: 'venwind',
  label: 'Venwind Refex Power Ltd',
  email_domains: ['venwind.com'],
};
const EXTROVIS = {
  id: 'extrovis',
  label: 'Extrovis',
  email_domains: ['extrovis.com'],
};
const KAVIS = {
  id: 'kavis',
  label: 'Kavis',
  email_domains: ['kavis.com'],
};
const REFEX = {
  id: 'refex',
  label: 'Refex',
  email_domains: ['refex.co.in'],
};

describe('pickSsoProvider', () => {
  test('one config starts immediately', () => {
    const hit = pickSsoProvider([EXTROVIS], '');
    expect(hit.reason).toBe('single');
    expect(hit.provider.id).toBe('extrovis');
  });

  test('does not send Extrovis into Venwind Refex by label', () => {
    const hit = pickSsoProvider([VENWIND, EXTROVIS, REFEX, KAVIS], '');
    expect(hit.reason).toBe('need_org');
    expect(hit.provider).toBeNull();
  });

  test('email domain selects Extrovis, not Venwind Refex', () => {
    const hit = pickSsoProvider(
      [VENWIND, EXTROVIS, KAVIS],
      'ajjusyed@extrovis.com',
    );
    expect(hit.reason).toBe('domain');
    expect(hit.provider.id).toBe('extrovis');
  });

  test('Kavis domain selects Kavis', () => {
    const hit = pickSsoProvider([VENWIND, EXTROVIS, KAVIS], 'user@kavis.com');
    expect(hit.provider.id).toBe('kavis');
  });

  test('unknown domain does not fall back to Refex/Venwind', () => {
    const hit = pickSsoProvider([VENWIND, REFEX], 'ajjusyed@extrovis.com');
    expect(hit.reason).toBe('no_match');
    expect(hit.provider).toBeNull();
  });

  test('emailDomainFrom reads host', () => {
    expect(emailDomainFrom('ajjusyed@extrovis.com')).toBe('extrovis.com');
  });
});
