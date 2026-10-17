import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Topbar } from '../components/AuthUI';
import { C } from '../theme';

/** Shown to riders whose application is not yet approved (or who are suspended). */
export function Pending({ status, onRefresh, onSignOut }: { status: string; onRefresh: () => void; onSignOut: () => void }) {
  const suspended = status === 'suspended';
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Topbar />
      <View style={styles.wrap}>
        <View style={styles.icon}><Text style={{ fontSize: 34 }}>{suspended ? '⛔' : '⏳'}</Text></View>
        <Text style={styles.title}>{suspended ? 'Account suspended' : 'Application under review'}</Text>
        <Text style={styles.text}>
          {suspended
            ? 'Your rider account is currently suspended. Please contact Sokoni Hub support.'
            : 'Thanks for applying. Our team is reviewing your details. You will be able to go online once you are approved.'}
        </Text>
        <Button variant="primary" onPress={onRefresh} style={{ alignSelf: 'stretch' }}>Check again</Button>
        <View style={{ height: 10 }} />
        <Button variant="secondary" onPress={onSignOut} style={{ alignSelf: 'stretch' }}>Sign out</Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 14 },
  icon: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.goldSoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '900', color: C.text, textAlign: 'center' },
  text: { fontSize: 15, lineHeight: 22, color: C.text2, textAlign: 'center', marginBottom: 12 },
});
