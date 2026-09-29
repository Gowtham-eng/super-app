export function selectMicrosoftProvider(providers = [], email = '') {
  if (!providers.length) return { error: 'Microsoft login is not configured yet' };
  const normalized = email.trim().toLowerCase();
  // Preserve one-provider sign-in when no email is needed to choose a tenant.
  if (!normalized && providers.length === 1) return { provider: providers[0] };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { error: 'Enter your full work email before signing in with Microsoft' };
  }
  const domain = normalized.split('@')[1];
  const matches = providers.filter((provider) =>
    (provider.email_domains || []).some(
      (value) => String(value).trim().toLowerCase().replace(/^@/, '') === domain
    )
  );
  if (matches.length === 1) return { provider: matches[0] };
  if (!matches.length && providers.length === 1 && !(providers[0].email_domains || []).length) {
    return { provider: providers[0] };
  }
  return {
    error: matches.length
      ? 'Multiple Microsoft organizations match your email. Contact your admin.'
      : `Microsoft login is not configured for @${domain}. Check your work email or contact your admin.`,
  };
}
