import { icons } from '@/constants';
import { calculateCameraPosition } from "@/lib/map";
import { useLocationStore, useOrderStore } from "@/store";
import { Order } from '@/types/order';
import { GoogleMaps } from 'expo-maps';
import React, { useState, useEffect } from 'react';
import { ImageSourcePropType, Platform, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

type OrderMarker = {
    id: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
    title: string;
    icon: ImageSourcePropType;
  };

export default function MyMap({orders}: {orders: Order[]}) {
    const [ routeCoords, setRouteCoords ] = useState<{ latitude: number; longitude: number }[]>([]);
    const [driverLocation, setDriverLocation] = useState<{latitude: number, longitude: number} | null>(null);
    const { userLongitude, userLatitude, destinationLatitude, destinationLongitude, setUserLocation } = useLocationStore();
    const { currentDriver } = useOrderStore();
    
    // Get driver's current location
    useEffect(() => {
        const getDriverLocation = async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    console.log('Location permission denied');
                    return;
                }

                const location = await Location.getCurrentPositionAsync({});
                const coords = {
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude
                };
                
                console.log('Driver location obtained:', coords);
                setDriverLocation(coords);
                
                // Also update the location store
                const address = await Location.reverseGeocodeAsync(coords);
                setUserLocation({
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    address: `${address[0]?.name || ''}, ${address[0]?.region || ''}`
                });
                
            } catch (error) {
                console.error('Error getting driver location:', error);
            }
        };

        getDriverLocation();
    }, [setUserLocation]);
    
    // Filter orders that have valid coordinates - handle both nested and flat structures
    const ordersWithCoordinates = orders.filter(order => {
        const latitude = order.customer?.latitude || order.latitude;
        const longitude = order.customer?.longitude || order.longitude;
        return latitude && longitude && 
               typeof latitude === 'number' && 
               typeof longitude === 'number';
    });
    
    const ordersMarkers:OrderMarker[] = ordersWithCoordinates.map((order, index) => {
        const latitude = order.customer?.latitude || order.latitude;
        const longitude = order.customer?.longitude || order.longitude;
        const customerName = order.customer?.name || order.customer_name || 'Customer';
        
        return {
            id: `order-${order.id}`,
            coordinates: {
                latitude: latitude,
                longitude: longitude 
            },
            title: customerName,
            icon: icons.pin,
        };
    });
    if (Platform.OS !== 'android') {
        return (
            <View style={styles.container}>
                <Text style={styles.platformText}>
                    This map is configured for Android only.
                </Text>
            </View>
        );
    }
    
    // Use driver location if available, otherwise fall back to location store
    const currentLatitude = driverLocation?.latitude || userLatitude;
    const currentLongitude = driverLocation?.longitude || userLongitude;
    
    const camera = calculateCameraPosition({
        userLongitude: currentLongitude, 
        userLatitude: currentLatitude, 
        destinationLatitude, 
        destinationLongitude
    });
    
    const startMarker:OrderMarker[] = currentLatitude && currentLongitude ? [
        {
            id: 'start',
            coordinates: {latitude: currentLatitude, longitude: currentLongitude},
            title: 'Your Location',
            icon: icons.selectedMarker,
        }
    ] : [];

    const allMarkers = [...startMarker, ...ordersMarkers];
    
    console.log('Map rendering with:', {
        driverLocation,
        currentLatitude,
        currentLongitude,
        ordersCount: ordersMarkers.length,
        cameraPosition: camera.coordinates
    });
    

    return (
        <GoogleMaps.View
            style={styles.map}
            cameraPosition={camera}
            uiSettings={{
                zoomControlsEnabled: true,
                compassEnabled: true,
                myLocationButtonEnabled: true,
                scrollGesturesEnabled: true,
                zoomGesturesEnabled: true,
                rotationGesturesEnabled: true,
                tiltGesturesEnabled: true,
                scrollGesturesEnabledDuringRotateOrZoom:true,
            }}
            markers={allMarkers}
        />
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    map: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    platformText: {
        fontSize: 18,
        textAlign: 'center',
        marginHorizontal: 20,
    },
});

