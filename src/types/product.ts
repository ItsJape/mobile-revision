
import type { OrderProduct } from "./order";

export type ProductCategory =
  | "Fruits"
  | "Egg & Poultry"
  | "Vegetables"
  | "Rice & Grains";

export type ProductUnit = string;

export type ProductStatus = "Available" | "Out of Stock";

// One product can have multiple independently priced variants.
export type ProductVariant = {
  id: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  status: ProductStatus;
  createdAt: number;
  updatedAt?: number;
};

export type CreateProductVariantInput = {
  id?: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  status?: ProductStatus;
};

export type CreateProductInput = {
  name: string;
  category: string;
  unit: string;
  description: string;

  image: string;
  imagePublicId: string;
  images?: string[];
  imagePublicIds?: string[];

  video?: string;
  videoPublicId?: string;

  farmerId: string;
  farmerName: string;
  farmName: string;

  variants: ProductVariant[];

  // Automatically calculated from the variants.
  price: number;
  stock: number;
  status: ProductStatus;

  rating: number;
  totalReviews: number;
  totalSales: number;
  weeklySales: number;
  monthlySales: number;

  createdAt: number;
  updatedAt?: number;

  archived: boolean;
  lastReviewId?: string;
};

export type ProductType = CreateProductInput & {
  docId: string;
};

// Review information no longer depends on a batch.
export type CreateReviewInput = {
  productId: string;
  variantId?: string;
  variantName?: string;

  orderProduct: OrderProduct;

  orderId: string;
  buyerId: string;
  buyerName: string;
  buyerProfileImage?: string;

  rating: number;
  comment: string;
  createdAt: number;
};

export type ReviewType = CreateReviewInput & {
  docId: string;
};
