import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CheckCircleIcon, DocumentArrowUpIcon, ShieldCheckIcon } from 'react-native-heroicons/outline';
import { api } from '../../api';
import { Badge, Button, Card, Notice, ScreenHeader } from '../../components/UI';
import { errorText } from '../../format';
import { C } from '../../theme';
import { DOCUMENT_KEYS, type DriverProfile } from './types';

export function Documents({ driver, onBack, onSaved }: { driver: DriverProfile; onBack: () => void; onSaved: (d: DriverProfile) => void }) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const docs = driver.documents ?? {};
  const uploadedCount = DOCUMENT_KEYS.filter((doc) => !!docs[doc.key]).length;
  const progress = uploadedCount / DOCUMENT_KEYS.length;

  const upload = async (key: string) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos needed', 'Allow access to your photos to upload documents.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (picked.canceled || !picked.assets?.[0]) return;

    setBusyKey(key);
    setMessage('');
    try {
      const form = new FormData();
      form.append('files', { uri: picked.assets[0].uri, name: `${key}.jpg`, type: 'image/jpeg' } as any);
      // purpose=kyc stores the file privately; only Sokoni Hub staff can review it.
      const res = await api.post<{ urls: string[] }>('/uploads?purpose=kyc', form);
      const storedKey = res.urls?.[0];
      if (!storedKey) throw new Error('The document could not be uploaded. Please try again.');
      const saved = await api.put<{ driver: DriverProfile }>('/drivers/me/documents', { [key]: storedKey });
      onSaved(saved.driver);
      setMessage('Document uploaded. Our team will review it shortly.');
    } catch (e) {
      Alert.alert('Upload failed', errorText(e));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <View style={styles.page}>
      <ScreenHeader title="Legal documents" subtitle="Clear photos with all four corners visible" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.pad}>
        <Card style={styles.progressCard}>
          <View style={styles.progressHead}>
            <View style={styles.progressIcon}><ShieldCheckIcon size={23} color={C.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.progressTitle}>Driver compliance</Text>
              <Text style={styles.progressSub}>{uploadedCount} of {DOCUMENT_KEYS.length} required documents received</Text>
            </View>
            <Text style={styles.progressValue}>{Math.round(progress * 100)}%</Text>
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
        </Card>

        <View style={{ marginVertical: 12 }}><Notice>Documents are stored privately and used only to verify your driver account.</Notice></View>
        {message ? <View style={{ marginBottom: 12 }}><Notice>{message}</Notice></View> : null}

        {DOCUMENT_KEYS.map((doc) => {
          const uploaded = !!docs[doc.key];
          return (
            <Card key={doc.key} style={styles.docCard}>
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: uploaded ? C.primarySoft : C.surface2 }]}>
                  {uploaded ? <CheckCircleIcon size={23} color={C.primary} /> : <DocumentArrowUpIcon size={23} color={C.text2} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{doc.label}</Text>
                  <Text style={styles.sub}>{uploaded ? 'Securely uploaded to your profile' : 'A clear photo is required'}</Text>
                </View>
                <Badge label={uploaded ? 'Received' : 'Required'} tone={uploaded ? 'green' : 'gold'} />
              </View>
              <View style={{ marginTop: 14 }}>
                {busyKey === doc.key ? (
                  <View style={styles.uploading}><ActivityIndicator color={C.primary} /><Text style={styles.uploadingText}>Uploading securely…</Text></View>
                ) : (
                  <Button title={uploaded ? 'Replace document' : 'Choose document photo'} tone={uploaded ? 'secondary' : 'primary'} onPress={() => upload(doc.key)} disabled={!!busyKey} icon={<DocumentArrowUpIcon size={18} color={uploaded ? C.text : '#fff'} />} />
                )}
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16, paddingBottom: 32 },
  progressCard: { padding: 16 },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  progressIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  progressTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
  progressSub: { color: C.text2, fontSize: 10, lineHeight: 15, marginTop: 3 },
  progressValue: { color: C.primary, fontSize: 15, fontWeight: '900' },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: C.surface2, marginTop: 15, overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 4, backgroundColor: C.primary },
  docCard: { marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '900', color: C.text },
  sub: { fontSize: 10, lineHeight: 15, color: C.text2, marginTop: 3 },
  uploading: { minHeight: 52, borderRadius: 14, backgroundColor: C.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  uploadingText: { color: C.primary, fontSize: 12, fontWeight: '800' },
});
