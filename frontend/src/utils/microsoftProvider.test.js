import { selectMicrosoftProvider } from './microsoftProvider';

const providers = [
  { id: 'venwind', label: 'Venwindrefex', email_domains: ['venwindrefex.com'] },
  { id: 'extrovis', label: 'extrovis', email_domains: ['extrovis.com'] },
  { id: 'kavis', label: 'kavispharma', email_domains: ['kavispharma.com'] },
];

test.each([
  ['user@extrovis.com', 'extrovis'],
  ['user@venwindrefex.com', 'venwind'],
  ['user@kavispharma.com', 'kavis'],
  [' USER@EXTROVIS.COM ', 'extrovis'],
])('routes %s to its own Microsoft tenant', (email, id) => {
  expect(selectMicrosoftProvider(providers, email).provider.id).toBe(id);
});

test.each(['', 'user', 'user@', 'user@unknown.com', 'user@@extrovis.com'])(
  'does not silently route %s to Venwind', (email) => {
    const result = selectMicrosoftProvider(providers, email);
    expect(result.provider).toBeUndefined();
    expect(result.error).toBeTruthy();
  }
);

test('preserves single-provider sign-in without an email', () => {
  expect(selectMicrosoftProvider([providers[0]], '').provider).toBe(providers[0]);
});

test('rejects ambiguous domain configuration', () => {
  const result = selectMicrosoftProvider([...providers, { ...providers[1], id: 'duplicate' }], 'user@extrovis.com');
  expect(result.provider).toBeUndefined();
  expect(result.error).toMatch(/Multiple/);
});

test('reports missing Microsoft configuration', () => {
  expect(selectMicrosoftProvider([], '').error).toMatch(/not configured/);
});
