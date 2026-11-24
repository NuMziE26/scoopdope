'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface CredentialData {
  learnerName: string;
  courseName: string;
  issueDate: string;
  onChainStatus: string;
  txHash?: string;
  verified?: boolean;
}

type FetchState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: CredentialData };

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const STELLAR_NETWORK =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';

function getExplorerUrl(txHash: string): string {
  const base =
    STELLAR_NETWORK === 'mainnet' || STELLAR_NETWORK === 'public'
      ? 'https://stellar.expert/explorer/public'
      : 'https://stellar.expert/explorer/testnet';
  return `${base}/tx/${txHash}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function VerifyCredentialPage() {
  const params = useParams<{ credentialHash: string }>();
  const credentialHash = params?.credentialHash;
  const [state, setState] = useState<FetchState>({ status: 'loading' });

  useEffect(() => {
    if (!credentialHash) {
      setState({ status: 'not-found' });
      return;
    }

    let cancelled = false;

    async function fetchCredential() {
      setState({ status: 'loading' });
      try {
        const response = await fetch(
          `${API_BASE_URL}/v1/credentials/verify/${encodeURIComponent(
            credentialHash as string,
          )}`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
          },
        );

        if (cancelled) return;

        if (response.status === 404) {
          setState({ status: 'not-found' });
          return;
        }

        if (!response.ok) {
          setState({
            status: 'error',
            message: 'Unable to verify credential. Please try again later.',
          });
          return;
        }

        const data = (await response.json()) as CredentialData;
        if (cancelled) return;
        setState({ status: 'success', data });
      } catch {
        if (cancelled) return;
        setState({
          status: 'error',
          message: 'Unable to verify credential. Please try again later.',
        });
      }
    }

    fetchCredential();

    return () => {
      cancelled = true;
    };
  }, [credentialHash]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Credential Verification
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Verify the authenticity of an on-chain credential.
          </p>
        </header>

        {state.status === 'loading' && (
          <div
            className="rounded-lg bg-white p-8 text-center shadow"
            role="status"
            aria-live="polite"
          >
            <p className="text-gray-600">Verifying credential…</p>
          </div>
        )}

        {state.status === 'not-found' && (
          <div
            className="rounded-lg border border-red-200 bg-white p-8 text-center shadow"
            role="alert"
          >
            <h2 className="text-xl font-semibold text-red-700">
              Credential Not Found
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              No credential matches the provided hash. Please check the link and
              try again.
            </p>
          </div>
        )}

        {state.status === 'error' && (
          <div
            className="rounded-lg border border-yellow-200 bg-white p-8 text-center shadow"
            role="alert"
          >
            <h2 className="text-xl font-semibold text-yellow-700">
              Verification Unavailable
            </h2>
            <p className="mt-2 text-sm text-gray-600">{state.message}</p>
          </div>
        )}

        {state.status === 'success' && (
          <div className="rounded-lg bg-white p-8 shadow">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Credential Details
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                  state.data.verified
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {state.data.verified
                  ? 'On-chain Verified'
                  : state.data.onChainStatus || 'Unverified'}
              </span>
            </div>

            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Learner Name
                </dt>
                <dd className="mt-1 text-base text-gray-900">
                  {state.data.learnerName}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Course Name
                </dt>
                <dd className="mt-1 text-base text-gray-900">
                  {state.data.courseName}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Issue Date
                </dt>
                <dd className="mt-1 text-base text-gray-900">
                  {formatDate(state.data.issueDate)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  On-chain Status
                </dt>
                <dd className="mt-1 text-base text-gray-900">
                  {state.data.onChainStatus || 'Unknown'}
                </dd>
              </div>
            </dl>

            {state.data.txHash && (
              <div className="mt-8 border-t border-gray-200 pt-6">
                <a
                  href={getExplorerUrl(state.data.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  View transaction on Stellar Explorer
                  <span aria-hidden="true" className="ml-1">
                    ↗
                  </span>
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}