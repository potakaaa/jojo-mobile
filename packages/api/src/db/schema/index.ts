// Re-export all schema tables and enums in FK dependency order.

// 1. No FK dependencies
export * from './branches';
export * from './categories';

// 2. Depends on categories
export * from './products';

// 3. Depends on products / branches
export * from './product_options';
export * from './branch_product_availability';

// 4a. No FK dependencies (ADM-008 — parent of offers)
export * from './promotions';

// 4b. Depends on promotions (enum-carrying) — ADM-008: renamed from deals
export * from './offers';

// 5. Depends on offers / products / branches — ADM-008: renamed from deal_products/deal_branches
export * from './offer_products';
export * from './offer_branches';

// 5b. Depends on products (self-referential — ADM-004 deals-as-products)
export * from './deal_components';

// 6. Depends on products
export * from './rewards';

// 7. Depends on branches
export * from './users';

// 7b. better-auth tables — depend on users
export * from './session';
export * from './account';
export * from './verification';

// 8. Depends on users / offers / rewards (lazy ref)
export * from './coupons';

// 9. Depends on users / branches
export * from './orders';

// 10. Depends on orders / products
export * from './order_items';

// 11. Depends on users
export * from './user_stars';

// 12. Depends on users / orders
export * from './star_transactions';

// 13. Depends on users
export * from './notifications';

// 14. Depends on users
export * from './device_tokens';
