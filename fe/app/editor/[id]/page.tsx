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
  const { setVersions, selectVersion, updateGlobalSettings } = useProjectStore();



  useEffect(() => {
    console.log('Editor Page Mounted', projectId);
    if (!projectId) return;
    
    // Fetch settings from server action
    const fetchData = async () => {
      try {
        // Dynamically import to ensure clean replacement if imports are tricky at top level
        // But better to use static import if possible. Text replacement might be tricky for top level.
        // I'll just use the imported action assuming I added it.
        // Wait, I need to add the import at the top first if I want to use it.
        // I will do it in one go if I can replace the whole file content or a large chunk.
        // Let's replace the `useEffect` block and assuming I will add import later?
        // No, I should add import.
        
        const settings = await getProjectSettings(projectId);
        
        if (settings) {
            updateGlobalSettings(settings as any);
        }
        
        // Versions are deprecated in this flow, they are loaded via canvasState in NodeCanvas
        setVersions([]); 
        
      } catch (error) {
        console.error('Error fetching data:', error);
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
