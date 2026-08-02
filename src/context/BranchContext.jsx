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
