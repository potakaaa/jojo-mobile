import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

/**
 * ADM-011 Section H (H4 / 19d) — the web staff-invite accept page's
 * start→verify→consume wiring. Renders the presentational `StaffInviteAccept`
 * directly (this app's test convention: no router harness). Mocks the two seam
 * boundaries — `fetch` (/start + /consume) and `authClient.magicLink.verify` —
 * and asserts (a) the 3 steps fire in order and (b) the single "Signing you in…"
 * loading state HOLDS across step 3 (verify) → step 4 (consume); `onSignedIn`
 * fires only after consume resolves, never after verify alone.
 *
 * Leading `-` in the filename: any file directly in `apps/admin/src/routes/` is
 * otherwise swept into TanStack Start's route generator (default ignore prefix is
 * `-`). Vitest still discovers it via the `*.test.tsx` glob. Same rationale as the
 * sibling `-index.test.tsx` / `-deals.$dealId.test.tsx`.
 */

vi.mock('@/features/auth/lib/auth-client', () => ({
  authClient: { magicLink: { verify: vi.fn() } },
}));

import { authClient } from '@/features/auth/lib/auth-client';

import { StaffInviteAccept } from './staff-invite-accept';

const verify = authClient.magicLink.verify as unknown as ReturnType<typeof vi.fn>;

/** A promise plus its resolver, so a test can hold a step open mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let calls: string[];

beforeEach(() => {
  calls = [];
  verify.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('runs start → verify → consume in order and holds the loading state across verify→consume', async () => {
  const consumeGate = deferred<void>();
  const onSignedIn = vi.fn();

  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/staff-invite/start')) {
      calls.push('start');
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ magicLinkToken: 'ml-tok' }),
      } as Response);
    }
    if (url.endsWith('/staff-invite/consume')) {
      calls.push('consume');
      // Hold consume open so we can assert the loading state is still shown and
      // onSignedIn has NOT fired yet (the held-state-across-3→4 assertion).
      return consumeGate.promise.then(() => ({
        ok: true,
        json: () => Promise.resolve({}),
      })) as Promise<Response>;
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  verify.mockImplementation(() => {
    calls.push('verify');
    return Promise.resolve({ error: null });
  });

  render(<StaffInviteAccept token="raw-invite-token" onSignedIn={onSignedIn} />);

  // Wait until consume has been reached (start + verify already ran before it).
  await waitFor(() => expect(calls).toEqual(['start', 'verify', 'consume']));

  // Held state: consume is still pending → still "Signing you in…", onSignedIn NOT called.
  expect(screen.getByText('Signing you in…')).toBeTruthy();
  expect(onSignedIn).not.toHaveBeenCalled();

  // Resolve consume → the flow completes and hands off to the shell.
  consumeGate.resolve();
  await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));

  // The full ordered sequence fired exactly once each.
  expect(calls).toEqual(['start', 'verify', 'consume']);
});

test('a failed /start shows the error card and never calls verify or consume', async () => {
  const onSignedIn = vi.fn();

  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/staff-invite/start')) {
      calls.push('start');
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<StaffInviteAccept token="bad-token" onSignedIn={onSignedIn} />);

  await screen.findByText('Invite failed');
  expect(verify).not.toHaveBeenCalled();
  expect(calls).toEqual(['start']);
  expect(onSignedIn).not.toHaveBeenCalled();
  expect(screen.getByText('Back to log in')).toBeTruthy();
});

test('a missing token shows the error card without any network calls', async () => {
  const onSignedIn = vi.fn();
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  render(<StaffInviteAccept token={undefined} onSignedIn={onSignedIn} />);

  await screen.findByText('Invite failed');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(onSignedIn).not.toHaveBeenCalled();
});
