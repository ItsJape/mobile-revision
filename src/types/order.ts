
// One order item represents one selected product variant.
export type OrderProduct = {
  productId: string;
  variantId: string;
  variantName: string;

  name: string;
  image: string;

  price: number;
  quantity: number;
  unit: string;

  reviewed?: boolean;
};

export type OrderAddress = {
  id?: string;
  fullName: string;
  street: string;
  barangay: string;
  city: string;
  province: string;
  phone: string;

  lat?: number | null;
  lng?: number | null;
};

export type OrderStatus =
  | "pending"
  | "accepted"
  | "processing"
  | "to_receive"
  | "delivered"
  | "claimed"
  | "cancelled";

export type PaymentMethod = "gcash" | "cod";

export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled";

export type FulfillmentStatus =
  | "pending"
  | "fulfilled"
  | "stock_unavailable"
  | "manual_review";

export type CommissionStatus =
  | "pending"
  | "charged"
  | "not_applicable";

export type CodCommissionReservationStatus =
  | "not_applicable"
  | "reserved"
  | "consumed"
  | "released";

export type OrderType = {
  id?: string;
  orderNumber?: string;

  buyerId: string;
  buyerName: string;

  farmerId: string;
  farmName: string;

  products: OrderProduct[];

  delivery: "pickup" | "delivery";
  payment: PaymentMethod;

  address: OrderAddress | null;

  pickupDate?: string | null;
  pickupTime?: string | null;

  subTotal: number;
  deliveryFee: number;

  distanceKm?: number | null;
  adjustedDistanceKm?: number | null;
  deliveryTier?: string | null;
  feeStatus?: "ok" | null;
  roadFactor?: number | null;
  tierVersion?: string | null;
  deliveryMethod?: string | null;

  total: number;
  status: OrderStatus;

  farmerDecision?: "accepted" | "rejected";
  farmerDecisionAt?: any;
  rejectionReason?: string;

  createdAt?: any;
  processingAt?: any;
  toReceiveAt?: any;
  deliveredAt?: any;
  cancelledAt?: any;
  paidAt?: any;
  updatedAt?: any;

  cancelledBy?: "buyer" | "farmer" | "system";
  cancelReason?: string;

  autoCancelled?: boolean;
  autoCancellationMessage?: string;
  autoCancelledAt?: any;

  commissionRate?: number;
  commissionAmount?: number;
  commissionStatus?: CommissionStatus;
  commissionChargedAt?: any;

  farmerEarning?: number;
  farmerWalletCredited?: boolean;
  farmerWalletCreditedAt?: any;

  farmerWalletPendingCredited?: boolean;
  farmerWalletPendingCreditedAt?: any;

  financialStatus?: "pending" | "settled" | "refunded" | "manual_review";

  reviewedProductIds?: string[];

  codCommissionReserved?: number;
  codCommissionReservationStatus?: CodCommissionReservationStatus;

  paymentStatus?: PaymentStatus;

  xenditPaymentRequestId?: string;
  xenditPaymentId?: string;
  xenditReferenceId?: string;
  xenditPaymentChannel?: string;
  xenditPaymentStatus?: string;

  paymentFailureCode?: string;
  paymentFailureReason?: string;
  paymentRequestCreatedAt?: any;

  inventoryFulfilled?: boolean;
  fulfillmentStatus?: FulfillmentStatus;
  fulfillmentError?: string;

  serverValidated?: boolean;
  serverValidatedAt?: any;

  xenditWebhookEvent?: string;
  xenditWebhookReceivedAt?: any;
};
