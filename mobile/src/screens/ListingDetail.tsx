
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, FlatList, ImageBackground, KeyboardAvoidingView, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, useWindowDimensions, View, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError, query } from '../api';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, WEB_URL } from '../config';
import { AuthProvider, CartProvider, ThemeProvider, useAuth, useCart, useTheme } from '../providers';
import type { Booking, CartItem, Category, Listing, Order, Review, Vendor } from '../types';
import { BrandMark, Button, Card, Chip, Divider, Dropdown, EmptyState, Field, FontContext, Header, IconButton, Money, Notice, Sheet, Spinner, Text, TextInput, type DropdownOption, type FontStatus } from '../ui';
import { CityProvider, useCity } from '../city';
import { categoryImage } from '../catImages';
import { BottomBar } from '../ui';
import { BookService } from '../booking';
import { Checkout } from '../checkout';
import { FavouritesProvider, useFavourites } from '../favourites';
import { FeaturedStores, usePromotions, VipStores } from '../promotions';
import { LegalScreen } from '../legal';
import { Icon, type IconName } from '../icons';
import { styles, nx, ex } from '../styles';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { tap, success } from '../haptics';

export type Screen = 'welcome' | 'home' | 'browse' | 'cart' | 'account' | 'login' | 'register' | 'pin' | 'pinsetup' | 'forgot' | 'listing' | 'store' | 'checkout' | 'orders' | 'bookings' | 'track' | 'booking' | 'support' | 'saved' | 'notifications' | 'legal';
export type Nav = { screen: Screen; params?: Record<string, any>; id?: number };

const message = (error: any) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'To be arranged';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'To be arranged';
const statusLabel = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export const ToastContext = createContext<{ show: (text: string, cartLink?: boolean) => void }>({ show: () => {} });
export const useToast = () => useContext(ToastContext);

import { Welcome } from './Welcome';
import { Tabs } from './Tabs';
import { Home } from './Home';
import { TrustTile } from './TrustTile';
import { SectionTitle } from './SectionTitle';
import { ListingRail } from './ListingRail';
import { ListingImage } from './ListingImage';
import { ListingCard } from './ListingCard';
import { Browse } from './Browse';
import { Saved } from './Saved';
import { Notifications } from './Notifications';
import { AuthScaffold } from './AuthScaffold';
import { Login } from './Login';
import { Register } from './Register';
import { Pin } from './Pin';
import { Recovery } from './Recovery';
import { DetailFact } from './DetailFact';
import { StoreDetail } from './StoreDetail';
import { Cart } from './Cart';
import { Orders } from './Orders';
import { Bookings } from './Bookings';
import { Status } from './Status';
import { Track } from './Track';
import { Account } from './Account';
import { AccountRow } from './AccountRow';
import { Support } from './Support';
import { GuestGate } from './GuestGate';
import { WebOnlyAccount } from './WebOnlyAccount';export function ListingDetail({ id, go, back }: any) {
  const { colors }=useTheme();const {user}=useAuth();const {add}=useCart();const fav=useFavourites();const [data,setData]=useState<{listing:Listing;related:Listing[];vendorItems:Listing[]}|null>(null);const [reviews,setReviews]=useState<Review[]>([]);const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [error,setError]=useState('');const [reviewOpen,setReviewOpen]=useState(false);const [review,setReview]=useState({rating:'5',title:'',comment:''});
  const load=useCallback(async(pull=false)=>{if(pull)setRefreshing(true);else setLoading(true);setError('');try{const detail=await api.get<{listing:Listing;related:Listing[];vendorItems:Listing[]}>(`/listings/${id}`);setData(detail);const result=await api.get<{reviews:Review[]}>(`/reviews${query({listing_id:id,limit:5})}`);setReviews(result.reviews);}catch(e){if(pull)Alert.alert('Could not refresh',message(e));else setError(message(e));}finally{setLoading(false);setRefreshing(false);}},[id]);useEffect(()=>{void load();},[load]);if(error&&!data)return <View style={styles.page}><Header title="Product details" back={back}/><EmptyState icon="cloud-offline-outline" title="Listing unavailable" text={error} action={<Button style={{marginTop:8}} onPress={()=>void load()}>Try again</Button>}/></View>;if(loading||!data)return <View style={styles.page}><Header title="Product details" back={back}/><Spinner label="Loading listing…"/></View>;const listing=data.listing;
  const addItem=()=>{if(listing.quantity!==null&&listing.quantity<=0)return Alert.alert('Out of stock','This item is currently unavailable.');add({listing_id:listing.id,vendor_id:listing.vendor_id,vendor_name:listing.business_name||'Local seller',title:listing.title,price:Number(listing.price),currency:listing.currency,image:listing.images?.[0],qty:1,max:listing.quantity??undefined,kind:listing.kind});success();Alert.alert('Added to cart',`${listing.title} is ready for checkout.`,[{text:'Keep shopping'},{text:'View cart',onPress:()=>go('cart')}]);};const submitReview=async()=>{try{await api.post('/reviews',{listing_id:id,rating:Number(review.rating),title:review.title||undefined,comment:review.comment||undefined});setReviewOpen(false);setReview({rating:'5',title:'',comment:''});await load();Alert.alert('Thank you','Your review is now published.');}catch(e){Alert.alert('Cannot post review',message(e));}};
  return <View style={styles.page}><View style={styles.detailTopbar}><Pressable accessibilityRole="button" onPress={back} accessibilityLabel="Go back" style={[styles.detailCircle,{backgroundColor:colors.surface}]}><Icon name="arrow-back" size={22} color={colors.text}/></Pressable><View style={{flex:1}}/><Pressable accessibilityRole="button" onPress={()=>go('cart')} accessibilityLabel="Open cart" style={[styles.detailCircle,{backgroundColor:colors.surface}]}><Icon name="bag-handle-outline" size={20} color={colors.primary}/></Pressable><Pressable onPress={()=>{tap();fav.toggle(listing);}} accessibilityRole="button" accessibilityLabel={fav.has(listing.id)?'Remove from saved':'Save for later'} style={[styles.detailCircle,{backgroundColor:colors.surface}]}><Icon name={fav.has(listing.id)?'heart':'heart-outline'} size={20} color={fav.has(listing.id)?'#D9304F':colors.primary}/></Pressable></View><ScrollView contentContainerStyle={styles.referenceDetailScroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.primary}/>}>{listing.images?.length?<ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>{listing.images.map((url)=><ListingImage key={url} uri={url} style={styles.referenceDetailImage} icon={listing.kind==='service'?'construct-outline':'basket-outline'} size={68}/>)}</ScrollView>:<View style={[styles.referenceDetailImage,{backgroundColor:colors.primarySoft}]}><Icon name={listing.kind==='service'?'construct-outline':'basket-outline'} size={68} color={colors.primary}/></View>}<View style={styles.detailReferenceBody}><View style={styles.detailTagRow}><Text style={[styles.detailReferenceTag,{backgroundColor:listing.kind==='service'?colors.tealSoft:colors.primarySoft,color:listing.kind==='service'?colors.teal:colors.primary}]}>{listing.kind==='service'?'LOCAL SERVICE':'FRESH LOCAL PICK'}</Text>{listing.quantity!==null&&<View style={nx.inline}><Icon name={listing.quantity>0?'checkmark-circle':'close-circle'} size={14} color={listing.quantity>0?colors.primary:colors.danger}/><Text style={[styles.detailStock,{color:listing.quantity>0?colors.primary:colors.danger}]}>{listing.quantity>0?'In stock':'Out of stock'}</Text></View>}</View><Text style={[styles.referenceDetailTitle,{color:colors.text}]}>{listing.title}</Text><View style={styles.detailPriceLine}><Money value={listing.price} currency={listing.currency} strong/>{listing.unit&&<Text style={[styles.detailUnit,{color:colors.text2}]}>per {listing.unit}</Text>}</View><View style={[styles.sellerDetailCard,{backgroundColor:colors.surface2}]}><Pressable accessibilityRole="button" onPress={()=>go('store',{slug:listing.vendor_slug})} accessibilityLabel={`Visit ${listing.business_name} store`} style={styles.sellerDetailRow}><View style={[styles.sellerAvatar,{backgroundColor:colors.surface}]}>{listing.vendor_logo?<Image contentFit="cover" transition={200} source={{ uri:listing.vendor_logo}} style={styles.vendorLogo}/>:<Icon name="storefront-outline" size={24} color={colors.primary}/>}</View><View style={{flex:1}}><Text style={[styles.sellerDetailName,{color:colors.text}]}>{listing.business_name}</Text><View style={[nx.inline,{marginTop:3}]}><Icon name="location-outline" size={12} color={colors.text2}/><Text style={[styles.sellerDetailMeta,{color:colors.text2,marginTop:0}]}>{listing.vendor_city||'Doha'} · Verified community vendor</Text></View><View style={styles.ratingLine}><Icon name="star" size={13} color={colors.gold}/><Text style={[styles.ratingText,{color:colors.text2}]}>{Number(listing.vendor_rating_avg||listing.rating_avg||0).toFixed(1)} ({listing.vendor_rating_count||listing.rating_count||0} reviews)</Text></View></View><Icon name="chevron-forward" size={19} color={colors.muted}/></Pressable></View><Text style={[styles.detailSectionTitle,{color:colors.text}]}>About this {listing.kind}</Text><Text style={[styles.referenceDetailDescription,{color:colors.text2}]}>{listing.description||'Ask this verified local seller for more detail about this listing.'}</Text><View style={styles.detailFacts}><DetailFact icon="shield-checkmark-outline" label="Verified seller"/><DetailFact icon="chatbubble-ellipses-outline" label="Direct contact"/><DetailFact icon={listing.kind==='service'?'calendar-outline':'bag-check-outline'} label={listing.kind==='service'?'Book a time':'Server-priced checkout'}/></View><View style={styles.reviewHeader}><Text style={[styles.detailSectionTitle,{color:colors.text,marginBottom:0}]}>Buyer reviews</Text>{user&&<Pressable accessibilityRole="button" onPress={()=>setReviewOpen(true)}><Text style={[styles.writeReview,{color:colors.gold}]}>Write review</Text></Pressable>}</View>{reviews.length?reviews.slice(0,3).map((item)=><View key={item.id} style={[styles.referenceReview,{backgroundColor:colors.surface}]}><View style={styles.ratingLine}><View style={nx.inline}>{[1,2,3,4,5].map((n)=><Icon key={n} name="star" size={14} color={n<=item.rating?colors.gold:colors.border}/>)}</View><Text style={[styles.reviewDate,{color:colors.muted}]}>{date(item.created_at)}</Text></View><Text style={[styles.reviewTitle,{color:colors.text}]}>{item.title||'Buyer review'}</Text>{item.comment?<Text style={[styles.reviewCopy,{color:colors.text2}]}>{item.comment}</Text>:null}</View>):<Text style={[styles.noReview,{color:colors.text2}]}>Be the first buyer to leave a review after your completed order or booking.</Text>}<SectionTitle title="More to explore" action="View all" onPress={()=>go('browse')}/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listingRail}>{data.related.map((row)=><ListingCard key={row.id} listing={row} compact onPress={()=>go('listing',{id:row.id})}/>)}</ScrollView></View></ScrollView><BottomBar><View><Text style={[styles.totalLabel,{color:colors.text2}]}>{listing.kind==='service'?'STARTING FROM':'PRICE'}</Text><Money value={listing.price} currency={listing.currency} strong/></View><Button variant={listing.kind==='service'?'primary':'gold'} icon={listing.kind==='service'?'arrow-forward':'cart-outline'} onPress={listing.kind==='service'?()=>go('booking',{listing}):addItem} style={styles.detailBuyButton}>{listing.kind==='service'?'Book service':'Add to cart'}</Button></BottomBar><Sheet visible={reviewOpen} title="Write a review" onClose={()=>setReviewOpen(false)}><Field label="Rating (1–5)" value={review.rating} onChangeText={(rating)=>setReview((r)=>({...r,rating}))} keyboardType="number-pad" maxLength={1}/><Field label="Review title (optional)" value={review.title} onChangeText={(title)=>setReview((r)=>({...r,title}))} placeholder="Summarise your experience"/><Field label="Comment (optional)" value={review.comment} onChangeText={(comment)=>setReview((r)=>({...r,comment}))} multiline style={{minHeight:96,textAlignVertical:'top',paddingTop:12}}/><Button onPress={submitReview}>Post review</Button></Sheet></View>;
}
