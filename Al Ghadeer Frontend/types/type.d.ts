import type React from "react";
import type {
  ImageSourcePropType,
  TextInputProps,
  TouchableOpacityProps,
} from "react-native";

export interface ButtonProps extends Omit<TouchableOpacityProps, "onPress"> {
  title: string;
  onPress?: () => void;
  bgVariant?: "primary" | "secondary" | "danger" | "success" | "outline";
  textVariant?: "default" | "primary" | "secondary" | "danger" | "success";
  IconLeft?: React.ComponentType;
  IconRight?: React.ComponentType;
  className?: string;
}

export interface InputFieldProps extends TextInputProps {
  label: string;
  labelStyle?: string;
  icon?: ImageSourcePropType;
  secureTextEntry?: boolean;
  containerStyle?: string;
  inputStyle?: string;
  iconStyle?: string;
  className?: string;
}

export interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  profile_image_url?: string;
  car_image_url?: string;
  car_seats: number;
  rating?: number;
}

export interface MarkerData extends Driver {
  latitude: number;
  longitude: number;
  title: string;
  time?: number;
  price?: string;
}

export interface Ride {
  ride_id?: string;
  origin_address: string;
  destination_address: string;
  origin_latitude?: number;
  origin_longitude?: number;
  destination_latitude: number;
  destination_longitude: number;
  ride_time: number;
  fare_price?: number;
  payment_status: string;
  created_at: string;
  driver: Driver;
}
