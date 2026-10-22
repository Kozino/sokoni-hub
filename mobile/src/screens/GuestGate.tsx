import { View } from 'react-native';
import { Screen } from '../kit';
import { Button, EmptyState, Header } from '../ui';

/** Shown instead of a buyer-only screen (orders, bookings, notifications…) when nobody is signed in. */
export function GuestGate({ title, text, go, back, heading = 'Your activity' }: { title: string; text: string; go: (screen: any, params?: any) => void; back: () => void; heading?: string }) {
  return (
    <Screen>
      <Header title={heading} back={back} />
      <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
        <EmptyState
          title={title} text={text} icon="lock-closed-outline"
          action={(
            <View style={{ gap: 10, marginTop: 12, alignSelf: 'stretch', paddingHorizontal: 28 }}>
              <Button onPress={() => go('login')}>Sign in</Button>
              <Button variant="tonal" onPress={() => go('register')}>Create a buyer account</Button>
            </View>
          )}
        />
      </View>
    </Screen>
  );
}
