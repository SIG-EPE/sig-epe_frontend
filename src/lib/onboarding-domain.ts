const ONBOARDING_DOMAIN_POLICY = {
  DEFAULT_ALLOWED_DOMAINS: ["ensenaperu.org"],
  ENV_VALUE: process.env.NEXT_PUBLIC_ONBOARDING_ALLOWED_EMAIL_DOMAINS,
} as const;

function normalizeDomain(domain: string): string {
  return domain.trim().replace(/^@/, "").toLowerCase();
}

export function getAllowedOnboardingEmailDomains(): string[] {
  const domains = ONBOARDING_DOMAIN_POLICY.ENV_VALUE
    ?.split(",")
    .map(normalizeDomain)
    .filter((domain) => domain.length > 0);

  return domains && domains.length > 0
    ? domains
    : [...ONBOARDING_DOMAIN_POLICY.DEFAULT_ALLOWED_DOMAINS];
}

export function formatAllowedOnboardingEmailDomains(domains = getAllowedOnboardingEmailDomains()): string {
  return domains.map((domain) => `@${domain}`).join(" o ");
}

export function getOnboardingEmailDomainMessage(domains = getAllowedOnboardingEmailDomains()): string {
  return `Solo se permiten correos ${formatAllowedOnboardingEmailDomains(domains)} para completar la activación de cuenta.`;
}

export function isAllowedOnboardingEmailDomain(email: string, domains = getAllowedOnboardingEmailDomains()): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  const atIndex = normalizedEmail.lastIndexOf("@");

  if (atIndex < 0) return false;

  const domain = normalizedEmail.slice(atIndex + 1);

  return domains.some((allowedDomain) => domain === normalizeDomain(allowedDomain));
}
