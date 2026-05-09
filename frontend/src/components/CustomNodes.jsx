import { Handle, Position } from '@xyflow/react'

function BaseNode({ data, headerClass, bodyClass, icon }) {
  return (
    <div className={`rounded-xl overflow-hidden shadow-md border min-w-[150px] ${bodyClass}`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-2 !h-2" />
      <div className={`px-3 py-2 flex items-center gap-2 ${headerClass}`}>
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold text-white leading-tight">{data.label}</span>
      </div>
      {data.description && (
        <div className="px-3 py-1.5">
          <p className="text-xs text-right leading-tight">{data.description}</p>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-2 !h-2" />
    </div>
  )
}

export function RoleNode({ data }) {
  return <BaseNode data={data} headerClass="bg-violet-600" bodyClass="border-violet-200 bg-violet-50" icon="👤" />
}

export function EntityNode({ data }) {
  return <BaseNode data={data} headerClass="bg-blue-600" bodyClass="border-blue-200 bg-blue-50" icon="📋" />
}

export function ActionNode({ data }) {
  return <BaseNode data={data} headerClass="bg-emerald-600" bodyClass="border-emerald-200 bg-emerald-50" icon="⚡" />
}

export function ConstraintNode({ data }) {
  return <BaseNode data={data} headerClass="bg-amber-600" bodyClass="border-amber-200 bg-amber-50" icon="🔒" />
}
