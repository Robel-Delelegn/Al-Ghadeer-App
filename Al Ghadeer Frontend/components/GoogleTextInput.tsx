import { icons } from '@/constants';
import { Image, View } from 'react-native';
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";

const api_key = process.env.EXPO_PUBLIC_GOOGLE_API_KEY

const GoogleTextInput = ({ icon, containerStyle, handlePress, initialLocation=null }) => {
  return (
            <GooglePlacesAutocomplete
                placeholder="Search Places..."
                fetchDetails={true}
                debounce={200}
                onPress={(data, details=null) => {
                    handlePress({
                    latitude: details?.geometry.location.lat, longitude: details?.geometry.location.lng, address: data.description})
                }}
                query={{
                    key: api_key,
                    language: 'en',
                }}
                renderLeftButton={() => (
                    <View className="justify-center items-center w-6 h-6">
                        <Image source={icon ? icon: icons.search} className="w-6 h-6" resizeMode="contain"/>
                    </View>
                )}
                textInputProps={{
                    placeholderTextColor: "gray",
                    placeholder: initialLocation || "Where do you want to go?"

                }}
                styles={{
                    textInputContainer: {
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 6,
                        marginHorizontal: 0,
                        position: 'relative',
                        backgroundColor: 'white',
                        elevation: 2,

                    },
                    textInput: {
                        fontSize: 16,
                        fontWeight: 600,
                        backgroundColor: "white",
                        marginTop: 0,
                        marginBottom: 0,
                        width: '100%',
                        borderRadius: 0,
                    },
                    listView: {
                        borderRadius: 2,
                        top: 0,
                        marginTop: 5,
                        backgroundColor: 'white',
                        position: "relative",
                        width: '100%',
                        zIndex: 99,
                        shadowColor: "#d4d4d4"
                    },
                }}
            />
  );
};

export default GoogleTextInput;
