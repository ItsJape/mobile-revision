// List of the buyer's past and current orders.
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  useFocusEffect,
  useRouter,
} from "expo-router";

import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  Ionicons,
} from "@expo/vector-icons";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import { db } from "../../../FirebaseConfig";
import { getUserFriendlyErrorMessage } from "@/src/utils/userFacingError";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getFarmerScreenBottomPadding } from "@/src/constants/farmerLayout";

import {
  getBuyerOrders,
} from "@/src/services/orderService";

import {
  OrderType,
} from "@/src/types/order";

// The dark green used across the app.
const DARK_GREEN = "#14532d";

const filters = [
  "All",
  "pending",
  "accepted",
  "processing",
  "to_receive",
  "delivered",
  "claimed",
  "cancelled",
];

export default function BuyerOrders() {

  const router =
    useRouter();
  const insets = useSafeAreaInsets();

  const [orders, setOrders] =
    useState<OrderType[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [activeFilter, setActiveFilter] =
    useState("All");

  // Photo of each farm, keyed by farmerId, so the avatar can show the real
  // picture instead of repeating the same first letter.
  const [farmImages, setFarmImages] =
    useState<Record<string, string>>({});

  const formatOrderDate = (
    createdAt: any
  ) => {

    if (!createdAt) {
      return "Date unavailable";
    }

    try {

      let date: Date;

      if (
        typeof createdAt?.toDate ===
        "function"
      ) {

        date =
          createdAt.toDate();

      } else if (
        typeof createdAt?.seconds ===
        "number"
      ) {

        date =
          new Date(
            createdAt.seconds *
              1000
          );

      } else {

        date =
          new Date(createdAt);
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

  const fetchOrders =
    async () => {

      try {

        setLoading(true);

        const userStr =
          await AsyncStorage.getItem(
            "user"
          );

        const user =
          userStr
            ? JSON.parse(
                userStr
              )
            : null;

        if (!user) {

          setOrders([]);

          return;
        }

        const buyerId =
          user.uid ||
          user.userId ||
          user.id;

        if (!buyerId) {

          setOrders([]);

          return;
        }

        const data =
          await getBuyerOrders(
            buyerId
          );

        setOrders(data);

        // The profile image of every distinct farmer in the list is loaded once, so the
        // avatar can show the real picture.
        const uniqueFarmerIds =
          Array.from(
            new Set(
              data
                .map((o: any) => o.farmerId)
                .filter(Boolean)
            )
          );

        const imageEntries =
          await Promise.all(
            uniqueFarmerIds.map(
              async (farmerId: any) => {
                try {
                  const farmerDoc =
                    await getDoc(
                      doc(db, "users", farmerId)
                    );
                  return [
                    farmerId,
                    farmerDoc.exists()
                      ? farmerDoc.data().profileImage || ""
                      : "",
                  ] as const;
                } catch {
                  return [farmerId, ""] as const;
                }
              }
            )
          );

        setFarmImages(
          Object.fromEntries(imageEntries)
        );

      } catch (error) {
        getUserFriendlyErrorMessage(error, "Load buyer orders");

      } finally {

        setLoading(false);

      }
    };

  useEffect(() => {

    fetchOrders();

  }, []);

  useFocusEffect(
    useCallback(() => {

      fetchOrders();

    }, [])
  );

  const filteredOrders =
    activeFilter ===
      "All"
      ? orders
      : orders.filter(
          (o) =>
            o.status ===
            activeFilter
        );

  // Only finished orders can still be rated, so anything else shows zero.
  const getUnreviewedCount = (
    order: OrderType
  ) => {

    if (
      order.status !==
        "delivered" &&
      order.status !==
        "claimed"
    ) {

      return 0;
    }

    return (
      order.products || []
    ).filter(
      (product) =>
        !product.reviewed &&
        !order.reviewedProductIds?.includes(product.productId)
    ).length;
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
      case "All": return "All";
      default: return status;
    }
  };

  // The color that matches each order status in the list.
  const getStatusColor = (
    status: string
  ) => {

    switch (status) {

      case "pending":
        return {
          text: "#D97706",
          bg: "#FEF3C7",
        };

      case "accepted":
        return {
          text: "#1D4ED8",
          border: "#60A5FA",
          bg: "#DBEAFE",
        };

      case "processing":
        return {
          text: DARK_GREEN,
          border: DARK_GREEN,
          bg: "#DCFCE7",
        };

      case "to_receive":
        return {
          text: "#7C3AED",
          border: "#8B5CF6",
          bg: "#EDE9FE",
        };

      case "delivered":
        return {
          text: "#1D4ED8",
          border: "#2563EB",
          bg: "#DBEAFE",
        };

      case "claimed":
        return {
          text: "#14532d",
          border: "#86EFAC",
          bg: "#DCFCE7",
        };

      default:
        return {
          text: "#374151",
          border: "#9CA3AF",
          bg: "#F3F4F6",
        };
    }
  };

  if (loading) {

    return (
      <View className="flex-1 justify-center items-center bg-white">

        <ActivityIndicator
          size="large"
          color={DARK_GREEN}
        />

        <Text className="text-green-900 mt-3 font-semibold">
          Loading orders...
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
          className="mr-4"
        >

          <Ionicons
            name="arrow-back"
            size={24}
            color="white"
          />

        </TouchableOpacity>

        <Text className="text-white font-bold text-lg">
          My Orders
        </Text>

      </View>

      <View className="flex-1 px-4">
        <View className="mb-3 pt-4">
          <FlatList
            data={filters}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item}
            contentContainerStyle={{
              paddingRight: 20,
            }}
            renderItem={({ item }) => {
              const isActive = activeFilter === item;

              return (
                <TouchableOpacity
                  onPress={() => setActiveFilter(item)}
                  className={`mr-2 items-center justify-center rounded-full border px-4 py-2.5 ${
                    isActive
                      ? "border-[#14532d] bg-[#14532d]"
                      : "border-gray-200 bg-white"
                  }`}
                  style={{ minWidth: 82 }}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      isActive ? "text-white" : "text-gray-600"
                    }`}
                  >
                    {getStatusLabel(item)}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        <FlatList
          data={
            filteredOrders
          }

          keyExtractor={(
            item,
            index
          ) =>
            item.id ||
            `order-${index}`
          }

          showsVerticalScrollIndicator={
            false
          }

          contentContainerStyle={{
            paddingBottom: getFarmerScreenBottomPadding(insets.bottom),
            flexGrow:
              filteredOrders.length ===
              0
                ? 1
                : 0,
          }}

          ListEmptyComponent={
            <View className="mt-24 items-center">

              <Ionicons
                name="receipt-outline"
                size={70}
                color="#D1D5DB"
              />

              <Text className="text-gray-500 mt-4 text-base">
                No orders found
              </Text>

            </View>
          }

          renderItem={({
            item,
          }) => {

            const statusColors =
              getStatusColor(
                item.status
              );

            const unreviewedCount =
              getUnreviewedCount(
                item
              );

            const farmImage =
              (item as any).farmerId
                ? farmImages[(item as any).farmerId]
                : "";

            const productNames =
              (item.products || [])
                ?.map((product) =>
                  product.variantName
                    ? `${product.name} (${product.variantName})`
                    : product.name
                )
                .filter(Boolean)
                .join(", ") || "No items";

            const totalQty =
              (item.products || []).reduce(
                (sum, product) =>
                  sum +
                  (Number(product.quantity) || 0),
                0
              );

            const isPickup =
              (item as any).delivery === "pickup";

            const isGcash =
              (item as any).payment === "gcash";

            const showWaiting =
              item.status === "accepted" &&
              (item as any).payment === "gcash" &&
              (item as any).paymentStatus !== "paid";

            const showRate =
              item.status === "delivered" ||
              (item.status as string) === "claimed";

            return (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  if (item.status === "pending") {
                    router.push({
                      pathname: "/buyer/checkout/orderreceipt",
                      params: {
                        orderIds: JSON.stringify([item.id || ""]),
                        from: "orders",
                      },
                    });
                    return;
                  }

                  router.push({
                    pathname: "/buyer/profile/order-details",
                    params: {
                      orderId: item.id || "",
                    },
                  });
                }}
                className="mb-4 rounded-2xl border border-gray-200 bg-white p-4"
              >

                <View className="flex-row items-start justify-between">
                  <View className="mr-3 flex-1 flex-row items-center">
                    <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-green-900">
                      {farmImage ? (
                        <Image
                          source={{ uri: farmImage }}
                          style={{ width: "100%", height: "100%" }}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text className="text-lg font-bold text-white">
                          {item.farmName
                            ?.charAt(0)
                            ?.toUpperCase() || "F"}
                        </Text>
                      )}
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                        Farm
                      </Text>
                      <Text
                        className="mt-0.5 text-lg font-extrabold text-gray-900"
                        numberOfLines={1}
                      >
                        {item.farmName || "Farm"}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      backgroundColor: statusColors.bg,
                      borderColor: (statusColors as any).border || statusColors.bg,
                    }}
                    className="items-center rounded-full border px-3.5 py-1.5"
                  >
                    <Text
                      style={{ color: statusColors.text }}
                      className="text-[13px] font-bold"
                    >
                      {getStatusLabel(item.status)}
                    </Text>
                  </View>
                </View>

                <View className="mt-2 flex-row items-center">
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color="#6B7280"
                  />
                  <Text className="ml-1.5 text-[13px] font-semibold text-gray-600">
                    {formatOrderDate(item.createdAt)}
                  </Text>
                </View>

                <View className="mt-3 rounded-xl bg-gray-50 p-3">
                  <Text className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                    Order
                  </Text>
                  <Text
                    className="mt-1 text-[15px] font-semibold leading-5 text-gray-900"
                    numberOfLines={2}
                  >
                    {productNames}
                  </Text>
                  {totalQty > 0 && (
                    <Text className="mt-1 text-[13px] font-semibold text-gray-600">
                      {totalQty}{" "}
                      {totalQty === 1 ? "item" : "items"}
                    </Text>
                  )}
                </View>

                <View className="mt-3 flex-row gap-2">
                  <View className="flex-1 flex-row items-center justify-center rounded-full border border-green-200 bg-green-50 px-3 py-2.5">
                    <Ionicons
                      name={
                        isPickup
                          ? "storefront-outline"
                          : "bicycle-outline"
                      }
                      size={16}
                      color="#14532d"
                    />
                    <Text
                      className="ml-1.5 text-sm font-bold text-[#14532d]"
                      numberOfLines={1}
                    >
                      {isPickup
                        ? "Farm Pickup"
                        : (item as any).delivery === "delivery"
                          ? "Delivery"
                          : (item as any).delivery || "N/A"}
                    </Text>
                  </View>
                  <View className="flex-1 flex-row items-center justify-center rounded-full border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <Ionicons
                      name={
                        isGcash
                          ? "qr-code-outline"
                          : "cash-outline"
                      }
                      size={16}
                      color="#374151"
                    />
                    <Text
                      className="ml-1.5 text-sm font-bold text-gray-800"
                      numberOfLines={1}
                    >
                      {isGcash
                        ? "GCash"
                        : (item as any).payment === "cod"
                          ? "COD"
                          : (item as any).payment || "N/A"}
                    </Text>
                  </View>
                </View>

                <View className="mt-3 flex-row items-center justify-between border-t border-gray-100 pt-3">
                  <Text className="text-[13px] font-bold uppercase tracking-widest text-gray-500">
                    Total
                  </Text>
                  <Text className="text-xl font-extrabold text-green-900">
                    ₱{Number(item.total).toFixed(2)}
                  </Text>
                </View>

                {showWaiting && (
                  <View className="mt-3 flex-row items-center rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <Ionicons
                      name="time-outline"
                      size={18}
                      color="#B45309"
                    />
                    <Text className="ml-2 flex-1 text-[13px] font-bold leading-4 text-amber-800">
                      Awaiting GCash payment
                    </Text>
                  </View>
                )}

                {showRate && (
                  <View className="mt-3">
                    {unreviewedCount > 0 ? (
                      <View className="flex-row items-center justify-center rounded-xl bg-amber-500 py-3">
                        <Ionicons
                          name="star-outline"
                          size={16}
                          color="white"
                        />
                        <Text className="ml-1.5 text-sm font-bold text-white">
                          Rate Now
                        </Text>
                      </View>
                    ) : (
                      <View className="flex-row items-center justify-center rounded-xl border border-green-200 bg-green-50 py-3">
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={DARK_GREEN}
                        />
                        <Text className="ml-1.5 text-sm font-bold text-green-900">
                          Reviewed
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                <View className="mt-2.5 flex-row items-center justify-end">
                  <Text className="text-[13px] font-bold text-green-900">
                    View details
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={DARK_GREEN}
                  />
                </View>

              </TouchableOpacity>
            );
          }}
        />

      </View>

    </View>
  );
}