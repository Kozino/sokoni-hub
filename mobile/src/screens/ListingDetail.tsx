/**
 * Product / service detail. Gallery, price and options, seller card, description, trust points, reviews
 * (with real eligibility from the API) and more from the same seller. Products are added to the cart with
 * the chosen size and quantity; services go to the booking form.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, NativeScrollEvent, NativeSyntheticEvent, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { api, query } from '../api';
import { ProductCard, isOutOfStock } from '../cards';
import { WEB_URL } from '../config';
import { errorMessage, rememberImages, usePromoSet } from '../data';
import { useFavourites } from '../favourites';
import { cleanCity, durationLabel, num, plural, ratingOf, shortDate, whatsappUrl } from '../format';
import { success, tap } from '../haptics';
import { Icon, type IconName } from '../icons';
import { Avatar, Panel, Pill, Price, QtyStepper, Screen, SectionHead, Skeleton, Thumb, softShadow, useColumnWidth } from '../kit';
import type { NavProps } from '../nav';
import { useAuth, useCart, useTheme } from '../providers';
import { useToast } from '../toast';
import type { Listing, Review } from '../types';
import { BottomBar, Button, Chip, EmptyState, Field, Header, Sheet, Text } from '../ui';

type Detail = { listing: Listing; related: Listing[]; vendorItems: Listing[] };
type Reviews = { reviews: Review[]; summary?: { count: number; average: number | string; verified_count?: number; distribution?: Record<string, number> } };
type Eligibility = { can_review: boolean; reason?: string; verified?: boolean };

export function ListingDetail({ id, go, back, writeReview }: NavProps & { id?: string; writeReview?: boolean }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { add, count } = useCart();
  const fav = useFavourites();
  const toast = useToast();
  const promo = usePromoSet();
  const queryClient = useQueryClient();
  const width = useColumnWidth();
  const [opt, setOpt] = useState<string | undefined>(undefined);
  const [qty, setQty] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState({ rating: 5, title: '', comment: '' });
  const [posting, setPosting] = useState(false);
  const autoReview = useRef(!!writeReview);

  const detail = useQuery({ queryKey: ['listing-detail', id], enabled: !!id, staleTime: 5 * 60_000, queryFn: () => api.get<Detail>(`/listings/${id}`) });
  const reviews = useQuery({ queryKey: ['listing-reviews', id], enabled: !!id, staleTime: 60_000, queryFn: () => api.get<Reviews>(`/reviews${query({ listing_id: id, limit: 5 })}`) });
  const eligibility = useQuery({ queryKey: ['review-eligibility', id, user?.id], enabled: !!id && !!user, staleTime: 60_000, queryFn: () => api.get<Eligibility>(`/reviews/eligibility${query({ listing_id: id })}`) });
  const listing = detail.data?.listing;

  useEffect(() => { if (detail.data) rememberImages([detail.data.listing, ...detail.data.related, ...detail.data.vendorItems]); }, [detail.data]);
  // Arriving from "Review" on a delivered order opens the review sheet as soon as the API confirms the buyer may review.
  useEffect(() => {
    if (autoReview.current && eligibility.data?.can_review) { autoReview.current = false; setReviewOpen(true); }
  }, [eligibility.data]);

  const options = listing?.options ?? [];
  const chosen = options.find((o) => o.name === opt);
  const unitPrice = chosen ? Number(chosen.price || listing?.price) : Number(listing?.price ?? 0);
  const out = listing ? isOutOfStock(listing) : false;
  const stock = listing?.quantity ?? undefined;
  const service = listing?.kind === 'service';
  const more = useMemo(() => (detail.data?.vendorItems ?? []).filter((l) => l.id !== listing?.id), [detail.data, listing?.id]);
  const similar = useMemo(() => (detail.data?.related ?? []).filter((l) => l.id !== listing?.id && !more.some((m) => m.id === l.id)), [detail.data, listing?.id, more]);

  if (detail.error && !listing) {
    return (
      <Screen><Header title="Details" back={back} />
        <EmptyState icon="cloud-offline-outline" title="Listing unavailable" text={errorMessage(detail.error)} action={<Button style={{ marginTop: 8 }} onPress={() => void detail.refetch()}>Try again</Button>} />
      </Screen>
    );
  }
  if (!listing) {
    return (
      <Screen><Header title="Details" back={back} />
        <View style={{ padding: 12, gap: 11 }}><Skeleton height={width * 0.8} radius={24} /><Skeleton height={28} width="70%" /><Skeleton height={22} width="40%" /><Skeleton height={90} radius={20} /></View>
      </Screen>
    );
  }

  const images = listing.images?.length ? listing.images : [];
  const own = ratingOf({ rating_avg: listing.rating_avg, rating_count: listing.rating_count });
  const saved = fav.has(listing.id);
  const vip = promo.vip.has(listing.vendor_id);
  const city = cleanCity(listing.vendor_city);
  const vendorRating = Number(listing.vendor_rating_count || 0) > 0 ? { avg: Number(listing.vendor_rating_avg || 0), count: Number(listing.vendor_rating_count) } : null;
  const place = cleanCity(listing.service_area);
  const duration = durationLabel(listing.duration_mins);
  const chat = whatsappUrl(listing.whatsapp, `Hi ${listing.business_name || ''}, I'm interested in "${listing.title}" on Sokoni Hub.`);
  const summary = reviews.data?.summary;
  const reviewCount = Number(summary?.count || 0);
  const maxQty = stock !== undefined ? Math.max(1, stock) : 99;

  const addItem = () => {
    if (out) return toast.show('This item is out of stock');
    if (options.length && !chosen) return toast.show('Choose a size first');
    add({
      listing_id: listing.id, vendor_id: listing.vendor_id, vendor_name: listing.business_name || 'Local seller', title: listing.title, price: unitPrice, currency: listing.currency,
      image: listing.images?.[0], qty, max: listing.quantity ?? undefined, kind: listing.kind, option: opt, unit: listing.unit,
    });
    success();
    toast.show(`${qty > 1 ? `${qty} × ` : ''}${listing.title} added to cart`, true);
    setQty(1);
  };
  const submitReview = async () => {
    setPosting(true);
    try {
      await api.post('/reviews', { listing_id: id, rating: review.rating, title: review.title.trim() || undefined, comment: review.comment.trim() || undefined });
      setReviewOpen(false); setReview({ rating: 5, title: '', comment: '' });
      await Promise.all([reviews.refetch(), eligibility.refetch(), queryClient.invalidateQueries({ queryKey: ['listing-detail', id] })]);
      toast.show('Thank you — your review is published');
    } catch (e) { Alert.alert('Cannot post review', errorMessage(e)); }
    finally { setPosting(false); }
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  const share = () => void Share.share({ message: `${listing.title} on Sokoni Hub — ${WEB_URL}/listing/${listing.id}` }).catch(() => {});
  const galleryHeight = Math.min(Math.round(width * 0.74), 360);

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 101 }}
        refreshControl={<RefreshControl refreshing={detail.isRefetching} onRefresh={() => { void detail.refetch(); void reviews.refetch(); }} tintColor={colors.primary} />}
      >
        <View style={{ height: galleryHeight, backgroundColor: service ? colors.primarySoft : '#FFFFFF' }}>
          {images.length ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} scrollEventThrottle={64}>
              {images.map((url) => <Thumb key={url} uri={url} fit={service ? 'cover' : 'contain'} style={{ width, height: galleryHeight, backgroundColor: service ? colors.primarySoft : '#FFFFFF' }} icon={service ? 'service-bell' : 'basket-outline'} iconSize={70} />)}
            </ScrollView>
          ) : <Thumb style={{ width, height: galleryHeight }} icon={service ? 'service-bell' : 'basket-outline'} iconSize={70} />}
          {images.length > 1 ? (
            <>
              <View style={s.dots}>{images.map((u, i) => <View key={u} style={[s.dotPage, { backgroundColor: i === page ? '#FFFFFF' : 'rgba(255,255,255,0.55)', width: i === page ? 18 : 7 }]} />)}</View>
              <View style={s.counter}><Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>{page + 1}/{images.length}</Text></View>
            </>
          ) : null}
          <View style={s.topBar} pointerEvents="box-none">
            <RoundIcon icon="arrow-back" label="Go back" onPress={back} />
            <View style={{ flex: 1 }} />
            <RoundIcon icon="share" label="Share" onPress={share} />
            <RoundIcon icon="heart" solid={saved} tint={saved ? colors.heart : undefined} label={saved ? 'Remove from saved' : 'Save for later'} onPress={() => { tap(); const now = fav.toggle(listing); toast.show(now ? 'Saved for later' : 'Removed from saved'); }} />
            <RoundIcon icon="bag-handle" label="Open cart" badge={count} onPress={() => go('cart')} />
          </View>
        </View>

        <View style={[s.sheet, { backgroundColor: colors.bg }]}>
          <View style={s.tags}>
            {service ? <Pill tone="solidOrange" upper small>Service</Pill> : listing.category_name ? <Pill tone="mint" small>{listing.category_name}</Pill> : null}
            {service && listing.category_name ? <Pill tone="mint" small>{listing.category_name}</Pill> : null}
            {!service && stock !== undefined ? (out ? <Pill tone="rose" icon="close-circle" small>Out of stock</Pill> : stock <= 5 ? <Pill tone="orange" icon="flash" small>{`Only ${stock} left`}</Pill> : <Pill tone="mint" icon="checkmark-circle" small>In stock</Pill>) : null}
          </View>
          <Text style={[s.title, { color: colors.text }]}>{listing.title}</Text>
          {own ? <View style={s.ratingRow}><Icon name="star" size={16} color={colors.orange} /><Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{own.avg.toFixed(1)}</Text><Text style={{ fontSize: 12.5, color: colors.text2, fontWeight: '600' }}>({plural(own.count, 'review')})</Text></View> : null}

          <View style={s.priceRow}>
            <Price value={unitPrice} currency={listing.currency} size={32} from={(service && listing.price_type === 'from') || (options.length > 0 && !chosen)} />
            {listing.unit && !service ? <Text style={{ fontSize: 13, color: colors.text2, fontWeight: '600' }}>per {listing.unit}</Text> : null}
          </View>

          {options.length ? (
            <View style={{ marginTop: 14 }}>
              <Text style={[s.label, { color: colors.text2 }]}>CHOOSE A SIZE OR OPTION</Text>
              <View style={s.options}>{options.map((o) => <Chip key={o.name} selected={opt === o.name} onPress={() => setOpt(o.name)}>{`${o.name} · ${num(o.price || listing.price)} ${listing.currency}`}</Chip>)}</View>
            </View>
          ) : null}

          {service && (duration || place) ? (
            <View style={[s.facts, { backgroundColor: colors.surface2 }]}>
              {duration ? <View style={s.fact}><Icon name="time" solid={false} size={18} color={colors.text2} /><Text style={[s.factText, { color: colors.text2 }]}>{duration}</Text></View> : null}
              {place ? <View style={s.fact}><Icon name="location" solid={false} size={18} color={colors.text2} /><Text style={[s.factText, { color: colors.text2 }]}>Serves {place}</Text></View> : null}
              <View style={s.fact}><Icon name="cash" solid={false} size={18} color={colors.text2} /><Text style={[s.factText, { color: colors.text2 }]}>Pay the provider directly</Text></View>
            </View>
          ) : null}

          <Panel onPress={() => go('store', { slug: listing.vendor_slug })} label={`Visit ${listing.business_name} store`} style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={listing.business_name} uri={listing.vendor_logo} size={54} square tone="mint" />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1 }}>{listing.business_name}</Text>
                <Icon name="check-badge" size={16} color={colors.success} />
                {vip ? <Pill tone="orange" small>VIP</Pill> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="location" solid={false} size={13} color={colors.text2} /><Text numberOfLines={1} style={{ fontSize: 11.5, color: colors.text2, fontWeight: '600', flexShrink: 1 }}>{city || 'Qatar'} · Verified seller</Text>
              </View>
              {vendorRating ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="star" size={13} color={colors.orange} /><Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.text }}>{vendorRating.avg.toFixed(1)}</Text><Text style={{ fontSize: 11.5, color: colors.text2, fontWeight: '600' }}>({plural(vendorRating.count, 'review')})</Text></View> : <Text style={{ fontSize: 11.5, color: colors.text2, fontWeight: '600' }}>New seller</Text>}
            </View>
            <Icon name="chevron-forward" size={19} color={colors.muted} />
          </Panel>
          {chat ? <Button variant="mint" iconLeft="logo-whatsapp" style={{ marginTop: 9 }} onPress={() => void Linking.openURL(chat)}>Chat with seller on WhatsApp</Button> : null}

          <Text style={[s.section, { color: colors.text }]}>About this {listing.kind}</Text>
          <Text style={[s.about, { color: colors.text2 }]} numberOfLines={expanded ? undefined : 5}>{listing.description || 'Ask this verified seller for more detail about this listing.'}</Text>
          {listing.description && listing.description.length > 180 ? <Pressable accessibilityRole="button" onPress={() => setExpanded((v) => !v)} style={{ paddingVertical: 6 }}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{expanded ? 'Show less' : 'Read more'}</Text></Pressable> : null}

          <View style={s.trust}>
            {([
              ['shield-checkmark', 'Verified seller'],
              ['chat', 'Direct contact'],
              service ? ['calendar', 'Book a time'] : ['cash', 'Pay on delivery'],
            ] as [IconName, string][]).map(([icon, label]) => (
              <View key={label} style={[s.trustItem, { backgroundColor: colors.surface, borderColor: colors.border }, softShadow(colors.shadow)]}>
                <View style={[s.trustIcon, { backgroundColor: colors.primarySoft }]}><Icon name={icon} solid={false} size={20} color={colors.primary} /></View>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.text, textAlign: 'center' }}>{label}</Text>
              </View>
            ))}
          </View>

          <View style={s.reviewHead}>
            <Text style={[s.section, { color: colors.text, marginTop: 0 }]}>Buyer reviews</Text>
            {user && eligibility.data?.can_review ? <Pressable accessibilityRole="button" onPress={() => setReviewOpen(true)} style={[s.writeBtn, { backgroundColor: colors.orange }]}><Icon name="pencil" solid={false} size={15} color={colors.onOrange} /><Text style={{ color: colors.onOrange, fontSize: 12, fontWeight: '700' }}>Write a review</Text></Pressable> : null}
          </View>
          {reviewCount > 0 ? (
            <Panel style={{ marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 26.5, fontWeight: '700', color: colors.text, letterSpacing: -1 }}>{Number(summary?.average || 0).toFixed(1)}</Text>
                <View style={{ flexDirection: 'row', gap: 2 }}>{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={14} color={n <= Math.round(Number(summary?.average || 0)) ? colors.orange : colors.border} />)}</View>
                <Text style={{ fontSize: 11.5, color: colors.text2, fontWeight: '600', marginTop: 3 }}>{plural(reviewCount, 'review')}</Text>
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                {[5, 4, 3, 2, 1].map((n) => {
                  const total = Number(summary?.distribution?.[String(n)] || 0);
                  return <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ fontSize: 11, fontWeight: '600', color: colors.text2, width: 10 }}>{n}</Text><View style={[s.bar, { backgroundColor: colors.lav2 }]}><View style={[s.barFill, { width: `${reviewCount ? (total / reviewCount) * 100 : 0}%`, backgroundColor: colors.orange }]} /></View></View>;
                })}
              </View>
            </Panel>
          ) : null}
          {reviews.data?.reviews?.length ? (
            <View style={{ gap: 9, marginTop: 9 }}>
              {reviews.data.reviews.slice(0, 3).map((item) => (
                <Panel key={item.id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', gap: 2 }}>{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={15} color={n <= item.rating ? colors.orange : colors.border} />)}</View>
                    <Text style={{ fontSize: 11.5, color: colors.muted, fontWeight: '600' }}>{shortDate(item.created_at)}</Text>
                  </View>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.text }}>{item.title || 'Buyer review'}</Text>
                  {item.comment ? <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.text2 }}>{item.comment}</Text> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <Text style={{ fontSize: 11.5, color: colors.text2, fontWeight: '600' }}>{item.buyer_name || 'Sokoni Hub buyer'}</Text>
                    {item.verified ? <Pill tone="mint" icon="check-badge" small>Verified purchase</Pill> : null}
                  </View>
                  {item.vendor_reply ? <View style={[s.reply, { backgroundColor: colors.surface2 }]}><Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.primary }}>Reply from {listing.business_name}</Text><Text style={{ fontSize: 12, color: colors.text2, marginTop: 2, lineHeight: 17 }}>{item.vendor_reply}</Text></View> : null}
                </Panel>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 12.5, color: colors.text2, lineHeight: 18, marginTop: 8 }}>{user ? (eligibility.data?.reason === 'no_purchase' ? 'No reviews yet. Reviews open once you have bought this item or completed this booking.' : 'No reviews yet.') : 'No reviews yet. Sign in after your order or booking to leave the first one.'}</Text>
          )}
        </View>

        {more.length ? (
          <>
            <SectionHead title={`More from ${listing.business_name || 'this seller'}`} right={<Text onPress={() => go('store', { slug: listing.vendor_slug })} style={{ color: colors.brown, fontSize: 12.5, fontWeight: '700' }}>View store →</Text>} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>{more.map((row) => <ProductCard key={row.id} listing={row} style={{ width: 176 }} onPress={() => go('listing', { id: row.id })} />)}</ScrollView>
          </>
        ) : null}
        {similar.length ? (
          <>
            <SectionHead title="You may also like" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>{similar.map((row) => <ProductCard key={row.id} listing={row} style={{ width: 176 }} onPress={() => go('listing', { id: row.id })} />)}</ScrollView>
          </>
        ) : null}
      </ScrollView>

      <BottomBar style={{ gap: 11, paddingHorizontal: 12 }}>
        {service ? (
          <>
            <View>
              <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.1, color: colors.text2 }}>{listing.price_type === 'from' ? 'STARTING FROM' : 'PRICE'}</Text>
              <Price value={unitPrice} currency={listing.currency} size={24} />
            </View>
            <Button variant="gold" iconLeft="calendar" style={{ flex: 1, minHeight: 56 }} onPress={() => go('booking', { listing })}>Book Appointment</Button>
          </>
        ) : (
          <>
            {!out ? <QtyStepper qty={qty} max={maxQty} label={listing.title} onMinus={() => setQty((q) => Math.max(1, q - 1))} onPlus={() => setQty((q) => Math.min(maxQty, q + 1))} /> : null}
            <Button variant="deep" iconLeft={out ? undefined : 'cart'} disabled={out} style={{ flex: 1, minHeight: 56 }} onPress={addItem}>{out ? 'Out of stock' : options.length && !chosen ? 'Choose a size' : `Add · ${num(unitPrice * qty)} ${listing.currency}`}</Button>
          </>
        )}
      </BottomBar>

      <Sheet visible={reviewOpen} title="Write a review" onClose={() => setReviewOpen(false)}>
        <Text style={{ fontSize: 12.5, color: colors.text2, marginBottom: 9, lineHeight: 18 }}>{eligibility.data?.verified ? 'Your review will show as a verified purchase.' : 'Tell other buyers what you thought.'}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {[1, 2, 3, 4, 5].map((n) => <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} onPress={() => setReview((r) => ({ ...r, rating: n }))} hitSlop={4}><Icon name="star" size={38} color={n <= review.rating ? colors.orange : colors.border} /></Pressable>)}
        </View>
        <Field label="Review title (optional)" value={review.title} onChangeText={(title) => setReview((r) => ({ ...r, title }))} placeholder="Summarise your experience" maxLength={100} />
        <Field label="Comment (optional)" value={review.comment} onChangeText={(comment) => setReview((r) => ({ ...r, comment }))} multiline maxLength={1000} style={{ minHeight: 100, textAlignVertical: 'top', paddingTop: 9 }} />
        <Button loading={posting} onPress={submitReview}>Post review</Button>
      </Sheet>
    </Screen>
  );
}

function RoundIcon({ icon, label, onPress, badge, solid, tint }: { icon: 'arrow-back' | 'share' | 'heart' | 'bag-handle'; label: string; onPress: () => void; badge?: number; solid?: boolean; tint?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { tap(); onPress(); }} style={[s.round, { backgroundColor: 'rgba(255,255,255,0.94)' }, softShadow('#000000')]}>
      <Icon name={icon} solid={solid ?? false} size={21} color={tint ?? '#111827'} />
      {badge ? <View style={[s.badge, { backgroundColor: colors.orange, borderColor: '#FFFFFF' }]}><Text style={{ color: colors.onOrange, fontSize: 10, fontWeight: '700' }}>{badge > 9 ? '9+' : badge}</Text></View> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  topBar: { position: 'absolute', top: 12, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 2, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', bottom: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dotPage: { height: 7, borderRadius: 4 },
  counter: { position: 'absolute', right: 14, bottom: 40, backgroundColor: 'rgba(17,24,39,0.7)', borderRadius: 11, paddingHorizontal: 8, height: 24, justifyContent: 'center' },
  sheet: { marginTop: -26, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 12, paddingTop: 17 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 21, fontWeight: '700', letterSpacing: -0.7, lineHeight: 26, marginTop: 9 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 9 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1, marginBottom: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 9, marginTop: 14 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  factText: { fontSize: 12, fontWeight: '600' },
  section: { fontSize: 16.5, fontWeight: '700', letterSpacing: -0.4, marginTop: 20, marginBottom: 8 },
  about: { fontSize: 13, lineHeight: 20 },
  trust: { flexDirection: 'row', gap: 8, marginTop: 16 },
  trustItem: { flex: 1, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', gap: 8, paddingVertical: 11, paddingHorizontal: 6 },
  trustIcon: { width: 33, height: 33, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },
  writeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: 14, paddingHorizontal: 11 },
  bar: { flex: 1, height: 7, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 7, borderRadius: 4 },
  reply: { borderRadius: 12, padding: 9, marginTop: 4 },
  rail: { gap: 9, paddingHorizontal: 12, paddingBottom: 6 },
});
