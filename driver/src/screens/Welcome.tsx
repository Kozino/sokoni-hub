import React, { useRef, useState } from 'react';
import { FlatList, Image, ImageBackground, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/AuthUI';
import { C } from '../theme';

const slides = [
  { icon: '🏍️', title: 'Deliver and earn on your terms', text: 'Join Sokoni Hub’s local delivery fleet and choose when you ride.' },
  { icon: '🧭', title: 'Clear routes, live tracking', text: 'See pickups and drop-offs clearly, and share your live location with buyers.' },
  { icon: '✅', title: 'Ready to ride?', text: 'Create your rider account. Our team reviews every application before you go online.' },
];

export function Welcome({ onNav }: { onNav: (s: 'login' | 'register') => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const slideWidth = width;
  const [page, setPage] = useState(0);
  const ref = useRef<FlatList>(null);
  const last = page === slides.length - 1;

  return (
    <ImageBackground source={require('../../assets/hero.jpg')} resizeMode="cover" style={{ flex: 1 }}>
      <View style={styles.overlay}>
        <View style={[styles.top, { paddingTop: insets.top + 18 }]}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.brand}>Sokoni <Text style={{ color: C.gold }}>Driver</Text></Text>
        </View>

        <FlatList
          ref={ref}
          data={slides}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          getItemLayout={(_, index) => ({ length: slideWidth, offset: slideWidth * index, index })}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / slideWidth))}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width: slideWidth }]}>
              <View style={styles.slideIcon}><Text style={styles.slideEmoji}>{item.icon}</Text></View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.text}>{item.text}</Text>
            </View>
          )}
        />

        <View style={styles.dots}>
          {slides.map((_, i) => <View key={i} style={[styles.dot, { backgroundColor: i === page ? C.gold : 'rgba(255,255,255,.45)' }]} />)}
        </View>

        <View style={[styles.actions, { paddingBottom: 22 + insets.bottom }]}>
          {!last ? (
            <Button variant="gold" onPress={() => ref.current?.scrollToIndex({ index: page + 1 })}>Continue</Button>
          ) : (
            <>
              <Button variant="gold" onPress={() => onNav('register')}>Create a rider account</Button>
              <Button variant="secondary" onPress={() => onNav('login')}>Sign in</Button>
            </>
          )}
          {!last && (
            <Pressable accessibilityRole="button" onPress={() => onNav('login')}>
              <Text style={styles.skip}>Skip — I already have an account</Text>
            </Pressable>
          )}
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(4,38,26,0.84)' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  logo: { width: 40, height: 40 },
  brand: { fontSize: 24, fontWeight: '900', color: '#fff' },
  slide: { justifyContent: 'center', paddingHorizontal: 28, flex: 1 },
  slideIcon: { width: 76, height: 76, borderRadius: 23, backgroundColor: 'rgba(255,122,0,.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  slideEmoji: { fontSize: 36 },
  title: { color: '#fff', fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.8 },
  text: { color: 'rgba(255,255,255,.86)', fontSize: 16, lineHeight: 24, marginTop: 15 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  actions: { paddingHorizontal: 24, gap: 12 },
  skip: { color: '#fff', textAlign: 'center', fontWeight: '800', paddingVertical: 8, fontSize: 14 },
});
