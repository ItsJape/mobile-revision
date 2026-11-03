// Order creation, payments, delivery quotes, and status changes. Anything that
// touches money or stock runs on the backend, never here.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  arrayUnion,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { getAuth } from "firebase/auth";
import { db } from "../../FirebaseConfig";

import type { OrderProduct, OrderType } from "../types/order";
import { getOrderProductReviewKey } from "../utils/orderReview";
export { getOrderProductReviewKey } from "../utils/orderReview";

const BACKEND_URL = String(
  process.env.EXPO_PUBLIC_BACKEND_URL || ""
).replace(/\/+$/, "");

const REQUEST_TIMEOUT = 30000;

// Sends a signed-in request to the backend and returns the parsed body. Server
// error codes are kept on the error so callers can map them to a message.
const requestBackend = async <T = any>(
  path: string,
  options: RequestInit = {},
  timeout = REQUEST_TIMEOUT
): Promise<T> => {
  if (!BACKEND_URL) {
    throw new Error("EXPO_PUBLIC_BACKEND_URL is not configured.");
  }

  const user = getAuth().currentUser;

  if (!user) {
    throw new Error("Your login session has expired. Please login again.");
  }

  const token = await user.getIdToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const text = await response.text();
    let data: any = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const err: any = new Error(
        data?.error ||
          data?.message ||
          `Backend request failed with status ${response.status}.`
      );
      if (data?.code) err.code = data.code;
      err.status = response.status;
      throw err;
    }

    return data as T;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("The server took too long to respond. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

// Asks the backend for the live Xendit status of this order's GCash payment and
// fulfills the order when Xendit says SUCCEEDED.
export const syncOrderPayment = async (
  orderId: string
): Promise<{
  success: boolean;
  orderId: string;
  paymentStatus: string;
  xenditStatus?: string;
  alreadyPaid?: boolean;
  alreadyFulfilled?: boolean;
  message?: string;
}> =>
  requestBackend(
    `/payment-sync/${encodeURIComponent(orderId)}`,
    { method: "POST" }
  );

// Places a new order through the backend. The backend recomputes the delivery
// fee and all trusted financial values.
export const createOrder = async (order: OrderType) => {
  const data = await requestBackend<{
    success: boolean;
    orderId: string;
    orderNumber: string;
    deliveryFee: number | null;
    distanceKm: number | null;
    adjustedDistanceKm: number | null;
    deliveryTier: string | null;
    feeStatus: "ok" | null;
    total: number;
  }>("/orders", {
    method: "POST",
    body: JSON.stringify({
      farmerId: order.farmerId,
      farmName: order.farmName,
      buyerName: order.buyerName,
      products: order.products,
      address: order.address,
      delivery: order.delivery,
      payment: order.payment,
      pickupDate: order.pickupDate ?? null,
      pickupTime: order.pickupTime ?? null,
      subTotal: order.subTotal,
    }),
  });

  return {
    id: data.orderId,
    orderNumber: data.orderNumber,
    deliveryFee: data.deliveryFee,
    distanceKm: data.distanceKm,
    adjustedDistanceKm: data.adjustedDistanceKm,
    deliveryTier: data.deliveryTier,
    feeStatus: data.feeStatus,
    total: data.total,
  };
};

// Replaces the products of an order. Only allowed while still pending.
export const updateOrderProducts = async (
  orderId: string,
  buyerId: string,
  products: OrderProduct[]
) => {
  try {
    const ref = doc(db, "orders", orderId);
    const snap = await getDoc(ref);

    if (!snap.exists()) throw new Error("Order not found.");

    const order = snap.data() as OrderType;
    if (order.buyerId !== buyerId) {
      throw new Error("You are not authorized to update this order.");
    }
    if (order.status !== "pending") {
      throw new Error("Products can only be changed while the order is pending.");
    }

    await updateDoc(ref, {
      products,
      updatedAt: serverTimestamp(),
    });

    return true;
  } catch (error) {
    console.log("ERROR UPDATING ORDER PRODUCTS:", error);
    throw error;
  }
};

// Starts the GCash payment of an order the farmer has already accepted.
export const createGcashPayment = async (
  orderId: string,
  buyerId: string
) => {
  try {
    const snap = await getDoc(doc(db, "orders", orderId));
    if (!snap.exists()) throw new Error("Order not found.");

    const order = snap.data() as OrderType;
    if (order.buyerId !== buyerId) {
      throw new Error("You are not authorized to pay for this order.");
    }
    if (order.payment !== "gcash") {
      throw new Error("This order is not a GCash order.");
    }
    if (order.status !== "accepted") {
      throw new Error("The farmer must accept the order before GCash payment.");
    }
    if (order.paymentStatus === "paid") {
      return {
        success: true,
        alreadyPaid: true,
        orderId,
        paymentStatus: "paid",
      };
    }

    return await requestBackend(
      "/create-payment",
      {
        method: "POST",
        body: JSON.stringify({ orderId }),
      },
      60000
    );
  } catch (error) {
    console.log("ERROR CREATING GCASH PAYMENT:", error);
    throw error;
  }
};

// Reads the stored payment status of an order the buyer owns.
export const getOrderPaymentStatus = async (
  orderId: string,
  buyerId: string
) => {
  try {
    const snap = await getDoc(doc(db, "orders", orderId));
    if (!snap.exists()) throw new Error("Order not found.");

    const order = snap.data() as OrderType;
    if (order.buyerId !== buyerId) {
      throw new Error("You are not authorized to view this payment status.");
    }

    return order.paymentStatus || "pending";
  } catch (error) {
    console.log("ERROR GETTING PAYMENT STATUS:", error);
    throw error;
  }
};

// Reads one order by its document id.
export const getOrderById = async (id: string) => {
  try {
    const snap = await getDoc(doc(db, "orders", id));
    if (!snap.exists()) throw new Error("Order not found.");

    return {
      id: snap.id,
      ...snap.data(),
    } as OrderType;
  } catch (error) {
    console.log("ERROR GETTING ORDER:", error);
    throw error;
  }
};

// Normalizes Firestore timestamp shapes to milliseconds.
const toMillis = (ts: any) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  if (typeof ts === "number") return ts;
  if (typeof ts === "string") {
    const parsed = new Date(ts).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

// Returns buyer orders, newest first.
export const getBuyerOrders = async (buyerId: string) => {
  try {
    const q = query(collection(db, "orders"), where("buyerId", "==", buyerId));
    const snapshot = await getDocs(q);
    const orders = snapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() } as OrderType)
    );
    return orders.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    console.log("ERROR GETTING BUYER ORDERS:", error);
    throw error;
  }
};

// Returns farmer orders, newest first.
export const getFarmerOrders = async (farmerId: string) => {
  try {
    const q = query(collection(db, "orders"), where("farmerId", "==", farmerId));
    const snapshot = await getDocs(q);
    const orders = snapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() } as OrderType)
    );
    return orders.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    console.log("ERROR GETTING FARMER ORDERS:", error);
    throw error;
  }
};

// Marks only the exact product variant in an order as reviewed.
export const markProductReviewed = async (
  orderId: string,
  productId: string,
  variantId?: string,
  variantName?: string
) => {
  try {
    const ref = doc(db, "orders", orderId);
    const snap = await getDoc(ref);

    if (!snap.exists()) throw new Error("Order not found.");

    const order = snap.data() as OrderType;
    if (order.status !== "delivered" && order.status !== "claimed") {
      throw new Error("Only completed orders can be reviewed.");
    }

    const reviewKey = getOrderProductReviewKey(
      productId,
      variantId,
      variantName
    );

    // Check that the exact product/variant is part of this order.
    const matchingItem = (order.products || []).some((item) => {
      const itemKey = getOrderProductReviewKey(
        item.productId,
        item.variantId,
        item.variantName
      );
      return itemKey === reviewKey;
    });

    if (!matchingItem) {
      throw new Error("This product variant is not part of the selected order.");
    }

    await updateDoc(ref, {
      reviewedProductIds: arrayUnion(reviewKey),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.log("ERROR MARKING PRODUCT VARIANT REVIEW:", error);
    throw error;
  }
};

// Cancels an order on behalf of the buyer.
export const cancelOrder = async (
  orderId: string,
  buyerId: string,
  reason: string
) => {
  try {
    const snap = await getDoc(doc(db, "orders", orderId));
    if (!snap.exists()) throw new Error("Order not found.");

    const order = snap.data() as OrderType;
    if (order.buyerId !== buyerId) {
      throw new Error("You are not authorized to cancel this order.");
    }
    if (order.payment === "gcash" && order.paymentStatus === "paid") {
      throw new Error(
        "This GCash order has already been paid and cannot be cancelled here because a refund is required."
      );
    }

    await requestBackend(
      `/wallet/orders/${encodeURIComponent(orderId)}/cancel`,
      {
        method: "POST",
        body: JSON.stringify({ reason: reason?.trim() || "Cancelled by buyer." }),
      }
    );
    return true;
  } catch (error) {
    console.log("ERROR CANCELLING ORDER:", error);
    throw error;
  }
};

// Accepts an order on behalf of the farmer.
export const acceptOrder = async (orderId: string, farmerId: string) => {
  try {
    const snap = await getDoc(doc(db, "orders", orderId));
    if (!snap.exists()) throw new Error("Order not found.");

    const order = snap.data() as OrderType;
    if (order.farmerId !== farmerId) {
      throw new Error("You are not authorized to accept this order.");
    }
    if (order.status !== "pending") {
      throw new Error("Only pending orders can be accepted.");
    }

    await requestBackend(
      `/wallet/orders/${encodeURIComponent(orderId)}/accept`,
      { method: "POST", body: JSON.stringify({}) }
    );
    return true;
  } catch (error) {
    console.log("ERROR ACCEPTING ORDER:", error);
    throw error;
  }
};

// Cancels an order the farmer already accepted.
export const cancelAcceptedOrderByFarmer = async (
  orderId: string,
  farmerId: string,
  reason: string
) => {
  try {
    const snap = await getDoc(doc(db, "orders", orderId));
    if (!snap.exists()) throw new Error("Order not found.");

    const order = snap.data() as OrderType;
    if (order.farmerId !== farmerId) {
      throw new Error("You are not authorized to cancel this order.");
    }
    if (order.status !== "accepted") {
      throw new Error("Only accepted orders can be cancelled here.");
    }

    await requestBackend(
      `/wallet/orders/${encodeURIComponent(orderId)}/cancel`,
      {
        method: "POST",
        body: JSON.stringify({ reason: reason?.trim() || "Cancelled by farmer." }),
      }
    );
    return true;
  } catch (error) {
    console.log("ERROR CANCELLING ACCEPTED ORDER BY FARMER:", error);
    throw error;
  }
};

// Declines a pending order. The backend protects paid orders.
export const declineOrder = async (
  orderId: string,
  farmerId: string,
  reason: string
) => {
  try {
    const snap = await getDoc(doc(db, "orders", orderId));
    if (!snap.exists()) throw new Error("Order not found.");

    const order = snap.data() as OrderType;
    if (order.farmerId !== farmerId) {
      throw new Error("You are not authorized to decline this order.");
    }
    if (order.status !== "pending") {
      throw new Error("Only pending orders can be declined.");
    }

    await requestBackend(
      `/wallet/orders/${encodeURIComponent(orderId)}/decline`,
      {
        method: "POST",
        body: JSON.stringify({ reason: reason?.trim() || "Declined by farmer." }),
      }
    );
    return true;
  } catch (error) {
    console.log("ERROR DECLINING ORDER:", error);
    throw error;
  }
};

// City, barangay, and province of the delivery destination.
export type BuyerLocation = {
  city: string;
  barangay: string;
  province?: string;
};

export type QuoteBatchItem = {
  key: string;
  farmerId: string;
  success: boolean;
  deliveryFee?: number | null;
  distanceKm?: number | null;
  adjustedDistanceKm?: number | null;
  tier?: string | null;
  feeStatus?: "ok" | null;
  roadFactor?: number | null;
  tierVersion?: string | null;
  method?: string | null;
  code?: string;
  error?: string;
};

// Quotes every farm in the cart in a single call.
export const quoteDeliveries = async (
  items: { farmerId: string; key?: string }[],
  buyer: BuyerLocation | null,
  delivery: "pickup" | "delivery" = "delivery"
): Promise<QuoteBatchItem[]> => {
  if (delivery !== "delivery" || items.length === 0) return [];

  const data = await requestBackend<{
    success: boolean;
    quotes: QuoteBatchItem[];
  }>("/delivery/quote", {
    method: "POST",
    body: JSON.stringify({
      items,
      buyerCity: buyer?.city || "",
      buyerBarangay: buyer?.barangay || "",
      buyerProvince: buyer?.province || "",
      delivery,
    }),
  });

  return Array.isArray(data?.quotes) ? data.quotes : [];
};

// Quotes the delivery fee for a single farm.
export const quoteDelivery = async (
  farmerId: string,
  buyer: BuyerLocation | null,
  delivery: "pickup" | "delivery" = "delivery"
): Promise<{
  deliveryFee: number;
  distanceKm: number | null;
  tier: string | null;
}> => {
  if (delivery !== "delivery") {
    return { deliveryFee: 0, distanceKm: 0, tier: null };
  }

  return await requestBackend("/delivery/quote", {
    method: "POST",
    body: JSON.stringify({
      farmerId,
      buyerCity: buyer?.city || "",
      buyerBarangay: buyer?.barangay || "",
      buyerProvince: buyer?.province || "",
      delivery,
    }),
  });
};

// Moves an order to the next status through the trusted backend.
export const updateOrderStatus = async (
  orderId: string,
  farmerId: string,
  status: "accepted" | "processing" | "to_receive" | "delivered" | "claimed"
) => {
  try {
    const encodedId = encodeURIComponent(orderId);

    if (status === "accepted") return await acceptOrder(orderId, farmerId);

    if (status === "processing") {
      await requestBackend(`/orders/${encodedId}/process`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      return true;
    }

    if (status === "to_receive") {
      await requestBackend(`/orders/${encodedId}/to-receive`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      return true;
    }

    if (status === "delivered" || status === "claimed") {
      return await requestBackend(`/wallet/orders/${encodedId}/deliver`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    }

    throw new Error("Invalid order status.");
  } catch (error) {
    console.log("ERROR UPDATING ORDER STATUS:", error);
    throw error;
  }
};
