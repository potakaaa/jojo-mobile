import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * ADM-012 (#142) — the web staff-invite accept page's full onboarding flow:
 * start → verify → consume → PROFILE step → PASSWORD step → role-based routing.
 * Renders the presentational `StaffInviteAccept` directly (this app's test
 * convention: no router harness). Mocks the seam boundaries — `fetch`
 * (/start, /consume, /set-password), `authClient.magicLink.verify`,
 * `authClient.useSession`, and `authClient.updateUser`.
 *
 * Leading `-` in the filename: any file directly in `apps/admin/src/routes/` is
 * otherwise swept into TanStack Start's route generator (default ignore prefix is
 * `-`). Vitest still discovers it via the `*.test.tsx` glob. Same rationale as the
 * sibling `-index.test.tsx` / `-deals.$dealId.test.tsx`.
 */

vi.mock('@/features/auth/lib/auth-client', () => ({
  authClient: {
    magicLink: { verify: vi.fn() },
    useSession: vi.fn(() => ({ data: null, refetch: vi.fn() })),
    updateUser: vi.fn(() => Promise.resolve({ error: null })),
  },
}));

import { authClient } from '@/features/auth/lib/auth-client';

import { StaffInviteAccept } from './staff-invite-accept';

const verify = authClient.magicLink.verify as unknown as ReturnType<typeof vi.fn>;
const updateUser = authClient.updateUser as unknown as ReturnType<typeof vi.fn>;

let calls: string[];

/**
 * Fetch mock covering the three network seams. `consumeRole` drives the
 * role-based routing branch; `consumeOk`/`setPwOk` flip the two failure paths.
 */
function makeFetchMock(
  opts: { consumeRole?: string; consumeOk?: boolean; setPwOk?: boolean } = {},
) {
  const { consumeRole = 'admin', consumeOk = true, setPwOk = true } = opts;
  return vi.fn((input: RequestInfo | URL) => {
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
      return Promise.resolve({
        ok: consumeOk,
        json: () => Promise.resolve({ role: consumeRole }),
      } as Response);
    }
    if (url.endsWith('/staff-invite/set-password')) {
      calls.push('set-password');
      return Promise.resolve({
        ok: setPwOk,
        json: () => Promise.resolve({ ok: setPwOk }),
      } as Response);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

/** Fill the profile step with valid values so "Continue" enables. */
function fillValidProfile() {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Sam Staff' } });
  fireEvent.change(screen.getByLabelText('Birth month'), { target: { value: '05' } });
  fireEvent.change(screen.getByLabelText('Birth day'), { target: { value: '15' } });
  fireEvent.change(screen.getByLabelText('Birth year'), { target: { value: '1990' } });
  fireEvent.change(screen.getByLabelText('Address'), { target: { value: '123 Spud Lane' } });
}

beforeEach(() => {
  calls = [];
  verify.mockReset();
  verify.mockImplementation(() => {
    calls.push('verify');
    return Promise.resolve({ error: null });
  });
  updateUser.mockReset();
  updateUser.mockImplementation(() => Promise.resolve({ error: null }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('runs start → verify → consume in order, then lands on the profile step (never routes on consume alone)', async () => {
  const onSignedIn = vi.fn();
  vi.stubGlobal('fetch', makeFetchMock({ consumeRole: 'admin' }));

  render(<StaffInviteAccept token="raw-invite-token" onSignedIn={onSignedIn} />);

  await waitFor(() => expect(calls).toEqual(['start', 'verify', 'consume']));
  // Reaches the profile step — it does NOT sign the user into the dashboard yet.
  await screen.findByText('Tell us about you');
  expect(onSignedIn).not.toHaveBeenCalled();
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

test('profile step blocks Continue until name, valid birthday, and address are all present (AC6)', async () => {
  const onSignedIn = vi.fn();
  vi.stubGlobal('fetch', makeFetchMock({ consumeRole: 'admin' }));

  render(<StaffInviteAccept token="raw-invite-token" onSignedIn={onSignedIn} />);
  await screen.findByText('Tell us about you');

  const continueBtn = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
  // Nothing filled → blocked.
  expect(continueBtn.disabled).toBe(true);

  // Everything except an INVALID birthday (month 13) → still blocked.
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Sam Staff' } });
  fireEvent.change(screen.getByLabelText('Birth month'), { target: { value: '13' } });
  fireEvent.change(screen.getByLabelText('Birth day'), { target: { value: '40' } });
  fireEvent.change(screen.getByLabelText('Birth year'), { target: { value: '2020' } });
  fireEvent.change(screen.getByLabelText('Address'), { target: { value: '123 Spud Lane' } });
  expect(continueBtn.disabled).toBe(true);

  // Correct the birthday → enabled.
  fireEvent.change(screen.getByLabelText('Birth month'), { target: { value: '05' } });
  fireEvent.change(screen.getByLabelText('Birth day'), { target: { value: '15' } });
  expect(continueBtn.disabled).toBe(false);
});

test('admin/super_admin: after profile + password, routes to the dashboard (AC8)', async () => {
  for (const role of ['admin', 'super_admin'] as const) {
    calls = [];
    updateUser.mockClear();
    const onSignedIn = vi.fn();
    vi.stubGlobal('fetch', makeFetchMock({ consumeRole: role }));

    render(<StaffInviteAccept token="raw-invite-token" onSignedIn={onSignedIn} />);
    await screen.findByText('Tell us about you');

    fillValidProfile();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Password step.
    await screen.findByText('Set a password');
    expect(updateUser).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'strongpass123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'strongpass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));

    // set-password fired and the dashboard route was taken.
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(calls).toContain('set-password');

    cleanup();
  }
});

test('staff: after profile + password, shows the terminal confirmation and never routes to the dashboard (AC9)', async () => {
  const onSignedIn = vi.fn();
  vi.stubGlobal('fetch', makeFetchMock({ consumeRole: 'staff' }));

  render(<StaffInviteAccept token="raw-invite-token" onSignedIn={onSignedIn} />);
  await screen.findByText('Tell us about you');

  fillValidProfile();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  await screen.findByText('Set a password');
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'strongpass123' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: 'strongpass123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));

  // Terminal staff confirmation; the dashboard route is never taken.
  await screen.findByText("You're all set");
  expect(onSignedIn).not.toHaveBeenCalled();
  expect(calls).toContain('set-password');
});

test('password step blocks Finish until 8–128 chars AND the confirmation matches', async () => {
  const onSignedIn = vi.fn();
  vi.stubGlobal('fetch', makeFetchMock({ consumeRole: 'admin' }));

  render(<StaffInviteAccept token="raw-invite-token" onSignedIn={onSignedIn} />);
  await screen.findByText('Tell us about you');
  fillValidProfile();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('Set a password');

  const finishBtn = screen.getByRole('button', { name: 'Finish setup' }) as HTMLButtonElement;
  // Too short → blocked.
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'short' } });
  expect(finishBtn.disabled).toBe(true);

  // Long enough but mismatched → blocked + shows the mismatch alert.
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'strongpass123' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: 'different123' },
  });
  expect(finishBtn.disabled).toBe(true);
  expect(screen.getByText("Passwords don't match.")).toBeTruthy();

  // Matching + long enough → enabled.
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: 'strongpass123' },
  });
  expect(finishBtn.disabled).toBe(false);
});
