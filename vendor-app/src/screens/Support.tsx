import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CONTACT } from '../legal/content';
import { Group, Icon, Row, SubBar } from '../ui/kit';
import { C } from '../theme';
import { fw } from '../ui/type';

/** Help & support: WhatsApp, email and phone, with hours and the response time. Details come from the Sokoni Hub website config. */
export function Support({ onBack, onOpenLegal }: { onBack: () => void; onOpenLegal: (page: 'terms' | 'privacy') => void }) {
  const whatsapp = `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent('Hello Sokoni Hub, I need help with the vendor app.')}`;
  return (
    <View style={styles.screen}>
      <SubBar title="Help & support" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body}>
        <LinearGradient colors={['#FC7800', '#E06A00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name="chat-bubble" size={18} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>We are here to help</Text>
          <Text style={styles.heroSub}>{CONTACT.hours}</Text>
          <Text style={styles.heroSub}>Typical reply: within {CONTACT.responseTime}</Text>
        </LinearGradient>

        <Group label="Contact us">
          <Row icon="chat-bubble" tone="green" title="WhatsApp" subtitle={CONTACT.phoneDisplay} onPress={() => Linking.openURL(whatsapp)} />
          <Row icon="envelope" tone="blue" title="Email" subtitle={CONTACT.email} onPress={() => Linking.openURL(`mailto:${CONTACT.email}?subject=Vendor%20app%20support`)} />
          <Row icon="phone" tone="amber" title="Call" subtitle={CONTACT.phoneDisplay} onPress={() => Linking.openURL(`tel:${CONTACT.phone}`)} />
        </Group>

        <Group label="Good to know">
          <Row icon="shield-check" tone="violet" title="Keep your sign-in private" subtitle="Never share your password, PIN, MFA code or recovery codes." />
        </Group>

        <Group label="Policies">
          <Row icon="document-text" tone="brand" title="Terms of use" subtitle="How the marketplace works" onPress={() => onOpenLegal('terms')} />
          <Row icon="lock-closed" tone="slate" title="Privacy policy" subtitle="How we use and keep your information" onPress={() => onOpenLegal('privacy')} />
        </Group>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 12, gap: 12, paddingBottom: 32 },
  hero: { borderRadius: 16, padding: 14, gap: 3 },
  heroIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTitle: { fontSize: 15, ...fw('800'), color: '#FFFFFF' },
  heroSub: { fontSize: 11, color: '#FFF4EA', ...fw('600') },
});
