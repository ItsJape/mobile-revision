
// Farmer Edit Product Modal - Variant-based inventory.

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

import type {
  ProductType,
  ProductVariant,
} from "../../../src/types/product";

import {
  CATEGORIES,
  PRODUCT_CATALOG,
  ProductCategoryKey,
  getUnitsForProduct,
} from "@/src/constants/productCatalog";

import {
  MAX_PRODUCT_IMAGES,
  getProductVideoValidationError,
} from "@/src/constants/productMedia";

import { getUserFriendlyErrorMessage } from "@/src/utils/userFacingError";

type Props = {
  visible: boolean;
  onClose: () => void;
  product: ProductType;
  onSave: (product: ProductType) => Promise<void>;
  loading: boolean;
};

type DropdownProps = {
  label: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  placeholder?: string;
};

const createVariant = (): ProductVariant => ({
  id: "",
  name: "",
  unit: "per kg",
  price: 0,
  stock: 0,
  status: "Out of Stock",
  createdAt: Date.now(),
});

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
        className="flex-row items-center justify-between rounded-[10px] border border-gray-300 bg-gray-100 px-4 py-3"
      >
        <Text className={value ? "text-gray-800" : "text-gray-400"}>
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
                className={`px-4 py-3 ${value === option ? "bg-[#14532d]" : "bg-white"
                  }`}
              >
                <Text
                  className={
                    value === option ? "text-white" : "text-gray-800"
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

const EditProductModal = ({
  visible,
  onClose,
  product,
  onSave,
  loading,
}: Props) => {
  const [name, setName] = useState("");
  const [category, setCategory] =
    useState<ProductCategoryKey>("Vegetables");

  const [unit, setUnit] = useState("per kg");
  const [description, setDescription] = useState("");

  const [images, setImages] = useState<string[]>([]);
  const [imagePublicIds, setImagePublicIds] = useState<string[]>([]);

  const [video, setVideo] = useState("");

  const [variants, setVariants] =
    useState<ProductVariant[]>([]);

  const [error, setError] = useState("");

  const previewPlayer = useVideoPlayer(
    video || null,
    (player) => {
      player.loop = false;
    }
  );

  const { isPlaying: isPreviewPlaying } = useEvent(
    previewPlayer,
    "playingChange",
    { isPlaying: previewPlayer.playing }
  );

  // ================= LOAD PRODUCT =================

  useEffect(() => {
    if (!visible || !product) return;

    setName(product.name || "");

    setCategory(
      (product.category as ProductCategoryKey) || "Vegetables"
    );

    setUnit(product.unit || "per kg");

    setDescription(product.description || "");

    const currentImages =
      product.images?.length
        ? product.images
        : product.image
          ? [product.image]
          : [];

    setImages(currentImages);

    setImagePublicIds(
      product.imagePublicIds?.length
        ? product.imagePublicIds
        : product.imagePublicId
          ? [product.imagePublicId]
          : []
    );

    setVideo(product.video || "");

    // Keep existing variant IDs so updates affect the correct variants.
    setVariants(
      product.variants?.length
        ? product.variants.map((variant) => ({ ...variant }))
        : [
          {
            ...createVariant(),
            name: "Regular",
            unit: product.unit || "per kg",
            price: Number(product.price || 0),
            stock: Number(product.stock || 0),
            status: product.stock > 0
              ? "Available"
              : "Out of Stock",
          },
        ]
    );

    setError("");
  }, [visible, product]);

  // ================= CATEGORY / NAME OPTIONS =================

  const productNameOptions = PRODUCT_CATALOG[category] || [];

  const unitOptions = getUnitsForProduct(
    category,
    name || undefined
  );

  const handleCategoryChange = (value: string) => {
    const nextCategory = value as ProductCategoryKey;

    setCategory(nextCategory);

    const nextNames = PRODUCT_CATALOG[nextCategory] || [];

    if (!nextNames.includes(name)) {
      setName("");
    }

    const nextUnits = getUnitsForProduct(nextCategory);

    setUnit(nextUnits[0] || "per kg");

    setVariants((current) =>
      current.map((variant) => ({
        ...variant,
        unit: nextUnits.includes(variant.unit)
          ? variant.unit
          : nextUnits[0] || "per kg",
      }))
    );
  };

  // ================= VARIANT HELPERS =================

  const updateVariant = (
    index: number,
    field: "name" | "unit" | "price" | "stock",
    value: string
  ) => {
    setVariants((current) =>
      current.map((variant, i) => {
        if (i !== index) return variant;

        const updated = {
          ...variant,
          [field]: value,
        } as ProductVariant;

        if (field === "stock") {
          updated.status =
            Number(value) > 0 ? "Available" : "Out of Stock";
        }

        updated.updatedAt = Date.now();

        return updated;
      })
    );
  };

  const addVariant = () => {
    const defaultUnit =
      getUnitsForProduct(category, name)[0] || unit || "per kg";

    setVariants((current) => [
      ...current,
      {
        ...createVariant(),
        unit: defaultUnit,
      },
    ]);

    setError("");
  };

  const removeVariant = (index: number) => {
    if (variants.length <= 1) {
      setError("A product must have at least one variant.");
      return;
    }

    setVariants((current) =>
      current.filter((_, i) => i !== index)
    );

    setError("");
  };

  // ================= IMAGE PICKER =================

  const pickImages = async () => {
    const remaining = MAX_PRODUCT_IMAGES - images.length;

    if (remaining <= 0) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
      });

      if (!result.canceled && result.assets?.length) {
        const selected = result.assets
          .map((asset) => asset.uri)
          .filter(Boolean);

        setImages((current) =>
          [...current, ...selected].slice(0, MAX_PRODUCT_IMAGES)
        );

        setImagePublicIds((current) =>
          [
            ...current,
            ...selected.map(() => ""),
          ].slice(0, MAX_PRODUCT_IMAGES)
        );

        setError("");
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

  const removeImage = (index: number) => {
    setImages((current) =>
      current.filter((_, i) => i !== index)
    );

    setImagePublicIds((current) =>
      current.filter((_, i) => i !== index)
    );
  };

  // ================= VIDEO PICKER =================

  const pickVideo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        videoMaxDuration: 20,
        quality: 0.5,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];

      const validationError =
        getProductVideoValidationError(asset);

      if (validationError) {
        setError(validationError);
        return;
      }

      setVideo(asset.uri);
      setError("");
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

  // ================= VALIDATION =================

  const variantNames = variants.map((variant) =>
    variant.name.trim().toLowerCase()
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
      String(variant.price).trim() !== "" &&
      String(variant.stock).trim() !== "" &&
      Number.isFinite(price) &&
      price >= 0 &&
      Number.isInteger(stock) &&
      stock >= 0
    );
  });

  const isFormValid =
    name.trim() !== "" &&
    category.trim() !== "" &&
    unit.trim() !== "" &&
    description.trim() !== "" &&
    variantsValid &&
    (images.length > 0 || video !== "");

  // ================= SAVE =================

  const handleSave = async () => {
    if (!isFormValid) {
      setError(
        hasDuplicateVariantNames
          ? "Variant names must be unique."
          : "Please complete all required fields."
      );

      return;
    }

    if (!product.docId) {
      setError("Product ID is missing.");
      return;
    }

    setError("");

    const cleanedVariants: ProductVariant[] =
      variants.map((variant) => {
        const stock = Number(variant.stock);
        const price = Number(variant.price);

        return {
          ...variant,
          id: variant.id || "",
          name: variant.name.trim(),
          unit: variant.unit.trim(),
          price,
          stock,
          status:
            stock > 0 && variant.status !== "Out of Stock"
              ? "Available"
              : "Out of Stock",
          createdAt: variant.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
      });

    const updatedProduct: ProductType = {
      ...product,

      name: name.trim(),
      category,

      unit: cleanedVariants[0]?.unit || unit,

      description: description.trim(),

      image: images[0] || "",
      imagePublicId: imagePublicIds[0] || "",

      images,
      imagePublicIds,

      video,
      videoPublicId:
        video === product.video
          ? product.videoPublicId || ""
          : "",

      variants: cleanedVariants,
    };

    try {
      await onSave(updatedProduct);
      onClose();
    } catch (err) {
      setError(
        getUserFriendlyErrorMessage(
          err,
          "Edit farmer product",
          "We couldn't save these product changes. Please try again."
        )
      );
    }
  };

  // ================= UI =================

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
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* HEADER */}

            <View className="mb-4 flex-row items-center">
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-[10px] bg-green-50">
                <Ionicons
                  name="create-outline"
                  size={21}
                  color="#14532d"
                />
              </View>

              <View>
                <Text className="text-lg font-bold text-gray-900">
                  Edit Product
                </Text>

                <Text className="text-xs text-gray-500">
                  Update product details and variants.
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

            {/* PRODUCT CATEGORY */}

            <Dropdown
              label="CATEGORY"
              value={category}
              options={[...CATEGORIES]}
              onSelect={handleCategoryChange}
            />

            {/* PRODUCT NAME */}

            <Dropdown
              label="PRODUCT NAME"
              value={name}
              options={productNameOptions}
              onSelect={setName}
              placeholder="Select product"
            />

            {/* DESCRIPTION */}

            <Text className="mb-1 text-xs text-gray-500">
              DESCRIPTION
            </Text>

            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
              placeholder="Describe product..."
              className="mb-4 h-24 rounded-[10px] border border-gray-300 bg-gray-100 px-4 py-3 text-gray-800"
            />

            {/* VARIANTS */}

            <View className="mb-3 flex-row items-center justify-between">
              <View>
                <Text className="text-sm font-bold text-gray-900">
                  PRODUCT VARIANTS
                </Text>

                <Text className="mt-1 text-[10px] text-gray-500">
                  Each variant has its own price and stock.
                </Text>
              </View>

              <Text className="text-xs font-semibold text-[#14532d]">
                {variants.length} variants
              </Text>
            </View>

            {variants.map((variant, index) => (
              <View
                key={`${variant.id || "new"}-${index}`}
                className="mb-3 rounded-[10px] border border-gray-200 bg-gray-50 p-3"
              >
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="text-sm font-bold text-gray-800">
                    Variant {index + 1}
                  </Text>

                  {variants.length > 1 ? (
                    <TouchableOpacity
                      onPress={() => removeVariant(index)}
                      accessibilityLabel={`Remove variant ${index + 1}`}
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

                {/* VARIANT NAME */}

                <Text className="mb-1 text-xs text-gray-500">
                  VARIANT NAME / SIZE
                </Text>

                <TextInput
                  value={variant.name}
                  onChangeText={(value) =>
                    updateVariant(index, "name", value)
                  }
                  placeholder="Small, Medium, Large"
                  className="mb-3 rounded-[10px] border border-gray-300 bg-white px-4 py-3 text-gray-800"
                />

                {/* VARIANT UNIT */}

                <Dropdown
                  label="UNIT"
                  value={variant.unit}
                  options={getUnitsForProduct(category, name)}
                  onSelect={(value) =>
                    updateVariant(index, "unit", value)
                  }
                />

                {/* VARIANT PRICE AND STOCK */}

                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Text className="mb-1 text-xs text-gray-500">
                      PRICE (₱)
                    </Text>

                    <TextInput
                      value={String(variant.price)}
                      onChangeText={(value) => {
                        if (/^\d*\.?\d*$/.test(value)) {
                          updateVariant(index, "price", value);
                        }
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      className="rounded-[10px] border border-gray-300 bg-white px-3 py-3 text-gray-800"
                    />
                  </View>

                  <View className="flex-1">
                    <Text className="mb-1 text-xs text-gray-500">
                      STOCK
                    </Text>

                    <TextInput
                      value={String(variant.stock)}
                      onChangeText={(value) => {
                        if (/^\d*$/.test(value)) {
                          updateVariant(index, "stock", value);
                        }
                      }}
                      keyboardType="numeric"
                      placeholder="0"
                      className="rounded-[10px] border border-gray-300 bg-white px-3 py-3 text-gray-800"
                    />
                  </View>
                </View>

                {/* VARIANT STATUS */}

                <View className="mt-2 flex-row items-center">
                  <Ionicons
                    name={
                      Number(variant.stock) > 0 &&
                        variant.status === "Available"
                        ? "checkmark-circle"
                        : "alert-circle"
                    }
                    size={14}
                    color={
                      Number(variant.stock) > 0 &&
                        variant.status === "Available"
                        ? "#15803d"
                        : "#d97706"
                    }
                  />

                  <Text className="ml-1 text-[10px] text-gray-600">
                    {Number(variant.stock) > 0 &&
                      variant.status === "Available"
                      ? "Available"
                      : "Out of Stock"}
                  </Text>
                </View>
              </View>
            ))}

            {/* ADD VARIANT */}

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

            {/* PRODUCT MEDIA */}

            <Text className="mb-1 text-xs text-gray-500">
              PRODUCT MEDIA
            </Text>

            <View className="mb-5 rounded-[10px] border border-gray-300 bg-gray-50 p-3">
              {/* VIDEO */}

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
                    Product video selected
                  </Text>
                </View>
              ) : null}

              {/* IMAGES */}

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
                        onPress={() => removeImage(index)}
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

              {/* MEDIA BUTTONS */}

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
                Up to 5 images and 1 video, maximum 20 seconds.
              </Text>
            </View>

            {/* BUTTONS */}

            <View className="flex-row">
              <TouchableOpacity
                onPress={onClose}
                disabled={loading}
                className="mr-2 flex-1 items-center rounded-[10px] border border-[#14532d] py-3"
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
                className="ml-2 flex-1 items-center rounded-[10px] py-3"
                style={{
                  backgroundColor:
                    isFormValid && !loading
                      ? "#14532d"
                      : "#9ca3af",
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text className="font-bold text-white">
                      Save Changes
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

export default EditProductModal;
