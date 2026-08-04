import { useEffect, useState } from "react";
import supabase from "../../lib/supabase";
import { useBranch } from "../../context/BranchContext";
import { useCurrency } from "../../context/CurrencyContext";
import PageHeader from "../../components/admin/PageHeader";
import Modal from "../../components/admin/Modal";
import EmptyState from "../../components/admin/EmptyState";
import ImageUploader from "../../components/admin/ImageUploader";
import { deleteUploadedImage } from "../../lib/storage";
import { logActivity } from "../../lib/activity";

const emptyItem = {
  name: "",
  description: "",
  price: "",
  category_id: "",
  photo_url: "",
  is_available: true,
  requires_kitchen: true,
  is_featured: false,
  sort_order: 0,
};
const emptyCat = { name: "", sort_order: 0 };
let variantTempId = 0;
const nextVariantTempId = () => `temp-${++variantTempId}`;

export default function Menu() {
  const { activeBranch, activeBranchId } = useBranch();
  const { formatMoney } = useCurrency();

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [variantCounts, setVariantCounts] = useState({});
  const [branchMenu, setBranchMenu] = useState({});
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [itemModal, setItemModal] = useState(false);
  const [itemEditing, setItemEditing] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [assignedBranchIds, setAssignedBranchIds] = useState([]);
  const [variants, setVariants] = useState([]);
  const [removedVariantIds, setRemovedVariantIds] = useState([]);
  const [variantsLoading, setVariantsLoading] = useState(false);

  const [catModal, setCatModal] = useState(false);
  const [catEditing, setCatEditing] = useState(null);
  const [catForm, setCatForm] = useState(emptyCat);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    const [catRes, itemRes, bmiRes, branchRes, variantRes] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("menu_items").select("*").order("sort_order"),
      activeBranchId
        ? supabase
            .from("branch_menu_items")
            .select("*")
            .eq("branch_id", activeBranchId)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("branches").select("id, name").order("name"),
      supabase.from("menu_item_variants").select("menu_item_id"),
    ]);
    if (!catRes.error) setCategories(catRes.data || []);
    if (!itemRes.error) setItems(itemRes.data || []);
    if (!bmiRes.error) {
      const map = {};
      for (const row of bmiRes.data || [])
        map[row.menu_item_id] = { id: row.id, is_available: row.is_available };
      setBranchMenu(map);
    }
    if (!branchRes.error) setBranches(branchRes.data || []);
    if (!variantRes.error) {
      const counts = {};
      for (const row of variantRes.data || []) {
        counts[row.menu_item_id] = (counts[row.menu_item_id] || 0) + 1;
      }
      setVariantCounts(counts);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId]);

  if (!activeBranch) {
    return (
      <p className="text-stone-500">Select a branch to manage its menu.</p>
    );
  }

  const assignedItems = items.filter((i) => branchMenu[i.id]);
  const unassignedItems = items.filter((i) => !branchMenu[i.id]);

  const openCreateItem = (catId) => {
    setItemEditing(null);
    setItemForm({
      ...emptyItem,
      category_id: catId || (categories[0]?.id ?? ""),
    });
    setAssignedBranchIds(activeBranchId ? [activeBranchId] : []);
    setVariants([]);
    setRemovedVariantIds([]);
    setItemModal(true);
  };

  const openEditItem = async (item) => {
    setItemEditing(item);
    setItemForm({ ...item, price: String(item.price) });
    const assigned = branches
      .filter((b) => b.id === activeBranchId && branchMenu[item.id])
      .map((b) => b.id);
    setAssignedBranchIds(assigned);
    setRemovedVariantIds([]);
    setItemModal(true);

    setVariantsLoading(true);
    const { data, error } = await supabase
      .from("menu_item_variants")
      .select("*")
      .eq("menu_item_id", item.id)
      .order("sort_order");
    setVariantsLoading(false);
    if (!error) setVariants(data || []);
  };

  const openCreateCat = () => {
    setCatEditing(null);
    setCatForm({ ...emptyCat, sort_order: categories.length });
    setCatModal(true);
  };
  const openEditCat = (c) => {
    setCatEditing(c);
    setCatForm({ ...c });
    setCatModal(true);
  };

  const toggleAssignedBranch = (branchId) => {
    setAssignedBranchIds((prev) =>
      prev.includes(branchId)
        ? prev.filter((id) => id !== branchId)
        : [...prev, branchId],
    );
  };

  const addVariantRow = () => {
    setVariants((prev) => [
      ...prev,
      {
        _tempId: nextVariantTempId(),
        name: "",
        price_delta: "0",
        sort_order: prev.length,
      },
    ]);
  };

  const updateVariantField = (key, field, value) => {
    setVariants((prev) =>
      prev.map((v) => {
        const rowKey = v.id ?? v._tempId;
        if (rowKey !== key) return v;
        return { ...v, [field]: value };
      }),
    );
  };

  const removeVariantRow = (key) => {
    setVariants((prev) => {
      const target = prev.find((v) => (v.id ?? v._tempId) === key);
      if (target?.id) setRemovedVariantIds((ids) => [...ids, target.id]);
      return prev.filter((v) => (v.id ?? v._tempId) !== key);
    });
  };

  const submitItem = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      name: itemForm.name,
      description: itemForm.description,
      price: Number(itemForm.price),
      category_id: itemForm.category_id,
      photo_url: itemForm.photo_url,
      is_available: itemForm.is_available,
      requires_kitchen: itemForm.requires_kitchen,
      is_featured: itemForm.is_featured,
      sort_order: Number(itemForm.sort_order || 0),
      has_variants: variants.length > 0,
    };

    let itemId = itemEditing?.id;

    if (itemEditing) {
      const { error } = await supabase
        .from("menu_items")
        .update(payload)
        .eq("id", itemEditing.id);
      if (error) {
        setSaving(false);
        setError(error.message);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("menu_items")
        .insert([payload])
        .select()
        .single();
      if (error) {
        setSaving(false);
        setError(error.message);
        return;
      }
      itemId = data.id;
    }

    if (removedVariantIds.length > 0) {
      const { error: delErr } = await supabase
        .from("menu_item_variants")
        .delete()
        .in("id", removedVariantIds);
      if (delErr) {
        setSaving(false);
        setError(delErr.message);
        return;
      }
    }
    const toUpdate = variants.filter((v) => v.id);
    const toInsert = variants.filter((v) => !v.id);

    for (const v of toUpdate) {
      const { error: updErr } = await supabase
        .from("menu_item_variants")
        .update({
          name: v.name,
          price_delta: Number(v.price_delta || 0),
          sort_order: Number(v.sort_order || 0),
        })
        .eq("id", v.id);
      if (updErr) {
        setSaving(false);
        setError(updErr.message);
        return;
      }
    }
    if (toInsert.length > 0) {
      const { error: insErr } = await supabase
        .from("menu_item_variants")
        .insert(
          toInsert.map((v, idx) => ({
            menu_item_id: itemId,
            name: v.name,
            price_delta: Number(v.price_delta || 0),
            sort_order: Number(v.sort_order ?? idx),
          })),
        );
      if (insErr) {
        setSaving(false);
        setError(insErr.message);
        return;
      }
    }

    const wantsCurrentBranch = assignedBranchIds.includes(activeBranchId);
    const alreadyAssigned = !!branchMenu[itemId];

    if (wantsCurrentBranch && !alreadyAssigned) {
      await supabase
        .from("branch_menu_items")
        .insert([
          {
            branch_id: activeBranchId,
            menu_item_id: itemId,
            is_available: true,
          },
        ]);
    } else if (!wantsCurrentBranch && alreadyAssigned) {
      await supabase
        .from("branch_menu_items")
        .delete()
        .eq("branch_id", activeBranchId)
        .eq("menu_item_id", itemId);
    }

    setSaving(false);
    setItemModal(false);
    logActivity({
      module: "menu",
      action: itemEditing ? "update" : "create",
      description: `${itemEditing ? "Updated" : "Created"} menu item "${payload.name}"`,
      branchId: activeBranchId,
    });
    loadAll();
  };

  const submitCat = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: catForm.name,
      sort_order: Number(catForm.sort_order || 0),
    };
    const { error } = catEditing
      ? await supabase
          .from("categories")
          .update(payload)
          .eq("id", catEditing.id)
      : await supabase.from("categories").insert([payload]);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCatModal(false);
    const res = await supabase
      .from("categories")
      .select("*")
      .order("sort_order");
    if (!res.error) setCategories(res.data || []);
  };

  const toggleAvailability = async (item) => {
    const entry = branchMenu[item.id];
    if (!entry) return;
    const next = !entry.is_available;
    await supabase
      .from("branch_menu_items")
      .update({ is_available: next })
      .eq("id", entry.id);
    setBranchMenu({
      ...branchMenu,
      [item.id]: { ...entry, is_available: next },
    });
  };

  const toggleFeatured = async (item) => {
    await supabase
      .from("menu_items")
      .update({ is_featured: !item.is_featured })
      .eq("id", item.id);
    setItems(
      items.map((i) =>
        i.id === item.id ? { ...i, is_featured: !item.is_featured } : i,
      ),
    );
    logActivity({
      module: "menu",
      action: "update",
      description: `${item.is_featured ? "Unfeatured" : "Featured"} menu item "${item.name}"`,
      branchId: activeBranchId,
    });
  };

  const assignToBranch = async (item) => {
    const { data, error } = await supabase
      .from("branch_menu_items")
      .insert([
        {
          branch_id: activeBranchId,
          menu_item_id: item.id,
          is_available: true,
        },
      ])
      .select()
      .single();
    if (!error)
      setBranchMenu({
        ...branchMenu,
        [item.id]: { id: data.id, is_available: true },
      });
  };

  const removeFromBranch = async (item) => {
    const entry = branchMenu[item.id];
    if (!entry) return;
    if (
      !window.confirm(
        `Remove "${item.name}" from ${activeBranch.name}? It will stay available at other branches.`,
      )
    )
      return;
    await supabase.from("branch_menu_items").delete().eq("id", entry.id);
    const next = { ...branchMenu };
    delete next[item.id];
    setBranchMenu(next);
  };

  const deleteItemEverywhere = async (item) => {
    if (
      !window.confirm(
        `Permanently delete "${item.name}" from the entire menu (all branches, including its variants)? This cannot be undone.`,
      )
    )
      return;
    await supabase.from("menu_items").delete().eq("id", item.id);
    if (item.photo_url) deleteUploadedImage("product-images", item.photo_url);
    setItems(items.filter((i) => i.id !== item.id));
    const next = { ...branchMenu };
    delete next[item.id];
    setBranchMenu(next);
  };

  const deleteCat = async (c) => {
    const count = items.filter((i) => i.category_id === c.id).length;
    if (
      count > 0 &&
      !window.confirm(
        `Category "${c.name}" still has ${count} item(s). Deleting it will unlink them. Continue?`,
      )
    )
      return;
    await supabase.from("categories").delete().eq("id", c.id);
    setCategories(categories.filter((x) => x.id !== c.id));
  };

  return (
    <div>
      <PageHeader
        title="Menu Management"
        subtitle={
          activeBranch ? `Menu for ${activeBranch.name}` : "Select a branch"
        }
        actions={
          <>
            <button
              onClick={openCreateCat}
              className="px-3 sm:px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50 whitespace-nowrap"
            >
              + Category
            </button>
            <button
              onClick={() => openCreateItem(null)}
              className="px-3 sm:px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 whitespace-nowrap"
            >
              + Menu item
            </button>
          </>
        }
      />

      {loading ? (
        <p className="text-stone-500">Loading menu…</p>
      ) : categories.length === 0 ? (
        <EmptyState
          message="No categories yet."
          hint="Create a category, then add menu items to it."
        >
          <div className="mt-4">
            <button
              onClick={openCreateCat}
              className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm"
            >
              + New category
            </button>
          </div>
        </EmptyState>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {categories.map((cat) => {
            const catItems = assignedItems.filter(
              (i) => i.category_id === cat.id,
            );
            return (
              <div
                key={cat.id}
                className="bg-white rounded-xl border border-stone-200 overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-5 py-3 bg-stone-50 border-b border-stone-200">
                  <h2 className="font-semibold text-stone-900">{cat.name}</h2>
                  <div className="flex items-center gap-3 text-sm">
                    <button
                      onClick={() => openCreateItem(cat.id)}
                      className="font-medium text-brand-600 hover:text-brand-700"
                    >
                      + Add item
                    </button>
                    <button
                      onClick={() => openEditCat(cat)}
                      className="font-medium text-stone-500 hover:text-stone-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteCat(cat)}
                      className="font-medium text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {catItems.length === 0 ? (
                  <p className="px-4 sm:px-5 py-4 text-sm text-stone-400 italic">
                    No items assigned to this branch yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                      <thead>
                        <tr className="text-left text-stone-500 border-b border-stone-100">
                          <th className="px-4 sm:px-5 py-2 font-medium">
                            Item
                          </th>
                          <th className="px-4 sm:px-5 py-2 font-medium">
                            Price
                          </th>
                          <th className="px-4 sm:px-5 py-2 font-medium">
                            Kitchen
                          </th>
                          <th className="px-4 sm:px-5 py-2 font-medium">
                            At this branch
                          </th>
                          <th className="px-4 sm:px-5 py-2 font-medium">
                            Featured
                          </th>
                          <th className="px-4 sm:px-5 py-2 font-medium text-right">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {catItems.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-stone-50 hover:bg-stone-50/50"
                          >
                            <td className="px-4 sm:px-5 py-3">
                              <div className="flex items-center gap-3">
                                {item.photo_url ? (
                                  <img
                                    src={item.photo_url}
                                    alt={item.name}
                                    className="w-10 h-10 rounded-lg object-cover shrink-0"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-stone-100 shrink-0" />
                                )}
                                <div>
                                  <div className="font-medium text-stone-800 flex items-center gap-1.5 whitespace-nowrap">
                                    {item.name}
                                    {variantCounts[item.id] > 0 && (
                                      <span className="text-[10px] font-medium bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5">
                                        {variantCounts[item.id]} option
                                        {variantCounts[item.id] === 1
                                          ? ""
                                          : "s"}
                                      </span>
                                    )}
                                  </div>
                                  {item.description && (
                                    <div className="text-xs text-stone-500 max-w-[220px] sm:max-w-md truncate">
                                      {item.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 sm:px-5 py-3 text-stone-700 whitespace-nowrap">
                              {formatMoney(item.price)}
                            </td>
                            <td className="px-4 sm:px-5 py-3">
                              <span
                                className={`text-xs font-medium rounded-full px-2.5 py-0.5 whitespace-nowrap ${item.requires_kitchen !== false ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                              >
                                {item.requires_kitchen !== false
                                  ? "Kitchen"
                                  : "Ready"}
                              </span>
                            </td>
                            <td className="px-4 sm:px-5 py-3">
                              <button
                                onClick={() => toggleAvailability(item)}
                                className={`text-xs font-medium rounded-full px-2.5 py-0.5 whitespace-nowrap ${branchMenu[item.id]?.is_available ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                              >
                                {branchMenu[item.id]?.is_available
                                  ? "Available"
                                  : "Sold out"}
                              </button>
                            </td>
                            <td className="px-4 sm:px-5 py-3">
                              <button
                                onClick={() => toggleFeatured(item)}
                                className={`text-xs font-medium rounded-full px-2.5 py-0.5 whitespace-nowrap ${item.is_featured ? "bg-purple-100 text-purple-700" : "bg-stone-100 text-stone-500"}`}
                              >
                                {item.is_featured ? "Featured" : "Show"}
                              </button>
                            </td>
                            <td className="px-4 sm:px-5 py-3 text-right whitespace-nowrap space-x-3">
                              <button
                                onClick={() => openEditItem(item)}
                                className="text-brand-600 hover:text-brand-700"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => removeFromBranch(item)}
                                className="text-stone-500 hover:text-stone-700"
                              >
                                Remove here
                              </button>
                              <button
                                onClick={() => deleteItemEverywhere(item)}
                                className="text-red-500 hover:text-red-700"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {unassignedItems.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-4 sm:px-5 py-3 bg-stone-50 border-b border-stone-200">
                <h2 className="font-semibold text-stone-900">
                  Not yet on this branch's menu
                </h2>
                <p className="text-xs text-stone-500">
                  Items that exist on the global menu but aren't assigned to{" "}
                  {activeBranch.name} yet.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <tbody>
                    {unassignedItems.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-stone-50 hover:bg-stone-50/50"
                      >
                        <td className="px-4 sm:px-5 py-3">
                          <div className="font-medium text-stone-800 whitespace-nowrap">
                            {item.name}
                          </div>
                          <div className="text-xs text-stone-500">
                            {
                              categories.find((c) => c.id === item.category_id)
                                ?.name
                            }
                          </div>
                        </td>
                        <td className="px-4 sm:px-5 py-3 text-stone-700 whitespace-nowrap">
                          {formatMoney(item.price)}
                        </td>
                        <td className="px-4 sm:px-5 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => assignToBranch(item)}
                            className="text-sm font-medium text-brand-600 hover:text-brand-700"
                          >
                            + Add to this branch
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Item modal */}
      <Modal
        open={itemModal}
        onClose={() => setItemModal(false)}
        title={itemEditing ? "Edit menu item" : "New menu item"}
      >
        <form onSubmit={submitItem} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Name *
              </label>
              <input
                value={itemForm.name}
                onChange={(e) =>
                  setItemForm({ ...itemForm, name: e.target.value })
                }
                required
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Base price *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={itemForm.price}
                onChange={(e) =>
                  setItemForm({ ...itemForm, price: e.target.value })
                }
                required
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Category
            </label>
            <select
              value={itemForm.category_id}
              onChange={(e) =>
                setItemForm({ ...itemForm, category_id: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Description
            </label>
            <textarea
              value={itemForm.description}
              onChange={(e) =>
                setItemForm({ ...itemForm, description: e.target.value })
              }
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <ImageUploader
              label="Photo"
              value={itemForm.photo_url}
              onChange={(url) => setItemForm({ ...itemForm, photo_url: url })}
              bucket="product-images"
              folder="menu"
            />
          </div>

          {/* Variants (menu_item_variants) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-stone-700">
                Variants / options
              </label>
              <button
                type="button"
                onClick={addVariantRow}
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                + Add variant
              </button>
            </div>
            <p className="text-xs text-stone-400 mb-2">
              Optional. E.g. Small / Medium / Large, with a price adjustment
              relative to the base price above (use a negative number for a
              discount).
            </p>
            {variantsLoading ? (
              <p className="text-sm text-stone-400">Loading variants…</p>
            ) : variants.length === 0 ? (
              <p className="text-sm text-stone-400 italic">
                No variants — this item is sold as-is.
              </p>
            ) : (
              <div className="space-y-2">
                {variants.map((v) => {
                  const key = v.id ?? v._tempId;
                  return (
                    <div
                      key={key}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input
                        value={v.name}
                        onChange={(e) =>
                          updateVariantField(key, "name", e.target.value)
                        }
                        placeholder="e.g. Large"
                        required
                        className="flex-1 min-w-[120px] px-3 py-1.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-sm text-stone-400">+/-</span>
                        <input
                          type="number"
                          step="0.01"
                          value={v.price_delta}
                          onChange={(e) =>
                            updateVariantField(
                              key,
                              "price_delta",
                              e.target.value,
                            )
                          }
                          className="w-20 sm:w-24 px-2 py-1.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeVariantRow(key)}
                        className="shrink-0 text-red-500 hover:text-red-700 text-sm px-2"
                        aria-label="Remove variant"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Available at branches
            </label>
            <div className="flex flex-wrap gap-2">
              {branches.map((b) => (
                <label
                  key={b.id}
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border cursor-pointer ${assignedBranchIds.includes(b.id) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-stone-300 text-stone-600"}`}
                >
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={assignedBranchIds.includes(b.id)}
                    onChange={() => toggleAssignedBranch(b.id)}
                  />
                  {b.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-stone-400 mt-1">
              This page only manages the assignment for {activeBranch.name}. To
              add or remove this item at other branches, visit their Menu page.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={itemForm.is_available}
              onChange={(e) =>
                setItemForm({ ...itemForm, is_available: e.target.checked })
              }
              className="rounded"
            />
            Active (globally listed — uncheck to discontinue everywhere)
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={itemForm.requires_kitchen !== false}
              onChange={(e) =>
                setItemForm({ ...itemForm, requires_kitchen: e.target.checked })
              }
              className="rounded"
            />
            Requires kitchen (sent to kitchen queue)
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={!!itemForm.is_featured}
              onChange={(e) =>
                setItemForm({ ...itemForm, is_featured: e.target.checked })
              }
              className="rounded"
            />
            Featured on the public website
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setItemModal(false)}
              className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Category modal */}
      <Modal
        open={catModal}
        onClose={() => setCatModal(false)}
        title={catEditing ? "Edit category" : "New category"}
      >
        <form onSubmit={submitCat} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Name *
            </label>
            <input
              value={catForm.name}
              onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
              required
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Sort order
            </label>
            <input
              type="number"
              value={catForm.sort_order}
              onChange={(e) =>
                setCatForm({ ...catForm, sort_order: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCatModal(false)}
              className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
