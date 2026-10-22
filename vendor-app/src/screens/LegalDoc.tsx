import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CONTACT, LegalDocument, OPERATOR } from '../legal/content';
import { Card, SubBar } from '../ui/kit';
import { C } from '../theme';
import { fw } from '../ui/type';

/** Renders Terms or Privacy inside the app. The text is the same as the website's published version. */
export function LegalDoc({ doc, onBack }: { doc: LegalDocument; onBack: () => void }) {
  return (
    <View style={styles.screen}>
      <SubBar title={doc.title} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body}>
        <LinearGradient colors={['#00735C', '#005A48']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Text style={styles.kicker}>SOKONI HUB · {doc.key === 'terms' ? 'TERMS' : 'PRIVACY'}</Text>
          <Text style={styles.title}>{doc.title}</Text>
          <Text style={styles.sub}>{doc.subtitle}</Text>
          <Text style={styles.version}>Version {OPERATOR.version} · Effective {OPERATOR.effectiveDate}</Text>
        </LinearGradient>

        <Card>
          <Text style={styles.opName}>{OPERATOR.name}</Text>
          <Text style={styles.opLine}>Commercial registration (CR): {OPERATOR.cr}</Text>
          <Text style={styles.opLine}>{OPERATOR.address}</Text>
          <Text style={styles.opLine}>Support: {CONTACT.email} · {CONTACT.phoneDisplay} · {CONTACT.hours}</Text>
        </Card>

        {doc.sections.map((sec) => (
          <Card key={sec.title}>
            <Text style={styles.secTitle}>{sec.title}</Text>
            {sec.blocks.map((b, i) => (
              <View key={i} style={styles.block}>
                {b.h ? <Text style={styles.h}>{b.h}</Text> : null}
                {b.p ? <Text style={styles.p}>{b.p}</Text> : null}
                {b.ul
                  ? b.ul.map((item, j) => (
                      <View key={j} style={styles.li}>
                        <View style={styles.bullet} />
                        <Text style={[styles.p, { flex: 1 }]}>{item}</Text>
                      </View>
                    ))
                  : null}
              </View>
            ))}
          </Card>
        ))}

        <Text style={styles.foot}>Questions about these terms? Use Help & support in your Account.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 12, gap: 10, paddingBottom: 32 },
  hero: { borderRadius: 16, padding: 14, gap: 3 },
  kicker: { fontSize: 9, ...fw('800'), color: '#CDEEE3', letterSpacing: 0.8 },
  title: { fontSize: 17, ...fw('800'), color: '#FFFFFF' },
  sub: { fontSize: 11, color: '#E6F5EF', lineHeight: 16 },
  version: { fontSize: 10, color: '#CDEEE3', marginTop: 4, ...fw('600') },
  opName: { fontSize: 12, ...fw('800'), color: C.text },
  opLine: { fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 16 },
  secTitle: { fontSize: 13, ...fw('800'), color: C.primaryDeep, marginBottom: 6 },
  block: { gap: 4, marginTop: 6 },
  h: { fontSize: 12, ...fw('800'), color: C.text },
  p: { fontSize: 11, color: C.text2, lineHeight: 16 },
  li: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingLeft: 2 },
  bullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.gold, marginTop: 6 },
  foot: { fontSize: 10, color: C.muted, textAlign: 'center', marginTop: 4 },
});
