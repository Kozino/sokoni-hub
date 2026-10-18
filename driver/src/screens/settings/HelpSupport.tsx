import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChatBubbleLeftRightIcon, ChevronDownIcon, ChevronUpIcon, EnvelopeIcon } from 'react-native-heroicons/outline';
import { Card, ScreenHeader } from '../../components/UI';
import { C } from '../../theme';

const SUPPORT_EMAIL = 'support@sokonihub.qa';
const SUPPORT_WHATSAPP = '97466046431';

const FAQ = [
  { q: 'Why can I not go online?', a: 'New riders must be approved by Sokoni Hub before they can receive deliveries. Check the status in Settings or contact support.' },
  { q: 'How do I get paid?', a: 'The Earnings tab shows the delivery fee for every trip you complete. Payout timing is confirmed by the Sokoni Hub team, so keep your Bank information up to date.' },
  { q: 'The buyer is not at the address.', a: 'Call the buyer using the button on the delivery. If they still cannot be reached, contact support before leaving.' },
  { q: 'I accidentally tapped Accept.', a: 'Contact support as soon as possible so we can reassign the delivery.' },
];

export function HelpSupport({ onBack }: { onBack: () => void }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Help & support" subtitle="We are here to help riders" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.contacts}>
          <Pressable accessibilityRole="button" style={styles.contact} onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}`)}>
            <View style={[styles.contactIcon, { backgroundColor: C.primarySoft }]}><ChatBubbleLeftRightIcon size={22} color={C.primary} /></View>
            <Text style={styles.contactTitle}>WhatsApp</Text>
            <Text style={styles.contactSub}>Fastest reply</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.contact} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Rider%20support`)}>
            <View style={[styles.contactIcon, { backgroundColor: C.goldSoft }]}><EnvelopeIcon size={22} color={C.gold} /></View>
            <Text style={styles.contactTitle}>Email</Text>
            <Text style={styles.contactSub} numberOfLines={1}>{SUPPORT_EMAIL}</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>Common questions</Text>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <Pressable key={item.q} accessibilityRole="button" onPress={() => setOpen(isOpen ? null : i)} style={[styles.faq, i < FAQ.length - 1 && styles.faqBorder]}>
                <View style={styles.faqHead}>
                  <Text style={styles.faqQ}>{item.q}</Text>
                  {isOpen ? <ChevronUpIcon size={18} color={C.muted} /> : <ChevronDownIcon size={18} color={C.muted} />}
                </View>
                {isOpen ? <Text style={styles.faqA}>{item.a}</Text> : null}
              </Pressable>
            );
          })}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 18, paddingBottom: 32 },
  contacts: { flexDirection: 'row', gap: 12 },
  contact: { flex: 1, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 6 },
  contactIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  contactTitle: { fontSize: 15, fontWeight: '900', color: C.text },
  contactSub: { fontSize: 12, color: C.text2 },
  section: { fontSize: 13, fontWeight: '800', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 10 },
  faq: { padding: 16 },
  faqBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  faqHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  faqQ: { flex: 1, fontSize: 14, fontWeight: '800', color: C.text },
  faqA: { fontSize: 14, color: C.text2, lineHeight: 20, marginTop: 10 },
});
