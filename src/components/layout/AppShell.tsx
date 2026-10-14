import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  CalendarRange,
  ClipboardList,
  Database,
  FileClock,
  Globe,
  LayoutDashboard,
  Menu,
  Moon,
  Sun,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";
import { AddMatchButton } from "../../components/matches/AddMatchButton";
import { Select } from "../ui/Field";
import { useTheme } from "../../lib/theme";
import { useSession } from "../../services/session-context";

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/matches", label: "对局", icon: ClipboardList },
  { to: "/statistics", label: "统计", icon: BarChart3 },
  { to: "/data-center", label: "资料中心", icon: Globe },
  { to: "/goals", label: "训练目标", icon: Target },
  { to: "/weekly", label: "周复盘", icon: CalendarRange },
  { to: "/drafts", label: "草稿箱", icon: FileClock },
  { to: "/data", label: "数据", icon: Database },
];

/**
 * Global session switcher: one control in the shell, shared by every page.
 * The selected value is the persisted active training session.
 */
function SessionSwitcher({ compact = false }: { compact?: boolean }) {
  const { sessions, activeSessionId, setActiveSession } = useSession();
  return (
    <label
      className={`flex min-w-0 items-center gap-2 text-[11px] text-ink-600 ${compact ? "w-40 shrink" : "w-full"}`}
    >
      <span className="shrink-0 uppercase tracking-wide">当前训练</span>
      <Select
        aria-label="当前训练"
        value={activeSessionId}
        onChange={(e) => void setActiveSession(e.target.value)}
        className={`min-w-0 flex-1 py-1.5 text-xs ${compact ? "max-w-[124px]" : "max-w-52"}`}
      >
        {(sessions.length > 0 ? sessions : [{ id: "daily", name: "日常训练" }]).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
    </label>
  );
}

/**
 * Light/dark switch. Shows the mode you would switch TO (moon in light mode),
 * and names that target mode for assistive tech rather than the current one.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const nextLabel = theme === "light" ? "切换到夜晚模式" : "切换到白天模式";
  return (
    <button
      type="button"
      onClick={toggle}
      title={nextLabel}
      aria-label={nextLabel}
      aria-pressed={theme === "dark"}
      className="rounded-lg border border-line p-2 text-ink-400 hover:bg-base-800 hover:text-ink-200"
    >
      {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[236px_1fr]">
      <aside className="hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:border-line lg:bg-base-900/70 lg:backdrop-blur">
        <div className="flex h-full flex-col gap-6 px-4 py-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-2">
            <Brand />
            <ThemeToggle />
          </div>
          <SessionSwitcher />
        </div>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <NavItem key={item.to} {...item} onNavigate={() => undefined} />
            ))}
          </nav>
          <div className="mt-auto">
            <AddMatchButton />
            <p className="mt-4 text-[11px] leading-relaxed text-ink-600">
              数据全部保存在本机浏览器
            </p>
          </div>
        </div>
      </aside>

      <div className="lg:hidden sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-base-900/90 px-4 py-3 backdrop-blur">
        <button
          type="button"
          aria-label="打开菜单"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-line p-2 text-ink-200 hover:bg-base-800"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
        <Brand />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <AddMatchButton compact />
        </div>
        <div className="w-full lg:hidden">
          <SessionSwitcher compact />
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-b border-line bg-base-900/95 px-4 pb-4">
          <nav className="grid grid-cols-2 gap-2">
            {NAV.map((item) => (
              <NavItem key={item.to} {...item} onNavigate={() => setOpen(false)} stacked />
            ))}
          </nav>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}

function Brand() {
  const { dark } = useTheme();
  return (
    <div className="flex items-center gap-2">
      <img
        src={`${import.meta.env.BASE_URL}${dark ? "logo-dark.png" : "logo.png"}`}
        alt=""
        aria-hidden="true"
        width={32}
        height={32}
        className="size-8 shrink-0"
      />
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-wide text-ink-50">TFT 弈记</div>
        <div className="text-[10px] tracking-[0.16em] text-ink-600">TFT 对局记录与复盘</div>
      </div>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  onNavigate,
  stacked,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  onNavigate: () => void;
  stacked?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors",
          stacked && "gap-2 px-3 py-2",
          isActive
            ? "border-gold-500/35 bg-gold-500/10 text-gold-300"
            : "border-transparent text-ink-400 hover:bg-base-800 hover:text-ink-200",
        ]
          .filter(Boolean)
          .join(" ")
      }
    >
      <Icon size={16} className="shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
