/**
 * Offers & coupons. Everything listed here is live right now: an admin switched it on and it has not run out.
 * Automatic offers apply at checkout when the cart qualifies; codes are added in the Cart. Both come from the
 * server, so a new campaign needs no app update. Sokoni Hub pays for every offer.
 */
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { updateDraft } from '../checkoutDraft';
import { cleanPromo, useOffers } from '../data';
import { Icon } from '../icons';
import { AppBar, PageTitle, Panel, Screen, Tabs, useGrid } from '../kit';
import type { NavProps } from '../nav';
import { openAppLink } from '../openLink';
import { OfferRow } from '../offersUi';
import { useCart, useTheme } from '../providers';
import { useToast } from '../toast';
import type { Offer } from '../types';
import { Button, EmptyState, Spinner, Text } from '../ui';

export function Offers({ back, tab }: NavProps) {
  const { colors } = useTheme();
  const offers = useOffers();
  const cart = useCart();
  const toast = useToast();
  const grid = useGrid(300, 12, 8);
  const cols = grid.cols >= 3 ? 2 : 1;
  const list = offers.data ?? [];

  const use = (offer: Offer) => {
    if (offer.code) {
      // Keep the code for the Cart; it is checked against the cart there.
      updateDraft({ promo: cleanPromo(offer.code) });
      if (cart.items.length) { toast.show(`Code ${offer.code} added to your cart`); tab('cart'); }
      else { toast.show(`Code ${offer.code} saved. Add items to use it.`); tab('browse'); }
    } else if (!openAppLink(offer.link)) tab('browse');
  };

  const header = (
    <View style={{ paddingBottom: 6 }}>
      <PageTitle title="Offers & coupons" back={back} badge={list.length || undefined} subtitle="Savings from Sokoni Hub. Codes go in your cart." />
    </View>
  );
  const footer = (
    <Panel style={{ marginHorizontal: 12, marginTop: 12, gap: 6 }}>
      <View style={s.how}><Icon name="shield-checkmark" solid={false} size={16} color={colors.primary} /><Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>How offers work</Text></View>
      <Text style={s.line}>Automatic offers appear in your cart and are taken off when you qualify. Nothing to type.</Text>
      <Text style={s.line}>For a code, open your cart, tap “Add code” and enter it. One code per order, and it can sit alongside an automatic delivery offer.</Text>
      <Text style={s.line}>Sokoni Hub pays for every offer. Sellers and riders are paid in full, and you pay the lower total in cash.</Text>
    </Panel>
  );

  return (
    <Screen wide>
      <AppBar go={() => {}} tab={tab} />
      {offers.isLoading ? (
        <View style={{ flex: 1 }}>{header}<Spinner label="Finding offers…" /></View>
      ) : (
        <FlatList
          key={cols} data={list} numColumns={cols} keyExtractor={(o) => o.id} showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }} columnWrapperStyle={cols > 1 ? { gap: 8, paddingHorizontal: 12 } : undefined} ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListHeaderComponent={header} ListFooterComponent={footer}
          refreshControl={<RefreshControl refreshing={offers.isRefetching} onRefresh={() => void offers.refetch()} tintColor={colors.primary} />}
          renderItem={({ item }) => <View style={cols > 1 ? { flex: 1 } : { paddingHorizontal: 12 }}><OfferRow offer={item} onUse={() => use(item)} /></View>}
          ListEmptyComponent={offers.error
            ? <EmptyState icon="cloud-offline-outline" title="Could not load offers" text="Check your connection and try again." action={<Button style={{ marginTop: 8 }} onPress={() => void offers.refetch()}>Try again</Button>} />
            : <EmptyState icon="gift-outline" title="No offers right now" text="When Sokoni Hub runs a discount, a coupon or free delivery, it appears here. Check back soon." action={<Button style={{ marginTop: 8 }} onPress={() => tab('browse')}>Explore the market</Button>} />}
        />
      )}
      <Tabs active="none" tab={tab} />
    </Screen>
  );
}

const s = StyleSheet.create({
  how: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  line: { fontSize: 11, lineHeight: 16, color: '#5B6674' },
});
