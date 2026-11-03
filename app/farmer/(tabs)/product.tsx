// Farmer Product Listing - Variant-based inventory.
// No product batches or harvest records.

import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import AddProductModal from "../../farmer/products/add-product";
import EditProductModal from "../../farmer/products/edit-product";
import DeleteProductModal from "../../farmer/products/delete-product";

import { deleteCartItemsByProductId } from "../../../src/services/cartService";

import type {
  ProductType,
  CreateProductInput,
  ProductVariant,
  ProductStatus,
} from "../../../src/types/product";

import {
  createProduct,
  archiveProduct,
  unarchiveProduct,
  getFarmerProducts,
  getArchivedProducts,
  updateProductInfo,
  addProductVariant,
  updateProductVariant,
  deleteProductVariant,
  subscribeToFarmerProducts,
} from "../../../src/services/productService";

import { uploadImageAsync } from "../../../src/services/cloudinaryService";

import {
  ProductCategoryKey,
  getUnitsForProduct,
} from "@/src/constants/productCatalog";

type ViewMode = "active" | "archived";

type ProductScreenProps = {
  detailProductId?: string;
  initialViewMode?: ViewMode;
};

type VariantDraft = {
  name: string;
  unit: string;
  price: string;
  stock: string;
  status: ProductStatus;
};

type DropdownProps = {
  label: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  placeholder?: string;
};

const EMPTY_VARIANT: VariantDraft = {
  name: "",
  unit: "per kg",
  price: "",
  stock: "",
  status: "Available",
};

const formatPeso = (value: number) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Reusable dropdown, same look as the one in Edit Product.
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
      <Text className="mb-1 text-xs text-gray-500">{label}</Text>

      <TouchableOpacity
        onPress={() => setOpen((current) => !current)}
        disabled={options.length === 0}
        className={`flex-row items-center justify-between rounded-[10px] border border-gray-300 px-4 py-3 ${
          options.length === 0 ? "bg-gray-200" : "bg-gray-100"
        }`}
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
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {options.map((option) => (
              <TouchableOpacity
                key={option}
                onPress={() => {
                  onSelect(option);
                  setOpen(false);
                }}
                className={`px-4 py-3 ${
                  value === option ? "bg-[#14532d]" : "bg-white"
                }`}
              >
                <Text
                  className={value === option ? "text-white" : "text-gray-800"}
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

const ProductScreen = ({
  detailProductId,
  initialViewMode = "active",
}: ProductScreenProps) => {
  // ================= PRODUCT DATA =================

  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

  const [products, setProducts] = useState<ProductType[]>([]);

  const [archivedProducts, setArchivedProducts] = useState<ProductType[]>([]);

  const [user, setUser] = useState<any>(null);

  // ================= UI STATE =================

  const [expandedProductId, setExpandedProductId] = useState<string | null>(
    detailProductId || null
  );

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingVariant, setSavingVariant] = useState(false);

  // ================= SELECTED ITEMS =================

  const [selectedProduct, setSelectedProduct] = useState<ProductType | null>(
    null
  );

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    null
  );

  // ================= MODALS =================

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showVariantModal, setShowVariantModal] = useState(false);

  const [isAddingVariant, setIsAddingVariant] = useState(false);

  const [variantDraft, setVariantDraft] =
    useState<VariantDraft>(EMPTY_VARIANT);

  // ================= LOAD USER =================

  useEffect(() => {
    const loadUser = async () => {
      try {
        const data = await AsyncStorage.getItem("user");

        if (data) {
          setUser(JSON.parse(data));
        }
      } catch (error) {
        console.log("LOAD USER ERROR:", error);
      }
    };

    loadUser();
  }, []);

  // ================= FETCH PRODUCTS =================

  const fetchProducts = async () => {
    if (!user?.uid) return;

    try {
      const [active, archived] = await Promise.all([
        getFarmerProducts(user.uid),
        getArchivedProducts(user.uid),
      ]);

      setProducts(active);
      setArchivedProducts(archived);
    } catch (error) {
      console.log("FETCH PRODUCTS ERROR:", error);

      Alert.alert("Error", "Unable to load your products. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Keep active and archived products synchronized with Firestore in real time.
  // This listener receives changes made by addProductVariant/updateProductVariant.
  useEffect(() => {
    if (!user?.uid) return;

    setLoading(true);

    const unsubscribe = subscribeToFarmerProducts(
      user.uid,
      (farmerProducts) => {
        setProducts(farmerProducts.filter((product) => !product.archived));

        setArchivedProducts(
          farmerProducts.filter((product) => product.archived === true)
        );

        setLoading(false);
      },
      (error) => {
        console.log("PRODUCT LISTENER ERROR:", error);
        setLoading(false);

        Alert.alert("Error", "Unable to load your products. Please try again.");
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // Keep the requested detail route expanded.

  useEffect(() => {
    if (detailProductId) {
      setExpandedProductId(detailProductId);
    }
  }, [detailProductId]);

  useEffect(() => {
    setViewMode(initialViewMode);
  }, [initialViewMode]);

  // ================= IMAGE UPLOAD =================

  // Uploads local images and keeps existing Cloudinary URLs.

  const uploadProductImages = async (
    images: string[],
    existingPublicIds: string[] = []
  ) => {
    const uploaded = await Promise.all(
      images.map(async (uri, index) => {
        if (/^https?:\/\//i.test(uri)) {
          return {
            imageUrl: uri,
            publicId: existingPublicIds[index] || "",
          };
        }

        return uploadImageAsync(uri);
      })
    );

    return {
      images: uploaded.map((item) => item.imageUrl),
      imagePublicIds: uploaded.map((item) => item.publicId),
    };
  };

  // ================= ADD PRODUCT =================

  const handleAddProduct = async (product: CreateProductInput) => {
    try {
      setUploading(true);

      if (!user?.uid) {
        throw new Error("Farmer login information is missing.");
      }

      const selectedImages = product.images?.length
        ? product.images
        : product.image
          ? [product.image]
          : [];

      const uploadedMedia = await uploadProductImages(
        selectedImages,
        product.imagePublicIds || []
      );

      const newProduct: CreateProductInput = {
        ...product,
        image: uploadedMedia.images[0] || "",
        imagePublicId: uploadedMedia.imagePublicIds[0] || "",
        images: uploadedMedia.images,
        imagePublicIds: uploadedMedia.imagePublicIds,
        farmerId: user.uid,
        farmerName: user.fullName || "",
        farmName: user.farmName || "",
      };

      await createProduct(newProduct);

      await fetchProducts();

      setShowAddModal(false);

      Alert.alert(
        "Success",
        "Your product and variants have been added successfully."
      );
    } catch (error: any) {
      console.log("ADD PRODUCT ERROR:", error);

      throw error;
    } finally {
      setUploading(false);
    }
  };

  // ================= EDIT PRODUCT INFO =================

  const handleEditProduct = async (product: ProductType) => {
    try {
      setEditing(true);

      const selectedImages = product.images?.length
        ? product.images
        : product.image
          ? [product.image]
          : [];

      const uploadedMedia = await uploadProductImages(
        selectedImages,
        product.imagePublicIds || []
      );

      await updateProductInfo({
        ...product,
        image: uploadedMedia.images[0] || "",
        imagePublicId: uploadedMedia.imagePublicIds[0] || "",
        images: uploadedMedia.images,
        imagePublicIds: uploadedMedia.imagePublicIds,
      });

      await fetchProducts();

      setShowEditModal(false);
      setSelectedProduct(null);

      Alert.alert("Success", "Product information updated successfully.");
    } catch (error) {
      console.log("EDIT PRODUCT ERROR:", error);

      throw error;
    } finally {
      setEditing(false);
    }
  };

  // ================= OPEN ADD VARIANT =================

  const handleOpenAddVariant = (product: ProductType) => {
    setSelectedProduct(product);
    setSelectedVariant(null);

    setVariantDraft({
      ...EMPTY_VARIANT,
      unit: product.unit || "per kg",
    });

    setIsAddingVariant(true);
    setShowVariantModal(true);
  };

  // ================= OPEN EDIT VARIANT =================

  const handleOpenEditVariant = (
    product: ProductType,
    variant: ProductVariant
  ) => {
    setSelectedProduct(product);
    setSelectedVariant(variant);

    setVariantDraft({
      name: variant.name,
      unit: variant.unit,
      price: String(variant.price),
      stock: String(variant.stock),
      status: variant.status,
    });

    setIsAddingVariant(false);
    setShowVariantModal(true);
  };

  // ================= UPDATE VARIANT FIELD =================

  const updateVariantField = <K extends keyof VariantDraft>(
    field: K,
    value: VariantDraft[K]
  ) => {
    setVariantDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  // ================= SAVE VARIANT =================

  const handleSaveVariant = async () => {
    if (!selectedProduct?.docId) return;

    const name = variantDraft.name.trim();
    const unit = variantDraft.unit.trim();
    const price = Number(variantDraft.price);
    const stock = Number(variantDraft.stock);

    if (!name || !unit) {
      Alert.alert("Required Fields", "Please enter a variant name and unit.");
      return;
    }

    if (
      variantDraft.price.trim() === "" ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      Alert.alert("Invalid Price", "Enter a valid price.");
      return;
    }

    if (
      variantDraft.stock.trim() === "" ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      Alert.alert(
        "Invalid Stock",
        "Stock must be a whole number greater than or equal to zero."
      );
      return;
    }

    const status: ProductStatus =
      stock <= 0 ? "Out of Stock" : variantDraft.status;

    setSavingVariant(true);

    try {
      if (isAddingVariant) {
        await addProductVariant(selectedProduct.docId, {
          name,
          unit,
          price,
          stock,
          status,
        });
      } else {
        if (!selectedVariant) return;

        await updateProductVariant(selectedProduct.docId, selectedVariant.id, {
          name,
          unit,
          price,
          stock,
          status,
        });
      }

      await fetchProducts();

      setShowVariantModal(false);
      setSelectedVariant(null);
      setVariantDraft(EMPTY_VARIANT);

      Alert.alert(
        "Success",
        isAddingVariant
          ? "New variant added successfully."
          : "Variant updated successfully."
      );
    } catch (error: any) {
      console.log("SAVE VARIANT ERROR:", error);

      Alert.alert(
        "Unable to Save",
        error?.message || "Something went wrong. Please try again."
      );
    } finally {
      setSavingVariant(false);
    }
  };

  // ================= DELETE VARIANT =================

  const handleDeleteVariant = (
    product: ProductType,
    variant: ProductVariant
  ) => {
    Alert.alert(
      "Delete Variant",
      `Permanently remove "${variant.name}" from ${product.name}?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setSavingVariant(true);

              await deleteProductVariant(product.docId, variant.id);

              await fetchProducts();

              Alert.alert("Success", "Variant deleted successfully.");
            } catch (error: any) {
              console.log("DELETE VARIANT ERROR:", error);

              Alert.alert(
                "Unable to Delete",
                error?.message || "Unable to delete this variant."
              );
            } finally {
              setSavingVariant(false);
            }
          },
        },
      ]
    );
  };

  // ================= ARCHIVE PRODUCT =================

  const handleDeleteProduct = async () => {
    if (!selectedProduct?.docId) return;

    try {
      setDeleting(true);

      await archiveProduct(selectedProduct.docId);

      await deleteCartItemsByProductId(selectedProduct.docId);

      await fetchProducts();

      setShowDeleteModal(false);
      setSelectedProduct(null);

      Alert.alert("Success", "Product archived successfully.");
    } catch (error) {
      console.log("ARCHIVE PRODUCT ERROR:", error);

      Alert.alert("Error", "Unable to archive this product.");
    } finally {
      setDeleting(false);
    }
  };

  // ================= UNARCHIVE PRODUCT =================

  const handleUnarchiveProduct = (product: ProductType) => {
    Alert.alert(
      "Unarchive Product",
      `Ibalik sa active listing ang "${product.name}"?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Unarchive",
          onPress: async () => {
            try {
              await unarchiveProduct(product.docId);

              await fetchProducts();

              Alert.alert("Success", "Product restored successfully.");
            } catch (error) {
              console.log("UNARCHIVE ERROR:", error);

              Alert.alert("Error", "Unable to restore this product.");
            }
          },
        },
      ]
    );
  };

  // ================= PRODUCT HELPERS =================

  const getSellableVariants = (product: ProductType) =>
    (product.variants || []).filter(
      (variant) =>
        variant.status === "Available" && Number(variant.stock) > 0
    );

  const getTotalStock = (product: ProductType) =>
    getSellableVariants(product).reduce(
      (sum, variant) => sum + Number(variant.stock || 0),
      0
    );

  const getProductPriceRange = (product: ProductType) => {
    const available = getSellableVariants(product);

    const variants = available.length > 0 ? available : product.variants || [];

    if (variants.length === 0) return "No price";

    const prices = variants.map((variant) => Number(variant.price || 0));

    const min = Math.min(...prices);
    const max = Math.max(...prices);

    if (min === max) {
      return `₱${formatPeso(min)}`;
    }

    return `₱${formatPeso(min)} - ₱${formatPeso(max)}`;
  };

  // ================= VARIANT UNIT OPTIONS =================

  // Units that match the selected product. If an older variant has a unit that
  // is no longer in the list, it is kept so editing never wipes it out.
  const baseUnitOptions = selectedProduct
    ? getUnitsForProduct(
        selectedProduct.category as ProductCategoryKey,
        selectedProduct.name
      )
    : [];

  const variantUnitOptions =
    variantDraft.unit && !baseUnitOptions.includes(variantDraft.unit)
      ? [variantDraft.unit, ...baseUnitOptions]
      : baseUnitOptions;

  // ================= LOADING =================

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-green-800">
        <ActivityIndicator color="#fff" size="large" />

        <Text className="mt-3 text-sm text-white">Loading products...</Text>
      </View>
    );
  }

  // ================= DISPLAYED PRODUCTS =================

  const allDisplayedProducts =
    viewMode === "active" ? products : archivedProducts;

  const displayedProducts = detailProductId
    ? allDisplayedProducts.filter(
        (product) => product.docId === detailProductId
      )
    : allDisplayedProducts;

  // ================= UI =================

  return (
    <View className="flex-1 bg-green-700">
      {/* HEADER */}

      <View className="px-6 pb-6 pt-16">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[25px] font-bold text-white">
              Product Listing
            </Text>

            <Text className="text-[15px] text-white">
              {displayedProducts.length}{" "}
              {viewMode === "active" ? "Products listed" : "Archived products"}
            </Text>
          </View>

          {user?.role === "farmer" &&
            viewMode === "active" &&
            !detailProductId && (
              <TouchableOpacity onPress={() => setShowAddModal(true)}>
                <Ionicons name="add-circle" size={38} color="#fff" />
              </TouchableOpacity>
            )}
        </View>

        {/* ACTIVE / ARCHIVED TABS */}

        {user?.role === "farmer" && !detailProductId && (
          <View className="mt-4 flex-row self-start rounded-2xl bg-white/15 p-1">
            {(["active", "archived"] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                onPress={() => setViewMode(mode)}
                className={`rounded-xl px-5 py-2 ${
                  viewMode === mode ? "bg-white" : ""
                }`}
              >
                <Text
                  className={`text-xs font-semibold capitalize ${
                    viewMode === mode ? "text-green-800" : "text-white"
                  }`}
                >
                  {mode}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* PRODUCT LIST */}

      <View className="flex-1 rounded-t-[35px] bg-gray-100 px-6 pt-6">
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 35 }}
        >
          {displayedProducts.length === 0 && (
            <View className="items-center py-12">
              <Ionicons name="leaf-outline" size={45} color="#9ca3af" />

              <Text className="mt-3 text-center text-sm text-gray-500">
                {viewMode === "active"
                  ? "No products available."
                  : "No archived products."}
              </Text>
            </View>
          )}

          {displayedProducts.map((product) => {
            const variants = product.variants || [];

            const totalStock = getTotalStock(product);

            const isExpanded = expandedProductId === product.docId;

            return (
              <View
                key={product.docId}
                className={`mb-4 rounded-2xl bg-white p-4 ${
                  viewMode === "archived" ? "opacity-75" : ""
                }`}
              >
                {/* PRODUCT INFORMATION */}

                <View className="flex-row items-center">
                  {product.image ? (
                    <Image
                      source={{ uri: product.image }}
                      className="h-20 w-20 rounded-xl"
                    />
                  ) : (
                    <View className="h-20 w-20 items-center justify-center rounded-xl bg-gray-200">
                      <Ionicons
                        name="image-outline"
                        size={28}
                        color="#9ca3af"
                      />
                    </View>
                  )}

                  <View className="ml-3 flex-1">
                    <Text className="text-xs text-gray-400">
                      {product.farmName}
                    </Text>

                    <Text className="font-semibold text-gray-800">
                      {product.name}
                    </Text>

                    <Text className="text-xs text-gray-500">
                      {product.category}
                    </Text>

                    <Text className="mt-1 text-xs text-gray-600">
                      {totalStock.toLocaleString()} available stock
                    </Text>

                    <Text className="mt-1 font-bold text-gray-800">
                      {getProductPriceRange(product)}
                    </Text>

                    {product.totalReviews > 0 && (
                      <Text className="mt-1 text-xs text-yellow-600">
                        ★ {Number(product.rating || 0).toFixed(1)} (
                        {product.totalReviews} reviews)
                      </Text>
                    )}
                  </View>

                  {/* PRODUCT ACTIONS */}

                  {user?.role === "farmer" && viewMode === "active" && (
                    <View className="items-center gap-2">
                      <TouchableOpacity
                        className="rounded-lg bg-blue-100 p-2"
                        onPress={() => {
                          setSelectedProduct(product);
                          setShowEditModal(true);
                        }}
                      >
                        <MaterialIcons
                          name="edit"
                          size={18}
                          color="#2563eb"
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        className="rounded-lg bg-orange-100 p-2"
                        onPress={() => {
                          setSelectedProduct(product);
                          setShowDeleteModal(true);
                        }}
                      >
                        <MaterialIcons
                          name="archive"
                          size={18}
                          color="#c2410c"
                        />
                      </TouchableOpacity>
                    </View>
                  )}

                  {user?.role === "farmer" && viewMode === "archived" && (
                    <TouchableOpacity
                      className="rounded-lg bg-green-100 px-3 py-2"
                      onPress={() => handleUnarchiveProduct(product)}
                    >
                      <Text className="text-xs font-semibold text-green-700">
                        Unarchive
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* VARIANT TOGGLE */}

                <TouchableOpacity
                  onPress={() =>
                    setExpandedProductId(isExpanded ? null : product.docId)
                  }
                  className="mt-3 flex-row items-center justify-center border-t border-gray-100 py-3"
                >
                  <Text className="mr-1 text-xs font-semibold text-green-700">
                    {isExpanded
                      ? "Hide Variants"
                      : `Manage Variants (${variants.length})`}
                  </Text>

                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={14}
                    color="#15803d"
                  />
                </TouchableOpacity>

                {/* VARIANT LIST */}

                {isExpanded && (
                  <View className="mt-1">
                    {variants.length === 0 && (
                      <Text className="py-3 text-center text-xs text-gray-400">
                        No variants added.
                      </Text>
                    )}

                    {variants.map((variant) => {
                      const isAvailable =
                        variant.status === "Available" &&
                        Number(variant.stock) > 0;

                      return (
                        <View
                          key={variant.id}
                          className="mb-2 rounded-xl bg-gray-50 p-3"
                        >
                          <View className="flex-row items-center justify-between">
                            <View className="flex-1">
                              <Text className="font-semibold text-gray-800">
                                {variant.name}
                              </Text>

                              <Text className="mt-1 text-xs text-gray-600">
                                ₱{formatPeso(variant.price)} /{" "}
                                {variant.unit.replace(/^per\s+/i, "")}
                              </Text>

                              <Text className="mt-1 text-xs text-gray-600">
                                Stock: {variant.stock} {variant.unit}
                              </Text>

                              <View
                                className={`mt-2 self-start rounded-full px-2 py-1 ${
                                  isAvailable ? "bg-green-100" : "bg-red-100"
                                }`}
                              >
                                <Text
                                  className={`text-[10px] font-semibold ${
                                    isAvailable
                                      ? "text-green-700"
                                      : "text-red-600"
                                  }`}
                                >
                                  {isAvailable ? "Available" : "Out of Stock"}
                                </Text>
                              </View>
                            </View>

                            {/* VARIANT ACTIONS */}

                            {user?.role === "farmer" &&
                              viewMode === "active" && (
                                <View className="flex-row gap-2">
                                  <TouchableOpacity
                                    className="rounded-lg bg-blue-100 p-2"
                                    onPress={() =>
                                      handleOpenEditVariant(product, variant)
                                    }
                                  >
                                    <MaterialIcons
                                      name="edit"
                                      size={16}
                                      color="#2563eb"
                                    />
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    className="rounded-lg bg-red-100 p-2"
                                    onPress={() =>
                                      handleDeleteVariant(product, variant)
                                    }
                                  >
                                    <MaterialIcons
                                      name="delete-outline"
                                      size={17}
                                      color="#dc2626"
                                    />
                                  </TouchableOpacity>
                                </View>
                              )}
                          </View>
                        </View>
                      );
                    })}

                    {/* ADD VARIANT */}

                    {user?.role === "farmer" && viewMode === "active" && (
                      <TouchableOpacity
                        onPress={() => handleOpenAddVariant(product)}
                        className="mt-1 flex-row items-center justify-center rounded-xl border border-dashed border-[#14532d] py-3"
                      >
                        <Ionicons
                          name="add-circle-outline"
                          size={17}
                          color="#14532d"
                        />

                        <Text className="ml-2 text-xs font-semibold text-[#14532d]">
                          Add Another Variant
                        </Text>
                      </TouchableOpacity>
                    )}

                    {viewMode === "archived" && (
                      <Text className="mt-2 text-center text-[10px] text-gray-400">
                        Unarchive this product to manage its variants.
                      </Text>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* ADD PRODUCT MODAL */}

      <AddProductModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddProduct}
        loading={uploading}
        farmerId={user?.uid || ""}
        farmerName={user?.fullName || ""}
        farmName={user?.farmName || ""}
      />

      {/* EDIT PRODUCT MODAL */}

      {selectedProduct && (
        <EditProductModal
          visible={showEditModal}
          product={selectedProduct}
          onClose={() => {
            setShowEditModal(false);
            setSelectedProduct(null);
          }}
          onSave={handleEditProduct}
          loading={editing}
        />
      )}

      {/* ARCHIVE PRODUCT MODAL */}

      <DeleteProductModal
        visible={showDeleteModal}
        product={selectedProduct}
        onCancel={() => {
          setShowDeleteModal(false);
          setSelectedProduct(null);
        }}
        onConfirm={handleDeleteProduct}
        loading={deleting}
      />

      {/* ADD / EDIT VARIANT MODAL */}

      <Modal
        visible={showVariantModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowVariantModal(false)}
      >
        <View className="flex-1 justify-center bg-black/40 px-6">
          <View className="max-h-[85%] rounded-[15px] bg-white p-5">
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View className="mb-4 flex-row items-center">
                <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-green-50">
                  <Ionicons name="layers-outline" size={21} color="#14532d" />
                </View>

                <View className="flex-1">
                  <Text className="text-lg font-bold text-gray-900">
                    {isAddingVariant ? "Add Variant" : "Edit Variant"}
                  </Text>

                  <Text className="text-xs text-gray-500">
                    {selectedProduct?.name}
                  </Text>
                </View>
              </View>

              {/* VARIANT NAME */}

              <Text className="mb-1 text-xs text-gray-500">
                VARIANT NAME / SIZE
              </Text>

              <TextInput
                value={variantDraft.name}
                onChangeText={(value) => updateVariantField("name", value)}
                placeholder="Small, Medium, Large"
                className="mb-4 rounded-[10px] border border-gray-300 bg-gray-100 px-4 py-3 text-gray-800"
              />

              {/* UNIT */}

              <Dropdown
                label="UNIT"
                value={variantDraft.unit}
                options={variantUnitOptions}
                onSelect={(value) => updateVariantField("unit", value)}
                placeholder="Select unit"
              />

              {/* PRICE */}

              <Text className="mb-1 text-xs text-gray-500">PRICE (₱)</Text>

              <TextInput
                value={variantDraft.price}
                onChangeText={(value) => {
                  if (/^\d*\.?\d*$/.test(value)) {
                    updateVariantField("price", value);
                  }
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                className="mb-4 rounded-[10px] border border-gray-300 bg-gray-100 px-4 py-3 text-gray-800"
              />

              {/* STOCK */}

              <Text className="mb-1 text-xs text-gray-500">STOCK</Text>

              <TextInput
                value={variantDraft.stock}
                onChangeText={(value) => {
                  if (/^\d*$/.test(value)) {
                    updateVariantField("stock", value);
                  }
                }}
                keyboardType="numeric"
                placeholder="0"
                className="mb-4 rounded-[10px] border border-gray-300 bg-gray-100 px-4 py-3 text-gray-800"
              />

              {/* STATUS */}

              <Text className="mb-2 text-xs text-gray-500">STATUS</Text>

              <View className="mb-5 flex-row gap-2">
                {(["Available", "Out of Stock"] as const).map((status) => (
                  <TouchableOpacity
                    key={status}
                    disabled={
                      Number(variantDraft.stock) <= 0 && status === "Available"
                    }
                    onPress={() => updateVariantField("status", status)}
                    className={`flex-1 rounded-[10px] border px-2 py-3 ${
                      variantDraft.status === status
                        ? "border-[#14532d] bg-[#14532d]"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    <Text
                      className={`text-center text-xs font-semibold ${
                        variantDraft.status === status
                          ? "text-white"
                          : "text-gray-700"
                      }`}
                    >
                      {status}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {Number(variantDraft.stock) <= 0 && (
                <Text className="mb-4 text-xs text-orange-600">
                  A variant with zero stock will automatically be Out of Stock.
                </Text>
              )}

              {/* BUTTONS */}

              <View className="flex-row justify-between">
                <TouchableOpacity
                  onPress={() => setShowVariantModal(false)}
                  disabled={savingVariant}
                  className="w-[48%] items-center rounded-[10px] border border-[#14532d] py-3"
                >
                  <Text className="font-semibold text-[#14532d]">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSaveVariant}
                  disabled={savingVariant}
                  className="w-[48%] items-center rounded-[10px] bg-[#14532d] py-3"
                >
                  {savingVariant ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="font-bold text-white">Save Variant</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// Named export for the farmer product detail route.

export { ProductScreen };

export default ProductScreen;