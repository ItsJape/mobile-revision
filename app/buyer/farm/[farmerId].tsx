// Farm shop screen with products and details.
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../FirebaseConfig";
import { checkSavedFarm, saveFarm, unsaveFarm } from "@/src/services/savedFarmService";
import { getFarmerProductNames } from "@/src/services/productService";
import ProductCard from "@/src/components/buyer/ProductCard";
import { ProductType } from "@/src/types/product";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useToast } from "@/src/context/ToastContext";
import { getUserFriendlyErrorMessage } from "@/src/utils/userFacingError";
import { getFarmerScreenBottomPadding } from "@/src/constants/farmerLayout";
import QRCode from "react-native-qrcode-svg";
import ViewShot from "react-native-view-shot";
import * as MediaLibrary from "expo-media-library";

const STATUS_BAR = Constants.statusBarHeight ?? 44;
const DARK_GREEN = "#14532d";

// The sort icons use Ionicons names, matching the icon set of the rest of this
// screen, instead of MaterialCommunityIcons.
const SORT_OPTIONS = [
  { label: "All", icon: "options-outline" },
  { label: "Highest Rated", icon: "star-outline" },
  { label: "Best Selling", icon: "flame-outline" },
];

const CATEGORY_OPTIONS = ["All", "Vegetables", "Fruits", "Egg & Poultry", "Rice & Grains"];

const FarmProfile = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { farmerId } = useLocalSearchParams<{ farmerId: string }>();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductType[]>([]);
  const [farmerUser, setFarmerUser] = useState<any>(null);
  const [buyerId, setBuyerId] = useState("");
  const [isFavorited, setIsFavorited] = useState(false);
  const [farmQrVisible, setFarmQrVisible] = useState(false);
  const [qrSaving, setQrSaving] = useState(false);
  const [qrSaved, setQrSaved] = useState(false);

  // Captures this farmer's QR card for saving to the buyer's gallery.
  const qrRef = useRef<any>(null);
  const farmQrValue = farmerId ? `client://farm/${farmerId}` : "";

  const [activeCategory, setActiveCategory] = useState("All");
  const [sortBy, setSortBy] = useState("All");
  const [sortDropdownVisible, setSortDropdownVisible] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const sortButtonRef = useRef<View>(null);

  // Measures the real on-screen position of the sort button so the dropdown, which
  // lives in a Modal outside the FlatList, can be placed right under it. This
  // avoids fighting the product grid over zIndex and elevation.
  const openSortDropdown = () => {
    sortButtonRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get("window").width;
      setDropdownPos({
        top: y + height + 6,
        right: screenWidth - (x + width),
      });
      setSortDropdownVisible(true);
    });
  };

  // Taken from the farmer's own products, which is the source of truth.
  const farmName = products[0]?.farmName || farmerUser?.farmName || "Farm";
  const farmerName = products[0]?.farmerName || farmerUser?.fullName || "";

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        if (!farmerId) return;

        const items = await getFarmerProductNames(farmerId, false);
        setProducts(items);

        // The cover photo lives in the users collection, which is where the rest of the
        // app reads profileImage from.
        const farmerDoc = await getDoc(doc(db, "users", farmerId));
        if (farmerDoc.exists()) {
          setFarmerUser(farmerDoc.data());
        }

        const userStr = await AsyncStorage.getItem("user");
        if (userStr) {
          const user = JSON.parse(userStr);
          const uid = user.uid || user.userId || user.id;
          setBuyerId(uid);
          const saved = await checkSavedFarm(uid, farmerId);
          setIsFavorited(saved);
        }
      } catch (e) {
        getUserFriendlyErrorMessage(e, "Load buyer farm profile");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [farmerId]);

  // Save or remove this farm from favorites.
  const toggleFavorite = async () => {
    if (!buyerId || !farmerId) return;
    try {
      if (isFavorited) {
        await unsaveFarm(buyerId, farmerId);
        setIsFavorited(false);
      } else {
        // The saved farm document uses the same field names that savedFarmService.ts
        // writes and the Saved Farms list on the home screen reads.
        await saveFarm({
          buyerId,
          farmerId,
          farmName: farmName,
          coverPhoto: farmerUser?.coverPhoto || "",
          municipality: farmerUser?.municipality || "",
          province: farmerUser?.province || "",
        });
        setIsFavorited(true);
      }
    } catch (e) {
      showToast(
        getUserFriendlyErrorMessage(
          e,
          "Save buyer favorite farm",
          "We couldn't update your saved farms. Please try again."
        )
      );
    }
  };

  // Saves the QR code for the currently viewed farmer to the buyer's gallery.
  const handleDownloadFarmQr = async () => {
    if (qrSaving) return;

    if (!farmerId || !qrRef.current) {
      showToast("The farm QR code is not ready. Please try again.");
      return;
    }

    try {
      setQrSaving(true);
      setQrSaved(false);

      const permission = await MediaLibrary.requestPermissionsAsync(true);

      if (!permission.granted) {
        showToast("Gallery permission denied. Allow photo access to save the QR code.");
        return;
      }

      const uri = await qrRef.current.capture();

      if (!uri) {
        throw new Error("Unable to capture the farm QR code.");
      }

      await MediaLibrary.saveToLibraryAsync(uri);

      // Visible inside the Modal, so it can't be covered by it.
      setQrSaved(true);
      showToast(`The QR code is successfully downloaded to your gallery.`);
    } catch (error) {
      showToast(
        getUserFriendlyErrorMessage(
          error,
          "Save farm QR code",
          "We couldn't save this farm QR code. Please check your gallery permission and try again."
        )
      );
    } finally {
      setQrSaving(false);
    }
  };

  const filteredProducts = products
    .filter((p) => activeCategory === "All" || p.category === activeCategory)
    .sort((a, b) => {
      switch (sortBy) {
        case "Highest Rated":
          return (b.rating || 0) - (a.rating || 0);
        case "Best Selling":
          return (b.totalSales || 0) - (a.totalSales || 0);
        default:
          return 0;
      }
    });

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color={DARK_GREEN} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fafafa" }}>
      <FlatList
        data={filteredProducts}
        keyExtractor={(item, index) => item.docId ?? index.toString()}
        numColumns={2}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: getFarmerScreenBottomPadding(insets.bottom),
        }}
        columnWrapperStyle={{ justifyContent: "space-between", paddingHorizontal: 14 }}
        ListHeaderComponent={
          <>
            {/* Farm cover photo with the back button on top of it. */}
            <View style={{ height: 200, position: "relative" }}>
              {farmerUser?.coverPhoto ? (
                <Image source={{ uri: farmerUser.coverPhoto }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              ) : (
                <View style={{ width: "100%", height: "100%", backgroundColor: "#f0fdf4" }} />
              )}
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.15)" }} />

              {/* Goes back to the previous screen. */}
              <TouchableOpacity
                onPress={() => router.back()}
                style={{
                  position: "absolute", top: STATUS_BAR + 8, left: 16,
                  width: 38, height: 38, borderRadius: 10,
                  backgroundColor: "rgba(255,255,255,0.88)",
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <Ionicons name="arrow-back" size={20} color={DARK_GREEN} />
              </TouchableOpacity>
            </View>

            {/* Rounded panel that holds the farm details. */}
            <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -20, padding: 18 }}>

              {/* Farm name with the save and sort controls. */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827", lineHeight: 24 }}>
                    {farmName}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                    <Ionicons name="location" size={13} color={DARK_GREEN} />
                    <Text style={{ fontSize: 12, color: "#6b7280" }}>
                      {[
                        farmerUser?.street,
                        farmerUser?.barangay,
                        farmerUser?.municipality,
                        farmerUser?.province,
                      ].filter(Boolean).join(", ") || "Location not set"}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: "/buyer/messages/ChatScreen",
                        params: {
                          farmerId,
                          farmerName: farmerName,
                          farmerProfileImage: farmerUser?.profileImage || "",
                        },
                      })
                    }
                    style={{
                      width: 38, height: 38, borderRadius: 20,
                      backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#dcfce7",
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Ionicons name="chatbubble-outline" size={17} color="#15803d" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setQrSaved(false);
                      setFarmQrVisible(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="View and download farm QR code"
                    style={{
                      width: 38, height: 38, borderRadius: 20,
                      backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#dcfce7",
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Ionicons name="qr-code-outline" size={18} color={DARK_GREEN} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={toggleFavorite}
                    style={{
                      width: 38, height: 38, borderRadius: 20,
                      backgroundColor: isFavorited ? "#fff1f2" : "#f9fafb",
                      borderWidth: 1, borderColor: isFavorited ? "#ffe4e6" : "#f3f4f6",
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name={isFavorited ? "heart" : "heart-outline"}
                      size={17}
                      color={isFavorited ? "#ef4444" : "#9ca3af"}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: "#f3f4f6", marginBottom: 14 }} />

              {/* Only rendered when the farmer wrote an about section. */}
              {farmerUser?.about ? (
                <>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 6 }}>
                    About Farm
                  </Text>
                  <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: 20, marginBottom: 14 }}>
                    {farmerUser.about}
                  </Text>
                </>
              ) : null}

              {/* Name, location, and rating of the farmer. */}
              <View style={{
                backgroundColor: "#f9fafb", borderRadius: 5, padding: 12,
                flexDirection: "row", alignItems: "center",
                justifyContent: "space-between", marginBottom: 16,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, overflow: "hidden", backgroundColor: "#f0fdf4" }}>
                    {farmerUser?.profileImage ? (
                      <Image source={{ uri: farmerUser.profileImage }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="person" size={20} color={DARK_GREEN} />
                      </View>
                    )}
                  </View>
                  <View>
                    <Text style={{ fontSize: 11, color: "#9ca3af", fontWeight: "600" }}>Farmer</Text>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#111827" }}>
                      {farmerName || "—"}
                    </Text>
                  </View>
                </View>

                <Text style={{ fontSize: 11, fontWeight: "700", color: DARK_GREEN }}>Owner</Text>
              </View>

              <View style={{ height: 1, backgroundColor: "#f3f4f6", marginBottom: 14 }} />

              {/* Heading and sort control share one row. */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#111827" }}>
                  Our Products
                </Text>

                <TouchableOpacity
                  ref={sortButtonRef}
                  onPress={() => (sortDropdownVisible ? setSortDropdownVisible(false) : openSortDropdown())}
                  className="flex-row items-center bg-white px-3 py-1.5 rounded-full"
                >
                  <Ionicons name="swap-vertical" size={14} color="#6b7280" />
                  <Text className="text-gray-500 text-xs font-semibold ml-1">
                    Sort: {sortBy}
                  </Text>
                  <Ionicons
                    name={sortDropdownVisible ? "chevron-up" : "chevron-down"}
                    size={12}
                    color="#6b7280"
                    style={{ marginLeft: 2 }}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
              >
                {CATEGORY_OPTIONS.map((cat) => {
                  const active = activeCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setActiveCategory(cat)}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                        backgroundColor: active ? DARK_GREEN : "#f3f4f6",
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "600", color: active ? "white" : "#6b7280" }}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🌿</Text>
            <Text style={{ color: "#6b7280", fontWeight: "600" }}>No products yet</Text>
          </View>
        }
        renderItem={({ item }) => <ProductCard item={item} />}
      />

      {/* The dropdown lives in a Modal so it always sits above the product grid
          regardless of FlatList stacking, and tap-outside-to-close comes for
          free. */}
      <Modal
        visible={sortDropdownVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSortDropdownVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{ flex: 1 }}
          onPress={() => setSortDropdownVisible(false)}
        >
          <View
            className="absolute bg-white rounded-[14px] py-1.5"
            style={{
              top: dropdownPos.top,
              right: dropdownPos.right,
              width: 180,
              overflow: "hidden",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 10,
              elevation: 8,
            }}
          >
            {SORT_OPTIONS.map((opt) => {
              const active = sortBy === opt.label;
              return (
                <TouchableOpacity
                  key={opt.label}
                  onPress={() => {
                    setSortBy(opt.label);
                    setSortDropdownVisible(false);
                  }}
                  className={`flex-row items-center justify-between px-3.5 py-2.5 ${
                    active ? "bg-green-50" : ""
                  }`}
                >
                  <View className="flex-row items-center gap-2">
                    <Ionicons
                      name={opt.icon as any}
                      size={16}
                      color={active ? "#14532d" : "#6b7280"}
                    />
                    <Text
                      className={`text-xs font-semibold ${
                        active ? "text-green-900" : "text-gray-700"
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={16} color="#14532d" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Farmer-specific QR code. Buyers can view and save it to their gallery. */}
      <Modal
        visible={farmQrVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFarmQrVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 380,
              borderRadius: 18,
              backgroundColor: "white",
              padding: 22,
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: "100%",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>
                {farmName} QR Code
              </Text>
              <TouchableOpacity
                onPress={() => setFarmQrVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close farm QR code"
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text
              style={{
                color: "#6b7280",
                fontSize: 13,
                textAlign: "center",
                lineHeight: 19,
                marginBottom: 18,
              }}
            >
              Scan this code to open this farmer's public farm page.
            </Text>

            <ViewShot
              ref={qrRef}
              options={{ format: "png", quality: 1 }}
            >
              <View
                style={{
                  backgroundColor: "white",
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                  borderRadius: 12,
                  padding: 18,
                  alignItems: "center",
                }}
              >
                <QRCode value={farmQrValue} size={220} />
                <Text
                  style={{
                    marginTop: 12,
                    fontSize: 15,
                    fontWeight: "700",
                    color: DARK_GREEN,
                    textAlign: "center",
                  }}
                >
                  {farmName}
                </Text>
                <Text
                  style={{
                    marginTop: 3,
                    fontSize: 11,
                    color: "#6b7280",
                    textAlign: "center",
                  }}
                >
                  FarmGate
                </Text>
              </View>
            </ViewShot>

            <TouchableOpacity
              onPress={handleDownloadFarmQr}
              disabled={qrSaving}
              accessibilityRole="button"
              accessibilityLabel="Download farm QR code"
              className="mt-5 w-full flex-row items-center justify-center rounded-xl py-3.5"
              style={{ backgroundColor: DARK_GREEN, opacity: qrSaving ? 0.7 : 1 }}
            >
              {qrSaving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons
                  name={qrSaved ? "checkmark-circle" : "download-outline"}
                  size={19}
                  color="white"
                />
              )}
              <Text className="ml-2 font-semibold text-white">
                {qrSaving ? "Saving..." : qrSaved ? "Saved to Gallery" : "Download QR Code"}
              </Text>
            </TouchableOpacity>

            {qrSaved ? (
              <View
                style={{
                  marginTop: 10,
                  width: "100%",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  backgroundColor: "#f0fdf4",
                  borderWidth: 1,
                  borderColor: "#dcfce7",
                  borderRadius: 10,
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                }}
              >
                <Ionicons name="checkmark-circle" size={16} color="#15803d" />
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#15803d", flexShrink: 1 }}>
                  Na-download na ang QR Code at na-save na sa iyong gallery.
                </Text>
              </View>
            ) : null}

            <Text
              style={{
                marginTop: 10,
                fontSize: 10,
                color: "#9ca3af",
                textAlign: "center",
              }}
            >
              The QR code is specific to this farmer's farm profile.
            </Text>
          </View>
        </View>
      </Modal>

    </View>
  );
};

export default FarmProfile;