import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useAuth } from '../providers/AuthContext';

export function Settings({ onLogout }: { onLogout: () => void }) {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.profileBox}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.full_name[0]}</Text>
        </View>
        <View>
          <Text style={styles.name}>{user?.full_name}</Text>
          <Text style={styles.phone}>{user?.phone}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.row}>
          <Text style={styles.rowText}>Vehicle Details</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row}>
          <Text style={styles.rowText}>Bank Information</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row}>
          <Text style={styles.rowText}>Upload Documents (ID/License)</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.row}>
          <Text style={styles.rowText}>Help & Support</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8FD' },
  header: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold' },
  
  profileBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 20, marginTop: 20, marginBottom: 20 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { fontSize: 24, fontWeight: 'bold', color: '#126D4B' },
  name: { fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 4 },
  phone: { fontSize: 15, color: '#666' },

  section: { backgroundColor: '#fff', marginBottom: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#eee' },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#F3F4F6' },
  rowText: { fontSize: 16, color: '#333' },
  rowChevron: { fontSize: 20, color: '#ccc' },

  logoutBtn: { backgroundColor: '#FEE2E2', padding: 16, margin: 20, borderRadius: 12, alignItems: 'center' },
  logoutText: { color: '#DC2626', fontWeight: 'bold', fontSize: 16 }
});
