import { Router, type Router as ExpressRouter } from 'express';

import analyticsRouter from './analytics';
import branchesRouter from './branches';
import categoriesRouter from './categories';
import couponsRouter from './coupons';
import dealsRouter from './deals';
import offersRouter from './offers';
import ordersRouter from './orders';
import productsRouter from './products';
import promotionsRouter from './promotions';
import rewardsRouter from './rewards';
import usersRouter from './users';

/**
 * Admin router aggregator. The `requireAdmin` guard + CORS are applied ONCE at
 * mount time in `index.ts` (`app.use('/api/admin', cors(...), requireAdmin(auth), adminRouter)`),
 * so every sub-router mounted here inherits both automatically. Later admin
 * phases (ADM-002..007) mount their own sub-routers here — they never re-apply
 * the guard and never restructure this file, only append.
 */
const adminRouter: ExpressRouter = Router();

// Mounted at the admin ROOT so users.ts can serve BOTH the `/me` canary
// (→ GET /api/admin/me) and the role-management route (→ POST
// /api/admin/users/:id/role) at their authoritative Public-Contract paths.
adminRouter.use('/', usersRouter);

// Branch CRUD (ADM-002) — mounted under `/branches`; inherits requireAdmin + CORS.
adminRouter.use('/branches', branchesRouter);

// Product catalog CRUD (ADM-003) — categories + products (with options and
// per-branch availability). Same inherited guard; append-only, never restructure.
adminRouter.use('/categories', categoriesRouter);
adminRouter.use('/products', productsRouter);

// Deals CRUD (ADM-004 — deals-as-products) — is_deal=true products + the
// deal_components junction. Same inherited guard; append-only, never restructure.
adminRouter.use('/deals', dealsRouter);

// Coupon system CRUD (ADM-008 — Promotions/Offers/Coupons) — same inherited
// guard; append-only, never restructure.
adminRouter.use('/promotions', promotionsRouter);
adminRouter.use('/offers', offersRouter);
adminRouter.use('/coupons', couponsRouter);

// Rewards CRUD (ADM-005 — points-earned redemption tiers) — same inherited guard;
// append-only, never restructure. 5th consumer of the append-only aggregator pattern.
adminRouter.use('/rewards', rewardsRouter);

// Orders view (ADM-006 — READ-ONLY cross-branch order oversight) — GET handlers
// only, no mutation. Same inherited guard; append-only, never restructure. 10th
// consumer of the append-only aggregator pattern.
adminRouter.use('/orders', ordersRouter);

// Analytics view (ADM-007 — READ-ONLY aggregation dashboard) — GET only, no
// mutation. Same inherited guard; append-only, never restructure. 11th consumer
// of the append-only aggregator pattern.
adminRouter.use('/analytics', analyticsRouter);

export default adminRouter;
