import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CheckCircleIcon, CheckIcon } from 'react-native-heroicons/outline';
import { api } from '../../api';
import { Button, Card, Notice, ScreenHeader } from '../../components/UI';
import { errorText } from '../../format';
import { C } from '../../theme';

type Created = { request: { reference: string; status: string; created_at: string } };

/**
 * Starts a deletion request, the same durable process as the web portal. Sokoni Hub reviews it,
 * blocks the account, and removes profile data and uploaded documents. Records that must be kept
 * (for example, payments and delivery history) are retained under the privacy policy.
 */
export function DeleteAccount({ onBack }: { onBack: () => void }) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  const submit = async () => {
    if (!password) return Alert.alert('Password needed', 'Enter your current password to confirm.');
    if (!agree) return Alert.alert('Confirm first', 'Tick the box to confirm you understand the request.');
    setBusy(true);
    try {
      const res = await api.post<Created>('/account-deletion/requests', {
        password,
        acknowledge: true,
        reason: reason.trim() || undefined,
      });
      setReference(res.request.reference);
      setPassword('');
    } catch (e) {
      // Shows the server's reason, e.g. open deliveries or cash still to hand in.
      Alert.alert('Could not start deletion', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (reference) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScreenHeader title="Deletion requested" onBack={onBack} />
        <ScrollView contentContainerStyle={styles.pad}>
          <Card style={{ alignItems: 'center', gap: 10 }}>
            <CheckCircleIcon size={44} color={C.primary} />
            <Text style={styles.title}>We have your request</Text>
            <Text style={styles.body}>Keep this reference. Sokoni Hub will review the request and contact you if anything is needed.</Text>
            <Text style={styles.ref} selectable>{reference}</Text>
          </Card>
          <View style={{ marginTop: 14 }}>
            <Notice>Your account stays open until the review is complete. You can withdraw the request on the Sokoni Hub web portal.</Notice>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Delete account" subtitle="Request permanent deletion" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Notice>
          Deleting your account signs you out and removes your profile, login details and uploaded documents. You must finish or hand back any open delivery and hand in any cash you hold first. Some delivery and payout records are kept as required by law.
        </Notice>
        <View style={{ height: 14 }} />
        <Card>
          <Text style={styles.label}>Current password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Your password"
            placeholderTextColor={C.muted}
            style={styles.input}
          />
          <Text style={[styles.label, { marginTop: 14 }]}>Reason (optional)</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={500}
            placeholder="Help us improve"
            placeholderTextColor={C.muted}
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]}
          />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agree }} onPress={() => setAgree(!agree)} style={styles.agree}>
            <View style={[styles.box, agree && { backgroundColor: C.primary, borderColor: C.primary }]}>
              {agree ? <CheckIcon size={16} color="#fff" /> : null}
            </View>
            <Text style={styles.agreeText}>I understand my account will be deleted after review and that this cannot be undone.</Text>
          </Pressable>
        </Card>
        <View style={{ marginTop: 18 }}>
          <Button title="Request account deletion" tone="danger" onPress={submit} loading={busy} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 18, paddingBottom: 32 },
  title: { fontSize: 18, fontWeight: '900', color: C.text, textAlign: 'center' },
  body: { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 20 },
  ref: { fontSize: 16, fontWeight: '900', color: C.primary, marginTop: 6 },
  label: { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 12, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, fontSize: 15, color: C.text },
  agree: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.border, marginTop: 1 },
  agreeText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 19 },
});
