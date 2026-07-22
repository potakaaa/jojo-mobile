import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Palette } from '../../theme';
import { CouponCard } from '../coupon-card';
import { MOCK_COUPON } from './mocks';

/**
 * A3 / AC9 — the applied-coupon row must never look like a dead button, and must
 * never clip or wrap its text.
 *
 * The reported defect had two halves:
 *  1. the cart passed a descriptive LABEL into the solid jyellow `codeChip`
 *     pill, which reads as tappable even with no `onPress` wired, and clipped to
 *     "Ap…";
 *  2. the amount wrapped mid-number ("-₱1,289." / "00") because the pill ate the
 *     row's width.
 *
 * The pill now renders only for a genuine `code`; the amount carries a hard
 * one-line guard.
 */

const LONG_TITLE = 'Applied discount for the loyalty birthday reward bundle';

test('renders CouponCard without throwing', async () => {
  await render(<CouponCard mode="light" coupon={MOCK_COUPON} />);
});

test('renders the code pill when a genuine code is supplied', async () => {
  const { getByText, toJSON } = await render(<CouponCard mode="light" coupon={MOCK_COUPON} />);

  expect(getByText('JOJO10')).toBeTruthy();
  expect(hasYellowPill(toJSON())).toBe(true);
});

test('AC9: omits the code pill entirely when there is no real code', async () => {
  const { queryByText, toJSON } = await render(
    <CouponCard
      mode="light"
      coupon={{
        id: 'c1',
        title: 'Birthday reward',
        discountLabel: '-₱1,289.00',
        isRedeemed: false,
      }}
    />,
  );

  // Name and amount still render — only the false button affordance is gone.
  expect(queryByText('Birthday reward')).not.toBeNull();
  expect(queryByText('-₱1,289.00')).not.toBeNull();

  // No jyellow pill anywhere in the tree.
  expect(hasYellowPill(toJSON())).toBe(false);
});

test('AC9: a long title and a long amount are each held to one line', async () => {
  const { toJSON } = await render(
    <CouponCard
      mode="light"
      coupon={{
        id: 'c1',
        title: LONG_TITLE,
        discountLabel: '-₱1,289.00',
        isRedeemed: false,
      }}
    />,
  );

  const limits = lineLimits(toJSON());

  // The amount must not be allowed to wrap mid-number across two lines.
  expect(limits['-₱1,289.00']).toBe(1);
  expect(limits[LONG_TITLE]).toBe(1);
});

test('AC9: a short amount is held to one line too', async () => {
  const { toJSON } = await render(
    <CouponCard
      mode="light"
      coupon={{ id: 'c1', title: 'Deal', discountLabel: '-₱5.00', isRedeemed: false }}
    />,
  );

  expect(lineLimits(toJSON())['-₱5.00']).toBe(1);
});

test('the card is not a button unless it is genuinely tappable', async () => {
  const withoutPress = await render(<CouponCard mode="light" coupon={MOCK_COUPON} />);
  expect(withoutPress.queryByRole('button')).toBeNull();

  const withPress = await render(
    <CouponCard mode="light" coupon={MOCK_COUPON} onPress={() => {}} />,
  );
  expect(withPress.queryByRole('button')).not.toBeNull();
});

/** Every rendered Text node's `numberOfLines`, keyed by its text content. */
function lineLimits(json: unknown, out: Record<string, unknown> = {}): Record<string, unknown> {
  if (!json || typeof json !== 'object') return out;
  if (Array.isArray(json)) {
    for (const child of json) lineLimits(child, out);
    return out;
  }
  const node = json as { type?: string; props?: Record<string, unknown>; children?: unknown };
  if (node.type === 'Text') {
    const text = flatText(node.children);
    if (text) out[text] = node.props?.numberOfLines;
  }
  lineLimits(node.children, out);
  return out;
}

function flatText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatText).join('');
  if (node && typeof node === 'object' && 'children' in node) {
    return flatText((node as { children: unknown }).children);
  }
  return '';
}

/** True when any node in the tree paints the solid jyellow code-pill surface. */
function hasYellowPill(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false;
  if (Array.isArray(json)) return json.some(hasYellowPill);
  const node = json as { props?: { style?: unknown }; children?: unknown };
  const flat = (StyleSheet.flatten(node.props?.style) ?? {}) as Record<string, unknown>;
  // The pill is the only jyellow *rounded* surface this card renders.
  if (flat.backgroundColor === Palette.jyellow && flat.borderRadius !== undefined) return true;
  return hasYellowPill(node.children);
}
