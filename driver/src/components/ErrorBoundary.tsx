import React, { Component, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './UI';
import { C } from '../theme';

/** Stops a crash in one screen from closing the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.text}>This screen could not be shown. Your deliveries and account are safe.</Text>
        <Button title="Try again" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: C.bg, gap: 12 },
  title: { fontSize: 20, fontWeight: '900', color: C.text },
  text: { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
});
