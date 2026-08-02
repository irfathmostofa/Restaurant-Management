import { useEffect, useState } from "react";
import supabase from "../../lib/supabase";
import { useBranch } from "../../context/BranchContext";
import PageHeader from "../../components/admin/PageHeader";
import Modal from "../../components/admin/Modal";
import EmptyState from "../../components/admin/EmptyState";

const STATUS_STYLE = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
  completed: "bg-stone-200 text-stone-600",
  no_show: "bg-stone-100 text-stone-500",
};

export default function Reservations() {
  const { activeBranch, activeBranchId } = useBranch();
  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!activeBranchId) return;
    let active = true;
    setLoading(true);
    Promise.all([
      supabase
        .from("reservations")
        .select("*")
        .eq("branch_id", activeBranchId)
        .order("date")
        .order("time"),
      supabase
        .from("tables")
        .select("*")
        .eq("branch_id", activeBranchId)
        .order("number"),
    ]).then(([resRes, tableRes]) => {
      if (!active) return;
      if (!resRes.error) setReservations(resRes.data || []);
      if (!tableRes.error) setTables(tableRes.data || []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [activeBranchId, saving]);

  useEffect(() => {
    if (!activeBranchId) return;
    const channel = supabase
      .channel("reservations-realtime-" + activeBranchId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservations",
          filter: `branch_id=eq.${activeBranchId}`,
        },
        (payload) => {
          setReservations((prev) => {
            if (payload.eventType === "DELETE")
              return prev.filter((r) => r.id !== payload.old.id);
            if (payload.eventType === "INSERT") return [...prev, payload.new];
            return prev.map((r) => (r.id === payload.new.id ? payload.new : r));
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBranchId]);

  if (!activeBranch)
    return (
      <p className="text-stone-500">Select a branch to manage reservations.</p>
    );

  const tableName = (id) => tables.find((t) => t.id === id)?.number || "—";

  const openEdit = (r) => {
    setEditing(r);
    setForm({
      customer_name: r.customer_name,
      contact: r.contact || "",
      party_size: r.party_size,
      table_id: r.table_id || "",
      date: r.date,
      time: r.time,
      status: r.status,
    });
    setModalOpen(true);
  };

  const setStatus = async (r, status) => {
    await supabase.from("reservations").update({ status }).eq("id", r.id);
    setReservations(
      reservations.map((x) => (x.id === r.id ? { ...x, status } : x)),
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      branch_id: activeBranchId,
      party_size: Number(form.party_size),
      table_id: form.table_id || null,
    };
    const { error } = editing
      ? await supabase.from("reservations").update(payload).eq("id", editing.id)
      : null;
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setModalOpen(false);
  };

  const visible = dateFilter
    ? reservations.filter((r) => r.date === dateFilter)
    : reservations;

  return (
    <div>
      <PageHeader
        title="Reservations"
        subtitle={
          activeBranch
            ? `Reservations at ${activeBranch.name}`
            : "Select a branch"
        }
        actions={
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-stone-300 text-sm"
          />
        }
      />

      {loading ? (
        <p className="text-stone-500">Loading reservations…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          message="No reservations for this date."
          hint="Public reservations and new requests appear here live."
        />
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-200 bg-stone-50">
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Party</th>
                <th className="px-5 py-3 font-medium">Table</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-stone-50 hover:bg-stone-50/50"
                >
                  <td className="px-5 py-3">
                    <div className="font-medium text-stone-800">
                      {r.customer_name}
                    </div>
                    {r.contact && (
                      <div className="text-xs text-stone-500">{r.contact}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-stone-700">{r.party_size}</td>
                  <td className="px-5 py-3 text-stone-700">
                    {tableName(r.table_id)}
                  </td>
                  <td className="px-5 py-3 text-stone-700">{r.date}</td>
                  <td className="px-5 py-3 text-stone-700">{r.time}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-xs font-medium rounded-full px-2.5 py-0.5 capitalize ${STATUS_STYLE[r.status] || "bg-stone-100 text-stone-600"}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {r.status === "pending" && (
                      <>
                        <button
                          onClick={() => setStatus(r, "confirmed")}
                          className="text-emerald-600 hover:text-emerald-700 mr-3"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setStatus(r, "cancelled")}
                          className="text-red-500 hover:text-red-700 mr-3"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {r.status === "confirmed" && (
                      <>
                        <button
                          onClick={() => setStatus(r, "completed")}
                          className="text-brand-600 hover:text-brand-700 mr-3"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => setStatus(r, "no_show")}
                          className="text-stone-500 hover:text-stone-700 mr-3"
                        >
                          No-show
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => openEdit(r)}
                      className="text-brand-600 hover:text-brand-700"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Edit reservation"
      >
        {form && (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Customer
                </label>
                <input
                  value={form.customer_name}
                  onChange={(e) =>
                    setForm({ ...form, customer_name: e.target.value })
                  }
                  required
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Contact
                </label>
                <input
                  value={form.contact}
                  onChange={(e) =>
                    setForm({ ...form, contact: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Party size
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.party_size}
                  onChange={(e) =>
                    setForm({ ...form, party_size: e.target.value })
                  }
                  required
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Time
                </label>
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Table
              </label>
              <select
                value={form.table_id}
                onChange={(e) => setForm({ ...form, table_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white"
              >
                <option value="">Unassigned</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.number} (cap {t.capacity})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white"
              >
                {Object.keys(STATUS_STYLE).map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
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
        )}
      </Modal>
    </div>
  );
}
