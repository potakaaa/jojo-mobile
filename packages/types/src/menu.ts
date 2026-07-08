export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  imageUrl?: string;
  categoryId: string;
  isAvailable: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}
