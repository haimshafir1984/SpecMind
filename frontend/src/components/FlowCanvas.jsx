import { useEffect } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { RoleNode, EntityNode, ActionNode, ConstraintNode } from './CustomNodes'

const nodeTypes = {
  role:       RoleNode,
  entity:     EntityNode,
  action:     ActionNode,
  constraint: ConstraintNode,
}

const minimapNodeColor = (node) => {
  switch (node.type) {
    case 'role':       return '#7c3aed'
    case 'entity':     return '#2563eb'
    case 'action':     return '#059669'
    case 'constraint': return '#d97706'
    default:           return '#94a3b8'
  }
}

function FlowInner({ flowData }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const { fitView } = useReactFlow()

  useEffect(() => {
    if (!flowData) return
    setNodes(flowData.nodes || [])
    setEdges(flowData.edges || [])
    setTimeout(() => fitView({ padding: 0.2 }), 50)
  }, [flowData, setNodes, setEdges, fitView])

  if (!flowData?.nodes?.length) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-400">
          <div className="text-4xl mb-3">🗺️</div>
          <p className="text-sm font-medium">הזרימה הויזואלית תופיע כאן</p>
          <p className="text-xs mt-1">התחל שיחה כדי לבנות את המפה</p>
        </div>
      </div>
    )
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      className="bg-slate-50"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
      <Controls />
      <MiniMap nodeColor={minimapNodeColor} />
    </ReactFlow>
  )
}

export default function FlowCanvas({ flowData }) {
  return (
    <ReactFlowProvider>
      <div className="flex-1 h-full">
        <FlowInner flowData={flowData} />
      </div>
    </ReactFlowProvider>
  )
}
