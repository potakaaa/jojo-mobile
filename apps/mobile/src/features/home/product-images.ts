/**
 * Local product photography, sourced from the live jojopotato.ph site
 * (`www.jojopotato.ph/assets/**`) and bundled locally so the Home screen
 * renders real brand imagery instead of flat placeholder blocks. Keyed by
 * `MenuItem.categoryId` — every mock product's category maps to one hero shot.
 */
import type { ImageSourcePropType } from 'react-native';

export const CATEGORY_IMAGES: Record<string, ImageSourcePropType> = {
  classic: require('../../../assets/images/food/fries-large.webp'),
  cheesy: require('../../../assets/images/food/corndog.webp'),
  spicy: require('../../../assets/images/food/nuggets.webp'),
  'sweet-savory': require('../../../assets/images/food/lemonade.webp'),
};

export const MASCOT_IMAGE: ImageSourcePropType = require('../../../assets/images/food/mascot.webp');
export const PRODUCT_TRIO_IMAGE: ImageSourcePropType = require('../../../assets/images/food/product-trio.webp');

export function getProductImage(categoryId: string): ImageSourcePropType | undefined {
  return CATEGORY_IMAGES[categoryId];
}
