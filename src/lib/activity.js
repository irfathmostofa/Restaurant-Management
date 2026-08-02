// Centralized audit-log writer. Every important operation calls logActivity()
// which executes the SECURITY DEFINER log_activity RPC (so any role can record
// an audit trail without RLS permission to write the table directly). Failures
// are swallowed: logging must never block the business flow.

import supabase from './supabase'

export function logActivity({ module, action, description, branchId, metadata }) {
  return supabase
    .rpc('log_activity', {
      p_module: module,
      p_action: action,
      p_description: description || null,
      p_branch_id: branchId || null,
      p_metadata: metadata || null
    })
    .then(() => {})
    .catch(() => {})
}

// Best-effort: resolves the branch used for logging. Falls back to the active
// branch passed in, or null.
export const logAndReturn = (fn) => fn
