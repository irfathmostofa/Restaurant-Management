import { createContext, useContext, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { canManageBranches } from "../lib/roles";
import supabase from "../lib/supabase";

const BranchContext = createContext(null);

export function BranchProvider() {
  const { staff } = useAuth();
  const [branches, setBranches] = useState([]);
  const [activeBranchId, setActiveBranchId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Branches visible to the current staff user (RLS enforces scope server-side).
  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from("branches")
      .select("*")
      .order("name")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Failed to load branches:", error.message);
        } else {
          setBranches(data || []);
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [staff?.id]);

  const isOwnerOrAdmin = canManageBranches(staff?.role);

  // Owners/admins manage all branches. Auto-select a branch when they have not
  // picked one yet (avoids a blank UI for single-branch owners) and re-validate
  // a previously stored selection so a stale id never leaks through.
  useEffect(() => {
    if (!isOwnerOrAdmin || loading) return;
    setActiveBranchId((current) => {
      if (current && branches.some((b) => b.id === current)) return current;
      const stored = localStorage.getItem("activeBranchId");
      if (stored && branches.some((b) => b.id === stored)) return stored;
      return branches[0]?.id ?? null;
    });
  }, [isOwnerOrAdmin, loading, branches]);

  useEffect(() => {
    if (isOwnerOrAdmin && activeBranchId) {
      localStorage.setItem("activeBranchId", activeBranchId);
    }
  }, [isOwnerOrAdmin, activeBranchId]);

  const effectiveBranchId = isOwnerOrAdmin ? activeBranchId : staff?.branch_id;
  const activeBranch = branches.find((b) => b.id === effectiveBranchId) ?? null;

  return (
    <BranchContext.Provider
      value={{
        branches,
        loading,
        activeBranch,
        activeBranchId: effectiveBranchId,
        setActiveBranchId,
        canSwitchBranches: isOwnerOrAdmin && branches.length > 1,
      }}
    >
      <Outlet />
    </BranchContext.Provider>
  );
}

export const useBranch = () => useContext(BranchContext);
