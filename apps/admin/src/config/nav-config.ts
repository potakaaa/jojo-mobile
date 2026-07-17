import {
  LayoutDashboard,
  Store,
  Users,
  TestTube,
  FolderTree,
  Package,
  Tag,
  Megaphone,
  Ticket,
  Gift,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  to: string;
  activeOptions?: { exact?: boolean };
  disabled?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navConfig: NavGroup[] = [
  {
    label: 'Main',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        to: '/',
        activeOptions: { exact: true },
      },
    ],
  },
  {
    label: 'Management',
    items: [
      {
        id: 'branches',
        label: 'Branches',
        icon: Store,
        to: '/branches',
      },
      {
        id: 'categories',
        label: 'Categories',
        icon: FolderTree,
        to: '/categories',
      },
      {
        id: 'products',
        label: 'Products',
        icon: Package,
        to: '/products',
      },
      {
        id: 'deals',
        label: 'Deals',
        icon: Tag,
        to: '/deals',
      },
      {
        id: 'promotions',
        label: 'Promotions',
        icon: Megaphone,
        to: '/promotions',
      },
      {
        id: 'offers',
        label: 'Offers',
        icon: Ticket,
        to: '/offers',
      },
      {
        id: 'rewards',
        label: 'Rewards',
        icon: Gift,
        to: '/rewards',
      },
      {
        id: 'users',
        label: 'Users & Roles',
        icon: Users,
        to: '/users',
        disabled: true,
      },
    ],
  },
  {
    label: 'Dev',
    items: [
      {
        id: 'components',
        label: 'UI Showcase',
        icon: TestTube,
        to: '/components',
      },
    ],
  },
];
