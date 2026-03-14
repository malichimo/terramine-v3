// screens/OnboardingScreen.tsx
// Shows once on first launch. Uses AsyncStorage to persist the "seen" flag.
// Install dependency if not present: npx expo install @react-native-async-storage/async-storage

import React, { useRef, useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, FlatList,
  Dimensions, Animated, SafeAreaView, Platform, StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const ONBOARDING_SEEN_KEY = '@terramine_onboarding_seen';

interface Slide {
  key: string;
  emoji: string;
  title: string;
  body: string;
  bgColor: string;
  accentColor: string;
}

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    emoji: '⛏️',
    title: 'Welcome to TerraMine',
    body: 'The real world is your mine. Buy virtual properties on a real map, earn passive income, and check in to mines owned by other players to earn TerraBucks.',
    bgColor: '#1a237e',
    accentColor: '#5C6BC0',
  },
  {
    key: 'tb',
    emoji: '💰',
    title: "You Start with 1,000 TB",
    body: "TerraBucks (TB) are the in-game currency. You've been given 1,000 TB to get started. Use them to purchase your first TerraAcre on the map.",
    bgColor: '#1b5e20',
    accentColor: '#43A047',
  },
  {
    key: 'buy',
    emoji: '🗺️',
    title: 'Buy Properties',
    body: 'Tap any green square on the map to purchase it as your own TerraAcre. Each property is assigned a mine type — Rock, Coal, Gold, or Diamond — with different earning rates.',
    bgColor: '#004d40',
    accentColor: '#00897B',
  },
  {
    key: 'rent',
    emoji: '📈',
    title: 'Earn Passive Rent',
    body: 'Every property you own earns a small amount of real USD over time — automatically. Diamond mines earn the most. Check your Portfolio tab to see your estimated monthly earnings.',
    bgColor: '#4a148c',
    accentColor: '#8E24AA',
  },
  {
    key: 'checkin',
    emoji: '👋',
    title: 'Check In Everywhere',
    body: "See an orange square on the map? That's someone else's mine. Walk near it and check in to earn TB for yourself — and give the owner a bonus too. Leave a message or photo when you visit!",
    bgColor: '#e65100',
    accentColor: '#FB8C00',
  },
];

interface OnboardingScreenProps {
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

  const handleDone = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    } catch (e) {
      console.error('Failed to save onboarding flag:', e);
    }
    onDone();
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      handleDone();
    }
  };

  const handleSkip = () => {
    handleDone();
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const isLastSlide = currentIndex === SLIDES.length - 1;
  const currentSlide = SLIDES[currentIndex];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentSlide.bgColor }]}>
      <StatusBar barStyle="light-content" backgroundColor={currentSlide.bgColor} />

      {/* Skip button */}
      {!isLastSlide && (
        <TouchableOpacity
          style={[styles.skipButton, { paddingTop: statusBarHeight + 8 }]}
          onPress={handleSkip}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <Animated.FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        renderItem={({ item }: { item: Slide }) => (
          <View style={styles.slide}>
            <View style={[styles.emojiCircle, { backgroundColor: item.accentColor + '33' }]}>
              <Text style={styles.slideEmoji}>{item.emoji}</Text>
            </View>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideBody}>{item.body}</Text>
          </View>
        )}
      />

      {/* Bottom controls */}
      <View style={styles.footer}>
        {/* Dot indicators */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => {
            const inputRange = [
              (i - 1) * SCREEN_WIDTH,
              i * SCREEN_WIDTH,
              (i + 1) * SCREEN_WIDTH,
            ];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.4, 1, 0.4],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  { width: dotWidth, opacity, backgroundColor: currentSlide.accentColor },
                ]}
              />
            );
          })}
        </View>

        {/* Next / Get Started button */}
        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: currentSlide.accentColor }]}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={styles.nextButtonText}>
            {isLastSlide ? "Let's Mine! ⛏️" : 'Next →'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skipButton: {
    position: 'absolute',
    top: 0,
    right: 20,
    zIndex: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  skipText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontWeight: '500',
  },

  // Slide
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingTop: 60,
    paddingBottom: 20,
  },
  emojiCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  slideEmoji: {
    fontSize: 64,
  },
  slideTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 34,
  },
  slideBody: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
    lineHeight: 24,
  },

  // Footer
  footer: {
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === 'android' ? 24 : 16,
    alignItems: 'center',
    gap: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  nextButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: 'bold',
  },
});
