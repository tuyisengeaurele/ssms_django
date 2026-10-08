import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, Ban, Bell, Building2, Calendar, ChartNoAxesColumn, Check,
  ChevronDown, ChevronRight, CircleCheck, Cpu, Download, Droplets, Eye, EyeOff, Gauge, Info, Inbox, KeyRound,
  LayoutDashboard, Leaf, Lock, LogOut, Mail, MapPin, Microscope, PanelLeft, Pencil, Plus, Printer, RefreshCw,
  ScrollText, Search, Settings, ShieldCheck, ShoppingBasket, Thermometer, Trash2, TriangleAlert, UserCheck,
  UserRound, Users, UserX, Warehouse, Worm, X,
  type LucideIcon,
} from 'lucide-react';

/**
 * The one icon set for the signed in app. Names say what the icon means, not what it looks like,
 * so a picture can change in one place.
 */
const ICONS = {
  dashboard: LayoutDashboard,
  adminDashboard: ShieldCheck,
  users: Users,
  cooperatives: Building2,
  farms: Warehouse,
  batches: Worm,
  harvests: ShoppingBasket,
  overview: Gauge,
  detections: Microscope,
  devices: Cpu,
  messages: Mail,
  audit: ScrollText,
  systemReport: ChartNoAxesColumn,
  alerts: Bell,
  profile: UserRound,
  logout: LogOut,
  menu: PanelLeft,
  search: Search,
  add: Plus,
  download: Download,
  print: Printer,
  remove: Trash2,
  edit: Pencil,
  view: Eye,
  hide: EyeOff,
  check: Check,
  close: X,
  warning: TriangleAlert,
  info: Info,
  success: CircleCheck,
  temperature: Thermometer,
  humidity: Droplets,
  next: ChevronRight,
  down: ChevronDown,
  back: ArrowLeft,
  forward: ArrowRight,
  open: ArrowUpRight,
  refresh: RefreshCw,
  calendar: Calendar,
  settings: Settings,
  activity: Activity,
  inbox: Inbox,
  leaf: Leaf,
  lock: Lock,
  location: MapPin,
  block: Ban,
  activate: UserCheck,
  deactivate: UserX,
  key: KeyRound,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, className, strokeWidth = 1.6 }: IconProps) {
  const Component = ICONS[name];
  return <Component size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" focusable="false" />;
}
