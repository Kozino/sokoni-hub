import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { WEB_URL } from './config';
import { useTheme } from './providers';
import { Button, EmptyState, Header } from './ui';

// In-app web page (Terms & privacy by default, or any path of the customer website).
// Same-origin pages load inside the app; any other link opens in the system browser.
export function LegalScreen({ back, path = '/legal', title = 'Terms & privacy' }: { back: () => void; path?: string; title?: string }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const uri = `${WEB_URL}${path}`;

  const retry = () => { setFailed(false); setLoading(true); setAttempt((n) => n + 1); };

  return (
    <View style={{ flex: 1 }}>
      <Header title={title} back={back} />
      {failed ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not load this page"
          text="Check your connection and try again."
          action={<Button style={{ marginTop: 8 }} onPress={retry}>Try again</Button>}
        />
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            key={attempt}
            source={{ uri }}
            style={{ flex: 1, backgroundColor: colors.bg }}
            onLoadEnd={() => setLoading(false)}
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(request) => {
              if (request.url === 'about:blank' || request.url.startsWith(WEB_URL)) return true;
              void Linking.openURL(request.url);
              return false;
            }}
          />
          {loading ? (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
