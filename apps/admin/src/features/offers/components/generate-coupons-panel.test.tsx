import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { OfferType } from '../lib/admin-offers-api';

import { GenerateCouponsPanel } from './generate-coupons-panel';

afterEach(cleanup);

function renderPanel(
  opts: { offerType?: OfferType; benefitProductId?: string | null } = {},
  onGenerate = vi.fn(),
) {
  const utils = render(
    <GenerateCouponsPanel
      offerId="o1"
      offerType={opts.offerType ?? 'percentage_discount'}
      benefitProductId={opts.benefitProductId ?? null}
      submitting={false}
      error={null}
      lastIssuedCount={null}
      onGenerate={onGenerate}
    />,
  );
  return { onGenerate, ...utils };
}

test('bulk-generates N coupons', () => {
  const { onGenerate } = renderPanel();
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
  expect(onGenerate).toHaveBeenCalledWith({ offerId: 'o1', quantity: 5 });
});

test('targeted mode pins quantity to 1 and reveals the customer field', () => {
  const { onGenerate } = renderPanel();
  fireEvent.click(screen.getByLabelText('Issue to a specific customer (targeted)'));

  const quantity = screen.getByLabelText('Quantity') as HTMLInputElement;
  expect(quantity.value).toBe('1');
  expect(quantity.disabled).toBe(true);

  fireEvent.change(screen.getByLabelText('Customer ID'), {
    target: { value: '11111111-1111-1111-1111-111111111111' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

  expect(onGenerate).toHaveBeenCalledWith({
    offerId: 'o1',
    quantity: 1,
    userId: '11111111-1111-1111-1111-111111111111',
  });
});

test('targeted issue without a customer id is blocked', () => {
  const { onGenerate, container } = renderPanel();
  fireEvent.click(screen.getByLabelText('Issue to a specific customer (targeted)'));
  // Submit the form directly to bypass jsdom's native `required`-field gating and
  // exercise the component's own JS validation branch.
  fireEvent.submit(container.querySelector('form')!);

  expect(onGenerate).not.toHaveBeenCalled();
  expect(screen.getByText('A targeted issue needs a customer ID.')).toBeDefined();
});

test('blocks generation for an unconfigured free-mechanic offer', () => {
  const { onGenerate, container } = renderPanel({ offerType: 'free_item', benefitProductId: null });

  expect(screen.getByText('Configure a benefit product first.')).toBeDefined();
  expect((screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement).disabled).toBe(
    true,
  );

  // Even a direct form submit (bypassing the disabled button) must not generate.
  fireEvent.submit(container.querySelector('form')!);
  expect(onGenerate).not.toHaveBeenCalled();
});

// F7c mutation-killer: parametrize the block over BOTH benefit mechanics. A typo in
// needsBenefitProduct's free_upgrade comparison would leave an unconfigured
// free_upgrade offer un-blocked; testing free_item alone cannot catch it.
for (const mechanic of ['free_item', 'free_upgrade'] as const) {
  test(`blocks generation for an unconfigured ${mechanic} offer`, () => {
    const { onGenerate, container } = renderPanel({ offerType: mechanic, benefitProductId: null });
    expect(screen.getByText('Configure a benefit product first.')).toBeDefined();
    expect((screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.submit(container.querySelector('form')!);
    expect(onGenerate).not.toHaveBeenCalled();
  });
}

test('allows generation once the free-mechanic offer has a benefit product', () => {
  const { onGenerate } = renderPanel({ offerType: 'free_item', benefitProductId: 'p1' });

  expect(screen.queryByText('Configure a benefit product first.')).toBeNull();
  expect((screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement).disabled).toBe(
    false,
  );

  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
  expect(onGenerate).toHaveBeenCalledWith({ offerId: 'o1', quantity: 3 });
});
