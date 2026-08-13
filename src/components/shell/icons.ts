import {
  LayoutDashboard,
  Package,
  Truck,
  Car,
  Building2,
  Users,
  ShieldCheck,
  FileText,
  Bell,
  Wallet,
  BarChart3,
  History,
  Settings,
  Contact,
  Send,
  AlertTriangle,
} from "lucide-react";

// Server Components can't pass component references as props to Client Components
// (RSC serialization rejects functions/classes) — nav items pass icon *names* instead,
// resolved to a component here on the client side.
export const ICONS = {
  LayoutDashboard,
  Package,
  Truck,
  Car,
  Building2,
  Users,
  ShieldCheck,
  FileText,
  Bell,
  Wallet,
  BarChart3,
  History,
  Settings,
  Contact,
  Send,
  AlertTriangle,
} as const;

export type IconName = keyof typeof ICONS;
