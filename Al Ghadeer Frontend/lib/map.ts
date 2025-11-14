import { Driver, MarkerData } from "@/types/type";
import { CameraPosition } from "expo-maps";

const directionsAPI = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

export const generateMarkersFromData = ({
                                            data,
                                            userLatitude,
                                            userLongitude,
                                        }: {
    data: Driver[];
    userLatitude: number;
    userLongitude: number;
}): MarkerData[] => {
    return data.map((driver) => {
        const latOffset = (Math.random() - 0.5) * 0.01; // Random offset between -0.005 and 0.005
        const lngOffset = (Math.random() - 0.5) * 0.01; // Random offset between -0.005 and 0.005

        return {
            latitude: userLatitude + latOffset,
            longitude: userLongitude + lngOffset,
            title: `${driver.first_name} ${driver.last_name}`,
            ...driver,
        };
    });
};

interface Args {
    userLatitude: number | null;
    userLongitude: number | null;
    destinationLatitude?: number | null;
    destinationLongitude?: number | null;
}

export function calculateCameraPosition({
                                            userLatitude,
                                            userLongitude,
                                            destinationLatitude,
                                            destinationLongitude,
                                        }: Args): CameraPosition {
    // 1️⃣ No user location? Use Dubai as default center with moderate zoom
    if (userLatitude == null || userLongitude == null) {
        return {
            coordinates: { latitude: 25.2048, longitude: 55.2708 }, // Dubai coordinates
            zoom: 12, // Earth visible at level 0; 12 is a moderate city‐level zoom
        };
    }

    // 2️⃣ Only user location (no destination): zoom in tighter around user
    if (
        destinationLatitude == null ||
        destinationLongitude == null
    ) {
        return {
            coordinates: { latitude: userLatitude, longitude: userLongitude },
            zoom: 15,
        };
    }

    // 3️⃣ Both user & destination: center between them and compute zoom
    const minLat = Math.min(userLatitude, destinationLatitude);
    const maxLat = Math.max(userLatitude, destinationLatitude);
    const minLng = Math.min(userLongitude, destinationLongitude);
    const maxLng = Math.max(userLongitude, destinationLongitude);

    const centerLat = (userLatitude + destinationLatitude) / 2;
    const centerLng = (userLongitude + destinationLongitude) / 2;

    // Convert degree difference roughly to kilometers: 1° ≈ 111 km
    const latKm = (maxLat - minLat) * 111;
    const lngKm = (maxLng - minLng) * (111 * Math.cos(centerLat * (Math.PI / 180)));
    const spanKm = Math.max(latKm, lngKm);

    // Map a span in km to Google Maps zoom (~higher span ➝ lower zoom):
    const zoom = Math.max(
        5,
        Math.min(16, Math.round(14 - Math.log2(spanKm + 1)))
    );

    return {
        coordinates: { latitude: centerLat, longitude: centerLng },
        zoom,
    };
}
export const calculateDriverTimes = async ({
                                               markers,
                                               userLatitude,
                                               userLongitude,
                                               destinationLatitude,
                                               destinationLongitude,
                                           }: {
    markers: MarkerData[];
    userLatitude: number | null;
    userLongitude: number | null;
    destinationLatitude: number | null;
    destinationLongitude: number | null;
}) => {
    if (
        !userLatitude ||
        !userLongitude ||
        !destinationLatitude ||
        !destinationLongitude
    )
        return;

    try {
        const timesPromises = markers.map(async (marker) => {
            const responseToUser = await fetch(
                `https://maps.googleapis.com/maps/api/directions/json?origin=${marker.latitude},${marker.longitude}&destination=${userLatitude},${userLongitude}&key=${directionsAPI}`,
            );
            const dataToUser = await responseToUser.json();
            const timeToUser = dataToUser.routes[0].legs[0].duration.value; // Time in seconds

            const responseToDestination = await fetch(
                `https://maps.googleapis.com/maps/api/directions/json?origin=${userLatitude},${userLongitude}&destination=${destinationLatitude},${destinationLongitude}&key=${directionsAPI}`,
            );
            const dataToDestination = await responseToDestination.json();
            const timeToDestination =
                dataToDestination.routes[0].legs[0].duration.value; // Time in seconds

            const totalTime = (timeToUser + timeToDestination) / 60; // Total time in minutes
            const price = (totalTime * 0.5).toFixed(2); // Calculate price based on time

            return {...marker, time: totalTime, price};
        });

        return await Promise.all(timesPromises);
    } catch (error) {
        console.error("Error calculating driver times:", error);
    }
};