// Helpers for deriving order-level kitchen state from order_items.

export const KITCHEN_STATUS = {
  PENDING: 'pending',
  PREPARING: 'preparing',
  READY: 'ready'
}

export const KITCHEN_STATUS_LABELS = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready: 'Ready'
}

// Kitchen-required items of an order (non-kitchen items are filtered out).
export const kitchenItemsOf = (items) => (items || []).filter((it) => it.requires_kitchen)

// True when an order has at least one kitchen-required item.
export const hasKitchenItems = (items) => kitchenItemsOf(items).length > 0

// Aggregate kitchen status of an order derived from its kitchen items.
//   ready    -> every kitchen item is ready
//   preparing-> at least one item is preparing
//   pending  -> otherwise
//   null     -> order has no kitchen items
export const orderKitchenStatus = (items) => {
  const kitchen = kitchenItemsOf(items)
  if (kitchen.length === 0) return null
  if (kitchen.every((it) => it.kitchen_status === KITCHEN_STATUS.READY)) return KITCHEN_STATUS.READY
  if (kitchen.some((it) => it.kitchen_status === KITCHEN_STATUS.PREPARING)) return KITCHEN_STATUS.PREPARING
  return KITCHEN_STATUS.PENDING
}

// Estimated minutes remaining for the order: the slowest item that is not yet
// ready. Returns 0 when nothing is left in the kitchen.
export const orderKitchenEta = (items) => {
  const pending = kitchenItemsOf(items).filter((it) => it.kitchen_status !== KITCHEN_STATUS.READY)
  if (pending.length === 0) return 0
  return Math.max(...pending.map((it) => Number(it.estimated_prep_time) || 0))
}

// Items still being handled by the kitchen (not ready yet).
export const inProgressKitchenItems = (items) =>
  kitchenItemsOf(items).filter((it) => it.kitchen_status !== KITCHEN_STATUS.READY)
