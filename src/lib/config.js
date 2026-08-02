import supabase from './supabase'
import { DEFAULT_ROUTE_BY_ROLE } from './roles'

// Reads the configurable landing route for a role from the database.
// Falls back to the client-side defaults in roles.js when the DB value is
// missing (e.g. the schema has not been migrated yet).
export async function fetchDefaultRoute(role) {
  if (!role) return DEFAULT_ROUTE_BY_ROLE[role] || '/admin/dashboard'
  const { data } = await supabase.from('role_default_routes').select('route').eq('role', role).maybeSingle()
  return data?.route || DEFAULT_ROUTE_BY_ROLE[role] || '/admin/dashboard'
}

// Loads all role landing routes as a { role: route } map.
export async function fetchAllRoleRoutes() {
  const { data, error } = await supabase.from('role_default_routes').select('role, route')
  if (error || !data) return {}
  const map = {}
  data.forEach((r) => { map[r.role] = r.route })
  return map
}

// Reads the settings key/value store into a plain object.
export async function fetchSettings() {
  const { data, error } = await supabase.from('settings').select('key, value')
  if (error || !data) return {}
  const settings = {}
  data.forEach((s) => { settings[s.key] = s.value })
  return settings
}

// Snapshot of commonly-used settings with sensible defaults.
export const DEFAULT_SETTINGS = {
  restaurant_name: 'RestaurantHub',
  invoice_footer: 'Thank you for dining with us!',
  default_prep_time: '5',
  restaurant_logo: ''
}
