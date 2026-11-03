// Modal where a buyer rates and reviews one specific product variant they ordered.
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { addReview } from "@/src/services/productService";
import { markProductReviewed } from "@/src/services/orderService";
import { OrderProduct } from "@/src/types/order";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../FirebaseConfig";
import { getUserFriendlyErrorMessage } from "@/src/utils/userFacingError";
import { getOrderProductReviewKey } from "@/src/utils/orderReview";

type Props = {
  visible: boolean;
  onClose: () => void;
  orderId: string;
  product: OrderProduct | null;
  buyerId: string;
  buyerName: string;
  buyerProfileImage?: string;
  // Returns a composite key for the exact product variant reviewed.
  onSubmitted: (reviewKey: string) => void;
};

const RateOrderModal = ({
  visible,
  onClose,
  orderId,
  product,
  buyerId,
  buyerName,
  buyerProfileImage,
  onSubmitted,
}: Props) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setRating(5);
    setComment("");
    setError("");
  };

  const handleSubmit = async () => {
    if (!product) return;

    if (!comment.trim()) {
      setError("Please write a short review.");
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      let profileImage = buyerProfileImage || "";

      if (!profileImage && buyerId) {
        const buyerDoc = await getDoc(doc(db, "users", buyerId));
        profileImage = buyerDoc.exists()
          ? buyerDoc.data().profileImage || ""
          : "";
      }

      await addReview({
        productId: product.productId,
        orderProduct: product,
        variantId: product.variantId || "",
        variantName: product.variantName || "",
        orderId,
        buyerId,
        buyerName,
        buyerProfileImage: profileImage,
        rating,
        comment: comment.trim(),
        createdAt: Date.now(),
      });

      await markProductReviewed(
        orderId,
        product.productId,
        product.variantId || "",
        product.variantName || ""
      );

      const reviewKey = getOrderProductReviewKey(
        product.productId,
        product.variantId || "",
        product.variantName || ""
      );

      onSubmitted(reviewKey);
      resetForm();
      onClose();
    } catch (err) {
      setError(
        getUserFriendlyErrorMessage(
          err,
          "Submit buyer product variant review",
          "We couldn't submit your review right now. Please try again in a moment."
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!product) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center bg-black/40 px-6">
        <View
          className="rounded-[10px] bg-white p-6"
          style={{ borderWidth: 1, borderColor: "#14532d" }}
        >
          <Text className="mb-1 text-lg font-bold">Rate this product</Text>
          <Text className="mb-4 text-xs text-gray-400">
            {product.name}
            {product.variantName ? ` · ${product.variantName}` : ""}
          </Text>

          {error ? (
            <Text className="mb-3 text-xs text-red-500">{error}</Text>
          ) : null}

          <View className="mb-4 flex-row justify-center">
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                className="px-1"
                disabled={submitting}
              >
                <Ionicons
                  name={star <= rating ? "star" : "star-outline"}
                  size={32}
                  color="#f59e0b"
                />
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            value={comment}
            onChangeText={setComment}
            multiline
            editable={!submitting}
            placeholder="Kumusta ang produkto? (freshness, sukat, atbp.)"
            textAlignVertical="top"
            className="mb-4 h-24 rounded-[5px] border border-gray-300 bg-gray-100 px-4 py-3"
          />

          <View className="flex-row justify-between">
            <TouchableOpacity
              onPress={() => {
                resetForm();
                onClose();
              }}
              disabled={submitting}
              className="w-[48%] items-center rounded-[5px] py-3"
              style={{ borderWidth: 1, borderColor: "#14532d" }}
            >
              <Text style={{ color: "#14532d" }} className="font-semibold">
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              className="w-[48%] items-center rounded-[5px] py-3"
              style={{ backgroundColor: submitting ? "#9ca3af" : "#14532d" }}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="font-bold text-white">Submit</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default RateOrderModal;
