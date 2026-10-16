import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Register({ onNav }: { onNav: (s: 'login') => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', vehicleType: 'Motorcycle', licenseNo: '', pin: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await fetch('https://api-sokonihub.e2b.dev/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.name,
          phone: form.phone,
          email: form.email,
          password: form.password,
          pin: form.pin,
          role: 'driver'
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Registration failed');
      }
      alert('Application submitted! Check your email to verify your account.');
      onNav('login');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Apply to Drive</Text>
        <Text style={styles.subtitle}>Join Sokoni Hub's delivery fleet and earn on your own schedule.</Text>

        <Text style={styles.label}>Full Name</Text>
        <TextInput style={styles.input} value={form.name} onChangeText={t => setForm({...form, name: t})} />

        <Text style={styles.label}>Phone Number</Text>
        <TextInput style={styles.input} keyboardType="phone-pad" value={form.phone} onChangeText={t => setForm({...form, phone: t})} />

        <Text style={styles.label}>Email Address</Text>
        <TextInput style={styles.input} keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={t => setForm({...form, email: t})} />

        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} secureTextEntry value={form.password} onChangeText={t => setForm({...form, password: t})} />
        
        <Text style={styles.label}>4-Digit PIN (for quick login)</Text>
        <TextInput style={styles.input} keyboardType="number-pad" secureTextEntry maxLength={4} value={form.pin} onChangeText={t => setForm({...form, pin: t})} />

        <Text style={styles.label}>Vehicle Type</Text>
        <View style={styles.row}>
          {['Motorcycle', 'Car', 'Van'].map(v => (
            <TouchableOpacity key={v} style={[styles.chip, form.vehicleType === v && styles.chipActive]} onPress={() => setForm({...form, vehicleType: v})}>
              <Text style={[styles.chipText, form.vehicleType === v && styles.chipTextActive]}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>License Plate / ID</Text>
        <TextInput style={styles.input} value={form.licenseNo} onChangeText={t => setForm({...form, licenseNo: t})} />

        <TouchableOpacity style={styles.btn} onPress={handleSubmit} disabled={loading}>
          <Text style={styles.btnText}>{loading ? 'Submitting...' : 'Submit Application'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onNav('login')} style={{ marginTop: 20 }}>
          <Text style={styles.link}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 30, lineHeight: 22 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 14, fontSize: 16 },
  row: { flexDirection: 'row', gap: 10 },
  chip: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  chipActive: { backgroundColor: '#E8F5E9', borderColor: '#126D4B' },
  chipText: { color: '#666', fontWeight: '500' },
  chipTextActive: { color: '#126D4B', fontWeight: '700' },
  btn: { backgroundColor: '#126D4B', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 30 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { textAlign: 'center', color: '#126D4B', fontWeight: '600', fontSize: 15 }
});
