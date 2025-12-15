'use client';

import { memo, useState } from 'react';
import { Handle, Position, NodeProps, Node, Edge } from '@xyflow/react';
import { Eye, Code2, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import Image from 'next/image';
import { useProjectStore } from '@/store/use-project-store';
import { cn } from '@/lib/utils';

export type OutputNodeData = {
  label: string;
  imageUrl?: string;
  config?: Record<string, any>;
  generationTime?: string;
};

export const OutputGenerationNode = memo((props: NodeProps<Node<OutputNodeData>>) => {
  const { data, selected, id } = props;
  const [showConfig, setShowConfig] = useState(false);

  return (
    <div 
      className={cn(
        "bg-[#1E2128] rounded-lg border-2 transition-all min-w-[280px]",
        selected ? "border-green-500 shadow-green-500/50" : "border-white/10"
      )}
    >
      {/* Input Handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 !bg-cyan-500 !border-2 !border-white"
      />

      {/* Header */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-green-600/20 to-emerald-600/20">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-green-600 flex items-center justify-center">
            <Eye className="w-3 h-3 text-white" />
          </div>
          <span className="text-xs font-semibold text-white/90 uppercase tracking-wide">
            {data.label}
          </span>
        </div>
        {data.generationTime && (
          <span className="text-[9px] text-white/40">{data.generationTime}</span>
        )}
      </div>

      {/* Content Area */}
      <div className="p-3 space-y-3">
        {/* Image Display */}
        {data.imageUrl ? (
          <div className="relative aspect-[4/3] rounded-md overflow-hidden bg-[#0F1115] border border-white/5">
            <Image
              src={data.imageUrl}
              alt={data.label}
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="aspect-[4/3] rounded-md bg-[#0F1115] border border-white/5 border-dashed overflow-hidden relative">
            {/* Skeleton Animation */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-2 border-green-500/30 flex items-center justify-center mb-3 animate-pulse">
                <Eye className="w-8 h-8 text-green-500/40" />
              </div>
              <p className="text-xs text-white/40 font-medium mb-1">Results will appear here</p>
              <p className="text-[10px] text-white/20">Awaiting generation from input node</p>
            </div>
            
            {/* Animated shimmer effect */}
            <div 
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full"
              style={{
                animation: 'shimmer 2s infinite',
              }}
            />
          </div>
        )}

        {/* Config Section */}
        {data.config && Object.keys(data.config).length > 0 ? (
          <div className="space-y-2">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded bg-[#0F1115] border border-white/10 hover:border-white/20 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Code2 className="w-3 h-3 text-green-400" />
                <span className="text-xs text-white/70">Generation Config</span>
              </div>
              {showConfig ? (
                <ChevronUp className="w-3 h-3 text-white/40" />
              ) : (
                <ChevronDown className="w-3 h-3 text-white/40" />
              )}
            </button>

            {showConfig && (
              <div className="bg-[#0F1115] rounded border border-white/10 p-2 max-h-40 overflow-y-auto">
                <pre className="text-[9px] text-white/60 font-mono whitespace-pre-wrap">
                  {JSON.stringify(data.config, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : (
          // Config skeleton when no config yet
          <div className="space-y-2 opacity-50">
            <div className="w-full flex items-center justify-between px-2 py-1.5 rounded bg-[#0F1115] border border-white/10">
              <div className="flex items-center gap-1.5">
                <Code2 className="w-3 h-3 text-white/20" />
                <span className="text-xs text-white/30">Generation Config</span>
              </div>
              <ChevronDown className="w-3 h-3 text-white/20" />
            </div>
          </div>
        )}

        {/* View Only Badge */}
        <div className="flex items-center justify-center gap-1 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-[9px] text-white/40 uppercase tracking-wide">View Only</span>
        </div>
      </div>

      {/* Output Handle (right) - for reference image connection */}
      <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 group">
        <div className="relative">
          <Handle
            type="source"
            position={Position.Right}
            id="reference-out"
            className="w-3 h-3 !bg-purple-500 !border-2 !border-white !right-0 !top-1/2 !-translate-y-1/2"
          />
          
          {/* Invisible bridge for hover continuity */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-6 bg-transparent" />

          {/* Refine Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const zoom = 1; // Default zoom
              const setNodes = useProjectStore.getState().setNodes;
              const setEdges = useProjectStore.getState().setEdges;
              const nodes = useProjectStore.getState().nodes;
              const edges = useProjectStore.getState().edges;
              
              // Calculate position for new node
              // We need the current node's position but 'position' isn't passed in props directly
              // We'll approximate or use a safe offset if we can't get it easily,
              // or better, rely on the store to handle positioning if we passed ID.
              // Since we don't have easy access to absolute x/y here without store lookup:
              const currentNode = nodes.find(n => n.id === props.id);
              const baseX = currentNode?.position.x ?? 0;
              const baseY = currentNode?.position.y ?? 0;
              
              const newNodeId = crypto.randomUUID();
              const newNode: Node = {
                id: newNodeId,
                type: 'inputNode',
                position: { x: baseX + 400, y: baseY },
                data: {
                  label: 'Refined Input',
                  prompt: data.label, // Use previous label as starting prompt
                  referenceImages: data.imageUrl ? [data.imageUrl] : [],
                  numberOfOutputs: 1,
                  viewType: '3d',
                  cameraAngle: { position: 'eye-level', fov: 75 },
                  lighting: { type: 'natural', intensity: 80 },
                },
              };

              setNodes([...nodes, newNode]);
              
              setEdges([
                ...edges,
                {
                  id: `edge-${props.id}-${newNodeId}`,
                  source: props.id,
                  sourceHandle: 'reference-out',
                  target: newNodeId,
                  targetHandle: 'reference',
                  animated: true,
                  style: { stroke: '#a855f7', strokeWidth: 2 },
                },
              ]);
              
              useProjectStore.getState().saveCanvasState();
            }}
            className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-purple-600 text-white text-[10px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg flex items-center gap-1 hover:bg-purple-500"
          >
            <Plus className="w-3 h-3" />
            Refine
          </button>
        </div>
      </div>
    </div>
  );
});

OutputGenerationNode.displayName = 'OutputGenerationNode';


