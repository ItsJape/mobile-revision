// Farmer Add Product Modal with multiple variants.
// No batches, harvest records, or batch selection.

import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { doc, getDoc } from "firebase/firestore";

import { db } from "../../../FirebaseConfig";

import type {
  CreateProductInput,
  ProductType,
  ProductVariant,
} from "../../../src/types/product";

import { getFarmerProductNames } from "../../../src/services/productService";

import {
  getProductVideoValidationError,
  MAX_PRODUCT_IMAGES,
} from "@/src/constants/productMedia";

import {
  CATEGORIES,
  PRODUCT_CATALOG,
  ProductCategoryKey,
  normalizeProductName,
  toCanonicalKey,
  getUnitsForProduct,
  isEggProduct,
  isHalfTrayUnit,
  isFullTrayUnit,
  EGG_HALF_PCS,
  EGG_FULL_PCS,
} from "@/src/constants/productCatalog";

import { getUserFriendlyErrorMessage } from "@/src/utils/userFacingError";

// Department of Agriculture market price reference.
type DaPriceReference = {
  price: number;
  unit: string;
  source?: string;
  sourceUrl?: string;
  lastUpdated?: any;
};

type VariantDraft = {
  key: string;
  name: string;
  unit: string;
  price: string;
  stock: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (input: CreateProductInput) => Promise<void>;
  loading: boolean;
  farmerId: string;
  farmerName: string;
  farmName: string;
};

type DropdownProps = {
  label: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  placeholder?: string;
};

// Generates a temporary unique key for the variant form.
const createVariantDraft = (unit = "per kg"): VariantDraft => ({
  key: `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: "",
  unit,
  price: "",
  stock: "",
});

// Converts the DA canonical product key to its Firestore document ID.
const canonicalToDocId = (canonicalKey: string): string => {
  const key = canonicalKey.trim().toLowerCase();

  if (key === "duck") return "itik";

  return key.replace(/\s+/g, "-");
};

const normalizePriceUnit = (unit: string): string =>
  String(unit || "").trim().toLowerCase().replace(/\s+/g, " ");

const isPcUnit = (unit: string): boolean => {
  const value = normalizePriceUnit(unit);

  return [
    "pc",
    "pcs",
    "per pc",
    "per pcs",
    "piece",
    "pieces",
    "per piece",
    "piraso",
  ].includes(value);
};

const isTrayPriceUnit = (unit: string): boolean => {
  const value = normalizePriceUnit(unit);

  return [
    "tray",
    "per tray",
    "full tray",
    "per full tray",
  ].includes(value);
};

// Converts a DA egg reference to the selected selling unit.
const adjustDaPriceForUnit = (
  productName: string,
  farmerUnit: string,
  daPrice: DaPriceReference | null
): DaPriceReference | null => {
  if (!daPrice || !isEggProduct(productName)) return daPrice;

  const referenceUnit = normalizePriceUnit(daPrice.unit);

  if (
    isHalfTrayUnit(farmerUnit) &&
    isTrayPriceUnit(referenceUnit)
  ) {
    return {
      ...daPrice,
      price: Math.round(daPrice.price / 2),
      unit: "half tray",
    };
  }

  if (isPcUnit(referenceUnit)) {
    if (isFullTrayUnit(farmerUnit)) {
      return {
        ...daPrice,
        price: Math.round(daPrice.price * 30),
        unit: "per tray",
      };
    }

    if (isHalfTrayUnit(farmerUnit)) {
      return {
        ...daPrice,
        price: Math.round(daPrice.price * 15),
        unit: "half tray",
      };
    }
  }

  return daPrice;
};

// Reusable dropdown.
const Dropdown = ({
  label,
  value,
  options,
  onSelect,
  placeholder,
}: DropdownProps) => {
  const [open, setOpen] = useState(false);

  return (
    <View className="mb-4">
      <Text className="mb-1 text-xs text-gray-500">
        {label}
      </Text>

      <TouchableOpacity
        onPress={() => setOpen((current) => !current)}
        disabled={options.length === 0}
        className={`flex-row items-center justify-between rounded-[10px] border border-gray-300 px-4 py-3 ${
          options.length === 0 ? "bg-gray-200" : "bg-gray-100"
        }`}
      >
        <Text className={value ? "text-black" : "text-gray-400"}>
          {value || placeholder || `Select ${label.toLowerCase()}`}
        </Text>

        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color="#374151"
        />
      </TouchableOpacity>

      {open && (
        <View className="mt-1 max-h-56 overflow-hidden rounded-[10px] border border-gray-300 bg-white">
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {options.map((option) => (
              <TouchableOpacity
                key={option}
                onPress={() => {
                  onSelect(option);
                  setOpen(false);
                }}
                className={`px-4 py-3 ${
                  option === value ? "bg-[#14532d]" : "bg-white"
                }`}
              >
                <Text
                  className={
                    option === value ? "text-white" : "text-black"
                  }
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const AddProductModal = ({
  visible,
  onClose,
  onSave,
  loading,
  farmerId,
  farmerName,
  farmName,
}: Props) => {
  const [existingProducts, setExistingProducts] = useState<ProductType[]>([]);

  const [category, setCategory] =
    useState<ProductCategoryKey>("Vegetables");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [images, setImages] = useState<string[]>([]);
  const [video, setVideo] = useState("");

  const [variants, setVariants] = useState<VariantDraft[]>([
    createVariantDraft("per kg"),
  ]);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [duplicateProduct, setDuplicateProduct] =
    useState<ProductType | null>(null);

  const [archivedDuplicate, setArchivedDuplicate] =
    useState<ProductType | null>(null);

  // Department of Agriculture suggested price.
  const [daPrice, setDaPrice] = useState<DaPriceReference | null>(null);
  const [daPriceRaw, setDaPriceRaw] = useState<DaPriceReference | null>(null);
  const [daLoading, setDaLoading] = useState(false);

  // Egg price calculator.
  const [eggCalcPc, setEggCalcPc] = useState("");

  const previewPlayer = useVideoPlayer(video || null, (player) => {
    player.loop = false;
  });

  const { isPlaying: isPreviewPlaying } = useEvent(
    previewPlayer,
    "playingChange",
    { isPlaying: previewPlayer.playing }
  );

  const firstUnit =
    variants[0]?.unit ||
    getUnitsForProduct(category, name || undefined)[0] ||
    "per kg";

  const productNameOptions = PRODUCT_CATALOG[category] || [];

  const unitOptions = getUnitsForProduct(
    category,
    name || undefined
  );

  const firstVariantPrice = Number(variants[0]?.price || 0);

  // Load existing products to prevent duplicate listings.
  useEffect(() => {
    if (!visible || !farmerId) return;

    let cancelled = false;

    const loadProducts = async () => {
      try {
        const products = await getFarmerProductNames(farmerId, true);

        if (!cancelled) {
          setExistingProducts(products);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            getUserFriendlyErrorMessage(
              err,
              "Load farmer products",
              "Unable to check your existing products."
            )
          );
        }
      }
    };

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, [visible, farmerId]);

  // Reset the selected product whenever the category changes.
  useEffect(() => {
    setName("");
    setDescription("");
    setVariants([
      createVariantDraft(
        getUnitsForProduct(category)[0] || "per kg"
      ),
    ]);
    setDaPrice(null);
    setDaPriceRaw(null);
    setEggCalcPc("");
    setDuplicateProduct(null);
    setArchivedDuplicate(null);
    setNotice("");
  }, [category]);

  // Validate product name and check existing listings.
  useEffect(() => {
    if (!name) {
      setDuplicateProduct(null);
      setArchivedDuplicate(null);
      setNotice("");
      return;
    }

    const target = normalizeProductName(name);

    const match = existingProducts.find(
      (product) =>
        normalizeProductName(product.name) === target &&
        product.category === category
    );

    if (!match) {
      setDuplicateProduct(null);
      setArchivedDuplicate(null);
      setNotice("");
      return;
    }

    if (match.archived) {
      setArchivedDuplicate(match);
      setDuplicateProduct(null);
      setNotice("");
    } else {
      setDuplicateProduct(match);
      setArchivedDuplicate(null);
      setNotice("");
    }
  }, [name, category, existingProducts]);

  // Look up the latest DA reference price.
  useEffect(() => {
    if (!name) {
      setDaPrice(null);
      setDaPriceRaw(null);
      setDaLoading(false);
      return;
    }

    const canonicalKey = toCanonicalKey(name);

    if (!canonicalKey) {
      setDaPrice(null);
      setDaPriceRaw(null);
      return;
    }

    let cancelled = false;

    const loadDaPrice = async () => {
      try {
        setDaLoading(true);
        setDaPrice(null);
        setDaPriceRaw(null);

        const documentId = canonicalToDocId(canonicalKey);
        const snap = await getDoc(
          doc(db, "da_price_reference", documentId)
        );

        if (cancelled) return;

        if (!snap.exists()) {
          setDaPrice(null);
          setDaPriceRaw(null);
          return;
        }

        const data = snap.data();

        const rawPrice = Number(data.price);

        if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
          setDaPrice(null);
          setDaPriceRaw(null);
          return;
        }

        const reference: DaPriceReference = {
          price: rawPrice,
          unit: String(data.unit || "kg").trim() || "kg",
          source: data.source,
          sourceUrl: data.sourceUrl,
          lastUpdated: data.lastUpdated,
        };

        setDaPriceRaw(reference);
        setDaPrice(
          adjustDaPriceForUnit(name, firstUnit, reference)
        );
      } catch (err) {
        console.log("LOAD DA PRICE ERROR:", err);

        if (!cancelled) {
          setDaPrice(null);
          setDaPriceRaw(null);
        }
      } finally {
        if (!cancelled) setDaLoading(false);
      }
    };

    loadDaPrice();

    return () => {
      cancelled = true;
    };
  }, [name, firstUnit]);

  // Updates one field of one variant.
  const updateVariantField = (
    key: string,
    field: keyof VariantDraft,
    value: string
  ) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.key === key
          ? { ...variant, [field]: value }
          : variant
      )
    );
  };

  // Adds another variant row.
  const addVariant = () => {
    setVariants((current) => [
      ...current,
      createVariantDraft(firstUnit),
    ]);
    setError("");
  };

  // Removes a variant row. At least one variant must remain.
  const removeVariant = (key: string) => {
    if (variants.length <= 1) return;

    setVariants((current) =>
      current.filter((variant) => variant.key !== key)
    );
  };

  // Image picker.
  const pickImages = async () => {
    const remainingSlots = MAX_PRODUCT_IMAGES - images.length;

    if (remainingSlots <= 0) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
      });

      if (!result.canceled && result.assets?.length) {
        setError("");

        setImages((current) =>
          [...current, ...result.assets.map((asset) => asset.uri).filter(Boolean)]
            .slice(0, MAX_PRODUCT_IMAGES)
        );
      }
    } catch (err) {
      setError(
        getUserFriendlyErrorMessage(
          err,
          "Select product images",
          "Unable to select product images."
        )
      );
    }
  };

  // Video picker.
  const pickVideo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        videoMaxDuration: 20,
        quality: 0.5,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const validationError = getProductVideoValidationError(asset);

      if (validationError) {
        setError(validationError);
        return;
      }

      setError("");
      setVideo(asset.uri);
    } catch (err) {
      setError(
        getUserFriendlyErrorMessage(
          err,
          "Select product video",
          "Unable to select product video."
        )
      );
    }
  };

  // Validates decimal price input.
  const handlePriceChange = (
    key: string,
    text: string
  ) => {
    if (/^\d*\.?\d*$/.test(text)) {
      updateVariantField(key, "price", text);
    }
  };

  // Stock must be a whole number.
  const handleStockChange = (
    key: string,
    text: string
  ) => {
    if (/^\d*$/.test(text)) {
      updateVariantField(key, "stock", text);
    }
  };

  // DA price warning is based on the first variant.
  const priceExceedsDaSuggestion =
    daPrice !== null &&
    variants[0]?.price !== "" &&
    Number.isFinite(firstVariantPrice) &&
    firstVariantPrice > daPrice.price;

  // DA estimate when the reference is priced per egg.
  const eggTraySuggestion =
    daPriceRaw !== null &&
    isPcUnit(daPriceRaw.unit) &&
    isEggProduct(name)
      ? {
          perPc: daPriceRaw.price,
          halfTray: Math.round(daPriceRaw.price * 15),
          fullTray: Math.round(daPriceRaw.price * 30),
        }
      : null;

  // Egg price calculator.
  const eggCalcPcValue = Number(eggCalcPc);

  const eggCalcResult =
    isEggProduct(name) &&
    eggCalcPc !== "" &&
    Number.isFinite(eggCalcPcValue) &&
    eggCalcPcValue > 0
      ? {
          halfTray: Math.round(eggCalcPcValue * 15),
          fullTray: Math.round(eggCalcPcValue * 30),
        }
      : null;

  // Applies the calculated full tray price to the first variant.
  const applyEggCalculator = () => {
    if (!eggCalcResult || !variants[0]) return;

    updateVariantField(
      variants[0].key,
      "price",
      String(eggCalcResult.fullTray)
    );
  };

  // Checks every variant before enabling Save.
  const variantNames = variants.map((variant) =>
    normalizeProductName(variant.name)
  );

  const hasDuplicateVariantNames =
    new Set(variantNames).size !== variantNames.length;

  const variantsValid =
    variants.length > 0 &&
    !hasDuplicateVariantNames &&
    variants.every((variant) => {
      const price = Number(variant.price);
      const stock = Number(variant.stock);

      return (
        variant.name.trim() !== "" &&
        variant.unit.trim() !== "" &&
        variant.price.trim() !== "" &&
        Number.isFinite(price) &&
        price >= 0 &&
        variant.stock.trim() !== "" &&
        Number.isInteger(stock) &&
        stock >= 0
      );
    });

  const isFormValid =
    !duplicateProduct &&
    !archivedDuplicate &&
    name.trim() !== "" &&
    category.trim() !== "" &&
    description.trim() !== "" &&
    variantsValid &&
    (images.length > 0 || video !== "");

  // Resets all form fields.
  const resetForm = () => {
    setCategory("Vegetables");
    setName("");
    setDescription("");
    setImages([]);
    setVideo("");
    setVariants([createVariantDraft("per kg")]);
    setError("");
    setNotice("");
    setDuplicateProduct(null);
    setArchivedDuplicate(null);
    setDaPrice(null);
    setDaPriceRaw(null);
    setDaLoading(false);
    setEggCalcPc("");

    previewPlayer.pause();
  };

  // Creates a new product with all its initial variants.
  const handleSave = async () => {
    if (archivedDuplicate) {
      setError(
        `You already have an archived "${archivedDuplicate.name}". Unarchive it before creating another listing.`
      );
      return;
    }

    if (duplicateProduct) {
      setError(
        `"${duplicateProduct.name}" already exists. Open that product and add its variants instead.`
      );
      return;
    }

    if (!isFormValid) {
      setError(
        hasDuplicateVariantNames
          ? "Each variant must have a different name."
          : "Please complete all product and variant fields."
      );
      return;
    }

    if (!farmerId) {
      setError("Farmer information is missing. Please log in again.");
      return;
    }

    setError("");

    const productVariants: ProductVariant[] = variants.map(
      (variant) => {
        const stock = Number(variant.stock);

        return {
          id: "",
          name: variant.name.trim(),
          unit: variant.unit,
          price: Number(variant.price),
          stock,
          status: stock > 0 ? "Available" : "Out of Stock",
          createdAt: Date.now(),
        };
      }
    );

    const availableVariants = productVariants.filter(
      (variant) =>
        variant.status === "Available" &&
        variant.stock > 0
    );

    const productPriceSource =
      availableVariants.length > 0
        ? availableVariants
        : productVariants;

    const input: CreateProductInput = {
      name: name.trim(),
      category,
      unit: productVariants[0].unit,
      description: description.trim(),

      image: images[0] || "",
      imagePublicId: "",
      images,
      imagePublicIds: images.map(() => ""),

      video,
      videoPublicId: "",

      farmerId,
      farmerName,
      farmName,

      variants: productVariants,

      price: Math.min(
        ...productPriceSource.map((variant) => variant.price)
      ),

      stock: availableVariants.reduce(
        (sum, variant) => sum + variant.stock,
        0
      ),

      status:
        availableVariants.length > 0
          ? "Available"
          : "Out of Stock",

      rating: 0,
      totalReviews: 0,
      totalSales: 0,
      weeklySales: 0,
      monthlySales: 0,

      createdAt: Date.now(),
      archived: false,
    };

    try {
      await onSave(input);
      resetForm();
      onClose();
    } catch (err) {
      setError(
        getUserFriendlyErrorMessage(
          err,
          "Save farmer product",
          "We couldn't create this product right now. Please try again."
        )
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center bg-black/40 px-6">
        <View className="max-h-[90%] rounded-[10px] bg-white p-5">
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View className="mb-3 flex-row items-center">
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-[10px] bg-green-50">
                <Ionicons
                  name="add-circle-outline"
                  size={22}
                  color="#14532d"
                />
              </View>

              <View>
                <Text className="text-lg font-bold text-gray-900">
                  Add Product
                </Text>
                <Text className="text-xs text-gray-500">
                  Create a product with multiple variants.
                </Text>
              </View>
            </View>

            {error ? (
              <View className="mb-3 rounded-[10px] border border-red-100 bg-red-50 px-3 py-2">
                <Text className="text-sm text-red-600">
                  {error}
                </Text>
              </View>
            ) : null}

            {/* Archived duplicate warning */}
            {archivedDuplicate ? (
              <View className="mb-4 rounded-[10px] border border-orange-300 bg-orange-50 px-4 py-3">
                <Text className="mb-1 text-xs font-semibold text-orange-700">
                  Archived Product Already Exists
                </Text>

                <Text className="text-xs text-orange-700">
                  "{archivedDuplicate.name}" is already archived.
                  Unarchive the existing product before creating a new listing.
                </Text>
              </View>
            ) : null}

            {/* Active duplicate warning */}
            {duplicateProduct ? (
              <View className="mb-4 rounded-[10px] border border-blue-200 bg-blue-50 px-4 py-3">
                <Text className="mb-1 text-xs font-semibold text-blue-800">
                  Product Already Exists
                </Text>

                <Text className="text-xs text-blue-700">
                  You already have "{duplicateProduct.name}".
                  Open its Edit Product screen to add another variant.
                  Do not create another listing for the same product.
                </Text>
              </View>
            ) : null}

            {/* Category */}
            <Dropdown
              label="CATEGORY"
              value={category}
              options={[...CATEGORIES]}
              onSelect={(value) =>
                setCategory(value as ProductCategoryKey)
              }
            />

            {/* Product name */}
            <Dropdown
              label="PRODUCT NAME"
              value={name}
              options={productNameOptions}
              onSelect={setName}
              placeholder="Select product"
            />

            {/* Description */}
            <Text className="mb-1 text-xs text-gray-500">
              DESCRIPTION
            </Text>

            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="Describe product..."
              textAlignVertical="top"
              className="mb-4 h-24 rounded-[10px] border border-gray-300 bg-gray-100 px-4 py-3 text-gray-800"
            />

            {/* Variants section */}
            <View className="mb-3 mt-1 flex-row items-center justify-between">
              <View>
                <Text className="text-sm font-bold text-gray-900">
                  PRODUCT VARIANTS
                </Text>
                <Text className="mt-1 text-[10px] text-gray-500">
                  Set a different price and stock for each option.
                </Text>
              </View>

              <View className="rounded-full bg-green-50 px-3 py-1">
                <Text className="text-xs font-semibold text-[#14532d]">
                  {variants.length} variant{variants.length === 1 ? "" : "s"}
                </Text>
              </View>
            </View>

            {variants.map((variant, index) => (
              <View
                key={variant.key}
                className="mb-3 rounded-[10px] border border-gray-200 bg-gray-50 p-3"
              >
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="text-sm font-bold text-gray-800">
                    Variant {index + 1}
                  </Text>

                  {variants.length > 1 ? (
                    <TouchableOpacity
                      accessibilityLabel={`Remove variant ${index + 1}`}
                      onPress={() => removeVariant(variant.key)}
                      className="flex-row items-center"
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color="#dc2626"
                      />
                      <Text className="ml-1 text-xs text-red-600">
                        Remove
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Variant name */}
                <Text className="mb-1 text-xs text-gray-500">
                  VARIANT NAME / SIZE
                </Text>

                <TextInput
                  value={variant.name}
                  onChangeText={(value) =>
                    updateVariantField(
                      variant.key,
                      "name",
                      value
                    )
                  }
                  placeholder="Example: Small, Medium, Large"
                  className="mb-3 rounded-[10px] border border-gray-300 bg-white px-4 py-3 text-gray-800"
                />

                {/* Variant unit */}
                <Dropdown
                  label="UNIT"
                  value={variant.unit}
                  options={unitOptions}
                  onSelect={(value) =>
                    updateVariantField(
                      variant.key,
                      "unit",
                      value
                    )
                  }
                />

                {/* Price and stock */}
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Text className="mb-1 text-xs text-gray-500">
                      PRICE (₱)
                    </Text>

                    <TextInput
                      value={variant.price}
                      onChangeText={(value) =>
                        handlePriceChange(variant.key, value)
                      }
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      className="rounded-[10px] border border-gray-300 bg-white px-3 py-3 text-gray-800"
                    />
                  </View>

                  <View className="flex-1">
                    <Text className="mb-1 text-xs text-gray-500">
                      STOCK ({variant.unit})
                    </Text>

                    <TextInput
                      value={variant.stock}
                      onChangeText={(value) =>
                        handleStockChange(variant.key, value)
                      }
                      keyboardType="numeric"
                      placeholder="0"
                      className="rounded-[10px] border border-gray-300 bg-white px-3 py-3 text-gray-800"
                    />
                  </View>
                </View>

                <View className="mt-2 flex-row items-center">
                  <Ionicons
                    name={
                      Number(variant.stock) > 0
                        ? "checkmark-circle"
                        : "alert-circle"
                    }
                    size={14}
                    color={
                      Number(variant.stock) > 0
                        ? "#15803d"
                        : "#d97706"
                    }
                  />

                  <Text
                    className={`ml-1 text-[10px] ${
                      Number(variant.stock) > 0
                        ? "text-green-700"
                        : "text-orange-600"
                    }`}
                  >
                    {Number(variant.stock) > 0
                      ? "Available"
                      : "Out of Stock"}
                  </Text>
                </View>
              </View>
            ))}

            {/* Add another variant */}
            <TouchableOpacity
              onPress={addVariant}
              className="mb-5 flex-row items-center justify-center rounded-[10px] border border-dashed border-[#14532d] py-3"
            >
              <Ionicons
                name="add-circle-outline"
                size={18}
                color="#14532d"
              />

              <Text className="ml-2 text-xs font-semibold text-[#14532d]">
                Add Another Variant
              </Text>
            </TouchableOpacity>

            {/* Egg calculator */}
            {isEggProduct(name) ? (
              <View className="mb-3 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3">
                <Text className="mb-1 text-xs font-semibold text-amber-800">
                  Egg Calculator
                </Text>

                <Text className="mb-1 text-xs text-gray-500">
                  PRICE PER EGG (₱)
                </Text>

                <TextInput
                  value={eggCalcPc}
                  onChangeText={(value) => {
                    if (/^\d*\.?\d*$/.test(value)) {
                      setEggCalcPc(value);
                    }
                  }}
                  keyboardType="decimal-pad"
                  placeholder="Example: 8.50"
                  className="mb-2 rounded-[10px] border border-gray-300 bg-white px-4 py-2 text-gray-800"
                />

                {eggCalcResult ? (
                  <View>
                    <Text className="text-xs text-amber-800">
                      Half tray (15 eggs): ₱{eggCalcResult.halfTray.toLocaleString()}
                      {"\n"}
                      Full tray (30 eggs): ₱{eggCalcResult.fullTray.toLocaleString()}
                    </Text>

                    <TouchableOpacity
                      onPress={applyEggCalculator}
                      className="mt-2 items-center rounded-[5px] bg-[#14532d] py-3"
                    >
                      <Text className="text-xs font-semibold text-white">
                        Use ₱{eggCalcResult.fullTray.toLocaleString()} for first variant
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text className="text-[10px] text-gray-400">
                    Enter the price per egg to calculate half and full tray prices.
                  </Text>
                )}
              </View>
            ) : null}

            {/* DA price loading */}
            {daLoading && name ? (
              <View className="mb-3 rounded-[10px] border border-gray-200 bg-gray-50 px-4 py-3">
                <View className="flex-row items-center">
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text className="ml-2 text-xs text-gray-500">
                    Fetching the latest DA market reference...
                  </Text>
                </View>
              </View>
            ) : null}

            {/* DA suggested price */}
            {!daLoading && daPrice ? (
              <View className="mb-3 rounded-[10px] border border-blue-200 bg-blue-50 px-4 py-3">
                <View className="mb-1 flex-row items-center">
                  <Ionicons
                    name="information-circle"
                    size={16}
                    color="#1D4ED8"
                  />

                  <Text className="ml-1 text-xs font-semibold text-blue-800">
                    Suggested Market Price (DA)
                  </Text>
                </View>

                <Text className="mb-1 text-sm text-blue-800">
                  ₱{daPrice.price.toLocaleString()} per {daPrice.unit}
                </Text>

                {eggTraySuggestion ? (
                  <View className="mt-2 rounded-[8px] bg-blue-100/60 px-3 py-2">
                    <Text className="mb-1 text-xs font-semibold text-blue-800">
                      Tray estimate based on ₱{eggTraySuggestion.perPc} per egg:
                    </Text>

                    <Text className="text-xs text-blue-800">
                      Half tray: ₱{eggTraySuggestion.halfTray.toLocaleString()}
                      {"\n"}
                      Full tray: ₱{eggTraySuggestion.fullTray.toLocaleString()}
                    </Text>
                  </View>
                ) : null}

                <Text className="text-[10px] text-blue-600">
                  This is only a Department of Agriculture reference
                  {daPrice.lastUpdated?.toDate
                    ? ` (updated ${daPrice.lastUpdated.toDate().toLocaleDateString()})`
                    : ""}
                  . You are free to set your own selling prices.
                </Text>
              </View>
            ) : null}

            {name && !daLoading && !daPrice ? (
              <View className="mb-3 rounded-[10px] border border-gray-200 bg-gray-50 px-4 py-3">
                <Text className="text-xs text-gray-500">
                  There is no available DA reference for this product right now.
                </Text>
              </View>
            ) : null}

            {/* Price warning */}
            {priceExceedsDaSuggestion ? (
              <View className="mb-4 rounded-[10px] border border-orange-300 bg-orange-50 px-4 py-3">
                <View className="flex-row items-start">
                  <Ionicons
                    name="warning"
                    size={16}
                    color="#C2410C"
                  />

                  <Text className="ml-2 flex-1 text-xs text-orange-700">
                    The first variant's price is higher than the latest
                    suggested DA market price. This is only a reference.
                    You can still set your own price.
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Variant summary */}
            <View className="mb-5 rounded-[10px] bg-green-50 p-3">
              <Text className="mb-2 text-xs font-semibold text-green-800">
                PRODUCT SUMMARY
              </Text>

              <Text className="text-xs text-green-800">
                Number of variants: {variants.length}
              </Text>

              <Text className="mt-1 text-xs text-green-800">
                Total stock:{" "}
                {variants.reduce(
                  (sum, variant) => sum + (Number(variant.stock) || 0),
                  0
                ).toLocaleString()}
              </Text>
            </View>

            {/* Product media */}
            <Text className="mb-1 text-xs text-gray-500">
              PRODUCT MEDIA
            </Text>

            <View className="mb-5 rounded-[10px] border border-gray-300 bg-gray-50 p-3">
              {video ? (
                <View className="mb-3">
                  <View className="relative h-44 w-full overflow-hidden rounded-[10px] bg-black">
                    <VideoView
                      player={previewPlayer}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="contain"
                      nativeControls={false}
                    />

                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={
                        isPreviewPlaying
                          ? "Pause product video"
                          : "Play product video"
                      }
                      onPress={() =>
                        isPreviewPlaying
                          ? previewPlayer.pause()
                          : previewPlayer.play()
                      }
                      className="absolute inset-0 items-center justify-center"
                    >
                      <View className="h-12 w-12 items-center justify-center rounded-full bg-black/50">
                        <Ionicons
                          name={isPreviewPlaying ? "pause" : "play"}
                          size={24}
                          color="white"
                        />
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      accessibilityLabel="Remove video"
                      onPress={() => {
                        previewPlayer.pause();
                        setVideo("");
                      }}
                      className="absolute right-2 top-2"
                    >
                      <Ionicons
                        name="close-circle"
                        size={24}
                        color="#dc2626"
                      />
                    </TouchableOpacity>
                  </View>

                  <Text className="mt-1 text-sm text-gray-700">
                    20-second product video selected
                  </Text>
                </View>
              ) : null}

              {images.length > 0 ? (
                <View className="mb-3 flex-row flex-wrap gap-2">
                  {images.map((uri, index) => (
                    <View key={`${uri}-${index}`}>
                      <Image
                        source={{ uri }}
                        className="h-16 w-16 rounded-[10px]"
                      />

                      <TouchableOpacity
                        accessibilityLabel={`Remove image ${index + 1}`}
                        onPress={() => {
                          setImages((current) =>
                            current.filter(
                              (_, imageIndex) => imageIndex !== index
                            )
                          );
                        }}
                        className="absolute -right-1 -top-1"
                      >
                        <Ionicons
                          name="close-circle"
                          size={20}
                          color="#dc2626"
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={pickImages}
                  disabled={images.length >= MAX_PRODUCT_IMAGES}
                  className="flex-1 items-center rounded-[10px] border border-[#14532d] px-2 py-3"
                >
                  <Text className="text-center text-xs font-semibold text-[#14532d]">
                    Add images ({images.length}/{MAX_PRODUCT_IMAGES})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={pickVideo}
                  disabled={video !== ""}
                  className="flex-1 items-center rounded-[10px] border border-[#14532d] px-2 py-3"
                >
                  <Text className="text-center text-xs font-semibold text-[#14532d]">
                    Add 20-sec video
                  </Text>
                </TouchableOpacity>
              </View>

              <Text className="mt-2 text-[10px] text-gray-500">
                Add up to 5 images and 1 video (20 seconds, 25 MB max).
              </Text>
            </View>

            {/* Footer buttons */}
            <View className="flex-row justify-between">
              <TouchableOpacity
                onPress={() => {
                  resetForm();
                  onClose();
                }}
                disabled={loading}
                className="w-[48%] items-center rounded-[10px] border border-[#14532d] py-3"
              >
                <Text className="font-semibold text-[#14532d]">
                  Cancel
                </Text>
                <Text className="text-[10px] text-[#14532d]">
                  (Kanselahin)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSave}
                disabled={!isFormValid || loading}
                className="w-[48%] items-center rounded-[10px] py-3"
                style={{
                  backgroundColor:
                    isFormValid && !loading ? "#14532d" : "#9ca3af",
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text className="font-bold text-white">
                      Save Product
                    </Text>
                    <Text className="text-[10px] text-white/80">
                      (I-save)
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default AddProductModal;