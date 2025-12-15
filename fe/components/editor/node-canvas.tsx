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
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateSceneJson, renderScene } from '@/app/actions/scene';
import { saveProjectVersion } from '@/app/actions/project';

const nodeTypes = {
  inputNode: InputGenerationNode,
  outputNode: OutputGenerationNode,
};

export function NodeCanvas() {
  const params = useParams();
  const projectId = params?.id as string;
  const { 
    versions, 
    currentVersionId, 
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
    if (!inputData.prompt?.trim()) {
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
      const lighting = inputData.lighting || { type: 'natural', intensity: 80 };
      const camera = inputData.cameraAngle || { position: 'eye-level', fov: 75 };
      
      // Build enhanced prompt with global settings and view type
      const enhancedPrompt = `${inputData.prompt}. 
View: ${inputData.viewType || '3d'} view. 
Style: ${globalSettings.interiorStyle}. 
Materials: ${globalSettings.materials.join(', ')}. 
Lighting: ${lighting.type} with ${lighting.intensity}% intensity. 
Camera: ${camera.position} angle with ${camera.fov}° FOV.`;

      const generationConfig = {
        style: globalSettings.interiorStyle,
        materials: globalSettings.materials,
        lighting: lighting,
        camera: camera,
        colors: globalSettings.colorPalette,
        viewType: inputData.viewType,
        referenceImages: inputData.referenceImages,
      };

      // Step 1: Generate JSON from prompt
      const jsonPromptData = await generateSceneJson({
          type: hasReferences ? 'refine' : 'generate',
          prompt: enhancedPrompt,
          json_prompt: generationConfig,
          parent_id: currentVersionId,
      });

      const jsonData = jsonPromptData;

      // Step 2: Render images from JSON (request numberOfOutputs variants)
      const renderData = await renderScene({
          json_prompt: jsonData.json_prompt,
          seed: Math.floor(Math.random() * 10000),
          steps: 50,
          variants: numberOfOutputs,
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
      setNodes((nds) => [
        ...nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, isGenerating: false } }
            : node
        ),
        ...newOutputNodes,
      ]);

      setEdges((eds) => [...eds, ...newEdges]);

      // Step 4: Update output nodes with generated images
      if (generatedImages.length > 0) {
        setTimeout(() => {
          setNodes((nds) =>
            nds.map((node) => {
              const nodeIndex = newOutputNodes.findIndex(n => n.id === node.id);
              if (nodeIndex >= 0 && nodeIndex < generatedImages.length) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    imageUrl: generatedImages[nodeIndex],
                    generationTime: new Date().toLocaleTimeString(),
                  },
                };
              }
              return node;
            })
          );
        }, 300); // Small delay for visual effect
      }

      // Save to database
      if (projectId) {
        for (const imageUrl of generatedImages) {
          await saveProjectVersion(projectId, {
              name: `${inputData.prompt.substring(0, 30)}`,
              type: 'node-generation',
              imageUrl: imageUrl,
              configJson: jsonData.json_prompt,
              parentId: currentVersionId,
          });
        }
      }

      // Update store with first image
      finishGeneration({
        id: Date.now().toString(),
        parentId: currentVersionId,
        imageUrl: generatedImages[0],
        config: jsonData.json_prompt,
        name: `Generated from ${inputData.label}`,
        type: 'node-generation',
      });
    } catch (error) {
      console.error('Generation failed:', error);
      alert(`Generation failed: ${(error as Error).message}`);
      
      // Reset node state
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, isGenerating: false } }
            : node
        )
      );
      finishGeneration({
        id: '',
        parentId: null,
        imageUrl: '',
        config: {},
        name: '',
        type: '',
      });
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
        cameraAngle: { position: 'eye-level', fov: 75 },
        lighting: { type: 'natural', intensity: 80 },
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

