import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { QUANTITY_TYPES, type QuantityType } from "@/types/quantityType";

type QuantityTypeSelectProps = {
  value?: QuantityType | null;
  onChange: (value: QuantityType | null) => void;
  disabled?: boolean;
};

const QuantityTypeSelect: React.FC<QuantityTypeSelectProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [visible, setVisible] = useState(false);

  const selectValue = (nextValue: QuantityType | null) => {
    onChange(nextValue);
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        onPress={() => setVisible(true)}
        disabled={disabled}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`Quantity type: ${value || "Not selected"}`}
      >
        <Text style={styles.triggerLabel}>Quantity type</Text>
        <View style={styles.triggerValueRow}>
          <Text
            style={[styles.triggerValue, !value && styles.placeholder]}
            numberOfLines={1}
          >
            {value || "Select"}
          </Text>
          <Ionicons name="chevron-down" size={15} color="#64748B" />
        </View>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.overlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setVisible(false)}
            activeOpacity={1}
            accessibilityLabel="Close quantity type selector"
          />
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Quantity Type</Text>
                <Text style={styles.subtitle}>
                  Choose how this line is recorded
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setVisible(false)}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color="#334155" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.options}
              contentContainerStyle={styles.optionsContent}
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity
                style={styles.option}
                onPress={() => selectValue(null)}
              >
                <Text
                  style={[styles.optionText, !value && styles.optionTextActive]}
                >
                  Not selected
                </Text>
                {!value ? (
                  <Ionicons name="checkmark" size={18} color="#2563EB" />
                ) : null}
              </TouchableOpacity>
              {QUANTITY_TYPES.map((option) => {
                const selected = option === value;
                return (
                  <TouchableOpacity
                    key={option}
                    style={styles.option}
                    onPress={() => selectValue(option)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        selected && styles.optionTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                    {selected ? (
                      <Ionicons name="checkmark" size={18} color="#2563EB" />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    minHeight: 38,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  triggerDisabled: { opacity: 0.55 },
  triggerLabel: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  triggerValueRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
  },
  triggerValue: {
    flexShrink: 1,
    fontSize: 12,
    color: "#1E40AF",
    fontWeight: "700",
    textAlign: "right",
  },
  placeholder: { color: "#94A3B8", fontWeight: "600" },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheet: {
    maxHeight: "78%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingBottom: 18,
  },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  subtitle: { marginTop: 2, fontSize: 12, color: "#64748B" },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  options: { flexGrow: 0 },
  optionsContent: { paddingHorizontal: 12, paddingVertical: 6 },
  option: {
    minHeight: 44,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionText: { fontSize: 14, color: "#334155" },
  optionTextActive: { color: "#1D4ED8", fontWeight: "700" },
});

export default QuantityTypeSelect;
