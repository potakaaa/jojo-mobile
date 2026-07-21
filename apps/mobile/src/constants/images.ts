/**
 * Brand-level imagery shared across features (the auth pre-stack and the Home
 * screen), sourced from the live jojopotato.ph site (`www.jojopotato.ph/assets/**`)
 * and bundled locally so screens render real brand art instead of placeholders.
 * These are NOT specific to any one feature. Per-product photography comes from
 * the API (`MenuItem.imageUrl`, resolved via `@/lib/image-url`), not bundled assets.
 */
import type { ImageSourcePropType } from 'react-native';

export const MASCOT_IMAGE: ImageSourcePropType = require('../../assets/images/food/mascot.webp');
export const PRODUCT_TRIO_IMAGE: ImageSourcePropType = require('../../assets/images/food/product-trio.webp');
