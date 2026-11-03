// Shared identity helpers for reviews attached to a specific product variant
// inside a specific order.

const getVariantIdentity = (
  variantId?: string | null,
  variantName?: string | null
): string =>
  String(variantId || variantName || "default").trim() || "default";

// Stored in orders/{orderId}.reviewedProductIds.
export const getOrderProductReviewKey = (
  productId: string,
  variantId?: string | null,
  variantName?: string | null
): string => {
  const safeProductId = encodeURIComponent(String(productId || "").trim());
  const safeVariant = encodeURIComponent(
    getVariantIdentity(variantId, variantName)
  );

  return `${safeProductId}::${safeVariant}`;
};

// Unique Firestore document ID: one review per order + product + variant.
export const getOrderProductReviewDocumentId = (
  orderId: string,
  productId: string,
  variantId?: string | null,
  variantName?: string | null
): string =>
  `review_${encodeURIComponent(String(orderId).trim())}_${getOrderProductReviewKey(
    productId,
    variantId,
    variantName
  )}`;
