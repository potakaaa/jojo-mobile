import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import HelpScreen from '@/app/(tabs)/account/help';
import { renderWithProviders } from '@/test-utils/render';

/**
 * Help-screen render tests.
 *
 * The FAQ assertions deliberately check the ANSWER BODY's presence/absence rather
 * than the toggle's own props: a test that only asserted the chevron glyph or an
 * `expanded` flag would still pass if the accordion stopped rendering its answer
 * entirely. Answer text is matched by a distinctive phrase (regex) so rewording
 * the surrounding copy doesn't break the test, while removing the feature does.
 */

const mockRouterPush = jest.mocked(router.push);

/** A phrase unique to the "How does pickup work?" answer. */
const PICKUP_ANSWER = /we do not deliver/i;
/** A phrase unique to the "How do I place an order?" answer. */
const PLACE_ORDER_ANSWER = /pick the branch you want to collect from/i;

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  // Every external row hands off to the OS; keep it from touching a real handler.
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});

describe('HelpScreen — FAQ accordion', () => {
  test('renders every question but no answer body before any tap', async () => {
    const { getByText, queryByText } = await renderWithProviders(<HelpScreen />);

    expect(getByText('How do I place an order?')).toBeTruthy();
    expect(getByText('How does pickup work?')).toBeTruthy();
    expect(getByText('How do I earn and use stars?')).toBeTruthy();
    expect(getByText('What payment methods do you accept?')).toBeTruthy();
    expect(getByText('How do I edit my details or change branch?')).toBeTruthy();

    expect(queryByText(PICKUP_ANSWER)).toBeNull();
    expect(queryByText(PLACE_ORDER_ANSWER)).toBeNull();
  });

  test('tapping a question reveals its answer', async () => {
    const { getByTestId, queryByText } = await renderWithProviders(<HelpScreen />);

    expect(queryByText(PICKUP_ANSWER)).toBeNull();
    fireEvent.press(getByTestId('faq-toggle-pickup'));

    await waitFor(() => expect(queryByText(PICKUP_ANSWER)).not.toBeNull());
  });

  test('tapping the same question again hides its answer', async () => {
    const { getByTestId, queryByText } = await renderWithProviders(<HelpScreen />);

    fireEvent.press(getByTestId('faq-toggle-pickup'));
    await waitFor(() => expect(queryByText(PICKUP_ANSWER)).not.toBeNull());

    fireEvent.press(getByTestId('faq-toggle-pickup'));
    await waitFor(() => expect(queryByText(PICKUP_ANSWER)).toBeNull());
  });

  test('opening one question leaves the others closed', async () => {
    const { getByTestId, queryByText } = await renderWithProviders(<HelpScreen />);

    fireEvent.press(getByTestId('faq-toggle-pickup'));
    await waitFor(() => expect(queryByText(PICKUP_ANSWER)).not.toBeNull());

    expect(queryByText(PLACE_ORDER_ANSWER)).toBeNull();
  });

  test('exposes the expanded state to assistive tech', async () => {
    const { getByTestId } = await renderWithProviders(<HelpScreen />);
    const toggle = getByTestId('faq-toggle-pickup');

    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
    fireEvent.press(toggle);

    await waitFor(() =>
      expect(getByTestId('faq-toggle-pickup').props.accessibilityState).toMatchObject({
        expanded: true,
      }),
    );
  });
});

describe('HelpScreen — contact rows', () => {
  test('renders the email and phone rows with their values', async () => {
    const { getByText } = await renderWithProviders(<HelpScreen />);

    expect(getByText('Email us')).toBeTruthy();
    expect(getByText('jojopotatoph@gmail.com')).toBeTruthy();
    expect(getByText('Call us')).toBeTruthy();
    expect(getByText('0945 774 1612')).toBeTruthy();
  });

  test('Email us opens a mailto link', async () => {
    const { getByText } = await renderWithProviders(<HelpScreen />);
    fireEvent.press(getByText('Email us'));

    expect(Linking.openURL).toHaveBeenCalledWith('mailto:jojopotatoph@gmail.com');
  });

  test('Call us opens a tel link', async () => {
    const { getByText } = await renderWithProviders(<HelpScreen />);
    fireEvent.press(getByText('Call us'));

    expect(Linking.openURL).toHaveBeenCalledWith('tel:+639457741612');
  });
});

describe('HelpScreen — social and website rows', () => {
  test('renders the social rows with their handles', async () => {
    const { getByText } = await renderWithProviders(<HelpScreen />);

    expect(getByText('Facebook')).toBeTruthy();
    expect(getByText('@JojoPotatoph')).toBeTruthy();
    expect(getByText('Instagram')).toBeTruthy();
    expect(getByText('@jojopotatoph')).toBeTruthy();
  });

  test('Facebook opens the page in the external browser', async () => {
    const { getByText } = await renderWithProviders(<HelpScreen />);
    fireEvent.press(getByText('Facebook'));

    expect(Linking.openURL).toHaveBeenCalledWith('https://www.facebook.com/JojoPotatoph');
  });

  test('Instagram opens the profile in the external browser', async () => {
    const { getByText } = await renderWithProviders(<HelpScreen />);
    fireEvent.press(getByText('Instagram'));

    expect(Linking.openURL).toHaveBeenCalledWith('https://www.instagram.com/jojopotatoph/');
  });

  test('the website row opens jojopotato.ph in the external browser', async () => {
    const { getByText } = await renderWithProviders(<HelpScreen />);
    expect(getByText('Visit jojopotato.ph')).toBeTruthy();

    fireEvent.press(getByText('Visit jojopotato.ph'));
    expect(Linking.openURL).toHaveBeenCalledWith('https://www.jojopotato.ph/');
  });
});

describe('HelpScreen — legal rows (preserved)', () => {
  test('Terms and Conditions still pushes the terms route', async () => {
    const { getByText } = await renderWithProviders(<HelpScreen />);
    fireEvent.press(getByText('Terms and Conditions'));

    expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/terms');
  });

  test('Privacy Policy still pushes the privacy route', async () => {
    const { getByText } = await renderWithProviders(<HelpScreen />);
    fireEvent.press(getByText('Privacy Policy'));

    expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/privacy');
  });
});

describe('HelpScreen — external link failure handling', () => {
  test('a rejected openURL is swallowed instead of becoming an unhandled rejection', async () => {
    // The real failure path: a device with no dialer / mail client / browser.
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler') as never);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { getByText } = await renderWithProviders(<HelpScreen />);
    fireEvent.press(getByText('Call us'));

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('tel:+639457741612');
  });
});

describe('HelpScreen — footer', () => {
  test('Report a problem opens a pre-filled mailto with diagnostics', async () => {
    const { getByText } = await renderWithProviders(<HelpScreen />);
    fireEvent.press(getByText('Report a problem'));

    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    const url = jest.mocked(Linking.openURL).mock.calls[0]?.[0] ?? '';

    expect(url.startsWith('mailto:jojopotatoph@gmail.com?')).toBe(true);
    // Read the decoded params rather than string-matching the escaped form: the
    // assertion is about what the mail client ends up showing, not the escaping.
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(params.get('subject')).toBe('Jojo Potato app — problem report');

    const body = params.get('body') ?? '';
    expect(body).toContain('App version:');
    expect(body).toContain('Platform:');
    expect(body).toContain('OS version:');
  });

  test('renders the app version line', async () => {
    const { getByText } = await renderWithProviders(<HelpScreen />);
    expect(getByText(/^Jojo Potato · v/)).toBeTruthy();
  });
});
