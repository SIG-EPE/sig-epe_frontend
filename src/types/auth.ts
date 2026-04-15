// -------------------------------------------------------
// Auth types — SIG-EPE
// -------------------------------------------------------

/** Role reference embedded in AuthUser */
export interface AuthUserRole {
  code: string;
  name: string;
}

/** Authenticated user shape (stored in Zustand + returned by /auth/me) */
export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  documentNumber: string;
  role: AuthUserRole;
  onboardingCompleted: boolean;
}

/** POST /auth/login request body */
export interface LoginRequest {
  identifier: string;
  password: string;
}

/** POST /auth/login response body */
export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
  onboardingRequired: boolean;
}

/** POST /auth/onboarding request body */
export interface OnboardingRequest {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  passwordConfirm: string;
}

/** JWT payload shape (decoded by jose in middleware) */
export interface TokenPayload {
  sub: string;
  role: string;
  scope: "onboarding" | "full";
  iat: number;
  exp: number;
}

/** Token scope literal values */
const TOKEN_SCOPE = {
  ONBOARDING: "onboarding",
  FULL: "full",
} as const;

export type TokenScope = (typeof TOKEN_SCOPE)[keyof typeof TOKEN_SCOPE];
export { TOKEN_SCOPE };
