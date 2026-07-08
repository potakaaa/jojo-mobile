export function formatCurrency(amountInCents: number, currency = 'PHP', locale = 'en-PH'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountInCents / 100);
}
