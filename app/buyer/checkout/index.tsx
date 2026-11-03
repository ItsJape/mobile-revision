// Buyer checkout screen for pickup or delivery.
import {
  router,
  useLocalSearchParams,
  useFocusEffect,
} from "expo-router";

import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";

import AsyncStorage from "@react-native-async-storage/async-storage";

import DateTimePicker from "@react-native-community/datetimepicker";

import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/FirebaseConfig";
import { formatPhilippinePhoneNumber } from "@/src/utils/validators";
import { useAppAlert } from "@/src/context/FarmerAlertContext";

import {
  createOrder,
  quoteDeliveries,
} from "@/src/services/orderService";

import {
  deliveryErrorMessage,
} from "@/src/utils/deliveryFee";
import { getUserFriendlyErrorMessage } from "@/src/utils/userFacingError";

import {
  removeCartItem,
} from "@/src/services/cartService";

import {
  FARMER_CONTENT_BOTTOM_GAP,
  getFarmerScreenBottomPadding,
} from "@/src/constants/farmerLayout";

// CONSTANTS

const DARK_GREEN =
  "#14532d";

// COMPONENT

export default function Checkout() {
  const insets = useSafeAreaInsets();
  const Alert = useAppAlert();
  const {
    buyerId,
    items,
  } =
    useLocalSearchParams();

  const [
    cart,
    setCart,
  ] =
    useState<any[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    buyerName,
    setBuyerName,
  ] =
    useState<
      string | null
    >(null);

  // The address the order ships to.
  const [
    address,
    setAddress,
  ] =
    useState<any>(
      null
    );

  // Whether the buyer collects the order or has it delivered.
  const [
    delivery,
    setDelivery,
  ] =
    useState<
      "pickup" | "delivery"
    >("pickup");

  // How the buyer pays for the order.
  const [
    payment,
    setPayment,
  ] =
    useState<
      "gcash" | "cod"
    >("gcash");

  // Date and time the buyer will collect the order.
  const [
    pickupDate,
    setPickupDate,
  ] =
    useState<
      string | null
    >(null);

  const [
    pickupTime,
    setPickupTime,
  ] =
    useState<
      string | null
    >(null);

  const [
    showDatePicker,
    setShowDatePicker,
  ] =
    useState(
      false
    );

  const [
    showTimePicker,
    setShowTimePicker,
  ] =
    useState(
      false
    );

  const [
    dateObj,
    setDateObj,
  ] =
    useState(
      new Date()
    );

  const [
    timeObj,
    setTimeObj,
  ] =
    useState(
      new Date()
    );

  // The cart arrives as a JSON string in the route parameters.
  useEffect(
    () => {
      if (!items) {
        return;
      }

      try {
        const parsed =
          JSON.parse(
            items as string
          );

        if (
          Array.isArray(
            parsed
          )
        ) {
          setCart(
            parsed
          );
        } else {
          setCart(
            []
          );
        }
      } catch (
        error
      ) {
        getUserFriendlyErrorMessage(error, "Load buyer checkout cart");

        setCart(
          []
        );
      }
    },
    [items]
  );

  // Reloads the buyer and their default address every time the screen is focused,
  // so a newly added address is picked up.
  useFocusEffect(
    useCallback(
      () => {
        const loadUserAndAddress =
          async () => {
            try {
              const userString =
                await AsyncStorage.getItem(
                  "user"
                );

              if (
                !userString
              ) {
                return;
              }

              const user =
                JSON.parse(
                  userString
                );

              const uid =
                user.uid ||
                user.userId ||
                user.id;

              setBuyerName(
                user.fullName ||
                  user.name ||
                  ""
              );

              const q =
                query(
                  collection(
                    db,
                    "addresses"
                  ),

                  where(
                    "userId",
                    "==",
                    uid
                  ),

                  where(
                    "isDefault",
                    "==",
                    true
                  )
                );

              const snap =
                await getDocs(
                  q
                );

              if (
                !snap.empty
              ) {
                setAddress({
                  id:
                    snap
                      .docs[0]
                      .id,

                  ...snap
                    .docs[0]
                    .data(),
                });
              } else {
                setAddress(
                  null
                );
              }
            } catch (
              error
            ) {
              getUserFriendlyErrorMessage(error, "Load buyer checkout address");
            }
          };

        loadUserAndAddress();
      },
      []
    )
  );

  const onDateChange =
    (
      event: any,
      selectedDate: any
    ) => {
      setShowDatePicker(
        false
      );

      if (
        selectedDate
      ) {
        setDateObj(
          selectedDate
        );

        setPickupDate(
          selectedDate.toLocaleDateString()
        );
      }
    };

  const onTimeChange =
    (
      event: any,
      selectedTime: any
    ) => {
      setShowTimePicker(
        false
      );

      if (
        selectedTime
      ) {
        setTimeObj(
          selectedTime
        );

        setPickupTime(
          selectedTime.toLocaleTimeString(
            [],
            {
              hour:
                "2-digit",

              minute:
                "2-digit",
            }
          )
        );
      }
    };

  // Delivery quotes, all farms in one call. This preview is never trusted: the
  // server recomputes the fee from the city and barangay in POST /orders, in
  // /accept for COD, and in /create-payment for GCash. The buyer location comes
  // from the text of the address that was picked.

// The state of one farm's delivery quote.
  type FarmQuote =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ok"; deliveryFee: number; distanceKm: number | null; adjustedDistanceKm: number | null; tier: string | null; feeStatus: "ok"; method?: string | null }
    | { status: "error"; message: string; code?: string };

  const [quotes, setQuotes] = useState<Record<string, FarmQuote>>({});
  const [quoteAttempt, setQuoteAttempt] = useState(0);

  const activeFarms = cart.filter(
    (farm: any) => Array.isArray(farm?.products) && farm.products.length > 0
  );

  const buyerLocation =
    address && String(address.city || "").trim() && String(address.barangay || "").trim()
      ? {
          city: String(address.city),
          barangay: String(address.barangay),
          province: String(address.province || "Bulacan"),
        }
      : null;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (delivery !== "delivery" || !address || activeFarms.length === 0) {
        setQuotes({});
        return;
      }
      if (!buyerLocation) {
        const blocked: Record<string, FarmQuote> = {};
        for (const farm of activeFarms) {
          if (farm?.farmerId) {
            blocked[String(farm.farmerId)] = {
              status: "error",
              code: "ADDRESS_MISSING_BARANGAY",
              message: deliveryErrorMessage("ADDRESS_MISSING_BARANGAY"),
            };
          }
        }
        setQuotes(blocked);
        return;
      }
      const loading: Record<string, FarmQuote> = {};
      for (const farm of activeFarms) {
        if (farm?.farmerId) loading[String(farm.farmerId)] = { status: "loading" };
      }
      setQuotes(loading);
      try {
        // One endpoint call covers the whole cart, and the server resolves the
        // barangay of every farm in a single pass.
        const results = await quoteDeliveries(
          activeFarms
            .filter((farm: any) => farm?.farmerId)
            .map((farm: any) => ({ farmerId: String(farm.farmerId), key: String(farm.farmerId) })),
          buyerLocation,
          "delivery"
        );
        if (cancelled) return;
        const next: Record<string, FarmQuote> = {};
        for (const r of results) {
          if (!r?.success) {
            next[String(r.key)] = {
              status: "error",
              message: deliveryErrorMessage(r.code),
              code: r.code,
            };
          } else {
            next[String(r.key)] = {
              status: "ok",
              deliveryFee: Number(r.deliveryFee) || 0,
              distanceKm: r.distanceKm ?? null,
              adjustedDistanceKm: r.adjustedDistanceKm ?? null,
              tier: r.tier ?? null,
              feeStatus: "ok",
              method: r.method ?? null,
            };
          }
        }
        // A farm missing from the response is treated as an error, so a missing quote
        // never looks like free delivery.
        for (const farm of activeFarms) {
          const fid = String(farm?.farmerId || "");
          if (fid && !next[fid]) {
            next[fid] = { status: "error", message: deliveryErrorMessage() };
          }
        }
        setQuotes(next);
      } catch (e: any) {
        if (cancelled) return;
        const failed: Record<string, FarmQuote> = {};
        for (const farm of activeFarms) {
          if (farm?.farmerId) {
            failed[String(farm.farmerId)] = {
              status: "error",
              message: deliveryErrorMessage(e?.code),
              code: e?.code,
            };
          }
        }
        setQuotes(failed);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery, address?.id, address?.city, address?.barangay, items, quoteAttempt]);

  const quoting = Object.values(quotes).some((q) => q.status === "loading");
  const quoteErrors = activeFarms
    .map((farm: any) => ({
      farm,
      quote: quotes[String(farm?.farmerId || "")],
    }))
    .filter(({ quote }) => quote?.status === "error");

  const feeForFarm = (farmerId: string): number => {
    const q = quotes[String(farmerId || "")];
    return q?.status === "ok" ? Number(q.deliveryFee) || 0 : 0;
  };

  const kmForFarm = (farmerId: string): number | null => {
    const q = quotes[String(farmerId || "")];
    return q?.status === "ok" ? (q.distanceKm ?? null) : null;
  };

  // Adds up the server-quoted fee of every farm in the cart.
  const subTotal =
    cart.reduce(
      (
        sum,
        farm
      ) => {
        return (
          sum +
          farm.products.reduce(
            (
              pSum: number,
              p: any
            ) =>
              pSum +
              Number(
                p.price
              ) *
                Number(
                  p.quantity
                ),
            0
          )
        );
      },
      0
    );

  const deliveryFee =
    delivery === "delivery"
      ? activeFarms.reduce((sum: number, farm: any) => sum + feeForFarm(farm?.farmerId), 0)
      : 0;

  const total =
    subTotal +
    deliveryFee;

  const placeOrderBlocked =
    loading ||
    (delivery === "delivery" && (quoting || quoteErrors.length > 0 || activeFarms.some((f: any) => quotes[String(f?.farmerId || "")]?.status !== "ok")));

  // Creates one order per farm and clears the cart.
  const placeOrder =
    async () => {
      if (!buyerId) {
        return Alert.alert(
          "Error",
          "Buyer not found."
        );
      }

      if (!buyerName) {
        return Alert.alert(
          "Error",
          "Buyer information is missing."
        );
      }

      if (delivery === "delivery" && !address) {
        return Alert.alert(
          "Error",
          "No delivery address selected."
        );
      }

      if (delivery === "delivery" && quoting) {
        return Alert.alert(
          "Calculating delivery",
          "Please wait while delivery fees are calculated."
        );
      }

      if (delivery === "delivery" && quoteErrors.length > 0) {
        return Alert.alert(
          "Delivery unavailable",
          quoteErrors.map(({ farm, quote }: any) =>
            `${farm?.farmName || "A farm"}: ${quote?.status === "error" ? quote.message : "unavailable"}`
          ).join("\n")
        );
      }

      if (
        delivery === "pickup" &&
        (!pickupDate ||
          !pickupTime)
      ) {
        return Alert.alert(
          "Error",
          "Select pickup date and time."
        );
      }

      if (
        cart.length ===
        0
      ) {
        return Alert.alert(
          "Error",
          "No items to checkout."
        );
      }

      // Every line must say which variant the buyer chose.
      const lineWithoutVariant = cart
        .flatMap((farm: any) => farm?.products || [])
        .find((p: any) => !String(p?.variantId || "").trim());

      if (lineWithoutVariant) {
        return Alert.alert(
          "Choose an option",
          `Please remove ${lineWithoutVariant.name || "this item"} from your cart and add it again so we know which option you want.`
        );
      }

      setLoading(true);

      const createdOrderIds:
        string[] = [];

      try {
        /*
         * IMPORTANT:
         * Checkout ONLY creates the order.
         *
         * No stock is deducted here.
         * No GCash payment is opened here.
         *
         * The farmer must accept first.
         */

        for (
          let farmIndex = 0;
          farmIndex <
          cart.length;
          farmIndex++
        ) {
          const farm =
            cart[
              farmIndex
            ];

          if (
            !farm?.products ||
            !Array.isArray(
              farm.products
            ) ||
            farm.products.length ===
              0
          ) {
            continue;
          }

          const farmTotal =
            farm.products.reduce(
              (
                sum: number,
                p: any
              ) =>
                sum +
                Number(
                  p.price || 0
                ) *
                  Number(
                    p.quantity || 0
                  ),
              0
            );

          const farmDeliveryFee =
            delivery ===
            "delivery"
              ? feeForFarm(farm?.farmerId)
              : 0;

          const farmDistanceKm =
            delivery === "delivery" ? kmForFarm(farm?.farmerId) : 0;

          const farmTier =
            delivery === "delivery"
              ? (quotes[String(farm?.farmerId || "")] as any)?.tier ?? null
              : null;

          const farmQuote =
            delivery === "delivery"
              ? (quotes[String(farm?.farmerId || "")] as any)
              : null;

          const farmOrderTotal =
            farmTotal +
            farmDeliveryFee;

          // One order line = one product variant. The server re-reads the variant
          // price, unit and stock, so these values are only what the buyer saw.
          const products = farm.products.map((p: any) => ({
            productId: String(p.productId || p.docId || ""),
            variantId: String(p.variantId || ""),
            variantName: p.variantName || "",
            name: p.name || "",
            image: p.image || "",
            price: Number(p.price || 0),
            quantity: Number(p.quantity || 0),
            unit: p.unit || "",
            reviewed: false,
          }));

          const orderResult =
            await createOrder({
              buyerId:
                buyerId as string,

              buyerName:
                buyerName ||
                "",

              farmerId:
                farm.farmerId,

              farmName:
                farm.farmName,

              products,

              delivery,

              payment,

              paymentStatus:
                "pending",

              inventoryFulfilled:
                false,

              fulfillmentStatus:
                "pending",

              address:
                delivery === "delivery"
                  ? address
                  : null,

              pickupDate:
                delivery ===
                "pickup"
                  ? pickupDate
                  : null,

              pickupTime:
                delivery ===
                "pickup"
                  ? pickupTime
                  : null,

              subTotal:
                farmTotal,

              deliveryFee:
                farmDeliveryFee,

              distanceKm: farmDistanceKm ?? null,
              adjustedDistanceKm: (farmQuote as any)?.adjustedDistanceKm ?? null,
              deliveryTier: farmTier ?? null,
              // Only the preview fee is stored here. The server recomputes the real fee in
              // POST /orders and again at accept or payment.
              feeStatus: "ok" as any,
              roadFactor: null,
              tierVersion: null,
              deliveryMethod: farmQuote?.method ?? (delivery === "delivery" ? "barangay-road-factor" : null),

              total:
                farmOrderTotal,

              status:
                "pending",
            });

          createdOrderIds.push(
            orderResult.id
          );
        }

        if (
          createdOrderIds.length ===
          0
        ) {
          throw new Error(
            "No orders were created."
          );
        }

        // The cart lines are removed only after every order was created. A GCash order
        // is still pending at this point, because the buyer pays after the
        // farmer accepts.
        const cartItemIds = cart
          .flatMap((farm: any) => farm.products || [])
          .map((product: any) => product.docId)
          .filter(Boolean) as string[];

        await Promise.all(
          cartItemIds.map((docId) =>
            removeCartItem(docId)
          )
        );

        const goToThankYou = () => {
          router.replace({
            pathname: "/buyer/checkout/orderreceipt",
            params: {
              delivery,
              payment,
              subTotal: String(subTotal),
              deliveryFee: String(deliveryFee),
              total: String(total),
              pickupDate: pickupDate || "",
              pickupTime: pickupTime || "",
              orderIds: JSON.stringify(createdOrderIds),
              items: JSON.stringify(cart),
              address: JSON.stringify(
                delivery === "delivery" ? address : null
              ),
              orderStatus: "pending",
              paymentStatus: "pending",
            },
          });
        };

        if (payment === "gcash") {
          Alert.alert(
            "Order Submitted",
            "Your order has been sent to the farmer for approval. You do not need to pay yet. Once the farmer accepts the order, go to Orders and tap Pay with GCash to complete your payment.",
            [
              {
                text: "OK",
                onPress: goToThankYou,
              },
            ],
            { cancelable: false }
          );
        } else {
          goToThankYou();
        }
      } catch (
        error: any
      ) {
        console.log("PLACE ORDER ERROR:", {
          message: error?.message,
          code: error?.code,
          status: error?.status,
        });
        Alert.alert(
          "Order Error",
          getUserFriendlyErrorMessage(
            error,
            "Create buyer order",
            "We couldn't place your order right now. Please try again in a moment."
          )
        );
      } finally {
        setLoading(false);
      }
    };

  if (
    cart.length ===
    0
  ) {
    return (
      <View className="flex-1 justify-center items-center bg-white px-8">
        <Ionicons
          name="cart-outline"
          size={48}
          color="#d1d5db"
        />

        <Text className="text-gray-400 font-semibold mt-3">
          No items to checkout
        </Text>
      </View>
    );
  }

  return (
    <View
      className="flex-1"
      style={{
        backgroundColor:
          "#fafafa",
      }}
    >
      <ScrollView
        contentContainerStyle={{
          paddingBottom: FARMER_CONTENT_BOTTOM_GAP,
        }}
        showsVerticalScrollIndicator={
          false
        }
      >

        <View className="bg-green-900 pt-14 pb-4 px-5 rounded-b-2xl flex-row items-center">
          <TouchableOpacity
            onPress={() =>
              router.back()
            }
            disabled={
              loading
            }
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color="white"
            />
          </TouchableOpacity>

          <Text className="text-white font-bold text-lg ml-4">
            Checkout
          </Text>
        </View>

        <View className="px-4">

          {delivery === "delivery" ? (
            <>
              <Text className="text-gray-400 text-xs font-bold uppercase tracking-wide mt-5 mb-2 mx-1">
                Delivery Address
              </Text>

              <View className="bg-white p-4 rounded-[10px]">
                {address ? (
                  <>
                    <Text className="font-bold text-base text-gray-900">
                      {address.fullName}
                    </Text>

                    <Text className="text-gray-600 text-sm mt-1">
                      {address.street}, {address.barangay}
                    </Text>

                    <Text className="text-gray-600 text-sm">
                      {address.city}, {address.province}
                    </Text>

                    <Text className="text-gray-600 text-sm mt-1">
                      {formatPhilippinePhoneNumber(address.phone)}
                    </Text>
                  </>
                ) : (
                  <Text className="text-red-500 text-sm">
                    No default address
                  </Text>
                )}

                <TouchableOpacity
                  onPress={() =>
                    router.push(
                      "/buyer/profile/address"
                    )
                  }
                  disabled={loading}
                  className="mt-3 bg-green-900 py-2.5 rounded-[5px] items-center"
                >
                  <Text className="text-white font-semibold text-sm">
                    Change Address
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text className="text-gray-400 text-xs font-bold uppercase tracking-wide mt-5 mb-2 mx-1">
                Pickup Details
              </Text>

              <View className="bg-blue-50 border border-blue-100 p-4 rounded-[10px]">
                <Text className="text-blue-900 font-bold text-base">
                  Pickup from the farmer&apos;s farm
                </Text>

                <Text className="text-gray-500 text-sm mt-3">
                  Pickup Date
                </Text>
                <Text className="text-gray-900 font-semibold mt-1">
                  {pickupDate || "Not set"}
                </Text>

                <Text className="text-gray-500 text-sm mt-3">
                  Pickup Time
                </Text>
                <Text className="text-gray-900 font-semibold mt-1">
                  {pickupTime || "Not set"}
                </Text>
              </View>
            </>
          )}


          <Text className="text-gray-400 text-xs font-bold uppercase tracking-wide mt-8 mb-2 mx-1">
            Items
          </Text>

          {cart.map(
            (
              farm: any,
              farmIndex: number
            ) => (
              <View
                key={`farm-${farmIndex}-${farm.farmerId || farm.farmName}`}
                className="bg-white rounded-[10px] p-4 mb-3"
              >
                <Text className="font-bold text-base text-gray-900 mb-3">
                  {
                    farm.farmName
                  }
                </Text>

                {delivery === "delivery" &&
                  (() => {
                    const q: any = quotes[String(farm?.farmerId || "")];
                    if (!q || q.status === "loading" || q.status === "idle") {
                      return (
                        <View className="mb-3 flex-row items-center rounded-[5px] bg-gray-50 p-2.5">
                          <ActivityIndicator size="small" color="#14532d" />
                          <Text className="ml-2 text-xs text-gray-500">
                            Calculating delivery fee…
                          </Text>
                        </View>
                      );
                    }
                    if (q.status === "error") {
                      return (
                        <View className="mb-3 rounded-[5px] border border-red-200 bg-red-50 p-2.5">
                          <Text className="text-xs font-bold text-red-700">
                            Delivery unavailable
                          </Text>
                          <Text className="mt-0.5 text-xs text-red-600">
                            {deliveryErrorMessage(q.code)}
                          </Text>
                        </View>
                      );
                    }
                    return (
                      <View className="mb-3 flex-row items-center justify-between rounded-[5px] bg-green-50 p-2.5">
                        <Text className="text-xs text-gray-600">
                          Delivery
                        </Text>
                        <Text className="text-sm font-bold text-gray-800">
                          ₱{Number(q.deliveryFee || 0).toFixed(2)}
                        </Text>
                      </View>
                    );
                  })()}

                {farm.products.map(
                  (
                    p: any,
                    productIndex: number
                  ) => (
                    <View
                      key={`${farmIndex}-${productIndex}-${p.productId || p.docId || "product"}`}
                      className={`flex-row items-center ${
                        productIndex <
                        farm.products.length -
                          1
                          ? "pb-3 mb-3 border-b border-gray-100"
                          : ""
                      }`}
                    >
                      <Image
                        source={{
                          uri:
                            p.image,
                        }}
                        className="w-16 h-16 rounded-lg"
                        resizeMode="cover"
                      />

                      <View className="flex-1 ml-3">
                        <Text
                          className="font-semibold text-sm text-gray-900"
                          numberOfLines={
                            1
                          }
                        >
                          {p.name}
                        </Text>

                        {p.variantName ? (
                          <Text className="text-green-900 text-xs mt-0.5 font-semibold">
                            {p.variantName}
                          </Text>
                        ) : null}

                        <Text className="text-green-900 font-bold mt-1">
                          ₱
                          {Number(
                            p.price
                          ).toFixed(
                            2
                          )}
                        </Text>

                        <Text className="text-gray-500 text-xs mt-0.5">
                          Qty:{" "}
                          {
                            p.quantity
                          }
                          {p.unit ? ` ${String(p.unit).replace(/^per\s+/i, "")}` : ""}
                        </Text>
                      </View>

                      <Text className="font-bold text-gray-800">
                        ₱
                        {(
                          Number(
                            p.price
                          ) *
                          Number(
                            p.quantity
                          )
                        ).toFixed(
                          2
                        )}
                      </Text>
                    </View>
                  )
                )}
              </View>
            )
          )}


          <Text className="text-gray-400 text-xs font-bold uppercase tracking-wide mt-2 mb-2 mx-1">
            Delivery
          </Text>

          <TouchableOpacity
            onPress={() =>
              setDelivery(
                "pickup"
              )
            }
            disabled={
              loading
            }
            className={`flex-row items-center justify-between bg-white p-4 rounded-[5px] border ${
              delivery ===
              "pickup"
                ? "border-green-900"
                : "border-gray-200"
            }`}
          >
            <Text className="font-semibold text-sm text-gray-800">
              Farm Pickup
            </Text>

            <Ionicons
              name={
                delivery ===
                "pickup"
                  ? "radio-button-on"
                  : "radio-button-off"
              }
              size={20}
              color={
                delivery ===
                "pickup"
                  ? DARK_GREEN
                  : "#9ca3af"
              }
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              setDelivery(
                "delivery"
              )
            }
            disabled={
              loading
            }
            className={`flex-row items-center justify-between bg-white p-4 mt-2 rounded-[5px] border ${
              delivery ===
              "delivery"
                ? "border-green-900"
                : "border-gray-200"
            }`}
          >
            <Text className="font-semibold text-sm text-gray-800">
              Delivery (by distance)
            </Text>

            <Ionicons
              name={
                delivery ===
                "delivery"
                  ? "radio-button-on"
                  : "radio-button-off"
              }
              size={20}
              color={
                delivery ===
                "delivery"
                  ? DARK_GREEN
                  : "#9ca3af"
              }
            />
          </TouchableOpacity>


          {delivery ===
            "pickup" && (
            <View className="flex-row gap-3 mt-2">
              <TouchableOpacity
                onPress={() =>
                  setShowDatePicker(
                    true
                  )
                }
                disabled={
                  loading
                }
                className="flex-1 bg-white rounded-[5px] p-4 border border-gray-200"
              >
                <View className="w-9 h-9 rounded-full bg-green-50 items-center justify-center mb-2">
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={
                      DARK_GREEN
                    }
                  />
                </View>

                <Text className="text-gray-400 text-[11px] font-semibold uppercase tracking-wide">
                  Date
                </Text>

                <Text
                  className={`text-sm font-semibold mt-0.5 ${
                    pickupDate
                      ? "text-gray-900"
                      : "text-gray-400"
                  }`}
                >
                  {pickupDate ||
                    "Select date"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  setShowTimePicker(
                    true
                  )
                }
                disabled={
                  loading
                }
                className="flex-1 bg-white rounded-[5px] p-4 border border-gray-200"
              >
                <View className="w-9 h-9 rounded-full bg-green-50 items-center justify-center mb-2">
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={
                      DARK_GREEN
                    }
                  />
                </View>

                <Text className="text-gray-400 text-[11px] font-semibold uppercase tracking-wide">
                  Time
                </Text>

                <Text
                  className={`text-sm font-semibold mt-0.5 ${
                    pickupTime
                      ? "text-gray-900"
                      : "text-gray-400"
                  }`}
                >
                  {pickupTime ||
                    "Select time"}
                </Text>
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={
                    dateObj
                  }
                  mode="date"
                  onChange={
                    onDateChange
                  }
                />
              )}

              {showTimePicker && (
                <DateTimePicker
                  value={
                    timeObj
                  }
                  mode="time"
                  onChange={
                    onTimeChange
                  }
                />
              )}
            </View>
          )}


          <Text className="text-gray-400 text-xs font-bold uppercase tracking-wide mt-5 mb-2 mx-1">
            Payment
          </Text>

          <View className="bg-white rounded-[5px] p-2">

            <TouchableOpacity
              onPress={() =>
                setPayment(
                  "gcash"
                )
              }
              disabled={
                loading
              }
              className={`flex-row items-center justify-between p-3 rounded-[5px] ${
                payment ===
                "gcash"
                  ? "bg-green-50"
                  : ""
              }`}
            >
              <Text className="font-semibold text-sm text-gray-800">
                GCash
              </Text>

              <Ionicons
                name={
                  payment ===
                  "gcash"
                    ? "radio-button-on"
                    : "radio-button-off"
                }
                size={20}
                color={
                  payment ===
                  "gcash"
                    ? DARK_GREEN
                    : "#9ca3af"
                }
              />
            </TouchableOpacity>

            <View className="h-px bg-gray-100 mx-1" />


            <TouchableOpacity
              onPress={() =>
                setPayment(
                  "cod"
                )
              }
              disabled={
                loading
              }
              className={`flex-row items-center justify-between p-3 rounded-[5px] ${
                payment ===
                "cod"
                  ? "bg-green-50"
                  : ""
              }`}
            >
              <Text className="font-semibold text-sm text-gray-800">
                Cash on Delivery
              </Text>

              <Ionicons
                name={
                  payment ===
                  "cod"
                    ? "radio-button-on"
                    : "radio-button-off"
                }
                size={20}
                color={
                  payment ===
                  "cod"
                    ? DARK_GREEN
                    : "#9ca3af"
                }
              />
            </TouchableOpacity>
          </View>


          <View className="bg-green-50 rounded-[5px] p-4 mt-5">
            <View className="flex-row justify-between mb-1.5">
              <Text className="text-gray-600 text-sm">
                Subtotal
              </Text>

              <Text className="text-gray-800 text-sm">
                ₱
                {subTotal.toFixed(
                  2
                )}
              </Text>
            </View>

              {delivery === "delivery" &&
              activeFarms.map((farm: any) => {
                const q: any = quotes[String(farm?.farmerId || "")];
                const label = `Delivery · ${farm?.farmName}`;
                const value =
                  q?.status === "ok"
                    ? `₱${Number(q.deliveryFee || 0).toFixed(2)}`
                    : q?.status === "loading"
                      ? "…"
                      : "unavailable";
                return (
                  <View key={`fee-${farm?.farmerId}`} className="flex-row justify-between mb-1.5">
                    <Text className="text-gray-600 text-xs flex-1 mr-2" numberOfLines={1}>
                      {label}
                    </Text>
                    <Text className="text-gray-800 text-xs">{value}</Text>
                  </View>
                );
              })}

            <View className="flex-row justify-between mb-3">
              <Text className="text-gray-600 text-sm">
                Delivery Fee total
              </Text>

              <Text className="text-gray-800 text-sm">
                ₱
                {deliveryFee.toFixed(
                  2
                )}
              </Text>
            </View>

            {delivery === "delivery" && (quoting || quoteErrors.length > 0) && (
              <View className="mb-3 rounded-[5px] border border-amber-200 bg-amber-50 p-3">
                <Text className="text-xs font-bold text-amber-900">
                  {quoting ? "Calculating delivery fees…" : "Some farms can't be delivered to."}
                </Text>
                {quoteErrors.map(({ farm, quote }: any) => (
                  <Text key={`err-${farm?.farmerId}`} className="mt-1 text-xs text-amber-800">
                    {farm?.farmName}: {deliveryErrorMessage((quote as any)?.code)}
                  </Text>
                ))}
                {!quoting && (
                  <TouchableOpacity
                    onPress={() => setQuoteAttempt((n) => n + 1)}
                    className="mt-2 rounded-[5px] bg-amber-700 py-2 items-center"
                  >
                    <Text className="text-white text-xs font-bold">Try again</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View className="h-px bg-green-100 mb-3" />

            <View className="flex-row justify-between">
              <Text className="font-bold text-base text-gray-900">
                Total
              </Text>

              <Text className="font-black text-green-900 text-lg">
                ₱
                {total.toFixed(
                  2
                )}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>


      <View
        className="bg-white border-t border-gray-200 p-4"
        style={{ paddingBottom: getFarmerScreenBottomPadding(insets.bottom) }}
      >
        <TouchableOpacity
          onPress={
            placeOrder
          }
          disabled={
            placeOrderBlocked
          }
          className={`bg-green-900 py-4 rounded-[5px] items-center justify-center ${
            placeOrderBlocked
              ? "opacity-50"
              : loading
                ? "opacity-70"
                : ""
          }`}
        >
          {loading || quoting ? (
            <View className="flex-row items-center">
              <ActivityIndicator
                color="#fff"
              />

              <Text className="text-white font-bold ml-2">
                {quoting ? "Calculating delivery…" : "Processing..."}
              </Text>
            </View>
          ) : quoteErrors.length > 0 && delivery === "delivery" ? (
            <Text className="text-white text-center font-bold">
              Delivery unavailable
            </Text>
          ) : (
            <Text className="text-white text-center font-bold">
              {payment ===
              "gcash"
                ? "Place Order"
                : "Place Order"}
            </Text>
          )}
        </TouchableOpacity>
        {delivery === "delivery" && quoteErrors.length > 0 && !quoting && (
          <TouchableOpacity
            onPress={() => setQuoteAttempt((n) => n + 1)}
            className="mt-2 py-2 items-center"
          >
            <Text className="text-green-900 text-sm font-bold">Try again</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}