import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CheckCircleIcon, DocumentArrowUpIcon } from 'react-native-heroicons/outline';
import { api } from '../../api';
import { Badge, Button, Card, Notice, ScreenHeader } from '../../components/UI';
import { errorText } from '../../format';
import { C } from '../../theme';
import { DOCUMENT_KEYS, type DriverProfile } from './types';

export function Documents({ driver, onBack, onSaved }: { driver: DriverProfile; onBack: () => void; onSaved: (d: DriverProfile) => void }) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const docs = driver.documents ?? {};

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
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Documents" subtitle="Clear photos, all four corners visible" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.pad}>
        <Notice>Documents are stored privately and used only to verify your rider account.</Notice>
        {message ? <View style={{ marginTop: 12 }}><Notice>{message}</Notice></View> : null}

        {DOCUMENT_KEYS.map((d) => {
          const uploaded = !!docs[d.key];
          return (
            <Card key={d.key} style={{ marginTop: 14 }}>
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: uploaded ? C.primarySoft : C.surface2 }]}>
                  {uploaded ? <CheckCircleIcon size={22} color={C.primary} /> : <DocumentArrowUpIcon size={22} color={C.text2} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{d.label}</Text>
                  <Text style={styles.sub}>{uploaded ? 'Uploaded' : 'Not uploaded yet'}</Text>
                </View>
                <Badge label={uploaded ? 'Received' : 'Required'} tone={uploaded ? 'green' : 'gold'} />
              </View>
              <View style={{ marginTop: 14 }}>
                {busyKey === d.key ? (
                  <ActivityIndicator color={C.primary} />
                ) : (
                  <Button title={uploaded ? 'Replace file' : 'Choose photo'} tone={uploaded ? 'secondary' : 'primary'} onPress={() => upload(d.key)} disabled={!!busyKey} />
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
  pad: { padding: 18, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: C.text },
  sub: { fontSize: 13, color: C.text2, marginTop: 2 },
});
