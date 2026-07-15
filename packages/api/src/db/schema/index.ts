// Re-export all schema tables and enums in FK dependency order.

// 1. No FK dependencies
export * from './branches';
export * from './categories';

// 2. Depends on categories
export * from './products';

// 3. Depends on products / branches
export * from './product_options';
export * from './branch_product_availability';

// 4. No FK dependencies (enum-carrying)
export * from './deals';

// 5. Depends on deals / products / branches
export * from './deal_products';
export * from './deal_branches';

// 6. Depends on products
export * from './rewards';

// 7. Depends on branches
export * from './users';

// 7b. better-auth tables — depend on users
export * from './session';
export * from './account';
export * from './verification';

// 8. Depends on users / deals / rewards (lazy ref)
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
