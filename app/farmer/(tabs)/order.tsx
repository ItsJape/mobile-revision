// Farmer orders list screen.
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  useFocusEffect,
  useLocalSearchParams,
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
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  Ionicons,
} from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getFarmerOrders,
} from "@/src/services/orderService";

import {
  OrderType,
} from "@/src/types/order";
import { getUserFriendlyErrorMessage } from "@/src/utils/userFacingError";
import { getFarmerTabBarClearance } from "@/src/constants/farmerLayout";
import FarmerTutorialVideoModal from "@/src/components/FarmerTutorialVideoModal";

const filters = [
  "All",
  "to_pay",
  "pending",
  "accepted",
  "processing",
  "to_receive",
  "delivered",
  "claimed",
  "cancelled",
];

// Main orders screen with status filters.
export default function Orders() {

  const insets = useSafeAreaInsets();
  const router =
    useRouter();
  const { filter } = useLocalSearchParams<{ filter?: string }>();

  const [orders, setOrders] =
    useState<OrderType[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [activeFilter, setActiveFilter] =
    useState("All");
  const [showOrdersTutorial, setShowOrdersTutorial] =
    useState(false);

  useEffect(() => {
    if (filter && filters.includes(filter)) {
      setActiveFilter(filter);
    }
  }, [filter]);

// Fetches every order of this farmer.
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

        const farmerId =
          user.uid ||
          user.userId ||
          user.id;

        if (!farmerId) {

          setOrders([]);

          return;
        }

        const data =
          await getFarmerOrders(
            farmerId
          );

        setOrders(data);

      } catch (error) {

        getUserFriendlyErrorMessage(error, "Load farmer orders");

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
          (o) => activeFilter === "to_pay"
            ? o.payment === "gcash" && o.paymentStatus === "pending"
            : o.status === activeFilter
        );

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
      case "to_pay": return "To pay";
      default: return status;
    }
  };

// The badge color that goes with each order status.
  const getStatusColor = (
    status: string
  ) => {

    switch (status) {

      case "pending":
        return {
          text: "#D97706",
          border: "#FACC15",
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
          text: "#14532d",
          border: "#bbf7d0",
          bg: "#f0fdf4",
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

      case "cancelled":
        return {
          text: "#374151",
          border: "#6B7280",
          bg: "#E5E7EB",
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
      <View className="flex-1 items-center justify-center bg-[#f5f5f5]">

        <ActivityIndicator
          size="large"
          color="#14532d"
        />

        <Text className="mt-3 font-semibold text-gray-600">
          Loading orders...
        </Text>

      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#f5f5f5]">

      <View className="bg-green-900 pt-14 pb-4 px-5 rounded-b-2xl flex-row items-center justify-between">
        <Text className="text-white font-bold text-lg">
          Orders
        </Text>
        <TouchableOpacity
          onPress={() => setShowOrdersTutorial(true)}
          className="h-10 w-10 items-center justify-center"
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open orders tutorial"
        >
          <Ionicons name="play-circle-outline" size={25} color="white" />
        </TouchableOpacity>

      </View>

      <View className="flex-1 px-4 pt-4">

        <View className="mb-3">

          <FlatList
            data={filters}
            horizontal
            showsHorizontalScrollIndicator={
              false
            }
            keyExtractor={(item) =>
              item
            }
            contentContainerStyle={{
              paddingRight: 20,
            }}
            renderItem={({
              item,
            }) => {

              const isActive =
                activeFilter ===
                item;

              return (
                <TouchableOpacity
                  onPress={() =>
                    setActiveFilter(
                      item
                    )
                  }
                  className={`mr-2 items-center justify-center rounded-full border px-4 py-2.5 ${
                    isActive
                      ? "border-[#14532d] bg-[#14532d]"
                      : "border-gray-200 bg-white"
                  }`}
                  style={{
                    minWidth: 82,
                  }}
                >

                  <Text
                    className={`text-sm font-semibold ${
                      isActive
                        ? "text-white"
                        : "text-gray-600"
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
            paddingTop: 4,
            paddingBottom: getFarmerTabBarClearance(insets.bottom),
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
                size={54}
                color="#D1D5DB"
              />

              <Text className="mt-4 text-sm text-gray-500">
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

            const productNames =
              item.products
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
              item.delivery === "pickup";

            const isGcash =
              item.payment === "gcash";

            const showWaiting =
              item.status === "accepted" &&
              item.payment === "gcash" &&
              item.paymentStatus !== "paid";

            return (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() =>
                  router.push({
                    pathname:
                      "/farmer/orders/[id]",
                    params: {
                      id:
                        item.id ||
                        "",
                    },
                  })
                }
                className="mb-3 rounded-2xl border border-gray-200 bg-white p-4"
              >

                <View className="flex-row items-start justify-between">
                  <View className="mr-3 flex-1">
                    <Text className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                      Buyer
                    </Text>
                    <Text
                      className="mt-0.5 text-lg font-extrabold text-gray-900"
                      numberOfLines={1}
                    >
                      {item.buyerName || "Buyer"}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: statusColors.bg,
                      borderColor: statusColors.border,
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
                        : item.delivery === "delivery"
                          ? "Delivery"
                          : item.delivery || "N/A"}
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
                        : item.payment === "cod"
                          ? "COD"
                          : item.payment || "N/A"}
                    </Text>
                  </View>
                </View>

                {/* Subtotal, delivery fee, and grand total. */}
                <View className="mt-3 border-t border-gray-100 pt-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs text-gray-500">
                      Subtotal
                    </Text>
                    <Text className="text-sm font-semibold text-gray-700">
                      ₱{Number((item as any).subTotal ?? 0).toFixed(2)}
                    </Text>
                  </View>
                  <View className="mt-1 flex-row items-center justify-between">
                    <Text className="text-xs text-gray-500">
                      Delivery fee
                      {" · yours"}
                    </Text>
                    <Text className="text-sm font-semibold text-gray-700">
                      ₱{Number((item as any).deliveryFee || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View className="mt-1.5 flex-row items-center justify-between">
                    <Text className="text-[13px] font-bold uppercase tracking-widest text-gray-500">
                      Total
                    </Text>
                    <Text className="text-xl font-extrabold text-[#14532d]">
                      ₱{Number(item.total).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {showWaiting && (
                  <View className="mt-3 flex-row items-center rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <Ionicons
                      name="time-outline"
                      size={18}
                      color="#B45309"
                    />
                    <Text className="ml-2 flex-1 text-[13px] font-bold leading-4 text-amber-800">
                      Waiting for the buyer to complete the GCash
                      payment.
                    </Text>
                  </View>
                )}

                <View className="mt-2.5 flex-row items-center justify-end">
                  <Text className="text-[13px] font-bold text-[#14532d]">
                    View details
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color="#14532d"
                  />
                </View>

              </TouchableOpacity>
            );
          }}
        />

      </View>

      <FarmerTutorialVideoModal
        tutorial="orders"
        title="Orders tutorial"
        visible={showOrdersTutorial}
        onClose={() => setShowOrdersTutorial(false)}
      />
    </View>
  );
}