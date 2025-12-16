'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { InputGenerationNode, InputNodeData } from './input-generation-node';
import { OutputGenerationNode, OutputNodeData } from './output-generation-node';
import { NodeToolbar } from './node-toolbar';
import { useProjectStore } from '@/store/use-project-store';
import { useParams } from 'next/navigation';
import { Plus, Loader2, Download, Images } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { generateSceneJson, renderScene } from '@/app/actions/scene';


const nodeTypes = {
  inputNode: InputGenerationNode,
  outputNode: OutputGenerationNode,
};

export function NodeCanvas() {
  const params = useParams();
  const projectId = params?.id as string;
  const { 
 
    startGeneration, 
    finishGeneration, 
    isGenerating, 
    globalSettings,
    setProjectId,
    saveCanvasState,
    loadCanvasState
  } = useProjectStore();
  const [activeTool, setActiveTool] = useState<'select' | 'add' | 'pan'>('select');
  
  const [isCanvasLoading, setIsCanvasLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<InputNodeData | OutputNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [nodeCounter, setNodeCounter] = useState(1);
  const nodesRef = useRef(nodes);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Set project ID and load state on mount
  useEffect(() => {
    if (projectId) {
      setIsCanvasLoading(true);
      loadCanvasState(projectId).finally(() => {
          setIsCanvasLoading(false);
      });
    }
  }, [projectId, loadCanvasState]);

  const onConnect = useCallback(
    (params: Connection) => {
      // Check if this is a reference image connection (output → input reference)
      const sourceNode = nodes.find(n => n.id === params.source);
      const targetNode = nodes.find(n => n.id === params.target);
      
      if (sourceNode?.type === 'outputNode' && targetNode?.type === 'inputNode' && params.targetHandle === 'reference') {
        // Connect output to input reference
        const outputNodeData = sourceNode.data as OutputNodeData;
        if (outputNodeData.imageUrl) {
          // Add image to target node reference images
          setNodes((nds) =>
            nds.map((node) => {
              if (node.id === params.target) {
                // We know this is an InputNode because of the check above, but we need to tell TS
                const inputData = node.data as InputNodeData;
                const currentImages = inputData.referenceImages || [];
                // Avoid duplicates
                if (!currentImages.includes(outputNodeData.imageUrl!)) {
                  return {
                    ...node,
                    data: { 
                      ...node.data, 
                      referenceImages: [...currentImages, outputNodeData.imageUrl!] 
                    },
                  };
                }
              }
              return node;
            })
          );
        }
        
        setEdges((eds) => addEdge({ 
          ...params, 
          animated: true, 
          style: { stroke: '#a855f7', strokeWidth: 2 } // Purple for reference connections
        }, eds));
      } else {
        // Normal connection
        setEdges((eds) => addEdge({ 
          ...params, 
          animated: true, 
          style: { stroke: '#06b6d4', strokeWidth: 2 } 
        }, eds));
      }
    },
    [setEdges, nodes, setNodes]
  );

  // General helper for updating node data
  const updateNodeData = (nodeId: string, data: Partial<InputNodeData>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId 
          ? { 
              ...node, 
              data: { ...node.data, ...data } as InputNodeData | OutputNodeData
            } 
          : node
      )
    );
  };



  const handleRunInputNode = async (nodeId: string) => {
    const inputNode = nodesRef.current.find(n => n.id === nodeId);
    if (!inputNode || inputNode.type !== 'inputNode') return;

    const inputData = inputNode.data as InputNodeData;
    const inputPrompt = inputData.prompt?.trim();
    
    // Only require prompt if it's NOT a refine node (refine can just be "make it brighter")
    // But usually prompt is needed.
    if (!inputPrompt) {
      alert('Please enter a prompt');
      return;
    }

    // Update node to show it's generating
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, isGenerating: true } }
          : node
      )
    );

    startGeneration();

    try {
      const numberOfOutputs = inputData.numberOfOutputs || 1;
      const hasReferences = inputData.referenceImages && inputData.referenceImages.length > 0;
      
      // Defaults
      const lighting = inputData.lighting || { type: 'daylight', intensity: 80 };
      const camera = inputData.cameraAngle || { position: 'eye-level' };
      
      // Build enhanced prompt with global settings and view type
      const enhancedPrompt = `${inputData.prompt}. 
View: ${inputData.viewType || '3d'} view. 
Style: ${globalSettings.interiorStyle}. 
Materials: ${globalSettings.materials.join(', ')}. 
Lighting: ${lighting.type} with ${lighting.intensity}% intensity. 
Camera: ${camera.position} angle.`;

      const generationConfig = {
        style: globalSettings.interiorStyle,
        materials: globalSettings.materials,
        lighting: lighting,
        camera: camera,
        colors: globalSettings.colorPalette,
        viewType: inputData.viewType,
        referenceImages: inputData.referenceImages,
      };

      // Detect Refine Context: Check for incoming edge from an OutputNode to this InputNode's reference handle
      const refineEdge = useProjectStore.getState().edges.find(     
        e => e.target === nodeId && e.targetHandle === 'reference'
      );
      
      let previousStructuredPrompt: Record<string, any> | undefined;
      let previousImageUrl: string | undefined;

      if (refineEdge) {
        const sourceNode = useProjectStore.getState().nodes.find(n => n.id === refineEdge.source);
        if (sourceNode && sourceNode.type === 'outputNode') {
           const outputData = sourceNode.data as OutputNodeData;
           previousStructuredPrompt = outputData.structuredPrompt;
           previousImageUrl = outputData.imageUrl;
        }
      }
      
      // Fallback: If no edge but referenceImages exists, try to use first one as image_url
      // providing it's just one Refine. But ideally we rely on the edge for structuredPrompt.
      if (!previousImageUrl && hasReferences && inputData.referenceImages) {
          previousImageUrl = inputData.referenceImages[0];
          // We won't have structuredPrompt in this loose case unless we found the node.
      }

      // Step 1: Generate JSON from prompt
      // Determine type based on context:
      // - 'refine' if we have a previous structured prompt to modify
      // - 'visualize' if viewType is 'room' (2D room view)
      // - 'structure' if viewType is '3d' (3D isometric layout)
      let generationType: 'structure' | 'visualize' | 'refine' = 'structure';
      
      if (previousStructuredPrompt) {
        generationType = 'refine';
      } else if (inputData.viewType === 'room') {
        generationType = 'visualize';
      } else {
        generationType = 'structure';
      }
      
      const jsonPromptData = await generateSceneJson({
          type: generationType,
          prompt: enhancedPrompt,
          json_prompt: generationConfig,
          structured_prompt: previousStructuredPrompt,
          // Pass camera and lighting directly for prompt builders
          camera: camera,
          lighting: lighting,
          // Pass reference image if available
          reference_image: previousImageUrl || (hasReferences ? inputData.referenceImages![0] : undefined),
          // Pass style for the prompt builder
          style: globalSettings.interiorStyle,
          // Theme includes colors and materials
          theme: {
            colors: globalSettings.colorPalette,
            materials: globalSettings.materials,
            style: globalSettings.interiorStyle,
          },
          parent_id: null,
      });

      const jsonData = jsonPromptData;

      // Step 2: Render images from JSON (request numberOfOutputs variants)
      const renderData = await renderScene({
          json_prompt: jsonData.json_prompt,
          seed: Math.floor(Math.random() * 10000),
          steps: 50,
          variants: numberOfOutputs,
          image_url: previousImageUrl,
          structured_prompt: previousStructuredPrompt,
      });

      const generatedImages = renderData.images || [];

      // Step 3: Create output nodes immediately with skeleton state
      const newOutputNodes: Node<OutputNodeData>[] = [];
      const newEdges: Edge[] = [];
      const baseX = inputNode.position.x + 450;
      const baseY = inputNode.position.y;

      // Create skeleton output nodes first
      for (let i = 0; i < numberOfOutputs; i++) {
        const outputId = `output-${nodeCounter + i}-${Date.now()}`;
        const yOffset = i * 250;

        newOutputNodes.push({
          id: outputId,
          type: 'outputNode',
          position: { x: baseX, y: baseY + yOffset },
          data: {
            label: `Output ${nodeCounter + i}`,
            // No imageUrl initially - shows skeleton
            config: jsonData.json_prompt,
          },
        });

        // Create edge from input to output
        newEdges.push({
          id: `edge-${nodeId}-${outputId}`,
          source: nodeId,
          sourceHandle: `output-${i}`,
          target: outputId,
          animated: true,
          style: { stroke: '#06b6d4', strokeWidth: 2 },
        });
      }

      // Update counter
      setNodeCounter(prev => prev + numberOfOutputs);

      // Add skeleton nodes and edges first
      const nodesWithSkeleton = [
        ...nodesRef.current.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, isGenerating: false } }
            : node
        ),
        ...newOutputNodes,
      ];
      const edgesWithSkeleton = [...edges, ...newEdges];

      setNodes(nodesWithSkeleton);
      setEdges(edgesWithSkeleton);
      
      // Explicitly sync to store and save immediately
      useProjectStore.getState().setNodes(nodesWithSkeleton);
      useProjectStore.getState().setEdges(edgesWithSkeleton);
      saveCanvasState();

      // Step 4: Update output nodes with generated images
      if (generatedImages.length > 0) {
        setTimeout(() => {
          const finalNodes = nodesWithSkeleton.map((node) => {
              const nodeIndex = newOutputNodes.findIndex(n => n.id === node.id);
              if (nodeIndex >= 0 && nodeIndex < generatedImages.length) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    imageUrl: generatedImages[nodeIndex],
                    structuredPrompt: renderData.structuredPrompts?.[nodeIndex],
                    generationTime: new Date().toLocaleTimeString(),
                  },
                };
              }
              return node;
            });

          setNodes(finalNodes);
          
          // Sync and Save again with images
          useProjectStore.getState().setNodes(finalNodes);
          saveCanvasState();
        }, 300); // Small delay for visual effect
      }



      // Update store with first image
      finishGeneration();
    } catch (error) {
      console.error('Generation failed:', error);
      alert(`Generation failed: ${(error as Error).message}`);
      
      // Reset node state
      const resetNodes = nodesRef.current.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, isGenerating: false } }
            : node
        );
      setNodes(resetNodes);
      useProjectStore.getState().setNodes(resetNodes);
      
      finishGeneration();
    }
  };



  // Sync local nodes to global store whenever they change (Local -> Store)
  useEffect(() => {
    // Only sync if they are actually different to avoid loops
    // But since we are setting store nodes, this is the "user changed something" path
    // We need to be careful not to create a loop with the Store -> Local sync
    // For now, we trust that setNodes in store is cheap if same.
    useProjectStore.getState().setNodes(nodes);
  }, [nodes]);

  // Sync global store to local nodes whenever store changes (Store -> Local)
  // This handles initial load and external updates
  const storeNodes = useProjectStore(state => state.nodes);
  const storeEdges = useProjectStore(state => state.edges);

  useEffect(() => {
    if (storeNodes.length > 0 && JSON.stringify(storeNodes) !== JSON.stringify(nodes)) {
      const hydratedNodes = storeNodes.map((node) => {
        if (node.type === 'inputNode') {
          return {
            ...node,
            data: {
              ...node.data,
              onRun: () => handleRunInputNode(node.id),
              onPromptChange: (prompt: string) => updateNodeData(node.id, { prompt }),
              onAddReferenceImage: (image: string) => addNodeReferenceImage(node.id, image),
              onRemoveReferenceImage: (index: number) => removeNodeReferenceImage(node.id, index),
              onOutputsChange: (count: number) => updateNodeData(node.id, { numberOfOutputs: count }),
              onViewTypeChange: (type: '3d' | 'room') => updateNodeData(node.id, { viewType: type }),
              onCameraChange: (camera: any) => updateNodeData(node.id, { cameraAngle: camera }),
              onLightingChange: (lighting: any) => updateNodeData(node.id, { lighting }),
            },
          };
        }
        return node;
      });

      setNodes(hydratedNodes as Node<InputNodeData | OutputNodeData>[]);
      
      const maxId = storeNodes.reduce((max, node) => {
        const match = node.id.match(/-(?:input|output)-(\d+)/);
        if (match) {
          const num = parseInt(match[1]);
          return num > max ? num : max;
        }
        return max;
      }, 0);
      if (maxId > 0) setNodeCounter(maxId + 1);
    }
  }, [storeNodes, setNodes]); // Missing 'nodes' dependency to avoid loop? 
  // If we include 'nodes', then when we setNodes, it triggers this again.
  // JSON check helps. But deeper issue is two sources of truth. 
  // Ideally we switch to controlled flow, but for now this patches the load.

  useEffect(() => {
     if (storeEdges.length > 0 && JSON.stringify(storeEdges) !== JSON.stringify(edges)) {
        setEdges(storeEdges);
     }
  }, [storeEdges, setEdges]);

  const handleAddNode = () => {
    // setNodeCounter(prev => prev + 1); // No longer needed for IDs
    const newNodeId = crypto.randomUUID();
    const newNode: Node<InputNodeData> = {
      id: newNodeId,
      type: 'inputNode',
      position: { x: Math.random() * 300 + 150, y: Math.random() * 200 + 150 },
      data: {
        label: `Input Node ${nodeCounter}`,
        prompt: '',
        numberOfOutputs: 1,
        viewType: '3d',
        cameraAngle: { position: 'eye-level' },
        lighting: { type: 'daylight', intensity: 80 },
        referenceImages: [],
        onRun: () => handleRunInputNode(newNodeId),
        onPromptChange: (prompt) => updateNodeData(newNodeId, { prompt }),
        onAddReferenceImage: (image) => addNodeReferenceImage(newNodeId, image),
        onRemoveReferenceImage: (index) => removeNodeReferenceImage(newNodeId, index),
        onOutputsChange: (count) => updateNodeData(newNodeId, { numberOfOutputs: count }),
        onViewTypeChange: (type) => updateNodeData(newNodeId, { viewType: type }),
        onCameraChange: (camera) => updateNodeData(newNodeId, { cameraAngle: camera }),
        onLightingChange: (lighting) => updateNodeData(newNodeId, { lighting }),
      },
    };

    setNodes((nds) => {
      const updatedNodes = [...nds, newNode];
      // We'll let the useEffect handle the store sync
      // But we need to save explicitly after update
      // saveCanvasState() relies on get() store state, so we might need to wait for effect
      // OR pass updated nodes directly. 
      // Let's pass directly if possible or trigger save after effect.
      // Actually, let's just update local state here. 
      return updatedNodes;
    });
    
    // Trigger save after a moment to allow effect to sync
    setTimeout(() => {
        saveCanvasState();
    }, 100);
  };

  const addNodeReferenceImage = (nodeId: string, image: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          const inputData = node.data as InputNodeData;
          const currentImages = inputData.referenceImages || [];
          // Avoid duplicates (optional, but good practice)
          if (!currentImages.includes(image)) {
             return { 
               ...node, 
               data: { 
                 ...node.data, 
                 referenceImages: [...currentImages, image] 
               } 
             };
          }
        }
        return node;
      })
    );
  };

  const removeNodeReferenceImage = (nodeId: string, index: number) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          const inputData = node.data as InputNodeData;
          const currentImages = inputData.referenceImages || [];
          const newImages = [...currentImages];
          newImages.splice(index, 1);
          return { 
            ...node, 
            data: { 
              ...node.data, 
              referenceImages: newImages 
            } 
          };
        }
        return node;
      })
    );
  };


  if (isCanvasLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0B0C0E] text-white/50">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="bg-[#0B0C0E]"
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#06b6d4', strokeWidth: 2 },
        }}
      >
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={24} 
          size={1}
          color="#ffffff"
          className="opacity-[0.03]"
        />
        <Controls 
          className="bg-[#1E2128] border border-white/10 rounded-lg [&_button]:bg-[#15171B] [&_button]:border-white/10 [&_button]:text-white/60 [&_button:hover]:text-white [&_button:hover]:bg-[#1E2128]"
        />
        <MiniMap 
          className="bg-[#1E2128] border border-white/10 rounded-lg"
          nodeColor="#2A2F3A"
          maskColor="rgba(0, 0, 0, 0.6)"
        />
      </ReactFlow>

      {/* Left Toolbar */}
      <NodeToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onAddNode={handleAddNode}
      />

      {/* Top-Right Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-3">
        {/* Outputs Modal */}
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="bg-[#1E2128] border-white/10 hover:bg-[#2A2F3A] hover:border-white/20 text-white shadow-lg h-11"
            >
              <Images className="w-4 h-4 mr-2" />
              Outputs
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#15171B] border-white/10 text-white max-w-4xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="text-white">All Outputs</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto max-h-[60vh] pr-2">
              {nodes.filter(n => n.type === 'outputNode' && (n.data as OutputNodeData).imageUrl).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-white/40">
                  <Images className="w-12 h-12 mb-4 opacity-50" />
                  <p>No output images yet</p>
                  <p className="text-sm mt-1">Run a generation to see outputs here</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {nodes
                    .filter(n => n.type === 'outputNode' && (n.data as OutputNodeData).imageUrl)
                    .map((node) => {
                      const outputData = node.data as OutputNodeData;
                      return (
                        <div key={node.id} className="relative group rounded-xl overflow-hidden border border-white/10 bg-black/20">
                          <img 
                            src={outputData.imageUrl!} 
                            alt={outputData.label || 'Output'} 
                            className="w-full aspect-square object-cover"
                          />
                          {/* Download Button Overlay */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors">
                            <a
                              href={outputData.imageUrl!}
                              download={`output-${node.id}.png`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="absolute bottom-3 right-3 p-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white opacity-0 group-hover:opacity-100 hover:bg-white/20 transition-all"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                          {/* Label */}
                          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-xs text-white/80 truncate">{outputData.label}</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Button
          onClick={handleAddNode}
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg h-11"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Node
        </Button>
      </div>
    </div>
  );
}

