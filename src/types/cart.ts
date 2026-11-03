// A product line in the cart. One line = one product variant. The price is only
// a preview: the server re-reads the variant price and stock when the order is made.
export type CartItem = {
  docId?: string;
  productId: string;
  variantId: string;
  variantName?: string;
  buyerId: string;
  buyerName: string;
  farmerId?: string;
  farmName?: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
  unit: string;
  createdAt: number;
};