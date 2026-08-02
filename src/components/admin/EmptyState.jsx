export default function EmptyState({ message, hint, children }) {
  return (
    <div className="text-center py-12 bg-white rounded-xl border border-dashed border-stone-300">
      <p className="text-stone-500">{message}</p>
      {hint && <p className="text-sm text-stone-400 mt-1">{hint}</p>}
      {children}
    </div>
  )
}
