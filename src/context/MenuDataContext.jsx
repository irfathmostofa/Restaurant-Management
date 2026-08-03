import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import supabase from "../lib/supabase";

// Per-branch menu + category data for the public site.
const MenuDataContext = createContext(null);

export function MenuDataProvider({ children }) {
  const [branchId, setBranchId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    setError(null);

    // categories/menu_items are GLOBAL (shared across branches). What's
    // actually on THIS branch's menu — and whether it's currently
    // available — comes from branch_menu_items, so join through it.
    const [catRes, bmiRes] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase
        .from("branch_menu_items")
        .select("is_available, menu_item_id, menu_items(*)")
        .eq("branch_id", id),
    ]);

    if (catRes.error) setError(catRes.error.message);
    if (bmiRes.error) setError(bmiRes.error.message);

    let mergedItems = [];
    if (!bmiRes.error) {
      mergedItems = (bmiRes.data || [])
        .filter((row) => row.menu_items) // guard against a dangling row if an item was deleted
        .map((row) => ({
          ...row.menu_items,
          // Collapse both flags into the single is_available the UI already
          // reads: "sold out" if EITHER globally discontinued OR disabled
          // at this branch. Component code needs no changes.
          is_available: row.menu_items.is_available && row.is_available,
        }))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setItems(mergedItems);
    }

    if (!catRes.error) {
      // Only show categories that actually have something assigned to this
      // branch — otherwise every category in the whole system would show
      // up on every branch's public page, even empty ones.
      const activeCategoryIds = new Set(mergedItems.map((i) => i.category_id));
      setCategories(
        (catRes.data || []).filter((c) => activeCategoryIds.has(c.id)),
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (branchId) load(branchId);
  }, [branchId, load]);

  return (
    <MenuDataContext.Provider
      value={{ branchId, setBranchId, categories, items, loading, error }}
    >
      {children}
    </MenuDataContext.Provider>
  );
}

export const useMenuData = () => useContext(MenuDataContext);
