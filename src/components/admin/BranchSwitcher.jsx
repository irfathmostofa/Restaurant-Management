import { useBranch } from '../../context/BranchContext'

export default function BranchSwitcher() {
  const { branches, activeBranchId, setActiveBranchId, canSwitchBranches } = useBranch()

  if (!canSwitchBranches) return null

  return (
    <div className="flex items-center gap-3 mb-4">
      <label className="text-sm font-medium text-stone-600">Branch</label>
      <select
        value={activeBranchId ?? ''}
        onChange={(e) => setActiveBranchId(e.target.value)}
        className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        {!activeBranchId && <option value="">Select branch</option>}
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </div>
  )
}
