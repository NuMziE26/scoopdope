/**
 * Shared user-related types used by both frontend and backend.
 * @module user.types
 */

/** Roles available in the platform */
export type UserRole = 'student' | 'instructor' | 'admin';

/** Slugs of the initial badge catalogue */
export type BadgeSlug =
  | 'first_enrollment'
  | 'first_completion'
  | 'streak_7'
  | 'courses_10';

/** Tier of a badge, used for visual styling */
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

/**
 * A badge earned by a learner.
 * Returned by the profile/badges API so the frontend can render it.
 */
export interface EarnedBadge {
  /** Stable identifier of the badge, e.g. `first_completion` */
  slug: BadgeSlug;
  /** Human-readable badge name */
  name: string;
  /** Short description of the achievement */
  description: string;
  /** Icon identifier or URL used to render the badge */
  icon: string;
  /** Visual tier of the badge */
  tier: BadgeTier;
  /** ISO-8601 timestamp of when the badge was awarded */
  earnedAt: string;
}

/**
 * Public-facing user profile data.
 * Safe to expose to the frontend — excludes sensitive fields like passwordHash.
 */
export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  avatar: string | null;
  bio: string | null;
  role: UserRole;
  stellarPublicKey: string | null;
  isVerified: boolean;
  mfaEnabled: boolean;
  referralCode: string | null;
  createdAt: string;
  themePreference: 'light' | 'dark' | 'system';
  /** Badges earned by the user (optional — may be omitted from some responses) */
  badges?: EarnedBadge[];
}

/**
 * DTO for updating a user's profile.
 * All fields are optional — only provided fields are updated.
 */
export interface UpdateUserDto {
  /** 3–30 characters */
  username?: string;
  /** Must be a valid URL */
  avatar?: string;
  /** Max 500 characters, HTML stripped */
  bio?: string;
  /** Theme preference */
  theme?: 'light' | 'dark' | 'system';
}

/**
 * DTO for user registration.
 */
export interface RegisterDto {
  email: string;
  /** Min 8 characters */
  password: string;
  /** Optional referral code from an existing user */
  referralCode?: string;
}

/**
 * DTO for user login.
 */
export interface LoginDto {
  email: string;
  password: string;
  /** TOTP code or backup code — required if MFA is enabled */
  mfaToken?: string;
}

/**
 * Response returned after a successful login or token refresh.
 */
export interface AuthTokensResponse {
  access_token: string;
  refresh_token: string;
}

/**
 * Response when MFA is required to complete login.
 */
export interface MfaRequiredResponse {
  mfa_required: true;
}

/** Union of possible login responses */
export type LoginResponse = AuthTokensResponse | MfaRequiredResponse;

/**
 * JWT payload decoded from an access token.
 */
export interface JwtPayload {
  /** User ID */
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
