import { NavLink, useNavigate, Outlet } from "react-router-dom";
import { useEffect, useState, Suspense, useRef } from "react";
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

function SidebarContent({
  staff,
  nav,
  activeBranch,
  navigate,
  onNavigate,
  isCollapsed,
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header - fixed */}
      <div
        className={` py-5 border-b border-stone-800 flex-shrink-0 ${isCollapsed ? "px-3" : "px-5"}`}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-600 text-white font-bold shrink-0">
            R
          </span>
          {!isCollapsed && (
            <div>
              <div className="font-semibold text-white text-sm leading-tight">
                RestaurantHub
              </div>
              <div className="text-xs text-stone-500">Staff Portal</div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation - scrollable */}
      <nav
        className={`flex-1 overflow-y-auto ${isCollapsed ? "px-0" : "px-3"}  py-4 space-y-1 sidebar-nav-scroll min-h-0`}
      >
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? isCollapsed
                    ? "bg-brand-600 text-white w-10 h-10 justify-center mx-auto"
                    : "bg-brand-600 text-white px-3 py-2.5"
                  : isCollapsed
                    ? "text-stone-400 hover:bg-stone-800 hover:text-white w-10 h-10 justify-center mx-auto"
                    : "text-stone-400 hover:bg-stone-800 hover:text-white px-3 py-2.5"
              }`
            }
          >
            <Icon
              name={item.icon}
              className={`shrink-0 ${isCollapsed ? "w-5 h-5" : "w-5 h-5"}`}
            />
            {!isCollapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer - minimal, only shows branch if not collapsed */}
      {!isCollapsed && (
        <div className="px-5 py-3 border-t border-stone-800 flex-shrink-0">
          <div className="text-xs text-brand-400 truncate">
            Developed by{" "}
            <a
              href="https://irfathchowdhuryjoy.web.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Irfath Chowdhury Joy
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true, // force AM/PM regardless of the device's regional 24h setting
  });

  return (
    <div className="text-stone-500 tabular-nums leading-tight">
      <div className="flex flex-col sm:hidden text-[11px]">
        <span>{dateStr}</span>
        <span className="font-medium text-stone-600 uppercase">{timeStr}</span>
      </div>
      <div className="hidden sm:block text-sm whitespace-nowrap">
        {dateStr} · {timeStr}
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const closeDrawer = () => setMobileOpen(false);
  const toggleSidebar = () => setSidebarCollapsed(!sidebarCollapsed);
  const toggleUserMenu = () => setUserMenuOpen(!userMenuOpen);

  const handleLogout = async () => {
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
    <div className="min-h-screen bg-stone-100 flex">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex bg-stone-900 text-stone-300 flex-col fixed inset-y-0 left-0 z-30 transition-all duration-300 ${
          sidebarCollapsed ? "w-16" : "w-64"
        }`}
      >
        <SidebarContent
          staff={staff}
          nav={nav}
          activeBranch={activeBranch}
          navigate={navigate}
          onNavigate={() => {}}
          isCollapsed={sidebarCollapsed}
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
              isCollapsed={false}
            />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
        }`}
      >
        <header className="sticky top-0 z-20 bg-white border-b border-stone-200 px-3 sm:px-6 py-3 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-1 sm:gap-3 min-w-0">
            {/* Mobile: opens the drawer (this was missing — nothing else
               on small screens could ever set mobileOpen to true) */}
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="lg:hidden flex items-center justify-center w-9 h-9 -ml-1 rounded-lg text-stone-600 hover:bg-stone-100 shrink-0"
            >
              <Icon name="menu" className="w-5 h-5" />
            </button>

            {/* Desktop: collapse/expand the fixed sidebar */}
            <button
              onClick={toggleSidebar}
              aria-label={
                sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-stone-100 text-stone-600 hover:text-stone-800 transition-colors shrink-0"
            >
              <Icon name="menu" className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <HeaderClock />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {canSwitchBranches ? (
              <select
                value={activeBranchId ?? ""}
                onChange={(e) => setActiveBranchId(e.target.value)}
                aria-label="Branch"
                className="px-2.5 sm:px-3 py-2 rounded-lg border border-stone-300 bg-white text-xs sm:text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-500 max-w-[38vw] sm:max-w-none truncate"
              >
                {!activeBranchId && <option value="">Select branch</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : activeBranch ? (
              <span className="hidden sm:inline text-sm font-medium text-stone-600 truncate">
                Branch: {activeBranch.name}
              </span>
            ) : null}

            {/* User menu dropdown */}
            <div className="relative shrink-0" ref={menuRef}>
              <button
                onClick={toggleUserMenu}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-100 text-brand-700 font-bold text-sm shrink-0 hover:bg-brand-200 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
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
              </button>

              {/* Dropdown menu */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 max-w-[90vw] bg-white rounded-lg shadow-lg border border-stone-200 py-1 z-50">
                  <div className="px-4 py-3 border-b border-stone-100">
                    <div className="font-medium text-stone-800">
                      {staff.name}
                    </div>
                    <div className="text-xs text-stone-500">
                      {ROLE_LABELS[staff.role] || staff.role}
                    </div>
                    {activeBranch && (
                      <div className="text-xs text-brand-600 mt-1 truncate">
                        {activeBranch.name}
                      </div>
                    )}
                  </div>

                  <NavLink
                    to="/admin/profile"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                  >
                    <Icon name="user" className="w-4 h-4 text-stone-400" />
                    My Profile
                  </NavLink>

                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors w-full border-t border-stone-100"
                  >
                    <Icon name="log-out" className="w-4 h-4 text-red-400" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
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
