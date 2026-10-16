import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useAuth } from '../providers/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Login({ onNav }: { onNav: (s: 'register') => void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    // MOCK API CALL
    setTimeout(() => {
      if (phone === '123' && password === '123') {
        login({ id: '1', full_name: 'John Driver', phone: '123', driver_status: 'approved' }, 'mock-token');
      } else {
        setError('Invalid phone or password');
        setLoading(false);
      }
    }, 1000);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F8FD' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.brand}>Sokoni Driver</Text>
          <Text style={styles.subtitle}>Sign in to your rider account</Text>
        </View>

        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

        <View style={styles.form}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput style={styles.input} keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="e.g. +974 5555 5555" />
          
          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} placeholder="Enter your password" />

          <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign In</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => onNav('register')} style={{ marginTop: 20 }}>
          <Text style={styles.link}>New rider? Apply to drive with us</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  header: { marginBottom: 40, alignItems: 'center' },
  brand: { fontSize: 32, fontWeight: '800', color: '#126D4B' },
  subtitle: { fontSize: 16, color: '#666', marginTop: 8 },
  form: { backgroundColor: '#fff', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 14, fontSize: 16, marginBottom: 16 },
  btn: { backgroundColor: '#126D4B', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { textAlign: 'center', color: '#126D4B', fontWeight: '600', fontSize: 15 },
  errorBox: { backgroundColor: '#FEE2E2', padding: 12, borderRadius: 8, marginBottom: 16 },
  errorText: { color: '#DC2626', textAlign: 'center', fontWeight: '500' }
});
