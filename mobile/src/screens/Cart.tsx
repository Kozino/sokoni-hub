
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
import { ListingDetail } from './ListingDetail';
import { DetailFact } from './DetailFact';
import { StoreDetail } from './StoreDetail';
import { Orders } from './Orders';
import { Bookings } from './Bookings';
import { Status } from './Status';
import { Track } from './Track';
import { Account } from './Account';
import { AccountRow } from './AccountRow';
import { Support } from './Support';
import { GuestGate } from './GuestGate';
import { WebOnlyAccount } from './WebOnlyAccount';export function Cart({ go, back, tab }: any) {
  const { colors } = useTheme(); const cart = useCart(); const subtotal = cart.items.reduce((total,item)=>total+item.price*item.qty,0);
  const byVendor=cart.items.reduce<Record<string,CartItem[]>>((all,item)=>{(all[item.vendor_name]??=[]).push(item);return all;},{});
  // Header, scrolling content, checkout bar and the tab bar are stacked in one column, so the tab bar is always pinned to the bottom.
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.page}>
    <View style={styles.cartTopbar}><Pressable accessibilityRole="button" onPress={back} accessibilityLabel="Go back" style={styles.referenceBack}><Icon name="arrow-back" size={23} color={colors.text}/></Pressable><BrandMark small/></View>
    {cart.items.length ? <>
      <ScrollView style={{flex:1}} contentContainerStyle={styles.referenceCartScroll}>
        <View style={styles.cartTitleRow}><Text style={[styles.referenceCartTitle,{color:colors.text}]}>My Cart <Text style={[styles.cartCountPill,{backgroundColor:colors.surface2,color:colors.text2}]}>{cart.count} items</Text></Text></View>
        <View style={[styles.dispatchProgress,{backgroundColor:colors.surface}]}><View style={[styles.dispatchIcon,{backgroundColor:colors.primarySoft}]}><Icon name="car-outline" size={20} color={colors.primary}/></View><View style={{flex:1}}><View style={styles.dispatchHead}><Text style={[styles.dispatchTitle,{color:colors.text}]}>Delivery price confirmed at checkout</Text><Text style={[styles.dispatchTitle,{color:colors.primary}]}>Secure quote</Text></View><View style={[styles.progressTrack,{backgroundColor:colors.border}]}><View style={[styles.progressFill,{backgroundColor:colors.primary,width:'74%'}]}/></View><Text style={[styles.dispatchCopy,{color:colors.text2}]}>Server pricing checks availability, delivery options and final fees before payment.</Text></View></View>
        {Object.entries(byVendor).map(([vendor,items])=><View key={vendor} style={[styles.vendorCartBlock,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={styles.vendorCartHeading}><Icon name="storefront-outline" size={16} color={colors.primary}/><Text style={[styles.vendorCartName,{color:colors.text}]}>{vendor}</Text></View>{items.map((item)=><View key={item.listing_id + (item.option||'')} style={styles.referenceCartItem}><ListingImage uri={item.image} style={styles.referenceCartImage} icon="basket-outline" size={25}/><View style={{flex:1}}><Text numberOfLines={2} style={[styles.referenceCartItemTitle,{color:colors.text}]}>{item.title}{item.option ? ` (${item.option})` : ''}</Text><View style={styles.cartBadges}><Text style={[styles.cartFreshBadge,{backgroundColor:colors.primarySoft,color:colors.primary}]}>Verified listing</Text><Text style={[styles.importText,{color:colors.text2}]}>Local seller</Text></View><Money value={item.price} currency={item.currency} strong/></View><View style={styles.cartItemControls}><Pressable accessibilityRole="button" onPress={()=>cart.remove(item.listing_id, item.option)} accessibilityLabel="Remove item" hitSlop={8}><Icon name="trash-outline" size={18} color={colors.muted}/></Pressable><View style={styles.qtyRow}><Pressable accessibilityRole="button" onPress={()=>item.qty===1?cart.remove(item.listing_id, item.option):cart.setQty(item.listing_id, item.qty - 1, item.option)} accessibilityLabel="Decrease quantity" style={[styles.roundQty,{borderColor:colors.border}]}><Icon name="remove" size={15} color={colors.text}/></Pressable><Text style={[styles.qty,{color:colors.text}]}>{item.qty}</Text><Pressable accessibilityRole="button" onPress={()=>cart.setQty(item.listing_id, item.qty + 1, item.option)} accessibilityLabel="Increase quantity" style={[styles.roundQty,{backgroundColor:colors.primary,borderColor:colors.primary}]}><Icon name="add" size={15} color="#fff"/></Pressable></View></View></View>)}</View>)}
      </ScrollView>
      <BottomBar style={{paddingBottom:10}}><View><Text style={[styles.totalLabel,{color:colors.text2}]}>TOTAL CART</Text><Money value={subtotal} strong/></View><Button variant="gold" icon="arrow-forward" onPress={()=>go('checkout')} style={styles.referenceCheckoutButton}>Proceed to checkout</Button></BottomBar>
    </> : <View style={{flex:1}}><EmptyState title="Your cart is waiting" text="Add a local product, then checkout with server-verified prices." icon="bag-handle-outline" action={<Button style={{marginTop:10}} onPress={()=>tab('browse')}>Explore local listings</Button>}/></View>}
    <Tabs active="cart" tab={tab}/>
  </KeyboardAvoidingView>;
}

