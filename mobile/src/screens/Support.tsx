import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, WEB_URL } from '../config';
import { Icon, type IconName } from '../icons';
import { Panel, Screen } from '../kit';
import type { NavProps } from '../nav';
import { useTheme } from '../providers';
import { Header, Notice, Text } from '../ui';

/** How the app really behaves, in plain words. Kept next to the code that implements each rule. */
const FAQ: [string, string][] = [
  ['Where is my order?', 'Open Profile → Orders and tap Track Order. You will see the store, your rider and a live map once the order is on its way.'],
  ['How do I pay?', 'Orders are cash on delivery: you pay the seller or rider when you receive or collect your order. Nothing is charged in the app.'],
  ['Can I cancel an order?', 'Yes, until a rider accepts it: open the order and tap Cancel order. After that, please contact the store.'],
  ['Something arrived wrong', 'Open the order and tap Report a problem before the confirmation window closes. Our team reviews every report.'],
  ['How do bookings work?', 'Choose a provider, a date and a time. The provider confirms, and you pay them directly when the service is done.'],
  ['Change or cancel a booking', 'Open Profile → Bookings. Reschedule lets you message the provider, or cancel and book a new time.'],
];

export function Support({ go, back }: NavProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<number | null>(null);
  const open_ = (url: string) => void Linking.openURL(url);
  return (
    <Screen>
      <Header title="Help & support" back={back} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 50, gap: 14 }}>
        <LinearGradient colors={[colors.primary, colors.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroIcon}><Icon name="help-buoy" solid={false} size={30} color="#FFFFFF" /></View>
          <Text style={{ fontSize: 23, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.4, marginTop: 12 }}>We&apos;re here to help</Text>
          <Text style={{ fontSize: 14.5, lineHeight: 21, color: '#D3EEDF', textAlign: 'center', marginTop: 6 }}>For help with an order, booking, account or marketplace issue, contact Sokoni Hub directly.</Text>
        </LinearGradient>

        <Panel style={{ padding: 6 }}>
          <Contact icon="logo-whatsapp" title="WhatsApp support" sub="Message our support team" tint="mint" onPress={() => open_(`https://wa.me/${SUPPORT_WHATSAPP}`)} />
          <Contact icon="mail" title="Email support" sub={SUPPORT_EMAIL} tint="lav" onPress={() => open_(`mailto:${SUPPORT_EMAIL}`)} />
          <Contact icon="globe" title="Customer website" sub="More help and information" tint="lav" onPress={() => open_(WEB_URL)} />
          <Contact icon="document-text" title="Terms & privacy" sub="Customer policies and marketplace rules" tint="lav" onPress={() => go('legal', { path: '', title: 'Terms & privacy' })} last />
        </Panel>

        <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: colors.text, marginTop: 10 }}>Common questions</Text>
        <Panel style={{ padding: 6 }}>
          {FAQ.map(([q, a], index) => (
            <View key={q} style={[index < FAQ.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === index }} onPress={() => setOpen(open === index ? null : index)} style={s.q}>
                <Text style={{ flex: 1, fontSize: 15.5, fontWeight: '800', color: colors.text }}>{q}</Text>
                <Icon name={open === index ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
              </Pressable>
              {open === index ? <Text style={{ fontSize: 14, lineHeight: 21, color: colors.text2, paddingHorizontal: 12, paddingBottom: 14 }}>{a}</Text> : null}
            </View>
          ))}
        </Panel>
        <Notice type="warning">Never share your password, PIN, one-time recovery code or payment details in a message.</Notice>
      </ScrollView>
    </Screen>
  );
}

function Contact({ icon, title, sub, tint, onPress, last }: { icon: IconName; title: string; sub: string; tint: 'mint' | 'lav'; onPress: () => void; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [s.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={[s.icon, { backgroundColor: tint === 'mint' ? colors.primarySoft : colors.lav2 }]}><Icon name={icon} solid={false} size={21} color={tint === 'mint' ? colors.primary : colors.text2} /></View>
      <View style={{ flex: 1 }}><Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>{title}</Text><Text numberOfLines={1} style={{ fontSize: 13.5, color: colors.text2, marginTop: 2 }}>{sub}</Text></View>
      <Icon name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 26, padding: 22, alignItems: 'center' },
  heroIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 10 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  q: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 12 },
});
