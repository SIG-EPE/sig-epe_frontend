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
  role?: AuthUserRole;
  onboardingCompleted: boolean;
  /** Auth source — required since GET /auth/me always returns it. */
  authSource: 'LOCAL' | 'EPE';
}

/** Raw backend auth user shape before frontend normalization. */
export interface BackendAuthUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  epeDni: string | null;
  onboardingCompleted: boolean;
  authSource?: 'LOCAL' | 'EPE';
  role?: AuthUserRole;
  roles?: AuthUserRole[];
}

/** POST /auth/login request body */
export interface LoginRequest {
  identifier: string;
  password: string;
}

/** POST /auth/login response body */
export interface LoginResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  sessionExpiresAt: string;
  /** Backend returns roles as an array; normalize to `role` before calling setAuth */
  user: BackendAuthUser;
  onboardingRequired: boolean;
}

/** POST /auth/onboarding request body */
export interface OnboardingRequest {
  email: string;
  newPassword?: string;
  confirmPassword?: string;
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

/** PATCH /api/auth/profile request body */
export interface ProfileUpdatePayload {
  firstName?: string;
  lastName?: string;
  email?: string;
}
