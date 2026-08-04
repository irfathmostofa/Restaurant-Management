import { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import supabase from "../../lib/supabase";
import { fetchDefaultRoute } from "../../lib/config";
import { logActivity } from "../../lib/activity";

const DEMO_ACCOUNTS = [
  { role: "Owner", email: "irfathmostofa1@gmail.com", password: "Irfath@98" },
  {
    role: "Kitchen",
    email: "irfathchowdhury400@gmail.com",
    password: "Irfath@98",
  },
  {
    role: "Waiter",
    email: "freelancerirfath@gmail.com",
    password: "Irfath@98",
  },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/admin/dashboard";

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }
    if (data.user) {
      // Resolve the landing page for the signed-in user's role. The default
      // fallback (`/admin/dashboard`) is only used when the user was deep
      // linked to a specific page; otherwise we honour the configurable
      // per-role route stored in role_default_routes.
      let dest = from;
      if (from === "/admin/dashboard") {
        const { data: staffRow } = await supabase
          .from("staff")
          .select("role, branch_id")
          .eq("user_id", data.user.id)
          .maybeSingle();
        dest = await fetchDefaultRoute(staffRow?.role);
        logActivity({
          module: "auth",
          action: "login",
          description: `Signed in as ${data.user.email}`,
          branchId: staffRow?.branch_id,
        });
      }
      setLoading(false);
      navigate(dest, { replace: true });
    }
  };

  // Fills the form with a demo account. Doesn't auto-submit — lets the
  // person see what got filled in before signing in, same as typing it.
  const useDemoAccount = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  };

  const copyToClipboard = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — silently ignore,
      // the "Use" button still fills the form either way.
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-900 via-stone-800 to-brand-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-600 text-white font-bold text-xl mb-3">
            R
          </span>
          <h1 className="text-2xl font-bold text-white">
            RestaurantHub Staff Portal
          </h1>
          <p className="text-stone-400 text-sm mt-1">
            Sign in to manage your branch
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-white rounded-2xl shadow-2xl p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="you@restaurant.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-xs text-stone-400 text-center">
            No account? Ask your owner to create a staff profile for you.
          </p>
        </form>

        <div className="mt-5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
            {/* <span className="text-amber-400 text-sm">⚠</span> */}
            <p className="text-xs font-semibold text-stone-300 uppercase tracking-wide">
              Demo credentials — testing only
            </p>
          </div>
          <ul className="divide-y divide-white/10">
            {DEMO_ACCOUNTS.map((account) => (
              <li
                key={account.role}
                className="px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-brand-300 bg-brand-500/15 rounded px-1.5 py-0.5">
                      {account.role}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-stone-300 truncate">
                    {account.email}
                  </p>
                  <p className="text-xs font-mono text-stone-500">
                    {account.password}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        `${account.email} / ${account.password}`,
                        account.role,
                      )
                    }
                    className="text-[11px] font-medium text-stone-400 hover:text-white px-2 py-1.5 rounded-md hover:bg-white/10 transition-colors"
                  >
                    {copiedKey === account.role ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => useDemoAccount(account)}
                    className="text-[11px] font-semibold text-white bg-brand-600 hover:bg-brand-700 px-2.5 py-1.5 rounded-md transition-colors"
                  >
                    Use
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="text-center mt-6">
          <Link
            to="/"
            className="text-sm text-stone-400 hover:text-white transition-colors"
          >
            ← Back to restaurant website
          </Link>
        </div>
      </div>
    </div>
  );
}
