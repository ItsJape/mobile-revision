// Farmer archive product confirm modal.
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Modal,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { ProductType } from "../../../src/types/product";

type Props = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
  product?: ProductType | null;
};

// Confirm popup before archiving a product.
// This used to be called "Delete Product", but it is really "Archive": the
// product, its image, its variants, and its order history are never deleted. It
// is only hidden from the lists, the home page, and the shop, and it can still
// be unarchived later if needed.
const DeleteProductModal = ({ visible, onCancel, onConfirm, loading, product }: Props) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <View className="w-full max-w-[360px] rounded-[10px] bg-white p-5">
          <View className="mb-3 flex-row items-center">
            <View className="mr-3 h-10 w-10 items-center justify-center rounded-[10px] bg-amber-50">
              <Ionicons name="archive-outline" size={20} color="#b45309" />
            </View>
            <Text className="flex-1 text-lg font-bold text-gray-900">
              Archive product?
            </Text>
          </View>

          <Text className="mb-2 text-sm font-semibold text-gray-800">
            {product?.name || "This product"}
          </Text>

          <Text className="mb-6 text-sm leading-5 text-gray-600">
            This will archive{" "}
            <Text className="font-bold text-gray-700">
              {product?.name}
            </Text>
            . It will no longer appear in your listing or to buyers, but all of
            its data will remain (variants, orders, reviews). You can
            unarchive it later if needed.
          </Text>

          <View className="flex-row">
            <TouchableOpacity
              onPress={onCancel}
              className="mr-2 flex-1 items-center rounded-[10px] border border-gray-300 py-3"
            >
              <View className="items-center justify-center">
                <Text className="font-semibold text-gray-700">Cancel</Text>
                <Text className="text-[10px] text-gray-500">(Kanselahin)</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onConfirm}
              disabled={loading}
              className="ml-2 flex-1 items-center rounded-[10px] py-3"
              style={{ backgroundColor: "#dc2626" }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View className="items-center justify-center">
                  <Text className="font-bold text-white">Archive</Text>
                  <Text className="text-[10px] text-white/80">(I-archive)</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default DeleteProductModal;