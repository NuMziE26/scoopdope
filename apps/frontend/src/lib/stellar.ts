/**
 * Stellar balance utilities.
 *
 * On the Stellar network, the smallest unit is a "stroop":
 *   1 XLM (or any custom asset token) = 10,000,000 stroops
 *
 * When a balance is returned from a raw Soroban / token contract call it
 * arrives as an integer stroop value (e.g. 10_000_000 for 1 token).
 * This helper converts that integer to a human-readable decimal string with
 * 7 decimal places, which matches Stellar Horizon's canonical balance format.
 *
 * @example
 * formatStellarAmount('10000000')  // → '1.0000000'
 * formatStellarAmount('15000000')  // → '1.5000000'
 * formatStellarAmount('0')         // → '0.0000000'
 * formatStellarAmount('')          // → '0.0000000'
 */
export function formatStellarAmount(stroops: string): string {
  const raw = Number(stroops);
  if (!Number.isFinite(raw)) return '0.0000000';
  return (raw / 10_000_000).toFixed(7);
}

/**
 * Freighter wallet integration helpers.
 *
 * The Freighter extension API (`@stellar/freighter-api`) is imported
 * dynamically so that this module can be safely loaded in environments where
 * the extension (and even the package) is not available — e.g. server-side
 * rendering or browsers without the wallet installed.
 */

/** localStorage key used to persist the connected wallet public key. */
const WALLET_STORAGE_KEY = 'stellar_wallet_public_key';

/** Default Horizon endpoint used to query account balances. */
const HORIZON_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_HORIZON_URL) ||
  'https://horizon-testnet.stellar.org';

/** Default Stellar network passphrase (testnet). */
export const STELLAR_NETWORK_PASSPHRASE =
  (typeof process !== 'undefined' &&
    process.env?.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE) ||
  'Test SDF Network ; September 2015';

/**
 * Dynamically load the Freighter API. Returns `null` when the package is not
 * installed or cannot be resolved, so callers can degrade gracefully.
 */
async function loadFreighterApi(): Promise<any | null> {
  try {
    // Use a variable specifier so bundlers don't hard-fail when the optional
    // dependency is absent.
    const moduleName = '@stellar/freighter-api';
    const mod = await import(/* webpackIgnore: true */ moduleName);
    return (mod as any)?.default ?? mod;
  } catch {
    return null;
  }
}

/**
 * Returns `true` when the Freighter extension is installed and available.
 */
export async function isFreighterInstalled(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const freighter = await loadFreighterApi();
  if (!freighter) return false;
  try {
    if (typeof freighter.isConnected === 'function') {
      const result = await freighter.isConnected();
      // Older versions return a boolean, newer ones return { isConnected }.
      if (typeof result === 'boolean') return result;
      if (result && typeof result.isConnected === 'boolean') {
        return result.isConnected;
      }
    }
    if (typeof freighter.isAllowed === 'function') {
      const result = await freighter.isAllowed();
      if (typeof result === 'boolean') return result;
      if (result && typeof result.isAllowed === 'boolean') {
        return result.isAllowed;
      }
    }
    // If the API object exists, assume the extension is present.
    return true;
  } catch {
    return false;
  }
}

/**
 * Connect to the Freighter wallet and return the public key.
 *
 * Persists the public key to localStorage on success so the connection can be
 * restored across page loads.
 *
 * @throws Error when Freighter is unavailable or the user rejects the request.
 */
export async function connectFreighter(): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Freighter wallet is only available in the browser.');
  }
  const freighter = await loadFreighterApi();
  if (!freighter) {
    throw new Error(
      'Freighter wallet extension is not installed. Please install it to continue.',
    );
  }

  let publicKey: string | undefined;

  try {
    if (typeof freighter.requestAccess === 'function') {
      const result = await freighter.requestAccess();
      publicKey =
        typeof result === 'string'
          ? result
          : result?.address ?? result?.publicKey;
    }
    if (!publicKey && typeof freighter.getPublicKey === 'function') {
      const result = await freighter.getPublicKey();
      publicKey =
        typeof result === 'string'
          ? result
          : result?.address ?? result?.publicKey;
    }
  } catch (err: any) {
    throw new Error(
      err?.message || 'Failed to connect to Freighter wallet.',
    );
  }

  if (!publicKey) {
    throw new Error('Could not retrieve a public key from Freighter.');
  }

  try {
    window.localStorage.setItem(WALLET_STORAGE_KEY, publicKey);
  } catch {
    // Ignore storage failures (e.g. private browsing).
  }

  return publicKey;
}

/**
 * Sign a transaction XDR with Freighter.
 *
 * @param xdr               Base64-encoded transaction envelope XDR.
 * @param networkPassphrase Stellar network passphrase (defaults to testnet).
 * @returns The signed transaction XDR.
 * @throws Error when Freighter is unavailable or signing fails.
 */
export async function signWithFreighter(
  xdr: string,
  networkPassphrase: string = STELLAR_NETWORK_PASSPHRASE,
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Freighter wallet is only available in the browser.');
  }
  const freighter = await loadFreighterApi();
  if (!freighter) {
    throw new Error(
      'Freighter wallet extension is not installed. Please install it to continue.',
    );
  }

  try {
    const result = await freighter.signTransaction(xdr, {
      networkPassphrase,
    });
    const signed =
      typeof result === 'string'
        ? result
        : result?.signedTxXdr ?? result?.signedXDR;
    if (!signed) {
      throw new Error('Freighter did not return a signed transaction.');
    }
    return signed;
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to sign transaction with Freighter.');
  }
}

/**
 * Disconnect the wallet by clearing locally stored connection state.
 *
 * Note: this does not revoke the extension's permission; it only clears the
 * app's persisted public key so the UI treats the wallet as disconnected.
 */
export function disconnectWallet(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(WALLET_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

/**
 * Retrieve the previously stored wallet public key, if any.
 */
export function getStoredWalletPublicKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(WALLET_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Query Horizon for the native XLM balance of an account.
 *
 * @param publicKey Stellar account public key (G...).
 * @returns The XLM balance as a decimal string (e.g. '100.0000000'), or
 *          '0.0000000' when the account is unfunded or the request fails.
 */
export async function getWalletBalance(publicKey: string): Promise<string> {
  if (!publicKey) return '0.0000000';
  try {
    const response = await fetch(`${HORIZON_URL}/accounts/${publicKey}`);
    if (!response.ok) {
      // 404 means the account is not yet funded on the network.
      return '0.0000000';
    }
    const data = await response.json();
    const balances: Array<{ asset_type?: string; balance?: string }> =
      data?.balances ?? [];
    const native = balances.find((b) => b.asset_type === 'native');
    return native?.balance ?? '0.0000000';
  } catch {
    return '0.0000000';
  }
}