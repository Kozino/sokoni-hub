import React, { useRef, useState } from 'react';
import { FlatList, Image, ImageBackground, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CheckBadgeIcon, MapIcon, TruckIcon } from 'react-native-heroicons/outline';
import { Button } from '../components/AuthUI';
import { C } from '../theme';

const slides = [
  { Icon: TruckIcon, title: 'Deliver and earn on your terms', text: 'Join Sokoni Hub’s local delivery fleet and choose when you ride.' },
  { Icon: MapIcon, title: 'Clear routes, live tracking', text: 'See pickups and drop-offs clearly, and share your live location with buyers.' },
  { Icon: CheckBadgeIcon, title: 'Ready to ride?', text: 'Create your driver account. Our team reviews every application before you go online.' },
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
      <StatusBar style="light" />
      <View style={styles.overlay}>
        <View style={styles.top}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.brand}>Sokoni <Text style={{ color: '#FF9A2E' }}>Driver</Text></Text>
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
              <View style={styles.slideIcon}><item.Icon size={38} color="#FF9A2E" /></View>
              <Text style={styles.eyebrow}>SOKONI LOGISTICS · QATAR</Text>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.text}>{item.text}</Text>
            </View>
          )}
        />

        <View style={styles.dots}>
          {slides.map((_, i) => <View key={i} style={[styles.dot, i === page && styles.dotActive]} />)}
        </View>

        <View style={[styles.actions, { paddingBottom: 20 + insets.bottom }]}>
          {!last ? (
            <Button variant="gold" onPress={() => ref.current?.scrollToIndex({ index: page + 1 })}>Continue</Button>
          ) : (
            <>
              <Button variant="gold" onPress={() => onNav('register')}>Create a driver account</Button>
              <Button variant="secondary" onPress={() => onNav('login')}>Sign in</Button>
            </>
          )}
          {!last ? (
            <Pressable accessibilityRole="button" onPress={() => onNav('login')}>
              <Text style={styles.skip}>I already have a driver account</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(3,47,34,0.88)' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24, paddingTop: 20 },
  logo: { width: 38, height: 38, borderRadius: 10 },
  brand: { fontSize: 23, fontWeight: '900', color: '#fff', letterSpacing: -0.4 },
  slide: { justifyContent: 'center', paddingHorizontal: 28, flex: 1 },
  slideIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: 'rgba(255,146,37,.14)', borderWidth: 1, borderColor: 'rgba(255,175,82,.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  eyebrow: { color: '#FFB768', fontSize: 10, letterSpacing: 1.2, fontWeight: '900', marginBottom: 10 },
  title: { color: '#fff', fontSize: 32, lineHeight: 39, fontWeight: '900', letterSpacing: -0.9 },
  text: { color: 'rgba(255,255,255,.78)', fontSize: 15, lineHeight: 23, marginTop: 15, maxWidth: 340 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7, marginBottom: 20 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,.35)' },
  dotActive: { width: 22, backgroundColor: '#FF9A2E' },
  actions: { paddingHorizontal: 24, gap: 10 },
  skip: { color: '#fff', textAlign: 'center', fontWeight: '800', paddingVertical: 10, fontSize: 13 },
});
