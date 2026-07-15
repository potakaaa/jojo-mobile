import { Router, type Router as ExpressRouter } from 'express';

import branchesRouter from './branches';
import categoriesRouter from './categories';
import dealsRouter from './deals';
import productsRouter from './products';
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

// Deals CRUD (ADM-004) — deals + deal_products/deal_branches junctions. Same
// inherited guard; append-only, never restructure.
adminRouter.use('/deals', dealsRouter);

export default adminRouter;
