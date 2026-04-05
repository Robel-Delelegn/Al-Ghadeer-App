import ApiErrorText from "@/components/ApiErrorText";
import { icons } from "@/constants";
import { authenticatedFetch, useAuthStore } from "@/store/auth";
import {
  showErrorAlert,
  showSuccessAlert,
  showWarningAlert,
} from "@/store/utils/alert";
import { parseApiResponseWithSoftError } from "@/utils/api";
import { resolveResourceUrl } from "@/utils/resources";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_IP_ADDRESS || "http://localhost:3000"
)
  .trim()
  .replace(/\/+$/, "");

interface ProfileEmail {
  address: string;
  isPrimary: boolean;
  info: string | null;
}

interface ProfilePhone {
  number: string;
  isPrimary: boolean;
  info: string | null;
}

interface DriverProfile {
  id: string;
  firstName: string;
  lastName: string | null;
  emails: ProfileEmail[];
  phones: ProfilePhone[];
  profileImageUrl: string | null;
}

const normalizeProfile = (profile: DriverProfile): DriverProfile => ({
  ...profile,
  profileImageUrl: resolveResourceUrl(profile.profileImageUrl),
});

interface ContactEditorState {
  visible: boolean;
  mode: "add" | "edit";
  originalValue: string;
  value: string;
  info: string;
}

const EMPTY_EDITOR: ContactEditorState = {
  visible: false,
  mode: "add",
  originalValue: "",
  value: "",
  info: "",
};

interface EditModalProps {
  visible: boolean;
  title: string;
  submitLabel: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}

const EditModal = ({
  visible,
  title,
  submitLabel,
  busy,
  onClose,
  onSubmit,
  children,
}: EditModalProps) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onClose}
  >
    <View style={styles.modalOverlay}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} disabled={busy}>
            <Ionicons name="close" size={22} color="#64748B" />
          </TouchableOpacity>
        </View>

        {children}

        <View style={styles.modalActions}>
          <TouchableOpacity
            style={[styles.modalButton, styles.modalCancelButton]}
            onPress={onClose}
            disabled={busy}
          >
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modalButton,
              styles.modalSubmitButton,
              busy && styles.disabledButton,
            ]}
            onPress={onSubmit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.modalSubmitText}>{submitLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const Profile = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, updateUser, signOut } = useAuthStore();

  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [firstNameDraft, setFirstNameDraft] = useState("");
  const [lastNameDraft, setLastNameDraft] = useState("");

  const [emailEditor, setEmailEditor] =
    useState<ContactEditorState>(EMPTY_EDITOR);
  const [phoneEditor, setPhoneEditor] =
    useState<ContactEditorState>(EMPTY_EDITOR);

  const isBusy = !!busyAction;

  const displayName = useMemo(() => {
    if (profile) {
      return (
        [profile.firstName, profile.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || "Driver"
      );
    }
    return user?.name || "Driver";
  }, [profile, user?.name]);

  const avatarSource = useMemo(() => {
    const photoUrl = resolveResourceUrl(profile?.profileImageUrl);
    if (photoUrl) {
      return { uri: photoUrl };
    }
    return icons.person;
  }, [profile?.profileImageUrl]);

  const buildProfileHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (user?.id) {
      headers["X-Driver-Id"] = user.id;
    }

    return headers;
  }, [user?.id]);

  const requestProfile = useCallback(
    async <T,>(path: string, options: RequestInit = {}) => {
      const response = await authenticatedFetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
          ...buildProfileHeaders(),
          ...((options.headers as Record<string, string> | undefined) || {}),
        },
      });
      return parseApiResponseWithSoftError<T>(response);
    },
    [buildProfileHeaders],
  );

  const syncAuthUser = useCallback(
    (nextProfile: DriverProfile) => {
      const currentUser = useAuthStore.getState().user;
      const primaryPhone =
        nextProfile.phones.find((p) => p.isPrimary)?.number ||
        currentUser?.phone ||
        "";
      const fullName =
        [nextProfile.firstName, nextProfile.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        currentUser?.name ||
        "Driver";

      const nextUser = {
        id: nextProfile.id,
        phone: primaryPhone,
        name: fullName,
        helper_name: currentUser?.helper_name,
        vehicle_number: currentUser?.vehicle_number,
        vehicle_type: currentUser?.vehicle_type,
        zone: currentUser?.zone,
        status: currentUser?.status,
      };

      if (
        currentUser &&
        currentUser.id === nextUser.id &&
        currentUser.phone === nextUser.phone &&
        currentUser.name === nextUser.name &&
        currentUser.helper_name === nextUser.helper_name &&
        currentUser.vehicle_number === nextUser.vehicle_number &&
        currentUser.vehicle_type === nextUser.vehicle_type &&
        currentUser.zone === nextUser.zone &&
        currentUser.status === nextUser.status
      ) {
        return;
      }

      updateUser(nextUser);
    },
    [updateUser],
  );

  const fetchProfile = useCallback(
    async (initialLoad = false) => {
      if (initialLoad) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setApiError(null);

      try {
        const result = await requestProfile<DriverProfile>("/profile", {
          method: "GET",
        });

        if (!result.ok) {
          setApiError(result.error);

          if (result.status === 401) {
            showErrorAlert(
              "Session expired",
              result.error || "Please sign in again.",
            );
            await signOut();
            router.replace("/");
          }
          return;
        }

        const nextProfile = normalizeProfile(result.data);
        setProfile(nextProfile);
        syncAuthUser(nextProfile);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not load profile.";
        setApiError(message);
      } finally {
        if (initialLoad) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [requestProfile, router, signOut, syncAuthUser],
  );

  useEffect(() => {
    void fetchProfile(true);
  }, [fetchProfile]);

  const executeProfileMutation = useCallback(
    async (params: {
      path: string;
      method: "POST" | "PATCH" | "DELETE";
      actionKey: string;
      body?: Record<string, unknown>;
      successMessage: string;
    }) => {
      setBusyAction(params.actionKey);
      setApiError(null);

      try {
        const result = await requestProfile<DriverProfile>(params.path, {
          method: params.method,
          ...(params.body ? { body: JSON.stringify(params.body) } : {}),
        });

        if (!result.ok) {
          setApiError(result.error);
          showErrorAlert("Request failed", result.error);
          return false;
        }

        const nextProfile = normalizeProfile(result.data);
        setProfile(nextProfile);
        syncAuthUser(nextProfile);
        showSuccessAlert("Success", params.successMessage);
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Request failed.";
        setApiError(message);
        showErrorAlert("Request failed", message);
        return false;
      } finally {
        setBusyAction(null);
      }
    },
    [requestProfile, syncAuthUser],
  );

  const openNameEditor = () => {
    if (!profile) return;
    setFirstNameDraft(profile.firstName);
    setLastNameDraft(profile.lastName || "");
    setNameModalVisible(true);
  };

  const saveName = async () => {
    if (!profile) return;

    const nextFirstName = firstNameDraft.trim();
    const nextLastName = lastNameDraft.trim();

    if (!nextFirstName) {
      showWarningAlert("Missing info", "First name is required.");
      return;
    }

    const payload: { firstName?: string; lastName?: string } = {};
    if (nextFirstName !== profile.firstName) {
      payload.firstName = nextFirstName;
    }

    const currentLastName = (profile.lastName || "").trim();
    if (nextLastName !== currentLastName) {
      payload.lastName = nextLastName;
    }

    if (!payload.firstName && payload.lastName === undefined) {
      showWarningAlert("No changes", "Nothing changed to save.");
      return;
    }

    const ok = await executeProfileMutation({
      path: "/profile",
      method: "PATCH",
      actionKey: "save-name",
      body: payload,
      successMessage: "Name updated successfully.",
    });

    if (ok) {
      setNameModalVisible(false);
    }
  };

  const openAddEmail = () => {
    setEmailEditor({
      visible: true,
      mode: "add",
      originalValue: "",
      value: "",
      info: "",
    });
  };

  const openEditEmail = (item: ProfileEmail) => {
    setEmailEditor({
      visible: true,
      mode: "edit",
      originalValue: item.address,
      value: item.address,
      info: item.info || "",
    });
  };

  const saveEmail = async () => {
    const email = emailEditor.value.trim().toLowerCase();
    const info = emailEditor.info.trim();

    if (!email) {
      showWarningAlert("Missing info", "Email is required.");
      return;
    }

    if (emailEditor.mode === "add") {
      const ok = await executeProfileMutation({
        path: "/profile/emails",
        method: "POST",
        actionKey: "add-email",
        body: {
          email,
          ...(info ? { info } : {}),
        },
        successMessage: "Email added successfully.",
      });

      if (ok) {
        setEmailEditor(EMPTY_EDITOR);
      }
      return;
    }

    const oldEmail = emailEditor.originalValue;
    const oldEmailNormalized = oldEmail.trim().toLowerCase();
    const existingInfo =
      profile?.emails.find((item) => item.address === oldEmail)?.info || "";

    const body: { oldEmail: string; newEmail?: string; info?: string } = {
      oldEmail,
    };
    let hasChange = false;

    if (email !== oldEmailNormalized) {
      body.newEmail = email;
      hasChange = true;
    }

    if (info !== existingInfo) {
      body.info = info;
      hasChange = true;
    }

    if (!hasChange) {
      showWarningAlert("No changes", "Nothing changed to save.");
      return;
    }

    const ok = await executeProfileMutation({
      path: "/profile/emails",
      method: "PATCH",
      actionKey: "edit-email",
      body,
      successMessage: "Email updated successfully.",
    });

    if (ok) {
      setEmailEditor(EMPTY_EDITOR);
    }
  };

  const setPrimaryEmail = async (email: string) => {
    await executeProfileMutation({
      path: "/profile/emails/primary",
      method: "PATCH",
      actionKey: `primary-email-${email}`,
      body: { email },
      successMessage: "Primary email updated.",
    });
  };

  const deleteEmail = async (email: string) => {
    showWarningAlert("Delete Email", `Delete ${email}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void executeProfileMutation({
            path: "/profile/emails",
            method: "DELETE",
            actionKey: `delete-email-${email}`,
            body: { email },
            successMessage: "Email deleted.",
          });
        },
      },
    ]);
  };

  const openAddPhone = () => {
    setPhoneEditor({
      visible: true,
      mode: "add",
      originalValue: "",
      value: "",
      info: "",
    });
  };

  const openEditPhone = (item: ProfilePhone) => {
    setPhoneEditor({
      visible: true,
      mode: "edit",
      originalValue: item.number,
      value: item.number,
      info: item.info || "",
    });
  };

  const savePhone = async () => {
    const phone = phoneEditor.value.trim();
    const info = phoneEditor.info.trim();

    if (!phone) {
      showWarningAlert("Missing info", "Phone number is required.");
      return;
    }

    if (phoneEditor.mode === "add") {
      const ok = await executeProfileMutation({
        path: "/profile/phones",
        method: "POST",
        actionKey: "add-phone",
        body: {
          phone,
          ...(info ? { info } : {}),
        },
        successMessage: "Phone added successfully.",
      });

      if (ok) {
        setPhoneEditor(EMPTY_EDITOR);
      }
      return;
    }

    const oldPhone = phoneEditor.originalValue;
    const existingInfo =
      profile?.phones.find((item) => item.number === oldPhone)?.info || "";

    const body: { oldPhone: string; newPhone?: string; info?: string } = {
      oldPhone,
    };
    let hasChange = false;

    if (phone !== oldPhone.trim()) {
      body.newPhone = phone;
      hasChange = true;
    }

    if (info !== existingInfo) {
      body.info = info;
      hasChange = true;
    }

    if (!hasChange) {
      showWarningAlert("No changes", "Nothing changed to save.");
      return;
    }

    const ok = await executeProfileMutation({
      path: "/profile/phones",
      method: "PATCH",
      actionKey: "edit-phone",
      body,
      successMessage: "Phone updated successfully.",
    });

    if (ok) {
      setPhoneEditor(EMPTY_EDITOR);
    }
  };

  const setPrimaryPhone = async (phone: string) => {
    await executeProfileMutation({
      path: "/profile/phones/primary",
      method: "PATCH",
      actionKey: `primary-phone-${phone}`,
      body: { phone },
      successMessage: "Primary phone updated.",
    });
  };

  const deletePhone = async (phone: string) => {
    showWarningAlert("Delete Phone", `Delete ${phone}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void executeProfileMutation({
            path: "/profile/phones",
            method: "DELETE",
            actionKey: `delete-phone-${phone}`,
            body: { phone },
            successMessage: "Phone deleted.",
          });
        },
      },
    ]);
  };

  const uploadPhoto = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        showWarningAlert(
          "Permission required",
          "Please allow photo library access to upload a profile photo.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.75,
        base64: false,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      const asset = result.assets[0];
      const fileName = asset.fileName || "profile.jpg";
      const mimeType =
        asset.mimeType ||
        (fileName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");

      setBusyAction("upload-photo");
      setApiError(null);

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const imageDataUrl = `data:${mimeType};base64,${base64}`;

      const uploadResult = await requestProfile<{
        profileImageUrl: string | null;
        message: string;
      }>("/profile/photo", {
        method: "POST",
        body: JSON.stringify({
          imageDataUrl,
          originalName: fileName,
        }),
      });

      if (!uploadResult.ok) {
        setApiError(uploadResult.error);
        showErrorAlert("Upload failed", uploadResult.error);
        return;
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              profileImageUrl: resolveResourceUrl(
                uploadResult.data.profileImageUrl,
              ),
            }
          : prev,
      );

      showSuccessAlert(
        "Profile photo",
        uploadResult.data.message || "Profile photo updated successfully.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not upload photo.";
      setApiError(message);
      showErrorAlert("Upload failed", message);
    } finally {
      setBusyAction(null);
    }
  };

  const onLogOut = () => {
    showWarningAlert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/");
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#0284C7" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ApiErrorText error={apiError} className="px-4" />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 18) + 96,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void fetchProfile(false)}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <Image source={avatarSource} style={styles.avatar} />

          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.driverId}>
            Driver ID: {profile?.id || user?.id || "—"}
          </Text>

          <TouchableOpacity
            style={[styles.photoButton, isBusy && styles.disabledButton]}
            onPress={() => void uploadPhoto()}
            disabled={isBusy}
          >
            {busyAction === "upload-photo" ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="camera-outline" size={16} color="#FFFFFF" />
                <Text style={styles.photoButtonText}>Change Photo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Basic Information</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={openNameEditor}
              disabled={isBusy}
            >
              <Ionicons name="create-outline" size={15} color="#0F766E" />
              <Text style={styles.addButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>First name</Text>
              <Text style={styles.infoValue}>{profile?.firstName || "—"}</Text>
            </View>
            <View style={styles.rowDivider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Last name</Text>
              <Text style={styles.infoValue}>{profile?.lastName || "—"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Emails</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={openAddEmail}
              disabled={isBusy}
            >
              <Ionicons name="add" size={16} color="#0F766E" />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cardBody}>
            {!profile?.emails?.length ? (
              <Text style={styles.emptyText}>No email saved yet.</Text>
            ) : (
              profile.emails.map((item) => (
                <View key={item.address} style={styles.contactItem}>
                  <View style={styles.contactMain}>
                    <Text style={styles.contactValue}>{item.address}</Text>
                    {!!item.info && (
                      <Text style={styles.contactInfo}>{item.info}</Text>
                    )}
                    {item.isPrimary && (
                      <View style={styles.primaryBadge}>
                        <Ionicons name="star" size={12} color="#92400E" />
                        <Text style={styles.primaryBadgeText}>Primary</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.contactActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => openEditEmail(item)}
                      disabled={isBusy}
                    >
                      <Ionicons
                        name="create-outline"
                        size={16}
                        color="#0369A1"
                      />
                    </TouchableOpacity>
                    {!item.isPrimary && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => void setPrimaryEmail(item.address)}
                        disabled={isBusy}
                      >
                        <Ionicons
                          name="star-outline"
                          size={16}
                          color="#0F766E"
                        />
                      </TouchableOpacity>
                    )}
                    {!item.isPrimary && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => void deleteEmail(item.address)}
                        disabled={isBusy}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color="#B91C1C"
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Phones</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={openAddPhone}
              disabled={isBusy}
            >
              <Ionicons name="add" size={16} color="#0F766E" />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cardBody}>
            {!profile?.phones?.length ? (
              <Text style={styles.emptyText}>No phone saved yet.</Text>
            ) : (
              profile.phones.map((item) => (
                <View key={item.number} style={styles.contactItem}>
                  <View style={styles.contactMain}>
                    <Text style={styles.contactValue}>{item.number}</Text>
                    {!!item.info && (
                      <Text style={styles.contactInfo}>{item.info}</Text>
                    )}
                    {item.isPrimary && (
                      <View style={styles.primaryBadge}>
                        <Ionicons name="star" size={12} color="#92400E" />
                        <Text style={styles.primaryBadgeText}>Primary</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.contactActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => openEditPhone(item)}
                      disabled={isBusy}
                    >
                      <Ionicons
                        name="create-outline"
                        size={16}
                        color="#0369A1"
                      />
                    </TouchableOpacity>
                    {!item.isPrimary && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => void setPrimaryPhone(item.number)}
                        disabled={isBusy}
                      >
                        <Ionicons
                          name="star-outline"
                          size={16}
                          color="#0F766E"
                        />
                      </TouchableOpacity>
                    )}
                    {!item.isPrimary && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => void deletePhone(item.number)}
                        disabled={isBusy}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color="#B91C1C"
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={onLogOut}
          disabled={isBusy}
        >
          <Ionicons name="log-out-outline" size={18} color="#B91C1C" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <EditModal
        visible={nameModalVisible}
        title="Edit Name"
        submitLabel="Save"
        busy={busyAction === "save-name"}
        onClose={() => setNameModalVisible(false)}
        onSubmit={() => void saveName()}
      >
        <Text style={styles.inputLabel}>First Name</Text>
        <TextInput
          style={styles.input}
          value={firstNameDraft}
          onChangeText={setFirstNameDraft}
          placeholder="First name"
          placeholderTextColor="#94A3B8"
          editable={busyAction !== "save-name"}
        />

        <Text style={styles.inputLabel}>Last Name</Text>
        <TextInput
          style={styles.input}
          value={lastNameDraft}
          onChangeText={setLastNameDraft}
          placeholder="Last name"
          placeholderTextColor="#94A3B8"
          editable={busyAction !== "save-name"}
        />
      </EditModal>

      <EditModal
        visible={emailEditor.visible}
        title={emailEditor.mode === "add" ? "Add Email" : "Edit Email"}
        submitLabel={emailEditor.mode === "add" ? "Add" : "Save"}
        busy={busyAction === "add-email" || busyAction === "edit-email"}
        onClose={() => setEmailEditor(EMPTY_EDITOR)}
        onSubmit={() => void saveEmail()}
      >
        <Text style={styles.inputLabel}>Email</Text>
        <TextInput
          style={styles.input}
          value={emailEditor.value}
          onChangeText={(value) =>
            setEmailEditor((prev) => ({ ...prev, value }))
          }
          placeholder="email@example.com"
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
        />

        <Text style={styles.inputLabel}>Info (optional)</Text>
        <TextInput
          style={styles.input}
          value={emailEditor.info}
          onChangeText={(info) => setEmailEditor((prev) => ({ ...prev, info }))}
          placeholder="work / personal"
          placeholderTextColor="#94A3B8"
        />
      </EditModal>

      <EditModal
        visible={phoneEditor.visible}
        title={phoneEditor.mode === "add" ? "Add Phone" : "Edit Phone"}
        submitLabel={phoneEditor.mode === "add" ? "Add" : "Save"}
        busy={busyAction === "add-phone" || busyAction === "edit-phone"}
        onClose={() => setPhoneEditor(EMPTY_EDITOR)}
        onSubmit={() => void savePhone()}
      >
        <Text style={styles.inputLabel}>Phone</Text>
        <TextInput
          style={styles.input}
          value={phoneEditor.value}
          onChangeText={(value) =>
            setPhoneEditor((prev) => ({ ...prev, value }))
          }
          placeholder="+971XXXXXXXXX"
          placeholderTextColor="#94A3B8"
          keyboardType="phone-pad"
        />

        <Text style={styles.inputLabel}>Info (optional)</Text>
        <TextInput
          style={styles.input}
          value={phoneEditor.info}
          onChangeText={(info) => setPhoneEditor((prev) => ({ ...prev, info }))}
          placeholder="work / personal"
          placeholderTextColor="#94A3B8"
        />
      </EditModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  loadingText: {
    marginTop: 10,
    color: "#334155",
    fontSize: 14,
    fontWeight: "500",
  },
  headerCard: {
    marginTop: 6,
    marginBottom: 14,
    borderRadius: 20,
    backgroundColor: "#0F172A",
    paddingVertical: 24,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "#E2E8F0",
    marginBottom: 12,
  },
  displayName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  driverId: {
    fontSize: 13,
    color: "#CBD5E1",
    marginTop: 4,
    marginBottom: 14,
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0EA5E9",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  photoButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  cardTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "700",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
  },
  addButtonText: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "700",
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoLabel: {
    color: "#64748B",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  infoValue: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  rowDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },
  contactItem: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  contactMain: {
    marginBottom: 8,
  },
  contactValue: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "600",
  },
  contactInfo: {
    marginTop: 4,
    color: "#475569",
    fontSize: 12,
  },
  primaryBadge: {
    marginTop: 7,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  primaryBadgeText: {
    color: "#92400E",
    fontSize: 11,
    fontWeight: "700",
  },
  contactActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 6,
  },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#64748B",
    fontSize: 13,
  },
  signOutButton: {
    marginTop: 4,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  signOutText: {
    color: "#B91C1C",
    fontSize: 15,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  modalTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "700",
  },
  inputLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: "#0F172A",
    fontSize: 14,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
  },
  modalButton: {
    minWidth: 92,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelButton: {
    backgroundColor: "#F1F5F9",
  },
  modalSubmitButton: {
    backgroundColor: "#0284C7",
  },
  modalCancelText: {
    color: "#334155",
    fontWeight: "600",
  },
  modalSubmitText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});

export default Profile;
