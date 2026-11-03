// Shopping cart stored per buyer in Firestore.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

import { db } from "../../FirebaseConfig";

import { CartItem } from "../types/cart";

const cartCollection = collection(db, "cart");

// Adds a product variant to the cart, or adds to the quantity of the line that
// already holds the same product and variant.
export const addToCart = async (item: CartItem) => {
  try {
    if (!item.variantId) {
      throw new Error("Please choose a product option.");
    }

    const q = query(
      cartCollection,
      where("buyerId", "==", item.buyerId),
      where("productId", "==", item.productId),
      where("variantId", "==", item.variantId)
    );

    const snap = await getDocs(q);

    const match = snap.docs[0];

    if (match) {
      const data = match.data() as any;
      const existingQty = Number(data.quantity) || 1;

      await updateDoc(doc(db, "cart", match.id), {
        quantity: existingQty + item.quantity,
        // Keep the preview in line with the variant the buyer just saw.
        price: item.price,
        unit: item.unit,
        variantName: item.variantName || data.variantName || "",
      });

      return;
    }

    await addDoc(cartCollection, item);
  } catch (error) {
    console.log(error);
    throw error;
  }
};

// Returns every cart line of a buyer.
export const getCartByBuyer = async (buyerId: string) => {
  try {
    const q = query(cartCollection, where("buyerId", "==", buyerId));
    const snapshot = await getDocs(q);

    const items: any[] = [];
    snapshot.forEach((docSnap) => {
      items.push({
        docId: docSnap.id,
        ...docSnap.data(),
      });
    });

    return items;
  } catch (error) {
    console.log("GET CART ERROR:", error);
    throw error;
  }
};

// Sets the quantity of one cart line.
export const updateCartQuantity = async (docId: string, quantity: number) => {
  try {
    const ref = doc(db, "cart", docId);
    await updateDoc(ref, { quantity });
  } catch (error) {
    console.log("UPDATE CART ERROR:", error);
    throw error;
  }
};

// Removes one cart line.
export const removeCartItem = async (docId: string) => {
  try {
    const ref = doc(db, "cart", docId);
    await deleteDoc(ref);
  } catch (error) {
    console.log("REMOVE CART ERROR:", error);
    throw error;
  }
};

// Removes the cart lines of a product that was deleted.
export const deleteCartItemsByProductId = async (productId: string) => {
  try {
    const farmerId = getAuth().currentUser?.uid;
    if (!farmerId) {
      throw new Error("Your login session has expired. Please login again.");
    }
    const q = query(
      cartCollection,
      where("productId", "==", productId),
      where("farmerId", "==", farmerId)
    );
    const snapshot = await getDocs(q);

    const deletes = snapshot.docs.map((d) => deleteDoc(doc(db, "cart", d.id)));
    await Promise.all(deletes);
  } catch (error) {
    console.log("DELETE CART BY PRODUCT ERROR:", error);
    throw error;
  }
};

// Removes the cart lines of one deleted variant, leaving the other variants of
// the product untouched. Call it after deleteProductVariant succeeds.
export const deleteCartItemsByVariantId = async (
  productId: string,
  variantId: string
) => {
  try {
    const farmerId = getAuth().currentUser?.uid;
    if (!farmerId) {
      throw new Error("Your login session has expired. Please login again.");
    }
    const q = query(
      cartCollection,
      where("productId", "==", productId),
      where("variantId", "==", variantId),
      where("farmerId", "==", farmerId)
    );
    const snapshot = await getDocs(q);

    const deletes = snapshot.docs.map((d) => deleteDoc(doc(db, "cart", d.id)));
    await Promise.all(deletes);
  } catch (error) {
    console.log("DELETE CART BY VARIANT ERROR:", error);
    throw error;
  }
};