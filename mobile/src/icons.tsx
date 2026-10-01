import { View } from 'react-native';
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
} as const;

export type IconName = keyof typeof MAP | `${keyof typeof MAP}-outline` | 'radio-button-on' | 'radio-button-off';

export function Icon({ name, size = 20, color = '#111827', solid }: { name: IconName; size?: number; color?: string; solid?: boolean }) {
  if (name === 'radio-button-off') return <View style={{ width: size * .86, height: size * .86, borderRadius: size, borderWidth: 2, borderColor: color }} />;
  if (name === 'radio-button-on') { const Solid = S.CheckCircleIcon as HeroIcon; return <Solid size={size} color={color} />; }
  const outline = name.endsWith('-outline');
  const base = (outline ? name.slice(0, -8) : name) as keyof typeof MAP;
  const key = MAP[base] ?? 'QuestionMarkCircleIcon';
  const useSolid = solid ?? !outline;
  const Cmp = ((useSolid ? S : O) as unknown as Record<string, HeroIcon>)[key];
  return <Cmp size={size} color={color} />;
}
