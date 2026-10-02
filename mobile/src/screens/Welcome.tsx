import React, { useRef, useState } from 'react';
import { FlatList, ImageBackground, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../providers';
import { BrandMark, Button } from '../ui';
import { Icon } from '../icons';
import { Screen } from './types';
import { styles } from '../styles';

export function Welcome({ onDone }: { onDone: (screen?: Screen) => void }) {
  const { colors } = useTheme(); const insets = useSafeAreaInsets(); const { width } = useWindowDimensions(); const slideWidth = width - 48; const [page, setPage] = useState(0); const ref = useRef<FlatList>(null);
  const slides = [
    ['A market made for your neighbourhood', 'Find trusted local products and services, all in one simple place.', 'storefront-outline'],
    ['Shop with confidence', 'Clear prices, direct vendors, secure sign-in and status updates from checkout to delivery.', 'shield-checkmark-outline'],
    ['Your next find is nearby', 'Browse as a guest or create your free buyer account to order, book and track with ease.', 'heart-outline'],
  ] as const;
  return <ImageBackground source={require('../../assets/hero.jpg')} resizeMode="cover" style={styles.welcomeBg}><View style={[styles.welcomeOverlay, { backgroundColor: colors.overlay }]}><View style={[styles.welcomeTop, { paddingTop: insets.top + 16 }]}><BrandMark /></View><FlatList ref={ref} data={slides} horizontal pagingEnabled showsHorizontalScrollIndicator={false} getItemLayout={(_, index) => ({ length: slideWidth, offset: slideWidth * index, index })} onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width))} renderItem={({ item }) => <View style={[styles.welcomeSlide, { width: slideWidth }]}><View style={[styles.welcomeIcon, { backgroundColor: colors.goldSoft }]}><Icon name={item[2]} size={40} color={colors.gold}/></View><Text style={styles.welcomeTitle}>{item[0]}</Text><Text style={styles.welcomeText}>{item[1]}</Text></View>} keyExtractor={(_, index) => String(index)}/><View style={styles.dots}>{slides.map((_, index) => <View key={index} style={[styles.dot, { backgroundColor: index === page ? colors.gold : 'rgba(255,255,255,.45)' }]} />)}</View><View style={[styles.welcomeActions, { paddingBottom: 22 + insets.bottom }]}>{page < 2 ? <Button onPress={() => ref.current?.scrollToIndex({ index: page + 1 })} variant="gold">Continue</Button> : <><Button onPress={() => onDone('register')} variant="gold">Create a buyer account</Button><Button onPress={() => onDone('login')} variant="secondary">Sign in</Button></>}<Pressable accessibilityRole="button" onPress={() => onDone('home')}><Text style={styles.browseGuest}>Browse as a guest</Text></Pressable></View></View></ImageBackground>;
}