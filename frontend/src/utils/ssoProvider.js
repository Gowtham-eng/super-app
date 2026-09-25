/** Pick which Azure/Google config to start. Never guess a "Refex" label. */

export function emailDomainFrom(email = '') {
  const raw = String(email || '').trim().toLowerCase();
  if (!raw.includes('@')) return '';
  return raw.split('@').pop() || '';
}

export function pickSsoProvider(providers, email = '') {
  const list = Array.isArray(providers) ? providers : [];
  if (!list.length) return { provider: null, reason: 'none' };
  if (list.length === 1) return { provider: list[0], reason: 'single' };

  const domain = emailDomainFrom(email);
  if (domain) {
    const byDomain = list.find((p) =>
      (p.email_domains || []).some(
        (d) => String(d).toLowerCase().replace(/^@/, '') === domain,
      ),
    );
    if (byDomain) return { provider: byDomain, reason: 'domain' };
    return { provider: null, reason: 'no_match' };
  }

  return { provider: null, reason: 'need_org' };
}
