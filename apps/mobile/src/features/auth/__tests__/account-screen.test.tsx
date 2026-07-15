import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { AuthContextValue } from '@/features/auth/hooks/use-auth';
import type { AuthUser } from '@jojopotato/types';
import { fireEvent } from '@testing-library/react-native';

import AccountScreen from '@/app/(tabs)/account/index';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { renderWithProviders } from '@/test-utils/render';

// Stub the hook module directly (not the global auth-client mock): the screen
// reads a signed-in profile from `useAuth()`, and the default `jest-setup.ts`
// `authClient.useSession()` stub returns an unauthenticated `{data: null}`.
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

const sampleUser: AuthUser = {
  id: 'u1',
  name: 'Juan Dela Cruz',
  email: 'juan@test.com',
  role: 'customer',
  birthday: '1990-05-14',
  address: '123 Spud Lane',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AccountScreen', () => {
  test('renders the signed-in name and read-only email', async () => {
    mockUseAuth.mockReturnValue(authStub({ user: sampleUser }));

    const { getByText } = await renderWithProviders(<AccountScreen />);

    expect(getByText('Juan Dela Cruz')).toBeTruthy();
    expect(getByText('juan@test.com')).toBeTruthy();
  });

  test('shows the Edit-profile entry and the section links', async () => {
    mockUseAuth.mockReturnValue(authStub({ user: sampleUser }));

    const { getByText } = await renderWithProviders(<AccountScreen />);

    expect(getByText('Edit profile')).toBeTruthy();
    expect(getByText('Notifications')).toBeTruthy();
    expect(getByText('Help')).toBeTruthy();
    expect(getByText('Order History')).toBeTruthy();
  });

  test('fires signOut when Log out is pressed', async () => {
    const signOut = jest.fn();
    mockUseAuth.mockReturnValue(authStub({ user: sampleUser, signOut }));

    const { getByRole } = await renderWithProviders(<AccountScreen />);

    fireEvent.press(getByRole('button', { name: 'Log out' }));
    expect(signOut).toHaveBeenCalled();
  });
});
