import { REWARD_TYPES, type RewardType } from '@jojopotato/types';
import { asc, eq } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import { products, rewards } from '../../db/schema/index';
import { centsToNumeric, numericToCents, serializeAdminReward } from '../lib/serializers';
import { AdminApiError, handleAdminError } from './lib/errors';

/**
 * Admin Reward CRUD routes (ADM-005, #43). A Reward is a points-earned redemption
 * tier over the `rewards` table (name, required_stars, reward_type, reward_value,
 * eligible_product_id, is_active). Zero schema change — every field already exists.
 * `reward_type` is an unconstrained DB `varchar`; the {@link REWARD_TYPES}
 * allow-list (D2) is the ONLY gate on it. Money is CENTS at the boundary
 * (`centsToNumeric` on write, `numericToCents` on read via the serializer). Guard/
 * CORS are inherited from the `/api/admin` mount; no handler re-checks role. This
 * is the 5th consumer of the append-only admin aggregator pattern.
 *
 * The PUBLIC rewards surface (`GET /rewards/summary|available|history`,
 * `POST /rewards/:id/redeem`) is untouched — this only ADDS an admin surface over
 * the same table. Editing `required_stars`/`reward_value` here never mutates
 * `star_transactions` history or already-issued `coupons` (both invariants proven
 * by the admin-rewards integration suite — Known-Gap BANNED).
 */
const adminRewardsRouter: ExpressRouter = Router();

const uuidSchema = z.uuid();

const rewardTypeEnum = z.enum(REWARD_TYPES);

// Base object schema — the source `.partial()` derives from. The D4 cross-field
// rules live on a create-only `.superRefine` (a `ZodEffects` has no `.partial()`),
// and are re-run on the MERGED state in the PATCH handler.
const baseRewardSchema = z.object({
  name: z.string().min(1),
  requiredStars: z.number().int().positive(),
  rewardType: rewardTypeEnum,
  // Nullable so a PATCH can explicitly CLEAR the column (product→discount mechanic
  // flip sends `rewardValueCents: <n>` + `eligibleProductId: null`; the reverse
  // sends `rewardValueCents: null`). On create an explicit null behaves as absent.
  rewardValueCents: z.number().int().positive().nullable().optional(),
  eligibleProductId: z.uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * D4 reward_type ⇄ product ⇄ value cross-validation, shared by the create
 * `.superRefine` and the PATCH merged-state handler check. Returns the first
 * violation message, or null when the combination is valid:
 *  - free_item / free_upgrade REQUIRE an eligibleProductId and REJECT a rewardValueCents.
 *  - fixed_discount / percentage_discount REQUIRE a positive rewardValueCents and
 *    REJECT an eligibleProductId.
 * Prevents mint-able-but-worthless rewards (a free reward with no product, or a
 * discount reward with no value).
 */
function rewardBenefitError(input: {
  rewardType: RewardType;
  eligibleProductId?: string | null;
  rewardValueCents?: number | null;
}): string | null {
  const isProductReward = input.rewardType === 'free_item' || input.rewardType === 'free_upgrade';
  const isDiscount =
    input.rewardType === 'fixed_discount' || input.rewardType === 'percentage_discount';
  const hasProduct = input.eligibleProductId !== undefined && input.eligibleProductId !== null;
  const hasValue = input.rewardValueCents !== undefined && input.rewardValueCents !== null;

  if (isProductReward) {
    if (!hasProduct) {
      return 'eligibleProductId is required for free_item and free_upgrade rewards';
    }
    if (hasValue) {
      return 'rewardValueCents is not allowed for free_item and free_upgrade rewards';
    }
  }
  if (isDiscount) {
    if (hasProduct) {
      return 'eligibleProductId is not allowed for fixed_discount or percentage_discount rewards';
    }
    if (!hasValue) {
      return 'rewardValueCents is required for fixed_discount and percentage_discount rewards';
    }
    if (input.rewardValueCents! <= 0) {
      return 'rewardValueCents must be greater than 0 for fixed_discount and percentage_discount rewards';
    }
  }
  return null;
}

const createRewardSchema = baseRewardSchema.superRefine((data, ctx) => {
  const message = rewardBenefitError(data);
  if (message !== null) {
    ctx.addIssue({ code: 'custom', message });
  }
});

// `.refine` rejects an empty `{}` body so a no-op PATCH can't bump `updated_at`.
// Derives from the BASE object so `.partial()` is available; the D4 cross-rules run
// on the MERGED state in the PATCH handler (a partial body cannot be cross-validated
// in isolation).
const updateRewardSchema = baseRewardSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

/**
 * Pre-check a supplied `eligibleProductId` (E3, mirrors `offers.ts`'s
 * `assertBenefitProductExists`): a nonexistent product 404s (never a raw FK 500);
 * a deal-product or an inactive product 400s. A deal/inactive product can never be
 * added to a cart, so a reward pointed at one would be permanently unredeemable.
 */
async function assertProductExists(productId: string): Promise<void> {
  const [row] = await db
    .select({ id: products.id, isDeal: products.is_deal, isActive: products.is_active })
    .from(products)
    .where(eq(products.id, productId));
  if (!row) {
    throw new AdminApiError(404, 'Product not found');
  }
  if (row.isDeal) {
    throw new AdminApiError(400, 'eligibleProductId cannot be a deal product');
  }
  if (!row.isActive) {
    throw new AdminApiError(400, 'eligibleProductId must reference an active product');
  }
}

// GET / — all rewards incl. inactive, ordered required_stars ascending.
adminRewardsRouter.get('/', async (_req, res) => {
  const rows = await db.select().from(rewards).orderBy(asc(rewards.required_stars));
  res.json({ rewards: rows.map(serializeAdminReward) });
});

// GET /:rewardId — detail. 404 on a malformed id or a missing row.
adminRewardsRouter.get('/:rewardId', async (req, res) => {
  const rewardId = String(req.params.rewardId);
  if (!uuidSchema.safeParse(rewardId).success) {
    res.status(404).json({ error: 'Reward not found' });
    return;
  }

  const [reward] = await db.select().from(rewards).where(eq(rewards.id, rewardId));
  if (!reward) {
    res.status(404).json({ error: 'Reward not found' });
    return;
  }

  res.json({ reward: serializeAdminReward(reward) });
});

// POST / — create a reward. Validates `eligibleProductId` (404/400) before any write.
adminRewardsRouter.post('/', async (req, res) => {
  try {
    const parsed = createRewardSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid reward payload', details: parsed.error.issues });
      return;
    }
    const r = parsed.data;

    if (r.eligibleProductId != null) {
      await assertProductExists(r.eligibleProductId);
    }

    const [inserted] = await db
      .insert(rewards)
      .values({
        name: r.name,
        required_stars: r.requiredStars,
        reward_type: r.rewardType,
        ...(r.rewardValueCents == null ? {} : { reward_value: centsToNumeric(r.rewardValueCents) }),
        ...(r.eligibleProductId == null ? {} : { eligible_product_id: r.eligibleProductId }),
        ...(r.isActive === undefined ? {} : { is_active: r.isActive }),
      })
      .returning();

    res.status(201).json({ reward: serializeAdminReward(inserted!) });
  } catch (err) {
    handleAdminError(err, res, 'creating reward');
  }
});

// PATCH /:rewardId — partial update (incl. deactivate via `isActive: false`, D3).
adminRewardsRouter.patch('/:rewardId', async (req, res) => {
  try {
    const rewardId = String(req.params.rewardId);
    if (!uuidSchema.safeParse(rewardId).success) {
      throw new AdminApiError(404, 'Reward not found');
    }

    const parsed = updateRewardSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid reward payload', details: parsed.error.issues });
      return;
    }
    const r = parsed.data;

    // Load the existing row FIRST — the D4 cross-rules must be validated against the
    // MERGED (existing + patch) state, not the patch in isolation (partial-update
    // bypass trap: e.g. flipping only `rewardType` to a free mechanic while
    // `eligible_product_id` stays NULL, or to a discount mechanic while a value lingers).
    const [existing] = await db.select().from(rewards).where(eq(rewards.id, rewardId));
    if (!existing) {
      throw new AdminApiError(404, 'Reward not found');
    }

    // Only run the D4 cross-validation when the patch actually TOUCHES one of the
    // three cross-fields. A patch that changes none of them (a deactivate-only
    // `{ isActive: false }`, a rename, or a required_stars edit) must NOT be blocked
    // by a pre-existing legacy-invalid row — otherwise an admin could never
    // deactivate a misconfigured reward.
    const touchesBenefitFields =
      r.rewardType !== undefined ||
      r.eligibleProductId !== undefined ||
      r.rewardValueCents !== undefined;
    if (touchesBenefitFields) {
      const mergedEligibleProductId =
        r.eligibleProductId !== undefined ? r.eligibleProductId : existing.eligible_product_id;
      const mergedRewardValueCents =
        r.rewardValueCents !== undefined
          ? r.rewardValueCents
          : existing.reward_value === null
            ? null
            : numericToCents(existing.reward_value);
      const mergeError = rewardBenefitError({
        rewardType: (r.rewardType ?? existing.reward_type) as RewardType,
        eligibleProductId: mergedEligibleProductId,
        rewardValueCents: mergedRewardValueCents,
      });
      if (mergeError !== null) {
        res.status(400).json({ error: mergeError });
        return;
      }
    }

    if (r.eligibleProductId != null) {
      await assertProductExists(r.eligibleProductId);
    }

    const updates: Partial<typeof rewards.$inferInsert> = { updated_at: new Date() };
    if (r.name !== undefined) updates.name = r.name;
    if (r.requiredStars !== undefined) updates.required_stars = r.requiredStars;
    if (r.rewardType !== undefined) updates.reward_type = r.rewardType;
    if (r.rewardValueCents !== undefined)
      updates.reward_value =
        r.rewardValueCents === null ? null : centsToNumeric(r.rewardValueCents);
    if (r.eligibleProductId !== undefined) updates.eligible_product_id = r.eligibleProductId;
    if (r.isActive !== undefined) updates.is_active = r.isActive;

    const [updated] = await db
      .update(rewards)
      .set(updates)
      .where(eq(rewards.id, rewardId))
      .returning();

    if (!updated) {
      throw new AdminApiError(404, 'Reward not found');
    }

    res.json({ reward: serializeAdminReward(updated) });
  } catch (err) {
    handleAdminError(err, res, 'updating reward');
  }
});

export default adminRewardsRouter;
