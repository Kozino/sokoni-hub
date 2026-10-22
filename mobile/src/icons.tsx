import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import * as O from 'react-native-heroicons/outline';
import * as S from 'react-native-heroicons/solid';
import type { ComponentType } from 'react';

/**
 * Single entry point for every icon in the app. All glyphs are official Heroicons
 * (react-native-heroicons). Names are semantic; a trailing "-outline" is accepted so
 * call sites read the same as before, and the bare name renders the solid variant.
 */
type HeroIcon = ComponentType<{ size?: number; color?: string }>;

const MAP = {
  search: 'MagnifyingGlassIcon', location: 'MapPinIcon', 'chevron-down': 'ChevronDownIcon', 'chevron-forward': 'ChevronRightIcon',
  notifications: 'BellIcon', bag: 'ShoppingBagIcon', 'bag-handle': 'ShoppingBagIcon', cart: 'ShoppingCartIcon', 'cart-add': 'ShoppingCartIcon',
  apps: 'Squares2X2Icon', grid: 'Squares2X2Icon', storefront: 'BuildingStorefrontIcon', construct: 'WrenchScrewdriverIcon',
  person: 'UserIcon', home: 'HomeIcon', basket: 'ShoppingBagIcon', star: 'StarIcon', heart: 'HeartIcon',
  'arrow-back': 'ArrowLeftIcon', 'arrow-forward': 'ArrowRightIcon', close: 'XMarkIcon', 'close-circle': 'XCircleIcon',
  'checkmark-circle': 'CheckCircleIcon', add: 'PlusIcon', remove: 'MinusIcon', trash: 'TrashIcon',
  calendar: 'CalendarDaysIcon', time: 'ClockIcon', receipt: 'ClipboardDocumentListIcon', navigate: 'TruckIcon', car: 'TruckIcon',
  bicycle: 'TruckIcon', walk: 'ShoppingBagIcon', cash: 'BanknotesIcon', business: 'BuildingLibraryIcon',
  'logo-whatsapp': 'ChatBubbleLeftRightIcon', 'chatbubble-ellipses': 'ChatBubbleLeftEllipsisIcon', mail: 'EnvelopeIcon', call: 'PhoneIcon',
  globe: 'GlobeAltIcon', 'shield-checkmark': 'ShieldCheckIcon', pricetag: 'TagIcon', options: 'AdjustmentsHorizontalIcon',
  'cloud-offline': 'SignalSlashIcon', 'alert-circle': 'ExclamationCircleIcon', warning: 'ExclamationTriangleIcon',
  'information-circle': 'InformationCircleIcon', desktop: 'ComputerDesktopIcon', 'document-text': 'DocumentTextIcon',
  'finger-print': 'FingerPrintIcon', flash: 'BoltIcon', key: 'KeyIcon', backspace: 'BackspaceIcon', 'lock-closed': 'LockClosedIcon',
  'help-buoy': 'LifebuoyIcon', diamond: 'SparklesIcon', ribbon: 'CheckBadgeIcon', moon: 'MoonIcon', sunny: 'SunIcon',
  'bag-check': 'ShoppingBagIcon', 'chevron-up': 'ChevronUpIcon', 'log-out': 'ArrowRightOnRectangleIcon', pencil: 'PencilSquareIcon',
  bell: 'BellIcon', phone: 'PhoneIcon', 'id-card': 'IdentificationIcon',
  // Added for the Sokoni Hub 2 design.
  scissors: 'ScissorsIcon', tune: 'AdjustmentsHorizontalIcon', refresh: 'ArrowPathIcon', swap: 'ArrowsUpDownIcon', list: 'ListBulletIcon',
  copy: 'DocumentDuplicateIcon', ticket: 'TicketIcon', building: 'BuildingOffice2Icon', help: 'QuestionMarkCircleIcon', check: 'CheckIcon',
  chat: 'ChatBubbleBottomCenterTextIcon', 'receipt-percent': 'ReceiptPercentIcon', language: 'LanguageIcon', 'bell-alert': 'BellAlertIcon',
  'trending-down': 'ArrowTrendingDownIcon', 'user-circle': 'UserCircleIcon', share: 'ShareIcon', external: 'ArrowTopRightOnSquareIcon',
  gift: 'GiftIcon', fire: 'FireIcon', map: 'MapIcon', ellipsis: 'EllipsisHorizontalIcon', archive: 'ArchiveBoxIcon', cube: 'CubeIcon',
  'document-check': 'DocumentCheckIcon', 'clipboard-check': 'ClipboardDocumentCheckIcon', wallet: 'WalletIcon', eye: 'EyeIcon', send: 'PaperAirplaneIcon',
  funnel: 'FunnelIcon', inbox: 'InboxIcon', 'user-group': 'UserGroupIcon', cog: 'Cog6ToothIcon', ban: 'NoSymbolIcon', flag: 'FlagIcon',
  camera: 'CameraIcon', 'chevron-left': 'ChevronLeftIcon', 'calendar-days': 'CalendarDaysIcon', 'shield': 'ShieldCheckIcon', 'home-modern': 'HomeModernIcon',
  sparkles: 'SparklesIcon', 'check-badge': 'CheckBadgeIcon', 'arrow-path': 'ArrowPathIcon', 'qr-code': 'QrCodeIcon', 'lock-open': 'LockClosedIcon',
} as const;

/** Heroicons has no compass, so the Explore tab icon is drawn here in the same 24px / 1.5px-stroke style. */
function Compass({ size, color, solid }: { size: number; color: string; solid: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {solid ? (
        <Path fill={color} fillRule="evenodd" d="M12 2.25a9.75 9.75 0 1 0 0 19.5 9.75 9.75 0 0 0 0-19.5ZM16.4 7.6l-2.45 6.35L7.6 16.4l2.45-6.35L16.4 7.6Z" />
      ) : (
        <>
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.5} />
          <Path d="M15.7 8.3l-2.1 5.3-5.3 2.1 2.1-5.3 5.3-2.1Z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
        </>
      )}
    </Svg>
  );
}


/** A concierge / service bell: the universal "services" symbol (hair, beauty, home and other bookable help). Heroicons has none. */
function ServiceBell({ size, color, solid }: { size: number; color: string; solid: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {solid ? (
        <>
          <Path d="M12 5.9V8.2M10 5.9h4" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
          <Path fill={color} d="M3.9 16.1a8.1 8.1 0 0 1 16.2 0z" />
          <Rect x={2.4} y={17.1} width={19.2} height={3} rx={1.5} fill={color} />
          <Path d="M7.7 13.3a4.6 4.6 0 0 1 3-2.9" stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={1.4} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Path d="M12 6.2V8.1M10.2 6.2h3.6" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          <Path d="M4.2 16.2a7.8 7.8 0 0 1 15.6 0" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          <Path d="M2.8 16.2h18.4M3.9 19.8h16.2" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          <Path d="M7.6 13.1a4.6 4.6 0 0 1 3-2.8" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}

export type IconName = keyof typeof MAP | `${keyof typeof MAP}-outline` | 'radio-button-on' | 'radio-button-off' | 'compass' | 'compass-outline' | 'service-bell' | 'service-bell-outline';

/** Icons render ~10% smaller than the size asked for: the whole app uses the compact scale. */
const ICON_SCALE = 0.9;

export function Icon({ name, size = 20, color = '#111827', solid }: { name: IconName; size?: number; color?: string; solid?: boolean }) {
  const px = Math.max(11, Math.round(size * ICON_SCALE));
  if (name === 'radio-button-off') return <View style={{ width: px * .86, height: px * .86, borderRadius: px, borderWidth: 2, borderColor: color }} />;
  if (name === 'radio-button-on') { const Solid = S.CheckCircleIcon as HeroIcon; return <Solid size={px} color={color} />; }
  if (name === 'compass' || name === 'compass-outline') return <Compass size={px} color={color} solid={solid ?? name === 'compass'} />;
  if (name === 'service-bell' || name === 'service-bell-outline') return <ServiceBell size={px} color={color} solid={solid ?? name === 'service-bell'} />;
  const outline = name.endsWith('-outline');
  const base = (outline ? name.slice(0, -8) : name) as keyof typeof MAP;
  const key = MAP[base] ?? 'QuestionMarkCircleIcon';
  const useSolid = solid ?? !outline;
  const Cmp = ((useSolid ? S : O) as unknown as Record<string, HeroIcon>)[key];
  return <Cmp size={px} color={color} />;
}
