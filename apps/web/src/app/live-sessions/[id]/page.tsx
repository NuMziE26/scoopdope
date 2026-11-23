'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface LiveSession {
  id: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  joinUrl?: string;
  instructor?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export default function LiveSessionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [session, setSession] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/v1/live-sessions/${id}`);
        if (!res.ok) throw new Error('Failed to load live session');
        const data = (await res.json()) as LiveSession;
        if (!cancelled) setSession(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleAddToCalendar = () => {
    if (!id) return;
    window.location.href = `${API_BASE}/v1/live-sessions/${id}/calendar`;
  };

  if (loading) {
    return <div className="p-6">Loading live session…</div>;
  }

  if (error || !session) {
    return <div className="p-6 text-red-600">{error ?? 'Live session not found'}</div>;
  }

  const isCancelled = session.status === 'cancelled';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{session.title}</h1>
          {session.instructor && (
            <p className="text-sm text-gray-600">Hosted by {session.instructor}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleAddToCalendar}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add to Calendar
        </button>
      </header>

      {isCancelled && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          This live session has been cancelled.
        </div>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-gray-500">Starts</dt>
          <dd className="text-base">{new Date(session.startsAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Ends</dt>
          <dd className="text-base">{new Date(session.endsAt).toLocaleString()}</dd>
        </div>
      </dl>

      {session.description && (
        <section className="mt-6">
          <h2 className="text-lg font-medium">About this session</h2>
          <p className="mt-2 whitespace-pre-line text-gray-700">{session.description}</p>
        </section>
      )}

      {!isCancelled && session.joinUrl && (
        <a
          href={session.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Join Session
        </a>
      )}
    </div>
  );
}
