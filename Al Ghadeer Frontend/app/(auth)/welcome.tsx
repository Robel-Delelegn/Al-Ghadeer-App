import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Swiper from 'react-native-swiper';
import { Ionicons } from '@expo/vector-icons';
import { onboarding } from '@/constants';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

const Onboarding = () => {
  const swiperRef = useRef<Swiper>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isLastSlide = activeIndex === onboarding.length - 1;

  useEffect(() => {
    // Subtle animation on slide change
    Animated.parallel([
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.7,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 0.95,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
      ]),
    ]).start();
  }, [activeIndex]);

  const handleSkip = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    router.replace('/(auth)/sign-in');
  };

  const handleNext = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    
    if (isLastSlide) {
      router.replace('/(auth)/sign-in');
    } else {
      swiperRef.current?.scrollBy(1);
    }
  };

  const handleDotPress = async (index: number) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    swiperRef.current?.scrollTo(index);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Skip Button - Premium positioned */}
      <TouchableOpacity
        onPress={handleSkip}
        style={styles.skipButton}
        activeOpacity={0.7}
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Main Content */}
      <View style={styles.contentContainer}>
        <Swiper
          ref={swiperRef}
          loop={false}
          showsPagination={false}
          onIndexChanged={(index) => setActiveIndex(index)}
          removeClippedSubviews={false}
          autoplay={false}
        >
          {onboarding.map((item, index) => (
            <Animated.View
              key={item.id}
              style={[
                styles.slideContainer,
                {
                  opacity: fadeAnim,
                  transform: [{ scale: scaleAnim }],
                },
              ]}
            >
              {/* Image Container with Premium Shadow */}
              <View style={styles.imageWrapper}>
                <View style={styles.imageShadowContainer}>
                  <Image
                    source={item.image}
                    style={styles.image}
                    resizeMode="contain"
                  />
                </View>
              </View>

              {/* Content Section */}
              <View style={styles.textContainer}>
                <Text style={styles.title}>{item.title}</Text>
                <View style={styles.divider} />
                <Text style={styles.description}>{item.description}</Text>
              </View>

              {/* Decorative Elements */}
              <View style={styles.decorativeContainer}>
                <View style={[styles.decorativeCircle, styles.circle1]} />
                <View style={[styles.decorativeCircle, styles.circle2]} />
                <View style={[styles.decorativeCircle, styles.circle3]} />
              </View>
            </Animated.View>
          ))}
        </Swiper>
      </View>

      {/* Bottom Action Section */}
      <View style={styles.bottomSection}>
        {/* Custom Pagination Dots */}
        <View style={styles.customPagination}>
          {onboarding.map((_, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => handleDotPress(index)}
              activeOpacity={0.7}
              style={styles.customDotContainer}
            >
              <View
                style={[
                  styles.customDot,
                  activeIndex === index && styles.customDotActive,
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Premium CTA Button */}
        <TouchableOpacity
          onPress={handleNext}
          style={styles.ctaButton}
          activeOpacity={0.9}
        >
          <View style={styles.ctaButtonContent}>
            <Text style={styles.ctaButtonText}>
              {isLastSlide ? 'Get Started' : 'Continue'}
            </Text>
            <Ionicons
              name={isLastSlide ? 'checkmark-circle' : 'arrow-forward'}
              size={22}
              color="#FFFFFF"
              style={styles.ctaIcon}
            />
          </View>
          <View style={styles.ctaButtonGlow} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  skipButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    right: 24,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  skipText: {
    fontSize: 14,
    fontFamily: 'Jakarta-SemiBold',
    color: '#475569',
    letterSpacing: 0.3,
  },
  contentContainer: {
    flex: 1,
    marginTop: 80,
  },
  slideContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 20,
  },
  imageWrapper: {
    width: width * 0.85,
    height: height * 0.35,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 48,
  },
  imageShadowContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0286FF',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 40,
    elevation: 20,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    maxWidth: width * 0.9,
  },
  title: {
    fontSize: 32,
    fontFamily: 'Jakarta-ExtraBold',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 40,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  divider: {
    width: 48,
    height: 3,
    backgroundColor: '#0286FF',
    borderRadius: 2,
    marginBottom: 20,
    shadowColor: '#0286FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  description: {
    fontSize: 16,
    fontFamily: 'Jakarta-Regular',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 26,
    letterSpacing: 0.2,
    paddingHorizontal: 8,
  },
  decorativeContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    top: 0,
    left: 0,
    zIndex: -1,
  },
  decorativeCircle: {
    position: 'absolute',
    borderRadius: 1000,
    opacity: 0.06,
  },
  circle1: {
    width: 200,
    height: 200,
    backgroundColor: '#0286FF',
    top: -50,
    right: -50,
  },
  circle2: {
    width: 150,
    height: 150,
    backgroundColor: '#0286FF',
    bottom: 100,
    left: -30,
  },
  circle3: {
    width: 100,
    height: 100,
    backgroundColor: '#0286FF',
    top: '40%',
    right: 20,
  },
  bottomSection: {
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === 'ios' ? 40 : 32,
    paddingTop: 20,
    backgroundColor: '#FFFFFF',
  },
  customPagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    gap: 8,
  },
  customDotContainer: {
    padding: 4,
  },
  customDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    transition: 'all 0.3s ease',
  },
  customDotActive: {
    width: 24,
    backgroundColor: '#0286FF',
    shadowColor: '#0286FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  ctaButton: {
    width: '100%',
    height: 60,
    borderRadius: 16,
    backgroundColor: '#0286FF',
    overflow: 'hidden',
    shadowColor: '#0286FF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  ctaButtonContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  ctaButtonText: {
    fontSize: 17,
    fontFamily: 'Jakarta-SemiBold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginRight: 8,
  },
  ctaIcon: {
    marginLeft: 4,
  },
  ctaButtonGlow: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    backgroundColor: '#0286FF',
    opacity: 0.2,
    borderRadius: 40,
    zIndex: 1,
  },
});

export default Onboarding;
