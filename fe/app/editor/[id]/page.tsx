'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useProjectStore } from '@/store/use-project-store';
import { NodeCanvas } from '@/components/editor/node-canvas';
import { Header } from '@/components/header';

export default function EditorPage() {
  const params = useParams();
  const projectId = params?.id as string;
  const { setVersions, selectVersion, updateGlobalSettings } = useProjectStore();

  useEffect(() => {
    console.log('Editor Page Mounted', projectId);
    if (!projectId) return;
    
    // Fetch versions and settings from API (single call)
    const fetchData = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/versions`);
        if (response.ok) {
          const data = await response.json();
          
          // Set versions
          const formattedVersions = data.versions.map((v: {
            id: string;
            parentId: string | null;
            imageUrl: string;
            configJson: unknown;
            name: string;
            type: string;
            createdAt: string;
          }) => ({
            id: v.id,
            parentId: v.parentId,
            imageUrl: v.imageUrl,
            config: v.configJson,
            name: v.name,
            type: v.type,
            createdAt: new Date(v.createdAt),
          }));
          setVersions(formattedVersions);
          if (formattedVersions.length > 0) {
            selectVersion(formattedVersions[0].id);
          }

          // Set global settings
          if (data.settings) {
            updateGlobalSettings(data.settings);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        // Fallback to mock data if needed
      }
    };

    fetchData();
  }, [projectId, setVersions, selectVersion, updateGlobalSettings]);

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
