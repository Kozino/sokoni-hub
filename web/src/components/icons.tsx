import type { ElementType, ReactElement } from 'react';
import {
  ArrowDownTrayIcon,
  BellIcon,
  BuildingStorefrontIcon,
  ChartBarSquareIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  Cog6ToothIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  FolderIcon,
  InboxIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ReceiptPercentIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  StarIcon,
  TableCellsIcon,
  TrashIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

/**
 * Central Heroicons registry. Keeping navigation icons as React nodes preserves
 * the dashboard API while giving every icon the same accessible, maintained
 * 24px outline language. CSS controls the final size and colour.
 */
const icon = (Node: ElementType): ReactElement => <Node aria-hidden />;

export const IconChart = icon(ChartBarSquareIcon);
export const IconShield = icon(ShieldCheckIcon);
export const IconBox = icon(CubeIcon);
export const IconReceipt = icon(ReceiptPercentIcon);
export const IconAlert = icon(ExclamationTriangleIcon);
export const IconUsers = icon(UsersIcon);
export const IconStar = icon(StarIcon);
export const IconFolder = icon(FolderIcon);
export const IconHistory = icon(ClockIcon);
export const IconPlus = icon(PlusIcon);
export const IconStore = icon(BuildingStorefrontIcon);
export const IconGrid = icon(Squares2X2Icon);
export const IconInbox = icon(InboxIcon);
export const IconCheck = icon(CheckIcon);
export const IconSearch = icon(MagnifyingGlassIcon);
export const IconBell = icon(BellIcon);
export const IconSettings = icon(Cog6ToothIcon);
export const IconChevronUp = icon(ChevronUpIcon);
export const IconChevronDown = icon(ChevronDownIcon);
export const IconColumns = icon(TableCellsIcon);
export const IconDownload = icon(ArrowDownTrayIcon);
export const IconTrash = icon(TrashIcon);
export const IconX = icon(XMarkIcon);
