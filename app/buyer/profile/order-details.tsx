// One buyer order in detail, with cancel, payment, and rating actions.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, } from "expo-router";
import React, { useEffect, useRef, useState, } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, getDoc, onSnapshot, } from "firebase/firestore";
import { db } from "../../../FirebaseConfig";
import RateOrderModal from "./RateOrderModal";
import { cancelOrder, createGcashPayment, syncOrderPayment, } from "../../../src/services/orderService";
import { useToast } from "@/src/context/ToastContext";
import { getUserFriendlyErrorMessage } from "@/src/utils/userFacingError";
import { getFarmerScreenBottomPadding } from "@/src/constants/farmerLayout";
import { getOrderProductReviewKey } from "@/src/utils/orderReview";
import { OrderType, OrderProduct, } from "@/src/types/order";

// The dark green used across the app.
const DARK_GREEN = "#14532d";

// Reasons the buyer can pick when cancelling an order.
const buyerCancelReasons = [
  "Changed my mind",
  "Ordered by mistake",
  "Found another seller",
  "Unable to receive the order",
  "Other",
];

export default function OrderDetails() {

  const router =
    useRouter();
  const insets = useSafeAreaInsets();

  const { orderId } =
    useLocalSearchParams();

  const [order, setOrder] =
    useState<OrderType | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [buyerId, setBuyerId] =
    useState("");

  const [buyerName, setBuyerName] =
    useState("");

  const [buyerProfileImage, setBuyerProfileImage] =
    useState("");
  
  const { showToast } = useToast();
  
  // Rating popup state, which product is being rated.
  const [showRateModal, setShowRateModal] =
    useState(false);

  const [selectedProduct, setSelectedProduct] =
    useState<OrderProduct | null>(
      null
    );

  // Cancellation popup state.
  const [showCancelModal, setShowCancelModal] =
    useState(false);

  const [selectedCancelReason, setSelectedCancelReason] =
    useState("");

  const [customCancelReason, setCustomCancelReason] =
    useState("");

  const [cancelling, setCancelling] =
    useState(false);

  const [paying, setPaying] =
    useState(false);

  // True once the Xendit browser has been opened. It triggers a payment sync
  // when the buyer comes back, in case the webhook never arrived.
  const paymentOpenedRef =
    useRef(false);

  const appState =
    useRef(AppState.currentState);

  const [showConfirmCancelModal, setShowConfirmCancelModal] =
  useState(false);

  const [pendingCancelReason, setPendingCancelReason] =
    useState("");
  
  const formatDateTime =
    (timestamp: any) => {

      if (!timestamp) {
        return "Date unavailable";
      }

      try {

        let date: Date;

        if (
          typeof timestamp?.toDate ===
          "function"
        ) {

          date =
            timestamp.toDate();

        } else if (
          typeof timestamp?.seconds ===
          "number"
        ) {

          date = new Date(
            timestamp.seconds *
              1000
          );

        } else {

          date =
            new Date(timestamp);
        }

        if (
          isNaN(
            date.getTime()
          )
        ) {

          return "Date unavailable";
        }

        return date.toLocaleString(
          "en-PH",
          {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }
        );

      } catch {

        return "Date unavailable";
      }
    };

  const fetchOrder =
    async () => {

      try {

        if (!orderId) {
          return;
        }

        const orderDoc =
          await getDoc(
            doc(
              db,
              "orders",
              orderId as string
            )
          );

        if (
          orderDoc.exists()
        ) {

          setOrder({
            id:
              orderDoc.id,
            ...orderDoc.data(),
          } as OrderType);

        }

      } catch (error) {

        getUserFriendlyErrorMessage(error, "Load buyer order details");

      } finally {

        setLoading(false);

      }
    };

  useEffect(() => {
    if (!orderId) return;

    const unsubscribe = onSnapshot(
      doc(db, "orders", orderId as string),
      (orderDoc) => {
        if (orderDoc.exists()) {
          setOrder({
            id: orderDoc.id,
            ...orderDoc.data(),
          } as OrderType);
        }
        setLoading(false);
      },
      (error) => {
        getUserFriendlyErrorMessage(error, "Listen to buyer order updates");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [orderId]);

  // When the buyer returns from the Xendit browser, the backend is asked for the
  // live payment status. This repairs orders stuck on "pending" because the
  // payment.capture webhook never arrived. The onSnapshot above picks up any
  // change on its own.
  useEffect(() => {
    const subscription =
      AppState.addEventListener(
        "change",
        (nextState) => {
          const wasBackground =
            appState.current === "background" ||
            appState.current === "inactive";

          appState.current =
            nextState;

          if (
            !wasBackground ||
            nextState !== "active" ||
            !paymentOpenedRef.current ||
            !orderId
          ) {
            return;
          }

          paymentOpenedRef.current =
            false;

          syncOrderPayment(orderId as string)
            .then((result) => {
              if (
                result?.paymentStatus === "paid"
              ) {
                showToast(
                  "GCash payment confirmed."
                );
              }
            })
            .catch((error) => {
              getUserFriendlyErrorMessage(error, "Refresh buyer order payment status");
            });
        }
      );

    return () => {
      subscription.remove();
    };
  }, [orderId, showToast]);

  // Reads the stored buyer so the review can be linked to them.
  useEffect(() => {

    const loadBuyer =
      async () => {

        try {

          const userStr =
            await AsyncStorage.getItem(
              "user"
            );

          if (!userStr) {
            return;
          }

          const user =
            JSON.parse(
              userStr
            );

          const currentBuyerId =
            user.uid ||
            user.userId ||
            user.id ||
            "";

          setBuyerId(currentBuyerId);

          setBuyerName(
            user.fullName ||
              user.name ||
              ""
          );

          const storedProfileImage =
            user.profileImage ||
            "";

          if (storedProfileImage || !currentBuyerId) {
            setBuyerProfileImage(storedProfileImage);
            return;
          }

          const buyerDoc = await getDoc(
            doc(db, "users", currentBuyerId)
          );

          setBuyerProfileImage(
            buyerDoc.exists()
              ? buyerDoc.data().profileImage || ""
              : ""
          );

        } catch (error) {

          getUserFriendlyErrorMessage(error, "Load buyer order profile");

        }
      };

    loadBuyer();

  }, []);

  // The color that matches each order status.
  const getStatusColor = (
    status: string
  ) => {

    switch (status) {

      case "pending":
        return "#D97706";

      case "accepted":
        return "#2563EB";

      case "processing":
        return DARK_GREEN;

      case "to_receive":
        return "#7C3AED";

      case "delivered":
      case "claimed":
        return "#2563EB";

      case "cancelled":
        return "#6B7280";

      default:
        return "#374151";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Pending";
      case "accepted": return "Accepted";
      case "processing": return "Processing";
      case "to_receive": return "To Receive";
      case "delivered": return "Delivered";
      case "claimed": return "Claimed";
      case "cancelled": return "Cancelled";
      default: return status;
    }
  };

  const openRateModal =
    (product: OrderProduct) => {

      setSelectedProduct(
        product
      );

      setShowRateModal(
        true
      );
    };

  // Runs after a review was saved. Receives the composite key of the exact
  // product variant that was reviewed, so only that variant is marked.
  const handleReviewSubmitted =
    (reviewKey: string) => {

      setOrder(
        (prev) => {

          if (!prev) {
            return prev;
          }

          const ids =
            prev.reviewedProductIds || [];

          if (ids.includes(reviewKey)) {
            return prev;
          }

          return {
            ...prev,
            reviewedProductIds: [
              ...ids,
              reviewKey,
            ],
          };
        }
      );

      setShowRateModal(
        false
      );

      setSelectedProduct(
        null
      );
    };

  const openCancelModal =
    () => {

      setSelectedCancelReason(
        ""
      );

      setCustomCancelReason(
        ""
      );

      setShowCancelModal(
        true
      );
    };

    // Moves from the reason step to the confirmation step.
   const continueCancel = () => {
      if (!selectedCancelReason) {
        showToast("Please select a reason for cancelling the order.");
        return;
      }

      if (
        selectedCancelReason === "Other" &&
        !customCancelReason.trim()
      ) {
        showToast("Please enter your cancellation reason.");
        return;
      }

      const finalReason =
        selectedCancelReason === "Other"
          ? customCancelReason.trim()
          : selectedCancelReason;

      // The reason is kept for the confirmation step.
      setPendingCancelReason(finalReason);
      setShowCancelModal(false);
      setShowConfirmCancelModal(true);
  };

  // Cancels the order for real.
  const confirmCancel = async (reason: string) => {
    try {
      if (!order?.id) {
        showToast("Order not found.");
        return;
      }

      if (!buyerId) {
        showToast("Buyer not found.");
        return;
      }

      setCancelling(true);

      await cancelOrder(
        order.id,
        buyerId,
        reason
      );

      setShowConfirmCancelModal(false);
      setShowCancelModal(false);

      setSelectedCancelReason("");
      setCustomCancelReason("");
      setPendingCancelReason("");

      await fetchOrder();

      showToast("Order cancelled successfully.");

    } catch (error: any) {
      showToast(
        getUserFriendlyErrorMessage(
          error,
          "Cancel buyer order",
          "We couldn't cancel your order right now. Please try again in a moment."
        )
      );

    } finally {
      setCancelling(false);
    }
  };
  
  // Starts the GCash payment and opens the Xendit checkout page.
  const handlePayGcash =
    async () => {
      try {
        if (!order?.id) {
          return;
        }

        if (!buyerId) {
          showToast(
            "Buyer not found."
          );
          return;
        }

        if (
          order.status !==
          "accepted"
        ) {
          showToast(
            "The farmer must accept the order first."
          );
          return;
        }

        setPaying(true);

        const response =
          await createGcashPayment(
            order.id,
            buyerId
          );

        if (
          response.alreadyPaid ||
          response.paymentStatus ===
            "paid"
        ) {
          showToast(
            "This order is already paid."
          );
          await fetchOrder();
          return;
        }

        if (
          !response?.redirectUrl
        ) {
          throw new Error(
            "Xendit did not return a payment URL."
          );
        }

        await Linking.openURL(
          response.redirectUrl
        );

        paymentOpenedRef.current =
          true;

        showToast(
          "Complete your GCash payment. Return to FarmGate after payment."
        );
      } catch (error: any) {
        showToast(
          getUserFriendlyErrorMessage(
            error,
            "Start GCash payment",
            "We couldn't start your GCash payment right now. Please try again in a moment."
          )
        );
      } finally {
        setPaying(false);
      }
    };

  if (loading) {

    return (
      <View className="flex-1 justify-center items-center bg-white">

        <ActivityIndicator
          size="large"
          color={DARK_GREEN}
        />

        <Text className="text-green-900 mt-3 font-semibold text-sm">
          Loading order...
        </Text>

      </View>
    );
  }

  if (!order) {

    return (
      <View className="flex-1 justify-center items-center bg-white">

        <Ionicons
          name="alert-circle-outline"
          size={60}
          color="#9CA3AF"
        />

        <Text className="text-gray-600 mt-3">
          Order not found
        </Text>

      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: "#fafafa" }}>

      <View className="bg-green-900 pt-14 pb-4 px-5 rounded-b-2xl flex-row items-center">

        <TouchableOpacity
          onPress={() =>
            router.back()
          }
        >

          <Ionicons
            name="arrow-back"
            size={24}
            color="white"
          />

        </TouchableOpacity>

        <View className="ml-4 flex-1">

          <Text className="text-white font-bold text-lg">
            Order Details
          </Text>

          <Text className="text-green-100 text-xs mt-0.5">
            {order.orderNumber ||
              `Order #${order.id}`}
          </Text>

        </View>

      </View>

      <ScrollView
        className="px-4"
        showsVerticalScrollIndicator={
          false
        }
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: getFarmerScreenBottomPadding(insets.bottom),
        }}
      >

        <View className="bg-white rounded-[5px] p-4 mb-4">

          <Text className="text-gray-500 text-xs">
            FarmGate Order ID
          </Text>

          <Text className="text-green-900 font-black text-lg mt-1">
            {order.orderNumber ||
              `FG-${order.id}`}
          </Text>

          <View className="h-px bg-gray-100 my-4" />

          <View className="flex-row items-center justify-between mb-4">

            <View>

              <Text className="text-gray-500 text-xs mb-1">
                Status
              </Text>

              <Text
                style={{
                  color:
                    getStatusColor(
                      order.status
                    ),
                }}
                className="font-bold text-base"
              >
                {getStatusLabel(order.status)}
              </Text>

            </View>

            <View className="items-end">

              <Text className="text-gray-500 text-xs mb-1">
                Fulfillment
              </Text>

              <Text className="font-bold text-gray-900 text-base capitalize">
                {order.delivery ||
                  "N/A"}
              </Text>

            </View>

          </View>

          {/* Shown inside the first section when the order was cancelled. */}
          {order.status ===
            "cancelled" && (

            <View className="bg-red-50 border border-red-100 p-3 rounded-[5px] mb-4">

              <Text className="text-gray-500 text-xs">
                Cancelled By
              </Text>

              <Text className="font-bold text-gray-900 capitalize text-sm mb-2">
                {order.cancelledBy ||
                  "Unknown"}
              </Text>

              <Text className="text-gray-500 text-xs">
                Reason
              </Text>

              <Text className="font-semibold text-gray-900 text-sm mb-2">
                {order.cancelReason ||
                  "No reason provided"}
              </Text>

              {order.autoCancelled && (
                <Text className="mb-3 rounded-md bg-white px-3 py-2 text-sm text-gray-700">
                  {order.autoCancellationMessage ||
                    "This order was automatically cancelled because the farmer did not accept it within 2 days."}
                </Text>
              )}

              <Text className="text-gray-500 text-xs">
                Cancelled Date
              </Text>

              <Text className="font-semibold text-gray-900 text-sm">
                {formatDateTime(
                  order.cancelledAt
                )}
              </Text>

            </View>
          )}

          <View className="h-px bg-gray-100 mb-4" />

          <Text className="text-sm font-bold text-gray-900 mb-3">
            Order Timeline
          </Text>

          <TimelineRow
            icon="cart-outline"
            title="Order Placed"
            date={order.createdAt}
            color={DARK_GREEN}
            showLine={!!order.farmerDecisionAt || !!order.cancelledAt}
          />

          {order.farmerDecision === "accepted" && order.farmerDecisionAt && (
            <TimelineRow
              icon="checkmark-circle-outline"
              title="Accepted by Farmer"
              date={order.farmerDecisionAt}
              color="#2563EB"
              showLine={!!order.processingAt || !!order.toReceiveAt || !!order.deliveredAt}
            />
          )}

          {order.processingAt && (
            <TimelineRow
              icon="bicycle-outline"
              title="Processing"
              date={order.processingAt}
              color={DARK_GREEN}
              showLine={!!order.toReceiveAt || !!order.deliveredAt}
            />
          )}

          {order.toReceiveAt && (
            <TimelineRow
              icon="bag-check-outline"
              title="To Receive"
              date={order.toReceiveAt}
              color="#7C3AED"
              showLine={!!order.deliveredAt}
            />
          )}

          {order.deliveredAt && (
            <TimelineRow
              icon="checkmark-circle-outline"
              title={order.delivery === "pickup" ? "Claimed" : "Delivered"}
              date={order.deliveredAt}
              color="#2563EB"
              showLine={false}
            />
          )}

          {order.cancelledAt && (
            <TimelineRow
              icon="close-circle-outline"
              title="Cancelled"
              date={order.cancelledAt}
              color="#DC2626"
              showLine={false}
            />
          )}

          {(order.status === "delivered" || order.status === "claimed") && (
            <View className="bg-green-50 border border-green-100 rounded-[5px] p-3 mt-4 flex-row items-center">
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={DARK_GREEN}
              />
              <Text className="text-green-900 font-semibold text-sm ml-2">
                {order.status === "claimed"
                  ? "Your order has been claimed."
                  : "Your order has been delivered."}
              </Text>
            </View>
          )}

        </View>

        <View className="bg-white rounded-[5px] p-4 mb-4">

          <Text className="text-gray-500 text-sm mb-1">
            Farm
          </Text>

          <Text className="text-xl font-bold text-green-900 mb-4">
            {order.farmName ||
              "Farm"}
          </Text>

          <View className="h-px bg-gray-100 mb-4" />

          <Text className="text-base font-bold text-gray-900 mb-4">
            Items Ordered
          </Text>

          <FlatList
            data={
              order.products ||
              []
            }
            scrollEnabled={
              false
            }
            keyExtractor={(
              item,
              index
            ) =>
              `${item.productId || "product"}-${item.variantId || ""}-${index}`
            }
            renderItem={({
              item,
            }) => {

              const isCompleted =
                order.status === "delivered" ||
                order.status === "claimed";

              // Each product variant has its own review key.
              const reviewKey =
                getOrderProductReviewKey(
                  item.productId,
                  item.variantId,
                  item.variantName
                );

              // The plain productId check keeps older orders working,
              // because older reviews were saved by product only.
              const isReviewed =
                !!order.reviewedProductIds?.includes(reviewKey) ||
                !!order.reviewedProductIds?.includes(item.productId);

              const canRate =
                isCompleted && !isReviewed;

              return (
                <View className="mb-5">

                  <View className="flex-row items-center">

                    {item.image ? (

                      <Image
                        source={{
                          uri: item.image,
                        }}
                        className="w-16 h-16 rounded-lg mr-3"
                      />

                    ) : (

                      <View className="w-16 h-16 rounded-lg bg-green-100 justify-center items-center mr-3">

                        <Ionicons
                          name="leaf"
                          size={24}
                          color={DARK_GREEN}
                        />

                      </View>
                    )}

                    <View className="flex-1">

                      <Text className="font-semibold text-sm text-gray-900" numberOfLines={1}>
                        {item.name}
                      </Text>

                      {item.variantName ? (
                        <Text className="text-green-900 text-xs font-semibold mt-0.5">
                          {item.variantName}
                        </Text>
                      ) : null}

                      <Text className="text-gray-500 text-xs mt-1">
                        Qty:{" "}
                        {item.quantity}
                      </Text>

                    </View>

                    <Text className="font-bold text-green-900">
                      ₱
                      {Number(
                        item.price
                      ).toFixed(2)}
                    </Text>

                  </View>

                  {canRate && (

                    <TouchableOpacity
                      onPress={() =>
                        openRateModal(
                          item
                        )
                      }
                      activeOpacity={
                        0.8
                      }
                      className="mt-3 self-start bg-amber-100 border border-amber-200 px-4 py-2.5 rounded-[5px] flex-row items-center"
                    >

                      <Text className="text-amber-700 font-semibold text-xs ml-1">
                        Rate Now 
                      </Text>

                    </TouchableOpacity>
                  )}

                  {isCompleted && isReviewed && (

                    <View className="mt-3 self-start py-2.5 flex-row items-center">

                      <Ionicons
                        name="checkmark-circle"
                        size={15}
                        color={DARK_GREEN}
                      />

                      <Text className="text-green-900 font-semibold text-xs ml-1">
                        Reviewed
                      </Text>

                    </View>
                  )}

                </View>
              );
            }}
          />

        </View>

        <View className="bg-white rounded-[5px] p-4 mb-5">

          <Text className="text-base font-bold text-gray-900 mb-3">
            Payment Method
          </Text>

          <View className="flex-row items-center mb-4">

            <Ionicons
              name={
                order.payment ===
                "gcash"
                  ? "qr-code-outline"
                  : "cash-outline"
              }
              size={20}
              color={DARK_GREEN}
            />

            <Text className="ml-2 font-semibold text-gray-900 text-sm">
              {order.payment ===
              "gcash"
                ? "GCash"
                : "Cash on Delivery"}
            </Text>

          </View>

          <View className="h-px bg-gray-100 mb-4" />

          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-gray-500 text-sm">
              Payment Status
            </Text>

            <Text
              className={`font-bold text-sm ${
                order.paymentStatus === "paid"
                  ? "text-green-700"
                  : order.paymentStatus === "failed"
                  ? "text-red-600"
                  : "text-amber-600"
              }`}
            >
              {(order.paymentStatus || "pending").toUpperCase()}
            </Text>
          </View>

          <Text className="text-gray-500 text-sm mb-1">
            Breakdown
          </Text>

          <View className="flex-row justify-between mb-1">
            <Text className="text-gray-600 text-sm">Subtotal</Text>
            <Text className="text-gray-800 text-sm font-semibold">
              ₱{Number(order.subTotal ?? 0).toFixed(2)}
            </Text>
          </View>

          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-600 text-sm">
              Delivery fee
            </Text>
            <Text className="text-gray-800 text-sm font-semibold">
              ₱{Number(order.deliveryFee || 0).toFixed(2)}
            </Text>
          </View>

          <Text className="text-gray-500 text-sm mb-1">
            Total Amount
          </Text>

          <Text className="text-3xl font-black text-green-900">
            ₱
            {Number(
              order.total
            ).toFixed(2)}
          </Text>

        </View>

        {order.status === "accepted" &&
          order.payment === "gcash" &&
          order.paymentStatus !== "paid" && (
            <TouchableOpacity
              onPress={handlePayGcash}
              disabled={paying}
              activeOpacity={0.8}
              className="bg-green-700 py-4 rounded-[5px] mb-3"
            >
              {paying ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white text-center font-bold">
                  Pay with GCash
                </Text>
              )}
            </TouchableOpacity>
          )}

        {order.status === "accepted" &&
          order.payment === "gcash" &&
          order.paymentStatus === "paid" && (
            <View className="bg-green-50 border border-green-100 rounded-[5px] p-3 mb-3">
              <Text className="text-green-800 text-center font-semibold text-sm">
                GCash payment confirmed. The farmer can now process your order.
              </Text>
            </View>
          )}

        {order.status === "cancelled" &&
          order.farmerDecision === "rejected" && (
            <View className="bg-red-50 border border-red-100 rounded-[5px] p-3 mb-3">
              <Text className="text-red-700 font-semibold text-sm">
                The farmer rejected this order.
              </Text>
              {!!order.rejectionReason && (
                <Text className="text-gray-600 text-xs mt-1">
                  Reason: {order.rejectionReason}
                </Text>
              )}
            </View>
          )}

        {(order.status === "pending" || order.status === "accepted") &&
          !(order.payment === "gcash" && order.paymentStatus === "paid") &&
          order.inventoryFulfilled !== true && (
            <TouchableOpacity
              onPress={openCancelModal}
              disabled={cancelling}
              activeOpacity={0.8}
              className="py-4 rounded-[5px] mb-2"
              style={{ backgroundColor: "#dc2626" }}
            >
              <Text className="text-white font-bold text-center">
                Cancel Order
              </Text>
            </TouchableOpacity>
          )}

      </ScrollView>

      <RateOrderModal
        visible={
          showRateModal
        }

        onClose={() => {
          setShowRateModal(
            false
          );

          setSelectedProduct(
            null
          );
        }}

        orderId={
          order.id ||
          (orderId as string)
        }

        product={
          selectedProduct
        }

        buyerId={
          buyerId
        }

        buyerName={
          buyerName
        }

        buyerProfileImage={
          buyerProfileImage
        }

        onSubmitted={
          handleReviewSubmitted
        }
      />

      <Modal
        visible={
          showCancelModal
        }
        transparent
        animationType="fade"
        onRequestClose={() =>
          setShowCancelModal(
            false
          )
        }
        statusBarTranslucent
      >

        <View className="flex-1 bg-black/50 justify-end">

          <View
            className="bg-white rounded-t-[20px] p-6"
            style={{ borderTopWidth: 2, borderColor: DARK_GREEN }}
          >

            <View className="w-10 h-1 bg-gray-300 rounded-full self-center mb-5" />

            <Text className="text-xl font-bold text-gray-800">
              Cancel Order
            </Text>

            <Text className="text-gray-500 mt-1 mb-5">
              Why do you want to cancel this order?
            </Text>

            {buyerCancelReasons.map(
              (reason) => {

                const selected =
                  selectedCancelReason ===
                  reason;

                return (

                  <TouchableOpacity
                    key={
                      reason
                    }
                    onPress={() => {

                      setSelectedCancelReason(
                        reason
                      );

                      if (
                        reason !==
                        "Other"
                      ) {
                        setCustomCancelReason(
                          ""
                        );
                      }

                    }}
                    className="border rounded-[5px] px-4 py-3 mb-3 flex-row items-center"
                    style={{
                      borderColor: selected ? DARK_GREEN : "#e5e7eb",
                      backgroundColor: selected ? "#f0fdf4" : "#ffffff",
                    }}
                  >

                    <Ionicons
                      name={
                        selected
                          ? "radio-button-on"
                          : "radio-button-off"
                      }
                      size={20}
                      color={
                        selected
                          ? DARK_GREEN
                          : "#9CA3AF"
                      }
                    />

                    <Text className="ml-3 text-gray-700 font-semibold">
                      {reason}
                    </Text>

                  </TouchableOpacity>
                );
              }
            )}

            {selectedCancelReason ===
              "Other" && (

              <TextInput
                value={
                  customCancelReason
                }
                onChangeText={
                  setCustomCancelReason
                }
                placeholder="Please specify your reason..."
                placeholderTextColor="#9CA3AF"
                multiline
                textAlignVertical="top"
                className="border border-gray-300 rounded-[5px] px-4 py-3 min-h-[100px] mb-4 text-gray-800"
              />
            )}

            <TouchableOpacity
              disabled={
                cancelling
              }
              onPress={
                continueCancel
              }
              activeOpacity={
                0.8
              }
              className="bg-red-600 py-4 rounded-[5px]"
            >

              {cancelling ? (

                <ActivityIndicator
                  color="white"
                />

              ) : (

                <Text className="text-white text-center font-bold">
                  Continue
                </Text>

              )}

            </TouchableOpacity>

            <TouchableOpacity
              disabled={
                cancelling
              }
              onPress={() =>
                setShowCancelModal(
                  false
                )
              }
              className="bg-gray-100 py-4 rounded-[5px] mt-3"
            >

              <Text className="text-gray-700 text-center font-bold">
                Keep Order
              </Text>

            </TouchableOpacity>

          </View>

        </View>

      </Modal>
      {showConfirmCancelModal && (
        <View className="absolute inset-0 justify-center items-center bg-black/40">

          <View
            className="bg-white rounded-[5px] p-6 w-80"
            style={{ borderWidth: 1, borderColor: DARK_GREEN }}
          >

            <Text className="text-gray-800 text-lg font-semibold mb-4">
              Confirm Cancellation
            </Text>

            <Text className="text-gray-600 text-sm leading-5">
              Are you sure you want to cancel this order?
            </Text>

            <View className="mt-4 bg-gray-50 rounded-[5px] p-3">
              <Text className="text-gray-500 text-xs mb-1">
                Reason
              </Text>

              <Text className="text-gray-800 text-sm font-medium">
                {pendingCancelReason}
              </Text>
            </View>

            <View className="flex-row justify-between mt-6">

              <TouchableOpacity
                className="bg-gray-200 px-4 py-2 rounded-[5px] flex-1 mr-2 items-center"
                onPress={() => {
                  setShowConfirmCancelModal(false);
                  setPendingCancelReason("");
                }}
                disabled={cancelling}
              >
                <Text className="text-gray-700 font-semibold">
                  Cancel
                </Text>
              </TouchableOpacity>

              {/* The final, destructive confirm button of the cancellation flow. */}
              <TouchableOpacity
                className="px-4 py-2 rounded-[5px] flex-1 ml-2 items-center"
                style={{
                  backgroundColor: "#dc2626",
                  opacity: cancelling ? 0.6 : 1,
                }}
                onPress={() => confirmCancel(pendingCancelReason)}
                disabled={cancelling}
              >
                <Text className="text-white font-semibold">
                  {cancelling ? "Cancelling..." : "Yes"}
                </Text>
              </TouchableOpacity>

            </View>

          </View>

        </View>
      )}
    </View>
  );
}

// One step of the order status timeline.
function TimelineRow({
  icon,
  title,
  date,
  color,
  showLine = true,
}: {
  icon: any;
  title: string;
  date: any;
  color: string;
  showLine?: boolean;
}) {

  const formatDate =
    (timestamp: any) => {

      if (!timestamp) {
        return "";
      }

      try {

        let date: Date;

        if (
          typeof timestamp?.toDate ===
          "function"
        ) {

          date =
            timestamp.toDate();

        } else if (
          typeof timestamp?.seconds ===
          "number"
        ) {

          date = new Date(
            timestamp.seconds *
              1000
          );

        } else {

          date =
            new Date(
              timestamp
            );
        }

        if (
          isNaN(
            date.getTime()
          )
        ) {

          return "";
        }

        return date.toLocaleString(
          "en-PH",
          {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }
        );

      } catch {

        return "";
      }
    };

  return (
    <View className="flex-row">

      <View className="items-center mr-3">

        <View
          className="w-9 h-9 rounded-full items-center justify-center"
          style={{
            backgroundColor:
              `${color}15`,
          }}
        >

          <Ionicons
            name={icon}
            size={19}
            color={color}
          />

        </View>

        {showLine && (
          <View
            className="w-[2px] h-8 mt-1"
            style={{
              backgroundColor:
                "#D1D5DB",
            }}
          />
        )}

      </View>

      <View className="flex-1 pb-3">

        <Text className="font-bold text-gray-800">
          {title}
        </Text>

        <Text className="text-gray-500 text-xs mt-1">
          {formatDate(date)}
        </Text>

      </View>

    </View>
  );
}