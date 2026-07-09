export interface Coupon {
  id: string;
  code: string;
  title: string;
  discountLabel: string;
  expiresAt?: string;
  isRedeemed: boolean;
}
