/**
 * First-launch welcome: three short slides over the market photo, then create an account, sign in or browse as a guest.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { FlatList, Image, ImageBackground, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tap } from '../haptics';
import { Icon, type IconName } from '../icons';
import { COLUMN_MAX } from '../kit';
import type { Screen } from '../nav';
import { useTheme } from '../providers';
import { Button, Text } from '../ui';

const SLIDES: { title: string; text: string; icon: IconName }[] = [
  { title: 'A market made for your neighbourhood', text: 'Find trusted local products and services, all in one simple place.', icon: 'storefront' },
  { title: 'Shop with confidence', text: 'Clear prices, direct sellers, secure sign-in and status updates from checkout to delivery.', icon: 'shield-checkmark' },
  { title: 'Your next find is nearby', text: 'Browse as a guest or create your free buyer account to order, book and track with ease.', icon: 'heart' },
];

export function Welcome({ onDone }: { onDone: (screen?: Screen) => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height } = useWindowDimensions();
  const width = Math.min(screenWidth, COLUMN_MAX);
  const slideWidth = width - 48;
  const photoHeight = Math.round(height * 0.62);
  const [page, setPage] = useState(0);
  const ref = useRef<FlatList>(null);
  const last = page === SLIDES.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.deep, alignItems: 'center' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: COLUMN_MAX }}>
        <ImageBackground source={require('../../assets/hero.jpg')} resizeMode="cover" style={[s.photo, { height: photoHeight }]} />
        <LinearGradient colors={['rgba(0,76,45,0.35)', 'rgba(0,76,45,0.30)', colors.deep]} locations={[0, 0.45, 1]} style={[s.photo, { height: photoHeight }]} />
        <View style={[s.content, { paddingTop: insets.top + 18, paddingBottom: 20 + insets.bottom }]}>
          <View style={s.brand}>
            <View style={s.logoTile}><Image source={require('../../assets/logo-mark.png')} style={s.logo} /></View>
            <View>
              <Text style={s.brandName}>Sokoni <Text style={{ color: colors.orange }}>Hub</Text></Text>
              <Text style={s.tagline}>Local commerce, made simple</Text>
            </View>
          </View>

          <View>
            <FlatList
              ref={ref} data={SLIDES} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
              getItemLayout={(_, index) => ({ length: slideWidth + 24, offset: (slideWidth + 24) * index, index })}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (slideWidth + 24)))}
              keyExtractor={(item) => item.title}
              renderItem={({ item }) => (
                <View style={{ width: slideWidth + 24, paddingRight: 24, minHeight: 250, justifyContent: 'flex-end' }}>
                  <View style={[s.icon, { backgroundColor: colors.orange }]}><Icon name={item.icon} solid={false} size={32} color={colors.onOrange} /></View>
                  <Text style={s.title}>{item.title}</Text>
                  <Text style={s.text}>{item.text}</Text>
                </View>
              )}
            />
            <View style={s.dots}>{SLIDES.map((slide, index) => <View key={slide.title} style={[s.dot, { backgroundColor: index === page ? colors.orange : 'rgba(255,255,255,0.4)', width: index === page ? 24 : 8 }]} />)}</View>
            <View style={{ gap: 12 }}>
              {!last ? (
                <Button variant="gold" icon="arrow-forward" onPress={() => ref.current?.scrollToIndex({ index: page + 1 })}>Continue</Button>
              ) : (
                <>
                  <Button variant="gold" onPress={() => onDone('register')}>Create a buyer account</Button>
                  <Button variant="tonal" onPress={() => onDone('login')}>Sign in</Button>
                </>
              )}
              <Pressable accessibilityRole="button" onPress={() => { tap(); onDone('home'); }} style={{ alignItems: 'center', paddingVertical: 10 }}><Text style={s.guest}>Browse as a guest</Text></Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  photo: { position: 'absolute', top: 0, left: 0, right: 0 },
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoTile: { width: 54, height: 54, borderRadius: 17, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 42, height: 42, resizeMode: 'contain' },
  brandName: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { color: '#E4F7EC', fontSize: 13, fontWeight: '600', marginTop: 1 },
  icon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFFFFF', fontSize: 33, fontWeight: '800', letterSpacing: -0.9, lineHeight: 39, marginTop: 20 },
  text: { color: '#D3EEDF', fontSize: 16, lineHeight: 24, marginTop: 10 },
  dots: { flexDirection: 'row', gap: 7, marginTop: 20, marginBottom: 22 },
  dot: { height: 8, borderRadius: 4 },
  guest: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
