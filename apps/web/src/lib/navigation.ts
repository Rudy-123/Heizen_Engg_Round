import type { Permission, SessionUser } from '@fernleaf/shared';
import {
  AlarmClock,
  Building2,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  MapPinned,
  Receipt,
  Settings,
  Tags,
  Truck,
  UsersRound,
  UtensilsCrossed,
  BookOpenText,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown only to roles with this permission (the page and the API check it too). */
  permission?: Permission;
  /** Extra visibility rule based on the user's data (never on role names). */
  visible?: (user: SessionUser) => boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** The sidebar. Each person sees only the entries their permissions allow. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        visible: (user) => user.role.homeDashboard !== 'DRIVER',
      },
      { label: 'Orders', href: '/orders', icon: ClipboardList, permission: 'ORDERS_READ' },
      { label: 'Cut-offs', href: '/cutoffs', icon: AlarmClock, permission: 'CUTOFF_RUN' },
      { label: 'Kitchen board', href: '/kitchen', icon: ChefHat, permission: 'KITCHEN_READ' },
      { label: 'Dispatch board', href: '/dispatch', icon: Truck, permission: 'DISPATCH_READ' },
      { label: 'My deliveries', href: '/driver', icon: MapPinned, permission: 'DELIVERIES_OWN' },
    ],
  },
  {
    label: 'Commercial',
    items: [
      { label: 'Billing', href: '/billing', icon: Receipt, permission: 'BILLING_READ' },
      { label: 'Companies', href: '/companies', icon: Building2, permission: 'COMPANIES_READ' },
      { label: 'Pricing', href: '/pricing', icon: Tags, permission: 'PRICING_READ' },
    ],
  },
  {
    label: 'Food',
    items: [
      {
        label: 'Dishes & options',
        href: '/catalogue',
        icon: UtensilsCrossed,
        permission: 'CATALOGUE_READ',
      },
      { label: 'Menu', href: '/menu', icon: BookOpenText, permission: 'MENU_READ' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Staff & roles', href: '/staff', icon: UsersRound, permission: 'STAFF_MANAGE' },
      { label: 'Settings', href: '/settings', icon: Settings, permission: 'SETTINGS_READ' },
    ],
  },
];

export function visibleNavGroups(user: SessionUser): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (!item.permission || user.permissions.includes(item.permission)) &&
        (!item.visible || item.visible(user)),
    ),
  })).filter((group) => group.items.length > 0);
}
