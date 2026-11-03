import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "../../FirebaseConfig";
import { normalizeProductName } from "@/src/constants/productCatalog";
import { getOrderProductReviewDocumentId } from "@/src/utils/orderReview";

import type {
  CreateProductInput,
  CreateProductVariantInput,
  ProductType,
  ProductVariant,
  ProductStatus,
  CreateReviewInput,
  ReviewType,
} from "../types/product";

const productCollection = collection(db, "products");
const reviewCollection = collection(db, "reviews");

// Creates a Firestore-style unique ID without creating another document.
const generateVariantId = () => doc(collection(db, "products")).id;

// Validates and normalizes all variants before saving.
const normalizeVariants = (
  variants: ProductVariant[]
): ProductVariant[] => {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error("A product must have at least one variant.");
  }

  const usedNames = new Set<string>();
  const usedIds = new Set<string>();

  return variants.map((variant) => {
    const id = String(variant.id || generateVariantId());
    const name = String(variant.name || "").trim();
    const unit = String(variant.unit || "").trim();

    const price = Number(variant.price);
    const stock = Number(variant.stock);

    if (!name) {
      throw new Error("Variant name is required.");
    }

    if (!unit) {
      throw new Error("Variant unit is required.");
    }

    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Invalid price for ${name}.`);
    }

    if (!Number.isFinite(stock) || stock < 0) {
      throw new Error(`Invalid stock for ${name}.`);
    }

    const normalizedName = normalizeProductName(name);

    if (usedNames.has(normalizedName)) {
      throw new Error(`Duplicate variant name: ${name}.`);
    }

    if (usedIds.has(id)) {
      throw new Error(`Duplicate variant ID: ${id}.`);
    }

    usedNames.add(normalizedName);
    usedIds.add(id);

    const status: ProductStatus =
      stock > 0 && variant.status !== "Out of Stock"
        ? "Available"
        : "Out of Stock";

    return {
      id,
      name,
      unit,
      price,
      stock,
      status,
      createdAt: Number(variant.createdAt) || Date.now(),
      updatedAt: variant.updatedAt || Date.now(),
    };
  });
};

// Calculates the summary fields displayed on product cards.
// The actual prices and stocks remain inside their individual variants.
const getProductSummary = (variants: ProductVariant[]) => {
  const availableVariants = variants.filter(
    (variant) =>
      variant.status === "Available" &&
      Number(variant.stock) > 0
  );

  const priceVariants =
    availableVariants.length > 0
      ? availableVariants
      : variants;

  const lowestPrice =
    priceVariants.length > 0
      ? Math.min(...priceVariants.map((v) => v.price))
      : 0;

  const totalStock = availableVariants.reduce(
    (sum, variant) => sum + Number(variant.stock || 0),
    0
  );

  return {
    price: lowestPrice,
    stock: totalStock,
    status: totalStock > 0 ? "Available" : "Out of Stock",
  } as const;
};

// Creates an aggregate update for the product document.
const getVariantUpdates = (variants: ProductVariant[]) => ({
  variants,
  ...getProductSummary(variants),
  updatedAt: Date.now(),
});

// Reads one product using its Firestore document ID.
export const getProductById = async (
  id: string
): Promise<ProductType | null> => {
  try {
    const snap = await getDoc(doc(db, "products", id));

    if (!snap.exists()) {
      return null;
    }

    return {
      docId: snap.id,
      ...(snap.data() as CreateProductInput),
    };
  } catch (error) {
    console.log("GET PRODUCT ERROR:", error);
    throw error;
  }
};

// Returns all products owned by a farmer.
export const getFarmerProductNames = async (
  farmerId: string,
  includeArchived = false
): Promise<ProductType[]> => {
  try {
    const q = query(
      productCollection,
      where("farmerId", "==", farmerId)
    );

    const snapshot = await getDocsFromServer(q);

    const products = snapshot.docs.map((d) => ({
      docId: d.id,
      ...(d.data() as CreateProductInput),
    }));

    const filteredProducts = includeArchived
      ? products
      : products.filter((product) => !product.archived);

    return filteredProducts.sort(
      (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
    );
  } catch (error) {
    console.log("GET FARMER PRODUCTS ERROR:", error);
    throw error;
  }
};

export const getFarmerProducts = getFarmerProductNames;

// Returns only archived products owned by the farmer.
export const getArchivedProducts = async (
  farmerId: string
): Promise<ProductType[]> => {
  const products = await getFarmerProductNames(farmerId, true);

  return products.filter((product) => product.archived);
};

// Real-time subscription for all products owned by one farmer.
// Includes active and archived products so both tabs stay synchronized.
export const subscribeToFarmerProducts = (
  farmerId: string,
  callback: (products: ProductType[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  if (!farmerId) {
    onError?.(new Error("Farmer ID is required."));
    return () => {};
  }

  const q = query(
    productCollection,
    where("farmerId", "==", farmerId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const products: ProductType[] = snapshot.docs
        .map((d) => ({
          docId: d.id,
          ...(d.data() as CreateProductInput),
        }))
        .sort(
          (a, b) =>
            Number(b.createdAt || 0) - Number(a.createdAt || 0)
        );

      callback(products);
    },
    (error) => {
      console.log("FARMER PRODUCTS REALTIME ERROR:", error);
      onError?.(error);
    }
  );
};

// Checks whether a product with the same name and category already exists.
const findExistingProduct = async (
  farmerId: string,
  name: string,
  category: string
): Promise<ProductType | null> => {
  const q = query(
    productCollection,
    where("farmerId", "==", farmerId),
    where("category", "==", category)
  );

  const snapshot = await getDocs(q);
  const targetName = normalizeProductName(name);

  const match = snapshot.docs.find((d) => {
    const data = d.data() as CreateProductInput;

    return (
      !data.archived &&
      normalizeProductName(data.name) === targetName
    );
  });

  if (!match) return null;

  return {
    docId: match.id,
    ...(match.data() as CreateProductInput),
  };
};

// Checks whether a matching product is already archived.
export const findArchivedProduct = async (
  farmerId: string,
  name: string,
  category: string
): Promise<ProductType | null> => {
  const q = query(
    productCollection,
    where("farmerId", "==", farmerId),
    where("category", "==", category)
  );

  const snapshot = await getDocs(q);
  const targetName = normalizeProductName(name);

  const match = snapshot.docs.find((d) => {
    const data = d.data() as CreateProductInput;

    return (
      data.archived === true &&
      normalizeProductName(data.name) === targetName
    );
  });

  if (!match) return null;

  return {
    docId: match.id,
    ...(match.data() as CreateProductInput),
  };
};

// Creates a new product with its initial variants.
export const createProduct = async (
  input: CreateProductInput
): Promise<ProductType> => {
  try {
    if (!input.farmerId) {
      throw new Error("Farmer information is required.");
    }

    if (!input.name?.trim()) {
      throw new Error("Product name is required.");
    }

    const existing = await findExistingProduct(
      input.farmerId,
      input.name,
      input.category
    );

    if (existing) {
      throw new Error(
        `You already have "${existing.name}". Open that product to manage its variants.`
      );
    }

    const archived = await findArchivedProduct(
      input.farmerId,
      input.name,
      input.category
    );

    if (archived) {
      throw new Error(
        `You already have "${archived.name}" archived. Unarchive it before creating another listing.`
      );
    }

    const variants = normalizeVariants(input.variants);
    const images =
      input.images?.length
        ? input.images
        : input.image
          ? [input.image]
          : [];

    const imagePublicIds =
      input.imagePublicIds || [];

    const productData: CreateProductInput = {
      ...input,
      name: input.name.trim(),
      description: input.description.trim(),
      image: images[0] || "",
      imagePublicId: imagePublicIds[0] || input.imagePublicId || "",
      images,
      imagePublicIds,
      video: input.video || "",
      videoPublicId: input.videoPublicId || "",
      variants,
      ...getProductSummary(variants),
      createdAt: input.createdAt || Date.now(),
      archived: false,
    };

    const docRef = await addDoc(productCollection, productData);

    return {
      docId: docRef.id,
      ...productData,
    };
  } catch (error) {
    console.log("CREATE PRODUCT ERROR:", error);
    throw error;
  }
};

// Updates the shared product information and its complete variant list.
export const updateProductInfo = async (
  product: ProductType
): Promise<void> => {
  try {
    if (!product.docId) {
      throw new Error("Product ID is required.");
    }

    const productRef = doc(db, "products", product.docId);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(productRef);

      if (!snap.exists()) {
        throw new Error("Product not found.");
      }

      const variants = normalizeVariants(product.variants);

      const images =
        product.images?.length
          ? product.images
          : product.image
            ? [product.image]
            : [];

      transaction.update(productRef, {
        name: product.name.trim(),
        category: product.category,
        unit: product.unit,
        description: product.description.trim(),

        image: images[0] || "",
        imagePublicId: product.imagePublicIds?.[0] || product.imagePublicId || "",
        images,
        imagePublicIds: product.imagePublicIds || [],

        video: product.video || "",
        videoPublicId: product.videoPublicId || "",

        ...getVariantUpdates(variants),
      });
    });
  } catch (error) {
    console.log("UPDATE PRODUCT INFO ERROR:", error);
    throw error;
  }
};

// Adds another variant to an existing product.
export const addProductVariant = async (
  productId: string,
  input: CreateProductVariantInput
): Promise<ProductVariant> => {
  try {
    const productRef = doc(db, "products", productId);

    const newVariant = normalizeVariants([
      {
        id: input.id || generateVariantId(),
        name: input.name,
        unit: input.unit,
        price: input.price,
        stock: input.stock,
        status:
          input.status ||
          (input.stock > 0 ? "Available" : "Out of Stock"),
        createdAt: Date.now(),
      },
    ])[0];

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(productRef);

      if (!snap.exists()) {
        throw new Error("Product not found.");
      }

      const product = snap.data() as CreateProductInput;
      const currentVariants = product.variants || [];

      const duplicate = currentVariants.some(
        (variant) =>
          normalizeProductName(variant.name) ===
          normalizeProductName(newVariant.name)
      );

      if (duplicate) {
        throw new Error(
          `The variant "${newVariant.name}" already exists.`
        );
      }

      const updatedVariants = normalizeVariants([
        ...currentVariants,
        newVariant,
      ]);

      transaction.update(
        productRef,
        getVariantUpdates(updatedVariants)
      );
    });

    return newVariant;
  } catch (error) {
    console.log("ADD PRODUCT VARIANT ERROR:", error);
    throw error;
  }
};

// Updates the price, stock, name, unit, or status of one variant.
export const updateProductVariant = async (
  productId: string,
  variantId: string,
  updates: Partial<Omit<ProductVariant, "id" | "createdAt">>
): Promise<void> => {
  try {
    const productRef = doc(db, "products", productId);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(productRef);

      if (!snap.exists()) {
        throw new Error("Product not found.");
      }

      const product = snap.data() as CreateProductInput;
      const variants = product.variants || [];

      const index = variants.findIndex(
        (variant) => variant.id === variantId
      );

      if (index === -1) {
        throw new Error("Product variant not found.");
      }

      const currentVariant = variants[index];

      const nextStock =
        updates.stock !== undefined
          ? Number(updates.stock)
          : Number(currentVariant.stock);

      const requestedStatus =
        updates.status !== undefined
          ? updates.status
          : updates.stock !== undefined && nextStock > 0
            ? "Available"
            : currentVariant.status;

      const updatedVariant: ProductVariant = {
        ...currentVariant,
        ...updates,
        id: currentVariant.id,
        name: updates.name?.trim() || currentVariant.name,
        unit: updates.unit?.trim() || currentVariant.unit,
        price:
          updates.price !== undefined
            ? Number(updates.price)
            : currentVariant.price,
        stock: nextStock,
        status:
          nextStock > 0 && requestedStatus !== "Out of Stock"
            ? "Available"
            : "Out of Stock",
        updatedAt: Date.now(),
      };

      const updatedVariants = variants.map((variant, i) =>
        i === index ? updatedVariant : variant
      );

      const normalized = normalizeVariants(updatedVariants);

      transaction.update(
        productRef,
        getVariantUpdates(normalized)
      );
    });
  } catch (error) {
    console.log("UPDATE PRODUCT VARIANT ERROR:", error);
    throw error;
  }
};

// Removes one variant. A product must retain at least one variant.
export const deleteProductVariant = async (
  productId: string,
  variantId: string
): Promise<void> => {
  try {
    const productRef = doc(db, "products", productId);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(productRef);

      if (!snap.exists()) {
        throw new Error("Product not found.");
      }

      const product = snap.data() as CreateProductInput;
      const variants = product.variants || [];

      if (!variants.some((variant) => variant.id === variantId)) {
        throw new Error("Product variant not found.");
      }

      if (variants.length <= 1) {
        throw new Error(
          "A product must have at least one variant. Add another variant before removing this one."
        );
      }

      const updatedVariants = variants.filter(
        (variant) => variant.id !== variantId
      );

      transaction.update(
        productRef,
        getVariantUpdates(normalizeVariants(updatedVariants))
      );
    });
  } catch (error) {
    console.log("DELETE PRODUCT VARIANT ERROR:", error);
    throw error;
  }
};

// Archives a product. Its variants and inventory are retained.
export const archiveProduct = async (
  productId: string
): Promise<void> => {
  try {
    await updateDoc(doc(db, "products", productId), {
      archived: true,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.log("ARCHIVE PRODUCT ERROR:", error);
    throw error;
  }
};

// Restores an archived product.
export const unarchiveProduct = async (
  productId: string
): Promise<void> => {
  try {
    await updateDoc(doc(db, "products", productId), {
      archived: false,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.log("UNARCHIVE PRODUCT ERROR:", error);
    throw error;
  }
};

// Permanently deletes a product document.
export const deleteProduct = async (
  productId: string
): Promise<void> => {
  try {
    await deleteDoc(doc(db, "products", productId));
  } catch (error) {
    console.log("DELETE PRODUCT ERROR:", error);
    throw error;
  }
};

// Stores one review per order + product + variant and updates the product rating.
export const addReview = async (
  review: CreateReviewInput
): Promise<void> => {
  try {
    if (
      !Number.isFinite(review.rating) ||
      review.rating < 1 ||
      review.rating > 5
    ) {
      throw new Error("Rating must be between 1 and 5.");
    }

    // The variant is part of the ID, so two variants of the same product in
    // one order each get their own review document.
    const reviewId = getOrderProductReviewDocumentId(
      review.orderId,
      review.productId,
      review.variantId,
      review.variantName
    );
    const reviewRef = doc(reviewCollection, reviewId);
    const productRef = doc(db, "products", review.productId);

    await runTransaction(db, async (transaction) => {
      const existingReview = await transaction.get(reviewRef);
      const productSnapshot = await transaction.get(productRef);

      if (existingReview.exists()) {
        throw new Error(
          "You have already reviewed this product."
        );
      }

      if (!productSnapshot.exists()) {
        throw new Error("Product not found.");
      }

      const product = productSnapshot.data() as CreateProductInput;

      const previousCount = Math.max(
        0,
        Number(product.totalReviews) || 0
      );

      const previousRating = Math.max(
        0,
        Number(product.rating) || 0
      );

      const totalReviews = previousCount + 1;

      const rating =
        (previousRating * previousCount + review.rating) /
        totalReviews;

      transaction.set(reviewRef, review);

      transaction.update(productRef, {
        rating,
        totalReviews,
        lastReviewId: reviewId,
      });
    });
  } catch (error) {
    console.log("ADD REVIEW ERROR:", error);
    throw error;
  }
};

// Gets the reviews of one product, newest first.
export const getReviewsByProduct = async (
  productId: string
): Promise<ReviewType[]> => {
  try {
    const q = query(
      reviewCollection,
      where("productId", "==", productId)
    );

    const snapshot = await getDocs(q);

    const reviews = snapshot.docs.map((d) => ({
      docId: d.id,
      ...(d.data() as CreateReviewInput),
    }));

    return reviews.sort(
      (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
    );
  } catch (error) {
    console.log("GET PRODUCT REVIEWS ERROR:", error);
    throw error;
  }
};

// Realtime subscription for active products.
export const subscribeToProducts = (
  callback: (products: ProductType[]) => void,
  onError?: (error: Error) => void
) => {
  const q = query(
    productCollection,
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const products = snapshot.docs
        .map((d) => ({
          docId: d.id,
          ...(d.data() as CreateProductInput),
        }))
        .filter((product) => !product.archived);

      callback(products);
    },
    onError ||
      ((error) => {
        console.log("PRODUCT REALTIME ERROR:", error);
      })
  );
};