// Buyer cart screen grouped by farm.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useToast } from "@/src/context/ToastContext";
import { useAppAlert } from "@/src/context/FarmerAlertContext";
import { getUserFriendlyErrorMessage } from "@/src/utils/userFacingError";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BUYER_TAB_BAR_HEIGHT,
  getBuyerTabBarContentClearance,
} from "@/src/constants/buyerLayout";
import { FARMER_CONTENT_BOTTOM_GAP } from "@/src/constants/farmerLayout";
import React, { useCallback, useState } from "react";
import { getProductById } from "@/src/services/productService";

import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  getCartByBuyer,
  removeCartItem,
  updateCartQuantity,
} from "@/src/services/cartService";

import {
  groupCartByFarmer,
  FarmerCart,
} from "@/src/utils/groupCartByFarmer";

import { CartItem } from "@/src/types/cart";

// A cart line is one product variant. Stock is tracked per product + variant.
const stockKeyOf = (p: any): string =>
  `${String(p?.productId || "")}|${String(p?.variantId || "")}`;

// Stock that can really be bought: the variant must be Available and in stock.
const sellableStockOf = (variant: any): number =>
  variant && variant.status === "Available" && Number(variant.stock) > 0
    ? Number(variant.stock)
    : 0;

// Finds the variant a cart line points to. An old line without a variantId is only
// accepted when the product has exactly one variant.
const findVariant = (product: any, variantId?: string) => {
  const variants: any[] = Array.isArray(product?.variants) ? product.variants : [];
  if (variantId) return variants.find((v) => v.id === variantId) || null;
  return variants.length === 1 ? variants[0] : null;
};

// The most the buyer may put in the cart for one variant.
const maxQtyOf = (p: any, stock: number | null): number => {
  if (typeof stock !== "number") return Number(p?.quantity || 0);
  return Math.floor(stock);
};

export default function Cart() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const Alert = useAppAlert();
  const [cartItems, setCartItems] = useState<FarmerCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockMap, setStockMap] = useState<Record<string, number | null>>({});
  const [checkingStock, setCheckingStock] = useState(false);

  const [selectedItems, setSelectedItems] = useState<Set<string>>( new Set() );

  const [buyerId, setBuyerId] = useState("");

  const [removeTarget, setRemoveTarget] = useState<{
    farmerId: string;
    docId: string;
    name: string;
  } | null>(null);

// Load cart items for this buyer.
  const loadCart = useCallback(async () => {
    try {
      setLoading(true);

      const userString = await AsyncStorage.getItem("user");

      if (!userString) {
        router.replace("../login");
        return;
      }

      const user = JSON.parse(userString);

      const uid = user.uid || user.userId || user.id;

      setBuyerId(uid);

      const items: CartItem[] = await getCartByBuyer(uid);

      const grouped = groupCartByFarmer(items);

      // Load each product once. Variant price and stock come from the product, so
      // the cart shows what the server will charge.
      const uniqueProductIds = Array.from(new Set(items.map((i) => i.productId)));

      const failedProducts = new Set<string>();
      const productMap = new Map<string, any>();

      await Promise.all(
        uniqueProductIds.map(async (productId) => {
          try {
            productMap.set(productId, await getProductById(productId));
          } catch (error) {
            failedProducts.add(productId);
            getUserFriendlyErrorMessage(error, "Load cart product stock");
          }
        })
      );

      const nextStock: Record<string, number | null> = {};

      const refreshed = grouped.map((farm) => ({
        ...farm,
        products: farm.products.map((p: any) => {
          // Could not load the product, so the stock cannot be verified.
          if (failedProducts.has(p.productId)) {
            nextStock[stockKeyOf(p)] = null;
            return p;
          }

          const variant = findVariant(productMap.get(p.productId), p.variantId);

          // The product or variant no longer exists, so nothing can be bought.
          if (!variant) {
            nextStock[stockKeyOf(p)] = 0;
            return p;
          }

          const line = {
            ...p,
            variantId: variant.id,
            variantName: variant.name,
            price: Number(variant.price),
            unit: variant.unit,
          };

          nextStock[stockKeyOf(line)] = sellableStockOf(variant);

          return line;
        }),
      }));

      setCartItems(refreshed);
      setStockMap(nextStock);

    } catch (error) {
      Alert.alert(
        "Cart unavailable",
        getUserFriendlyErrorMessage(
          error,
          "Load buyer cart",
          "We couldn't load your cart. Please try again in a moment."
        )
      );
    } finally {
      setLoading(false);
    }

  }, [Alert, router]);

  useFocusEffect(
    useCallback(() => {
      void loadCart();
    }, [loadCart])
  );

  const toggleItemSelection = (docId: string) => {
    setSelectedItems((prev) => {
      const copy = new Set(prev);

      if (copy.has(docId)) {
        copy.delete(docId);
      } else {
        copy.add(docId);
      }

      return copy;
    });
  };

  const toggleFarmSelection = (farmerId: string) => {
    const farmProducts =
      cartItems
        .find((f) => f.farmerId === farmerId)
        ?.products.map((p) => p.docId!) || [];

    setSelectedItems((prev) => {
      const copy = new Set(prev);

      const allSelected = farmProducts.every((id) =>
        copy.has(id)
      );

      if (allSelected) {
        farmProducts.forEach((id) => copy.delete(id));
      } else {
        farmProducts.forEach((id) => copy.add(id));
      }

      return copy;
    });
  };

  const updateLocalQty = (
    farmerId: string,
    docId: string,
    qty: number
  ) => {
    setCartItems((prev) =>
      prev.map((f) =>
        f.farmerId === farmerId
          ? {
              ...f,
              products: f.products.map((p) =>
                p.docId === docId
                  ? { ...p, quantity: qty }
                  : p
              ),
            }
          : f
      )
    );
  };

  // Increase item quantity within the stock limit.
  const incrementQty = async (farmerId: string, docId: string) => {
  const product = cartItems
    .find((f) => f.farmerId === farmerId)
    ?.products.find((p) => p.docId === docId);

  if (!product?.docId) return;

  const availableStock = stockMap[stockKeyOf(product)];

  if (typeof availableStock !== "number") {
    showToast("Unable to verify stock. Please refresh the cart and try again.");
    return;
  }

  const maxQty = maxQtyOf(product, availableStock);

  if (product.quantity >= maxQty) {
    showToast(
      `Only ${availableStock} ${String(product.unit || "").replace(/^per\s+/i, "")} available`
    );
    return;
  }

  const newQty = product.quantity + 1;

  updateLocalQty(farmerId, docId, newQty);

  try {
    await updateCartQuantity(product.docId, newQty);
  } catch (error) {
    updateLocalQty(farmerId, docId, product.quantity);
    Alert.alert(
      "Couldn't update quantity",
      getUserFriendlyErrorMessage(
        error,
        "Increase cart item quantity",
        "We couldn't update this quantity. Please try again."
      )
    );
  }

  
};

  // Decrease quantity down to a minimum of 1. Use the delete button to remove an item.
  const decrementQty = async (
    farmerId: string,
    docId: string
  ) => {
    const product = cartItems
      .find((f) => f.farmerId === farmerId)
      ?.products.find((p) => p.docId === docId);

    if (!product?.docId) return;

    if (product.quantity <= 1) return;

    const newQty = product.quantity - 1;

    updateLocalQty(farmerId, docId, newQty);

    try {
      await updateCartQuantity(product.docId, newQty);
    } catch (error) {
      updateLocalQty(
        farmerId,
        docId,
        product.quantity
      );

      Alert.alert(
        "Couldn't update quantity",
        getUserFriendlyErrorMessage(
          error,
          "Decrease cart item quantity",
          "We couldn't update this quantity. Please try again."
        )
      );
    }
  };

  const removeItem = async (
    farmerId: string,
    docId: string
  ) => {
    const product = cartItems
      .find((f) => f.farmerId === farmerId)
      ?.products.find((p) => p.docId === docId);

    if (!product?.docId) return;

    const backup = [...cartItems];

    setCartItems((prev) =>
      prev
        .map((f) =>
          f.farmerId === farmerId
            ? {
                ...f,
                products: f.products.filter(
                  (p) => p.docId !== docId
                ),
              }
            : f
        )
        .filter((f) => f.products.length > 0)
    );

    setSelectedItems((prev) => {
      const copy = new Set(prev);

      copy.delete(docId);

      return copy;
    });

    try {
      await removeCartItem(product.docId);
    } catch (error) {
      setCartItems(backup);

      Alert.alert(
        "Couldn't remove item",
        getUserFriendlyErrorMessage(
          error,
          "Remove buyer cart item",
          "We couldn't remove this item. Please try again."
        )
      );
    }
  };

  const confirmRemove = (farmerId: string, docId: string, name: string) => {
    setRemoveTarget({ farmerId, docId, name });
  };

  const handleConfirmedRemove = () => {
    if (removeTarget) {
      removeItem(removeTarget.farmerId, removeTarget.docId);
    }
    setRemoveTarget(null);
  };

  // Check selected stock before going to checkout.
  const validateSelectedStockBeforeCheckout = async () => {
    const selectedProducts = cartItems.flatMap((farm) =>
      farm.products.filter((p) => selectedItems.has(p.docId!))
    );

    if (selectedProducts.length === 0) {
      showToast("Please select at least one item to checkout");
      return false;
    }

    // One entry per product + variant. The same variant on two lines is added up.
    const requestedMap = new Map<
      string,
      { productId: string; variantId: string; quantity: number; name: string; unit: string }
    >();

    for (const product of selectedProducts as any[]) {
      const productId = String(product.productId || "").trim();

      if (!productId) {
        Alert.alert(
          "Unable to Verify Stock",
          `Product ID is missing for ${product.name || "a selected item"}.`
        );
        return false;
      }

      const key = stockKeyOf(product);
      const current = requestedMap.get(key);
      const label = product.variantName
        ? `${product.name || "Product"} (${product.variantName})`
        : product.name || "Product";

      requestedMap.set(key, {
        productId,
        variantId: String(product.variantId || ""),
        quantity: (current?.quantity || 0) + Number(product.quantity || 0),
        name: current?.name || label,
        unit: current?.unit || product.unit || "unit",
      });
    }

    setCheckingStock(true);

    try {
      const productIds = Array.from(
        new Set(Array.from(requestedMap.values()).map((r) => r.productId))
      );

      const failedProducts = new Set<string>();
      const productMap = new Map<string, any>();

      await Promise.all(
        productIds.map(async (productId) => {
          try {
            productMap.set(productId, await getProductById(productId));
          } catch (error) {
            failedProducts.add(productId);
            getUserFriendlyErrorMessage(
              error,
              "Verify stock before buyer checkout"
            );
          }
        })
      );

      const checks = Array.from(requestedMap.entries()).map(
        ([key, requested]) => {
          if (failedProducts.has(requested.productId)) {
            return { key, ...requested, available: null as number | null };
          }

          const variant = findVariant(
            productMap.get(requested.productId),
            requested.variantId
          );

          return {
            key,
            ...requested,
            available: sellableStockOf(variant) as number | null,
          };
        }
      );

      setStockMap((prev) => ({
        ...prev,
        ...Object.fromEntries(checks.map((item) => [item.key, item.available])),
      }));

      const failedVerification = checks.filter(
        (item) => item.available === null
      );

      if (failedVerification.length > 0) {
        Alert.alert(
          "Unable to Verify Stock",
          "FarmGate could not verify the current stock of one or more products. Please refresh the cart and try again."
        );
        return false;
      }

      const shortages = checks.filter(
        (item) => Number(item.quantity) > Number(item.available)
      );

      if (shortages.length > 0) {
        const message = shortages
          .map(
            (item) =>
              `${item.name}: requested ${item.quantity}, available ${item.available} ${String(item.unit).replace(/^per\s+/i, "")}`
          )
          .join("\n");

        Alert.alert(
          "Insufficient Stock",
          `You cannot checkout yet because the selected quantity is higher than the current stock.\
\
${message}`
        );
        return false;
      }

      return true;
    } catch (error: any) {
      Alert.alert(
        "Unable to Verify Stock",
        getUserFriendlyErrorMessage(
          error,
          "Validate buyer cart stock",
          "We couldn't check product availability right now. Please try again in a moment."
        )
      );
      return false;
    } finally {
      setCheckingStock(false);
    }
  };

  // Total price of selected items.
  const totalPrice = cartItems.reduce((acc, farm) => {
    const farmTotal = farm.products.reduce((sum, p) => {
      if (selectedItems.has(p.docId!)) {
        return sum + p.price * p.quantity;
      }

      return sum;
    }, 0);

    return acc + farmTotal;
  }, 0);

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator
          size="large"
          color="#14532d"
        />
      </View>
    );
  }

  if (cartItems.length === 0) {
    return (
      <View className="flex-1" style={{ backgroundColor: "#f5f5f5" }}>
        <View className="bg-green-900 pt-14 pb-4 px-5 rounded-b-2xl flex-row items-center">
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color="white"
            />
          </TouchableOpacity>
          <Text className="text-white font-bold text-lg ml-4">
            My Cart
          </Text>
        </View>
        <Text className="text-center mt-10 text-gray-500">
          Your cart is empty
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: "#fafafa" }}>

      <View className="bg-green-900 pt-14 pb-4 px-5 rounded-b-2xl flex-row items-center">
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color="white"
          />
        </TouchableOpacity>

        <Text className="text-white font-bold text-lg ml-4">
          My Cart
        </Text>
      </View>

      <FlatList
        data={cartItems}
        keyExtractor={(f) => f.farmerId}
        contentContainerStyle={{
          padding: 16,
          paddingBottom:
            getBuyerTabBarContentClearance(
              insets.bottom,
              FARMER_CONTENT_BOTTOM_GAP
            ) + 72,
        }}
        renderItem={({ item: farm, index }) => (
            <View
              className={`rounded-[10px] p-4 ${
                index < cartItems.length - 1 ? "mb-4" : ""
              }`}
              style={{ backgroundColor: "#ffffff" }}
            >

            <View className="flex-row items-center mb-2">

              <TouchableOpacity
                onPress={() =>
                  toggleFarmSelection(farm.farmerId)
                }
                className="mr-3"
              >
                <MaterialCommunityIcons
                  name={
                    farm.products.every((p) =>
                      selectedItems.has(p.docId!)
                    )
                      ? "checkbox-marked"
                      : "checkbox-blank-outline"
                  }
                  size={20}
                  color="#14532d"
                />
              </TouchableOpacity>

              <Text className="font-bold text-lg">
                {farm.farmName}
              </Text>
            </View>

            {farm.products.map((p, index) => (
              <View
                key={p.docId}
                className={`py-4 ${
                  index < farm.products.length - 1
                    ? "border-b border-gray-200"
                    : ""
                }`}
              >
                <View className="flex-row items-start">

                  <TouchableOpacity
                    onPress={() =>
                      toggleItemSelection(p.docId!)
                    }
                    className="mr-3 mt-1"
                  >
                    <MaterialCommunityIcons
                      name={
                        selectedItems.has(p.docId!)
                          ? "checkbox-marked"
                          : "checkbox-blank-outline"
                      }
                      size={22}
                      color="#14532d"
                    />
                  </TouchableOpacity>

                  {/* Product details. */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() =>
                      router.push({
                        pathname: "/buyer/products/[id]",
                        params: { id: p.productId },
                      })
                    }
                    className="flex-1 flex-row items-start"
                  >
                    <View
                      className="rounded-lg overflow-hidden"
                      style={{ width: 80, height: 80 }}
                    >
                      <Image
                        source={{ uri: p.image }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="cover"
                      />
                    </View>

                    <View className="flex-1 ml-3 justify-center">

                      <Text className="font-bold text-base" numberOfLines={1}>
                        {p.name}
                      </Text>

                      <Text className="text-green-900 font-bold mt-1">
                        ₱{p.price.toFixed(2)}
                      </Text>

                      {(p as any).variantName ? (
                        <Text className="text-green-900 text-xs mt-0.5 font-semibold">
                          {(p as any).variantName}
                        </Text>
                      ) : null}

                      <Text className="text-gray-500 text-xs mt-0.5">
                        Total: {p.quantity} {p.unit?.replace(/^per\s+/i, "")}
                      </Text>

                    </View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={() =>
                      confirmRemove(farm.farmerId, p.docId!, p.name)
                    }
                    style={{ position: "absolute", top: 12, right: 0 }}
                  >
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={18}
                      color="#dc2626"
                    />
                  </TouchableOpacity>

                  <View className="flex-row items-center ml-2" style={{ marginTop: 50 }}>
                    <TouchableOpacity
                      onPress={() => decrementQty(farm.farmerId, p.docId!)}
                      className="w-7 h-7 rounded-[5px] items-center justify-center"
                      style={{ borderWidth: 1, borderColor: "#14532d" }}
                    >
                      <MaterialCommunityIcons name="minus" size={14} color="#14532d" />
                    </TouchableOpacity>

                    <Text className="mx-2 text-sm font-semibold text-gray-800">
                      {p.quantity}
                    </Text>

                    <TouchableOpacity
                      onPress={() => incrementQty(farm.farmerId, p.docId!)}
                      disabled={typeof stockMap[stockKeyOf(p)] !== "number" || p.quantity >= maxQtyOf(p as any, stockMap[stockKeyOf(p)] as number)}
                      className="w-7 h-7 rounded-[5px] items-center justify-center"
                      style={{
                        backgroundColor:
                          typeof stockMap[stockKeyOf(p)] !== "number" || p.quantity >= maxQtyOf(p as any, stockMap[stockKeyOf(p)] as number)
                            ? "#9ca3af"
                            : "#14532d",
                      }}
                    >
                      <MaterialCommunityIcons name="plus" size={14} color="white" />
                    </TouchableOpacity>
                  </View>

                </View>

              </View>
            ))}
          </View>
        )}
      />

      <View
        className="absolute left-0 right-0 bg-white border-t border-gray-200 flex-row items-stretch"
        style={{
          bottom: BUYER_TAB_BAR_HEIGHT + insets.bottom,
        }}
      >
        <View className="flex-1 justify-center px-4 py-5">
          <Text className="text-lg font-bold">
            Total: ₱{totalPrice.toFixed(2)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={async () => {
            if (!buyerId) {
              showToast("Buyer not logged in");
              return;
            }

            const stockIsEnough =
              await validateSelectedStockBeforeCheckout();

            if (!stockIsEnough) {
              return;
            }

            const itemsToCheckout = cartItems
              .map((farm) => ({
                farmerId: farm.farmerId,
                farmName: farm.farmName,
                products: farm.products.filter((p) =>
                  selectedItems.has(p.docId!)
                ),
              }))
              .filter((farm) => farm.products.length > 0);

            router.push({
              pathname: "/buyer/checkout",
              params: {
                items: JSON.stringify(itemsToCheckout),
                buyerId,
              },
            });
          }}
          disabled={checkingStock}
          className="bg-green-900 px-8 items-center justify-center"
        >
          <Text className="text-white font-bold">
            {checkingStock ? "Checking Stock..." : "Checkout"}
          </Text>
        </TouchableOpacity>
      </View>

      {removeTarget && (
        <View className="absolute inset-0 justify-center items-center bg-black/40">
          <View
            className="bg-white rounded-[10px] p-6 w-80"
            style={{ borderWidth: 1, borderColor: "#14532d" }}
          >
            <Text className="text-gray-800 text-lg font-semibold mb-2">
              Remove item
            </Text>
            <Text className="text-gray-500 text-sm mb-4">
              Remove {removeTarget.name} from your cart?
            </Text>

            <View className="flex-row justify-between mt-4">
              <TouchableOpacity
                className="bg-gray-200 px-4 py-2 rounded-[5px] flex-1 mr-2 items-center"
                onPress={() => setRemoveTarget(null)}
              >
                <Text className="text-gray-700 font-semibold">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="px-4 py-2 rounded-[5px] flex-1 ml-2 items-center"
                style={{ backgroundColor: "#dc2626" }}
                onPress={handleConfirmedRemove}
              >
                <Text className="text-white font-semibold">Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}