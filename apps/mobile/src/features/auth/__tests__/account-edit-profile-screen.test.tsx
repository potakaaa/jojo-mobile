import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { AuthContextValue } from '@/features/auth/hooks/use-auth';
import type { AuthUser } from '@jojopotato/types';
import { fireEvent } from '@testing-library/react-native';

import EditProfileScreen from '@/app/(tabs)/account/edit-profile';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { renderWithProviders } from '@/test-utils/render';

// Stub the hook module directly (same mechanism as the account index test).
jest.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = jest.mocked(useAuth);

function authStub(over: Partial<Record<keyof AuthContextValue, unknown>>): AuthContextValue {
  return {
    user: null,
    role: null,
    isStaff: false,
    isLoading: false,
    hasOnboarded: true,
    hasCompletedProfile: true,
    signIn: jest.fn(),
    signOut: jest.fn(),
    completeOnboarding: jest.fn(),
    completeProfile: jest.fn(),
    updateProfile: jest.fn(),
    ...over,
  } as unknown as AuthContextValue;
}

function user(over: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u1',
    name: 'Juan Dela Cruz',
    email: 'juan@test.com',
    role: 'customer',
    birthday: '1990-05-14',
    address: '123 Spud Lane',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EditProfileScreen', () => {
  test('pre-fills name, birthday, and address from the current user', async () => {
    mockUseAuth.mockReturnValue(authStub({ user: user() }));

    const { getByDisplayValue } = await renderWithProviders(<EditProfileScreen />);

    expect(getByDisplayValue('Juan Dela Cruz')).toBeTruthy();
    expect(getByDisplayValue('123 Spud Lane')).toBeTruthy();
    expect(getByDisplayValue('05')).toBeTruthy(); // MM
    expect(getByDisplayValue('14')).toBeTruthy(); // DD
    expect(getByDisplayValue('1990')).toBeTruthy(); // YYYY
  });

  test('blocks Save on an invalid birthday and never calls updateProfile', async () => {
    const updateProfile = jest.fn();
    // No birthday → assembled value is empty → invalid → Save disabled/guarded.
    mockUseAuth.mockReturnValue(authStub({ user: user({ birthday: null }), updateProfile }));

    const { getByRole } = await renderWithProviders(<EditProfileScreen />);

    fireEvent.press(getByRole('button', { name: 'Save changes' }));
    expect(updateProfile).not.toHaveBeenCalled();
  });

  test('valid Save calls updateProfile with exactly {name,birthday,address}', async () => {
    const updateProfile = jest.fn(() => Promise.resolve({ ok: true }));
    mockUseAuth.mockReturnValue(authStub({ user: user(), updateProfile }));

    const { getByRole } = await renderWithProviders(<EditProfileScreen />);

    fireEvent.press(getByRole('button', { name: 'Save changes' }));

    expect(updateProfile).toHaveBeenCalledWith({
      name: 'Juan Dela Cruz',
      birthday: '1990-05-14',
      address: '123 Spud Lane',
    });
    // The payload must never carry a server-owned field or onboarding stamp.
    const payload = (updateProfile.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('role');
    expect(payload).not.toHaveProperty('onboardedAt');
  });

  test('renders no role input in the form', async () => {
    mockUseAuth.mockReturnValue(authStub({ user: user() }));

    const { queryByText, queryByDisplayValue } = await renderWithProviders(<EditProfileScreen />);

    expect(queryByText('Role')).toBeNull();
    expect(queryByText('role')).toBeNull();
    // The user's role value must not appear as a pre-filled editable field.
    expect(queryByDisplayValue('customer')).toBeNull();
  });
});
