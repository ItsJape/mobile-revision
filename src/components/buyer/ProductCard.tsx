// One product tile in a grid: photo, farm, rating, sales, and price.
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import type { ProductType } from "@/src/types/product";

const IMG_HEIGHT = 140;

type Props = {
  item: ProductType;
  salesCount?: number;
  salesLabel?: string;
};

// Opens the product detail screen when the tile is tapped.
export default function ProductCard({
  item,
  salesCount,
  salesLabel = "sold",
}: Props) {
  const router = useRouter();

  // The tile shows the cheapest variant that can still be bought. When the
  // variants have different prices, the price is labelled "From".
  const variants = item.variants ?? [];
  const sellable = variants.filter(
    (v) => Number(v.stock) > 0 && v.status === "Available"
  );
  const shown = sellable.length > 0 ? sellable : variants;
  const cheapest =
    shown.length > 0
      ? shown.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a))
      : null;

  const price = cheapest ? Number(cheapest.price) : Number(item.price || 0);
  const unit = cheapest?.unit || item.unit || "";
  const hasPriceRange = shown.some((v) => Number(v.price) !== price);

  const outOfStock =
    variants.length > 0 ? sellable.length === 0 : (item.stock || 0) <= 0;
  const hasRating = (item.totalReviews || 0) > 0;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() =>
        router.push({ pathname: "/buyer/products/[id]", params: { id: item.docId } })
      }
      className="w-[48%] bg-white rounded-2xl mb-3 overflow-hidden border border-gray-100"
    >
      <View style={{ height: IMG_HEIGHT }}>
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        ) : (
          <View className="flex-1 bg-green-50 items-center justify-center">
            <Ionicons name="leaf-outline" size={30} color="#86efac" />
          </View>
        )}

        {/* Dark overlay so the out of stock label stays readable. */}
        {outOfStock && (
          <View
            className="absolute inset-0 items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          >
            <Text className="text-white font-bold text-xs">Out of stock</Text>
          </View>
        )}
      </View>

      <View className="flex-row px-2.5 py-2" style={{ minHeight: 72 }}>
        <View className="flex-1 pr-1.5">
          <Text
            className="text-gray-900 font-bold text-xs"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.name}
          </Text>
          <Text
            className="text-gray-400 text-[10px] mt-0.5"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.farmName}
          </Text>

          {/* Fixed height keeps a row of cards aligned whether or not a product has ratings. */}
          <View style={{ height: 14, marginTop: 3 }} className="flex-row items-center">
            {hasRating && (
              <>
                <Ionicons name="star" size={9} color="#f59e0b" />
                <Text className="text-[9px] text-gray-600 font-semibold ml-0.5">
                  {item.rating.toFixed(1)}
                </Text>
                <Text className="text-[9px] text-gray-300 mx-1">·</Text>
              </>
            )}
            <Text className="text-[9px] text-gray-400">
              {salesCount ?? item.totalSales ?? 0} {salesLabel}
            </Text>
          </View>
        </View>

        <View className="items-end justify-start pt-0.5">
          {hasPriceRange && (
            <Text className="text-gray-400 text-[9px]">From</Text>
          )}
          <Text className="text-green-900 font-black text-xs">
            ₱{price.toFixed(2)}
          </Text>
          <Text className="text-gray-400 text-[9px] mt-0.5">/{unit}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}