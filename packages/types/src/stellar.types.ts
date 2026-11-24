/**
 * Shared Stellar / blockchain-related types.
 * @module stellar.types
 */

/**
 * Stellar wallet connection status.
 */
export type WalletConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

/**
 * A Stellar account balance entry.
 */
export interface StellarBalance {
  asset_type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
  balance: string;
  asset_code?: string;
  asset_issuer?: string;
}

/**
 * Payload for linking a Stellar wallet to a user account.
 */
export interface LinkWalletDto {
  publicKey: string;
  signature: string;
  /** Base64-encoded challenge returned by generateStellarChallenge */
  challenge: string;
}

/**
 * Challenge issued to a user for wallet ownership verification.
 */
export interface StellarChallenge {
  /** Base64-encoded challenge data */
  challenge: string;
  nonce: string;
  message: string;
}

/**
 * Credential issued on-chain (Soroban contract).
 */
export interface OnChainCredential {
  contractId: string;
  credentialId: string;
  recipientPublicKey: string;
  courseId: string;
  issuedAt: number;
  txHash: string;
}

/**
 * Client-side wallet state used by the profile wallet UI.
 */
export interface WalletState {
  status: WalletConnectionStatus;
  publicKey: string | null;
  balance: StellarBalance[] | null;
  error?: string | null;
}

/**
 * Response returned when fetching a wallet's balance.
 */
export interface WalletBalanceResponse {
  publicKey: string;
  balances: StellarBalance[];
}

/**
 * On-chain verification status of a credential.
 */
export type CredentialOnChainStatus = 'verified' | 'pending' | 'failed' | 'not_found';

/**
 * Response returned by the public credential verification endpoint.
 */
export interface VerifyCredentialResponse {
  learnerName: string;
  courseName: string;
  issuedAt: number;
  onChainStatus: CredentialOnChainStatus;
  txHash: string;
  stellarPublicKey: string;
}