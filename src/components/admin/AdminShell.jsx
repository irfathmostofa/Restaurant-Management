import { NavLink, useNavigate, Outlet } from "react-router-dom";
import { useEffect, useState, Suspense } from "react";
import { useAuth } from "../../context/AuthContext";
import { useBranch } from "../../context/BranchContext";
import {
  NAV_BY_ROLE,
  ROLE_LABELS,
  DEFAULT_ROUTE_BY_ROLE,
} from "../../lib/roles";
import { fetchDefaultRoute } from "../../lib/config";
import { logActivity } from "../../lib/activity";
import Icon from "../Icon";
import supabase from "../../lib/supabase";

function SidebarContent({ staff, nav, activeBranch, navigate, onNavigate }) {
  const handleLogout = async () => {
    // Log the audit event BEFORE signing out (auth.uid() is still set).
    logActivity({
      module: "auth",
      action: "logout",
      description: `${staff?.name || "User"} signed out.`,
      branchId: activeBranch?.id,
    });
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-stone-800">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-600 text-white font-bold">
            R
          </span>
          <div>
            <div className="font-semibold text-white text-sm leading-tight">
              RestaurantHub
            </div>
            <div className="text-xs text-stone-500">Staff Portal</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-600 text-white"
                  : "text-stone-400 hover:bg-stone-800 hover:text-white"
              }`
            }
          >
            <Icon name={item.icon} className="w-4 h-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-stone-800 space-y-3">
        <div className="text-sm">
          <div className="font-medium text-white">{staff.name}</div>
          <div className="text-xs text-stone-500">
            {ROLE_LABELS[staff.role] || staff.role}
          </div>
          {activeBranch && (
            <div className="text-xs text-brand-400 mt-1 truncate">
              {activeBranch.name}
            </div>
          )}
        </div>
        <button
          onClick={() => {
            onNavigate();
            navigate("/admin/profile");
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors"
        >
          <Icon name="user" className="w-4 h-4" />
          My profile
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors"
        >
          <Icon name="log-out" className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function AdminShell() {
  const { staff, session } = useAuth();
  const {
    activeBranch,
    activeBranchId,
    setActiveBranchId,
    canSwitchBranches,
    branches,
  } = useBranch();
  const navigate = useNavigate();
  const [homeRoute, setHomeRoute] = useState(
    DEFAULT_ROUTE_BY_ROLE[staff?.role] || "/admin/dashboard",
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  function HeaderClock() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
      const t = setInterval(() => setNow(new Date()), 1000);
      return () => clearInterval(t);
    }, []);
    return (
      <div className="text-sm text-stone-500 tabular-nums">
        {now.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}
        {" · "}
        {now.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </div>
    );
  }
  useEffect(() => {
    if (!staff?.role) return;
    let active = true;
    fetchDefaultRoute(staff.role).then((r) => {
      if (active) setHomeRoute(r);
    });
    return () => {
      active = false;
    };
  }, [staff?.role]);

  if (!staff || !session) return null;

  const nav = NAV_BY_ROLE[staff.role] || [];

  const homeLabel = homeRoute.includes("order-taking")
    ? "Order Screen"
    : homeRoute.includes("billing")
      ? "POS / Billing"
      : homeRoute.includes("orders")
        ? "Kitchen Display"
        : "Dashboard";

  const closeDrawer = () => setMobileOpen(false);

  return (
    <div className="min-h-screen bg-stone-100 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-stone-900 text-stone-300 flex-col fixed inset-y-0 left-0 z-30">
        <SidebarContent
          staff={staff}
          nav={nav}
          activeBranch={activeBranch}
          navigate={navigate}
          onNavigate={() => {}}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={closeDrawer} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-stone-900 text-stone-300 shadow-2xl overflow-hidden">
            <button
              onClick={closeDrawer}
              aria-label="Close menu"
              className="absolute top-4 right-4 p-2 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800"
            >
              <Icon name="x" className="w-5 h-5" />
            </button>
            <SidebarContent
              staff={staff}
              nav={nav}
              activeBranch={activeBranch}
              navigate={navigate}
              onNavigate={closeDrawer}
            />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white border-b border-stone-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-2 -ml-2 rounded-lg text-stone-600 hover:bg-stone-100"
            >
              <Icon name="menu" className="w-5 h-5" />
            </button>
            {<HeaderClock />}
          </div>
          <div className="flex items-center gap-3 min-w-0">
            {canSwitchBranches ? (
              <select
                value={activeBranchId ?? ""}
                onChange={(e) => setActiveBranchId(e.target.value)}
                aria-label="Branch"
                className="px-3 py-2 rounded-lg border border-stone-300 bg-white text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-500 max-w-[45vw] sm:max-w-none"
              >
                {!activeBranchId && <option value="">Select branch</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : activeBranch ? (
              <span className="text-sm font-medium text-stone-600 truncate">
                Branch: {activeBranch.name}
              </span>
            ) : null}
            <NavLink
              to="/admin/profile"
              className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-100 text-brand-700 font-bold text-sm shrink-0 hover:bg-brand-200 transition-colors"
              title={staff.name}
            >
              {staff.profile_image_url ? (
                <img
                  src={staff.profile_image_url}
                  alt={staff.name}
                  className="w-9 h-9 rounded-full object-cover"
                />
              ) : (
                <span>{staff.name?.charAt(0)?.toUpperCase() || "U"}</span>
              )}
            </NavLink>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 min-w-0">
          <Suspense fallback={<div className="text-stone-500">Loading…</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
