'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useProjectStore } from '@/store/use-project-store';
import { NodeCanvas } from '@/components/editor/node-canvas';
import { Header } from '@/components/header';
import { getProjectSettings } from '@/app/actions/project';

export default function EditorPage() {
  const params = useParams();
  const projectId = params?.id as string;
  const { updateGlobalSettings } = useProjectStore();



  useEffect(() => {
    console.log('Editor Page Mounted', projectId);
    if (!projectId) return;
    
    // Fetch settings from server action
    const fetchData = async () => {
      try {
        const settings = await getProjectSettings(projectId);
        console.log('Settings:', settings?.canvasState);
        if (settings) {
            updateGlobalSettings(settings as any);
            if (settings.canvasState) {
                const state = settings.canvasState as any;
                let nodes = state.nodes || [];
                const edges = state.edges || [];
                const versions = state.versions || [];

                // Migration: Convert legacy versions to output nodes if they don't exist
                if (versions.length > 0) {
                    const existingNodeIds = new Set(nodes.map((n: any) => n.id));
                    let addedCount = 0;

                    versions.forEach((version: any, index: number) => {
                        // Check if this version is already represented as a node (by ID or image URL check if needed)
                        // Using ID check mostly, but legacy output nodes might not match version ID 1-to-1 if not careful.
                        // However, we didn't use to save node ID as version ID. 
                        // Let's just blindly add if not found, or maybe just add as 'migrated-output-...'
                        
                        // Simple heuristic: If we have versions but few/no output nodes, populate them.
                        // Let's create a new node for each version.
                        const potentialNodeId = `output-migrated-${version.id}`;
                        
                        // Check if we already migrated it (in case we save migrated state back)
                        // Or if the user already has output nodes.
                        
                        // For now, let's append them.
                        // Find a position: place them to the right of the existing nodes or in a grid.
                        const xOffset = 600 + (addedCount % 3) * 350;
                        const yOffset = Math.floor(addedCount / 3) * 350;

                        // Try to find if this version is already in nodes (by imageUrl)
                        const isAlreadyInNodes = nodes.some((n: any) => n.data?.imageUrl === version.imageUrl);

                        if (!isAlreadyInNodes) {
                             nodes.push({
                                id: potentialNodeId,
                                type: 'outputNode',
                                position: { x: xOffset, y: 100 + yOffset },
                                data: {
                                    label: version.name || `Output ${index + 1}`,
                                    imageUrl: version.imageUrl,
                                    config: version.configJson || {},
                                    generationTime: new Date(version.createdAt).toLocaleTimeString()
                                }
                            });
                            addedCount++;
                        }
                    });
                }

                useProjectStore.getState().setNodes(nodes);
                useProjectStore.getState().setEdges(edges);
            }
        }
        
 
        
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, [projectId, updateGlobalSettings]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0B0C0E] text-white overflow-hidden">
      <Header />
      
      {/* Full Screen Node-Based Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <NodeCanvas />
      </div>

      {/* Global Settings Panel */}
    </div>
  );
}
