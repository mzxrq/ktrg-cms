import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Bell,
  BookOpen,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  Clock,
  ExternalLink,
  FileText,
  Flag,
  Globe,
  Image,
  Info,
  Link,
  List,
  Map,
  MapPin,
  Maximize,
  Menu,
  MessageSquare,
  Moon,
  Mountain,
  MountainSnow,
  MousePointer2,
  Newspaper,
  PanelLeft,
  Pencil,
  Plus,
  Redo2,
  Route,
  Scissors,
  Settings,
  Stamp,
  Store,
  Sun,
  Trash2,
  TriangleAlert,
  Undo2,
  User,
  X,
  type LucideIcon,
} from "lucide-react";

// The admin screens' icons come from lucide-react (2026-11-26, user: they look better there). Each keeps the name and the
// size (28 px, `size` to change it) of the drawn icon it replaces in components/icons.tsx, so a screen only changes its
// import. Decoration only, next to a word or with the button's own label, as before. The visitor screens keep the drawn set.
function lucide(Svg: LucideIcon, name: string) {
  const Icon = ({ size = 28 }: { size?: number } = {}) => <Svg size={size} strokeWidth={2.25} aria-hidden="true" focusable="false" />;
  Icon.displayName = name;
  return Icon;
}

export const AlertIcon = lucide(CircleAlert, "AlertIcon");
export const ArrowDownIcon = lucide(ArrowDown, "ArrowDownIcon");
export const ArrowUpIcon = lucide(ArrowUp, "ArrowUpIcon");
export const ArticleIcon = lucide(Newspaper, "ArticleIcon");
export const BellIcon = lucide(Bell, "BellIcon");
export const ChartIcon = lucide(ChartColumn, "ChartIcon");
export const CheckIcon = lucide(CircleCheck, "CheckIcon");
export const ChevronDownIcon = lucide(ChevronDown, "ChevronDownIcon");
export const ChevronIcon = lucide(ChevronRight, "ChevronIcon");
export const ChevronLeftIcon = lucide(ChevronLeft, "ChevronLeftIcon");
export const ChevronUpIcon = lucide(ChevronUp, "ChevronUpIcon");
export const ClockIcon = lucide(Clock, "ClockIcon");
export const CloseIcon = lucide(X, "CloseIcon");
export const ClosedIcon = lucide(Ban, "ClosedIcon");
export const CommentIcon = lucide(MessageSquare, "CommentIcon");
export const CursorIcon = lucide(MousePointer2, "CursorIcon");
export const DocumentIcon = lucide(FileText, "DocumentIcon");
export const ExternalIcon = lucide(ExternalLink, "ExternalIcon");
export const FitIcon = lucide(Maximize, "FitIcon");
export const FlagIcon = lucide(Flag, "FlagIcon");
export const GearIcon = lucide(Settings, "GearIcon");
export const GlobeIcon = lucide(Globe, "GlobeIcon");
export const GuideIcon = lucide(BookOpen, "GuideIcon");
export const ImageIcon = lucide(Image, "ImageIcon");
export const InfoIcon = lucide(Info, "InfoIcon");
export const LinkIcon = lucide(Link, "LinkIcon");
export const ListIcon = lucide(List, "ListIcon");
export const MapIcon = lucide(Map, "MapIcon");
export const MenuIcon = lucide(Menu, "MenuIcon");
export const MoonIcon = lucide(Moon, "MoonIcon");
export const MountainIcon = lucide(MountainSnow, "MountainIcon");
export const PanelIcon = lucide(PanelLeft, "PanelIcon");
export const PencilIcon = lucide(Pencil, "PencilIcon");
export const PinIcon = lucide(MapPin, "PinIcon");
export const PlusIcon = lucide(Plus, "PlusIcon");
export const RedoIcon = lucide(Redo2, "RedoIcon");
export const RouteIcon = lucide(Route, "RouteIcon");
export const ScissorsIcon = lucide(Scissors, "ScissorsIcon");
export const ShopIcon = lucide(Store, "ShopIcon");
export const SortIcon = lucide(ArrowUpDown, "SortIcon");
export const StampIcon = lucide(Stamp, "StampIcon");
export const SunIcon = lucide(Sun, "SunIcon");
export const TerrainIcon = lucide(Mountain, "TerrainIcon");
export const TickIcon = lucide(Check, "TickIcon");
export const TrashIcon = lucide(Trash2, "TrashIcon");
export const UndoIcon = lucide(Undo2, "UndoIcon");
export const UserIcon = lucide(User, "UserIcon");
export const WarningIcon = lucide(TriangleAlert, "WarningIcon");
export const XIcon = lucide(X, "XIcon");
// Our own drawing: lucide has no furigana (a reading over a word).
export { FuriganaIcon } from "@/components/icons";
