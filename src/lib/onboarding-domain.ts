const ONBOARDING_DOMAIN_POLICY = {
  DEFAULT_RECOMMENDED_DOMAINS: ["ensenaperu.org"],
  RECOMMENDED_ENV_VALUE: process.env.NEXT_PUBLIC_ONBOARDING_RECOMMENDED_EMAIL_DOMAINS,
  LEGACY_ALLOWED_ENV_VALUE: process.env.NEXT_PUBLIC_ONBOARDING_ALLOWED_EMAIL_DOMAINS,
} as const;

const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ONBOARDING_EMAIL_RECOMMENDATION_MESSAGE =
  "Recomendamos usar tu correo corporativo para recibir notificaciones institucionales, pero puedes continuar con este correo.";

function normalizeDomain(domain: string): string {
  return domain.trim().replace(/^@/, "").toLowerCase();
}

export function getRecommendedOnboardingEmailDomains(): string[] {
  const envValue =
    ONBOARDING_DOMAIN_POLICY.RECOMMENDED_ENV_VALUE ??
    ONBOARDING_DOMAIN_POLICY.LEGACY_ALLOWED_ENV_VALUE;

  const domains = envValue
    ?.split(",")
    .map(normalizeDomain)
    .filter((domain) => domain.length > 0);

  return domains && domains.length > 0
    ? domains
    : [...ONBOARDING_DOMAIN_POLICY.DEFAULT_RECOMMENDED_DOMAINS];
}

export function getAllowedOnboardingEmailDomains(): string[] {
  return getRecommendedOnboardingEmailDomains();
}

export function formatRecommendedOnboardingEmailDomains(domains = getRecommendedOnboardingEmailDomains()): string {
  return domains.map((domain) => `@${domain}`).join(" o ");
}

export function formatAllowedOnboardingEmailDomains(domains = getAllowedOnboardingEmailDomains()): string {
  return formatRecommendedOnboardingEmailDomains(domains);
}

export function getOnboardingEmailDomainMessage(domains = getAllowedOnboardingEmailDomains()): string {
  return `Recomendamos usar correos ${formatAllowedOnboardingEmailDomains(domains)} para recibir notificaciones institucionales.`;
}

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_FORMAT_PATTERN.test(email.trim());
}

export function isRecommendedOnboardingEmailDomain(email: string, domains = getRecommendedOnboardingEmailDomains()): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  const atIndex = normalizedEmail.lastIndexOf("@");

  if (atIndex < 0) return false;

  const domain = normalizedEmail.slice(atIndex + 1);

  return domains.some((recommendedDomain) => domain === normalizeDomain(recommendedDomain));
}

export function isAllowedOnboardingEmailDomain(email: string, domains = getAllowedOnboardingEmailDomains()): boolean {
  return isRecommendedOnboardingEmailDomain(email, domains);
}

export function shouldShowOnboardingEmailRecommendation(email: string): boolean {
  return isValidEmailFormat(email) && !isRecommendedOnboardingEmailDomain(email);
}
