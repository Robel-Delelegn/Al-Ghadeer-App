import {
  Text,
  View,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { icons, images } from '@/constants';
import InputField from '@/components/InputField';
import { useState } from 'react';
import CustomButton from '@/components/CustomButton';
import { useSignUp } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import OAuth from '@/components/OAuth';
import { ReactNativeModal } from 'react-native-modal';
// Removed import - PostUser function will be defined inline

const IP_ADDRESS = process.env.IP_ADDRESS || '10.140.130.63';

// Inline function to post user data to server
const PostUser = async (userData: { name: string; email: string; clerk_id: string }) => {
  try {
    const response = await fetch(`http://${IP_ADDRESS}:3000/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error posting user:', error);
    throw error;
  }
};

const SignUp = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');

  const onSignUpPress = async () => {
    if (!isLoaded) return;

    console.log(form['email'], form['password']);

    // Start sign-up process using email and password provided
    try {
      await signUp.create({
        emailAddress: form.email,
        password: form.password,
      });

      // Send user an email with verification code
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

      // Set 'pendingVerification' to true to display second form
      // and capture OTP code
      setPendingVerification(true);
    } catch (err) {
      const errorMsg =
        (err as any)?.errors?.[0]?.longMessage ||
        (err as any)?.message ||
        'Something went wrong';
      Alert.alert('Error', errorMsg);
    }
  };
  // Handle submission of verification form
  const onVerifyPress = async () => {
    if (!isLoaded) return;

    try {
      // Use the code the user provided to attempt verification
      const signUpAttempt = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (signUpAttempt.status === 'complete') {
        await setActive({ session: signUpAttempt.createdSessionId });
        setPendingVerification(false);

        const clerk_id = signUpAttempt?.createdSessionId;
        if (clerk_id) {
          const userDataToSave = {
            name: form.name, // Use the name from your form state
            email: form.email, // Use the email from your form state
            clerk_id: clerk_id, // Get the unique Clerk user ID
          };
          console.log('Attempting to save user to Neon DB:', userDataToSave);
          const dbUser = await PostUser(userDataToSave);
          if (dbUser) {
            console.log('User successfully saved to Neon DB:', dbUser);
            Alert.alert('Success', 'Account created and user data saved!');
            router.replace('/(root)/(tabs)/home'); // Redirect after successful DB save
          }
        }
      }
    } catch (err) {
      const errorMsg =
        (err as any)?.errors?.[0]?.longMessage ||
        (err as any)?.message ||
        'Something went wrong';
      Alert.alert('Error', errorMsg);
    }
  };

  return (
    <ScrollView className="flex-1 bg-white">
      <ReactNativeModal isVisible={pendingVerification}>
        <View className="bg-white px-7 py-9 rounded-2xl min-h-[300px]">
          <Text className="text-2xl font-JakartaExtraBold mb-2">
            Verification
          </Text>
          <Text className="font-Jakarta mb-5">
            We&apos;ve sent a verification code to {form.email}
          </Text>
          <InputField
            label="Code"
            icon={icons.lock}
            placeholder="12345"
            value={code}
            keyboardType="numeric"
            onChangeText={(code) => setCode(code)}
          />
          <CustomButton
            title="Verify Email"
            onPress={onVerifyPress}
            className="mt-5 bg-success-500"
          />
        </View>
      </ReactNativeModal>
      <View className="flex-1 bg-white">
        <View className="relative w-full h-[250px]">
          <Image source={images.signUpCar} className="z-0 w-full h-[250px]" />
          <Text className="text-2xl text-black font-JakartaSemiBold absolute bottom-5 left-5">
            Create Your Account
          </Text>
        </View>
        <View className="p-5">
          <InputField
            label="Name"
            placeholder="Enter your name"
            icon={icons.person}
            value={form.name}
            onChangeText={(value: any) => setForm({ ...form, name: value })}
          />
          <InputField
            label="Email"
            placeholder="Enter your email"
            icon={icons.email}
            value={form.email}
            onChangeText={(value: any) => setForm({ ...form, email: value })}
          />
          <InputField
            label="Password"
            placeholder="Enter your password"
            icon={icons.lock}
            value={form.password}
            secureTextEntry={true}
            onChangeText={(value: any) => setForm({ ...form, password: value })}
          />
          <CustomButton
            title="Sign Up"
            onPress={onSignUpPress}
            className="mt-6"
          />
          <Link
            href={'/sign-in'}
            className="text-lg text-center text-general-200 mt-10"
          >
            <Text> Already have an account? </Text>
            <Text className="text-primary-500">Log In</Text>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
};

export default SignUp;
