import { create } from 'zustand';
import { Node, Edge } from '@xyflow/react';
import { getProject, updateProject } from '@/app/actions/project';

// Types


export type GenerationNode = {
  id: string;
  position: { x: number; y: number };
  data: {
    label: string;
    imageUrl?: string;
    prompt?: string;
    isGenerating?: boolean;
  };
};

export type ColorPalette = {
  primary: string;
  secondary: string;
  accent: string;
  neutral: string;
  highlight: string;
};

export type GlobalSettings = {
  colorPalette: ColorPalette;
  interiorStyle: 'scandi' | 'japandi' | 'industrial' | 'modern' | 'boho' | 'minimal';
  materials: string[];
};

type State = {

  
  // Node-based state
  nodes: Node[];
  edges: Edge[];
  
  // Global settings
  globalSettings: GlobalSettings;
  
  // Actions
  isGenerating: boolean;
  startGeneration: () => void;
  finishGeneration: () => void;
  
  // Node actions
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  updateNodeData: (nodeId: string, data: Partial<any>) => void;
  
  // Project context
  projectId: string | null;
  setProjectId: (id: string) => void;
  saveCanvasState: () => Promise<void>;
  loadCanvasState: (id: string) => Promise<void>;

  // Settings actions
  updateGlobalSettings: (settings: Partial<GlobalSettings>) => void;
  saveSettingsToDB: (projectId: string) => Promise<void>;
};

export const useProjectStore = create<State>((set, get) => ({

  projectId: null,
  isGenerating: false,
  nodes: [],
  edges: [],
  
  // Default global settings
  globalSettings: {
    colorPalette: {
      primary: '#2C3E50',
      secondary: '#ECF0F1',
      accent: '#3498DB',
      neutral: '#95A5A6',
      highlight: '#E74C3C',
    },
    interiorStyle: 'scandi',
    materials: ['wood', 'fabric', 'metal'],
  },

  setProjectId: (id) => set({ projectId: id }),

  saveCanvasState: async () => {
    const { projectId, nodes, edges } = get();
    if (!projectId) return;

    try {
      await updateProject(projectId, {
        canvasState: { nodes, edges },
      } as any);
    } catch (error) {
      console.error('Failed to save canvas state:', error);
    }
  },

  loadCanvasState: async (id: string) => {
    try {
      const project = await getProject(id);
      
      if (project && project.canvasState) {
        const state = project.canvasState as any;
        set({ 
          nodes: state.nodes || [], 
          edges: state.edges || [],
          projectId: id 
        });
      } else {
         set({ projectId: id });
      }
    } catch (error) {
      console.error('Failed to load canvas state:', error);
    }
  },

  startGeneration: () => set({ isGenerating: true }),
  
  finishGeneration: () => set({ isGenerating: false }),
  
  // Node management
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  
  updateNodeData: (nodeId, data) => set((state) => ({
    nodes: state.nodes.map((node) =>
      node.id === nodeId
        ? { ...node, data: { ...node.data, ...data } }
        : node
    ),
  })),
  
  // Global settings management
  updateGlobalSettings: (settings) => set((state) => ({
    globalSettings: { ...state.globalSettings, ...settings },
  })),
  
  // Save settings to database
  saveSettingsToDB: async (projectId: string) => {
    try {
      const { globalSettings } = get();
      await updateProject(projectId, {
        colorPalette: globalSettings.colorPalette,
        interiorStyle: globalSettings.interiorStyle, 
        materials: globalSettings.materials,
      } as any);
      
    } catch (error) {
      console.error('Error saving settings to database:', error);
      throw error; 
    }
  },
}));




