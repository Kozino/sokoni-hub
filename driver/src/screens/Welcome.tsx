import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ImageBackground, FlatList, useWindowDimensions, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

export function Welcome({ onNav }: { onNav: (s: 'login' | 'register') => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const slideWidth = width - 48;
  const [page, setPage] = useState(0);
  const ref = useRef<FlatList>(null);

  const slides = [
    ['Drive and Earn on your terms', 'Join the fastest growing local delivery fleet in Qatar.', '🏍️'],
    ['Keep your earnings clear', 'Transparent payouts, real-time map routing, and easy tools.', '💵'],
    ['Ready to hit the road?', 'Create your rider account to start accepting delivery requests.', '🚀'],
  ] as const;

  return (
    <ImageBackground source={require('../../assets/hero.jpg')} resizeMode="cover" style={styles.welcomeBg}>
      <View style={[styles.welcomeOverlay]}>
        <View style={[styles.welcomeTop, { paddingTop: insets.top + 16 }]}>
          <View style={styles.brandContainer}>
            <Image source={require('../../assets/logo.png')} style={styles.logo} contentFit="contain" />
            <Text style={styles.brandText}>Sokoni Driver</Text>
          </View>
        </View>
        
        <FlatList 
          ref={ref} 
          data={slides} 
          horizontal 
          pagingEnabled 
          showsHorizontalScrollIndicator={false} 
          getItemLayout={(_, index) => ({ length: slideWidth, offset: slideWidth * index, index })} 
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width))} 
          renderItem={({ item }) => (
            <View style={[styles.welcomeSlide, { width: slideWidth }]}>
              <View style={styles.welcomeIcon}><Text style={{ fontSize: 40 }}>{item[2]}</Text></View>
              <Text style={styles.welcomeTitle}>{item[0]}</Text>
              <Text style={styles.welcomeText}>{item[1]}</Text>
            </View>
          )} 
          keyExtractor={(_, index) => String(index)}
        />
        
        <View style={styles.dots}>
          {slides.map((_, index) => <View key={index} style={[styles.dot, { backgroundColor: index === page ? '#D4AF37' : 'rgba(255,255,255,.45)' }]} />)}
        </View>
        
        <View style={[styles.welcomeActions, { paddingBottom: 22 + insets.bottom }]}>
          {page < 2 ? (
            <TouchableOpacity style={[styles.btn, styles.btnGold]} onPress={() => ref.current?.scrollToIndex({ index: page + 1 })}>
              <Text style={styles.btnTextGold}>Continue</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={[styles.btn, styles.btnGold]} onPress={() => onNav('register')}>
                <Text style={styles.btnTextGold}>Apply to drive with us</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnWhite]} onPress={() => onNav('login')}>
                <Text style={styles.btnTextWhite}>Sign in</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  welcomeBg: { flex: 1, width: '100%' },
  welcomeOverlay: { flex: 1, backgroundColor: 'rgba(3, 59, 42, 0.85)', paddingHorizontal: 24 },
  welcomeTop: { flexDirection: 'row', justifyContent: 'center', marginBottom: 40 },
  brandContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 36, height: 36, tintColor: '#fff' },
  brandText: { fontSize: 24, fontWeight: '800', color: '#fff' },
  
  welcomeSlide: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  welcomeIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(212, 175, 55, 0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  welcomeTitle: { fontSize: 28, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 16, lineHeight: 34 },
  welcomeText: { fontSize: 16, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 24, paddingHorizontal: 10 },
  
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 40 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  
  welcomeActions: { gap: 12 },
  btn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnGold: { backgroundColor: '#D4AF37' },
  btnWhite: { backgroundColor: 'rgba(255,255,255,0.15)' },
  btnTextGold: { fontSize: 16, fontWeight: '700', color: '#111' },
  btnTextWhite: { fontSize: 16, fontWeight: '700', color: '#fff' }
});
