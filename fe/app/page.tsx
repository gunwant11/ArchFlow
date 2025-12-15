'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Upload, Wand2, Zap, ArrowRight, LayoutGrid, Clock } from 'lucide-react';
import { Header } from '@/components/header';
import { getUserProjects } from '@/app/actions/project';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Project = {
  id: string;
  name: string;
  createdAt: string;
  baseImage: string | null;
};

export default function HomePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [colors, setColors] = useState<string[]>(['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b']);
  const [colorInputs, setColorInputs] = useState<string[]>(['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b']);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (session?.user) {
      const fetchProjects = async () => {
        setIsLoadingHistory(true);
        try {
          const data = await getUserProjects();
          setProjects(data);
        } catch (error) {
          console.error('Failed to fetch projects', error);
        } finally {
          setIsLoadingHistory(false);
        }
      };
      fetchProjects();
    }
  }, [session]);

  const handleStart = () => {
    router.push('/editor/1');
  };

  const handleDescribeClick = () => {
    setIsDialogOpen(true);
  };

  const handleSubmitPrompt = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    
    try {
      // Step 1: Create a new project
      const projectResponse = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Project: ${prompt.substring(0, 50)}...`,
        }),
      });

      if (!projectResponse.ok) {
        throw new Error('Failed to create project');
      }

      const project = await projectResponse.json();
      const projectId = project.id;

      // Step 2: Generate JSON prompt from description and colors
      const jsonPromptResponse = await fetch('/api/scene/generate-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'generate',
          prompt: prompt,
          theme: {
            colors: colors,
            description: prompt,
          },
        }),
      });

      if (!jsonPromptResponse.ok) {
        throw new Error('Failed to generate JSON prompt');
      }

      const jsonPromptData = await jsonPromptResponse.json();
      const jsonPrompt = jsonPromptData.json_prompt;

      // Step 3: Render the image using the JSON prompt
      const renderResponse = await fetch('/api/scene/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json_prompt: jsonPrompt,
          seed: 5555,
          steps: 50,
          aspect_ratio: '1:1',
          guidance_scale: 5,
          variants: 1,
        }),
      });

      if (!renderResponse.ok) {
        throw new Error('Failed to render image');
      }

      const renderData = await renderResponse.json();
      const imageUrl = renderData.images[0];

      if (!imageUrl) {
        throw new Error('No image URL returned from render');
      }

      // Step 4: Create the first version with the rendered image
      const versionResponse = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId,
          parentVersionId: null,
          imageUrl: imageUrl, // Pass the rendered image URL
          config: {
            ...jsonPrompt,
            style: jsonPromptData.style,
            colors: colors,
            prompt: prompt,
          },
        }),
      });

      if (!versionResponse.ok) {
        throw new Error('Failed to create version');
      }

      // Step 5: Update the version with the actual rendered image
      // Note: The /api/generate endpoint creates a version, but we need to update it with the actual image
      // For now, we'll navigate to the editor. The version will be created by /api/generate
      // In a production setup, you'd want to update the version with the correct imageUrl

      // Close dialog and reset
      setIsDialogOpen(false);
      setPrompt('');
      const defaultColors = ['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b'];
      setColors(defaultColors);
      setColorInputs(defaultColors);

      // Navigate to editor
      router.push(`/editor/${projectId}`);
    } catch (error) {
      console.error('Error generating layout:', error);
      alert('Failed to generate layout. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const updateColor = (index: number, color: string) => {
    const newColors = [...colors];
    newColors[index] = color;
    setColors(newColors);
    const newInputs = [...colorInputs];
    newInputs[index] = color;
    setColorInputs(newInputs);
  };

  const updateColorInput = (index: number, value: string) => {
    const newInputs = [...colorInputs];
    newInputs[index] = value;
    setColorInputs(newInputs);
    
    // Update color if valid hex
    if (/^#[0-9A-F]{6}$/i.test(value)) {
      updateColor(index, value);
    }
  };

  return (
    <div className="h-screen w-full bg-[#0B0C0E] flex flex-col overflow-y-auto relative">
      <Header />

      {/* Background Ambient Effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[128px] pointer-events-none" />

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-start py-20 px-8 relative z-10">
        
        {/* Cards Container */}
        <div className="flex gap-8 w-full max-w-4xl">
          
          {/* Card 1: Upload */}
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleStart}
            className="flex-1 h-[400px] bg-[#15171B]/80 backdrop-blur-md border border-white/5 rounded-3xl flex flex-col items-center justify-center cursor-pointer group hover:border-cyan-500/50 transition-all shadow-2xl"
          >
            <div className="w-20 h-20 mb-6 rounded-2xl bg-[#1E2128] flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
              <Upload className="w-10 h-10 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-medium text-white mb-2">Upload Floor Plan</h2>
            <p className="text-white/40">Supports .JPG, PNG, .PDF</p>
          </motion.div>

          {/* Card 2: Describe */}
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDescribeClick}
            className="flex-1 h-[400px] bg-[#15171B]/80 backdrop-blur-md border border-white/5 rounded-3xl flex flex-col items-center justify-center cursor-pointer group hover:border-cyan-500/50 transition-all shadow-2xl"
          >
            <div className="w-20 h-20 mb-6 rounded-2xl bg-[#1E2128] flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
              <Wand2 className="w-10 h-10 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-medium text-white mb-2">Describe Layout</h2>
            <div className="w-48 h-1 bg-white/10 mt-4 rounded-full overflow-hidden">
              <div className="w-1/3 h-full bg-cyan-500/50" />
            </div>
          </motion.div>

        </div>

        {/* History List Section */}
        {session?.user && (projects.length > 0 || isLoadingHistory) && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="w-full max-w-6xl mt-16"
          >
            <div className="flex items-center gap-2 mb-6">
              <Clock className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-medium text-white">Your Projects</h2>
            </div>
            
            {isLoadingHistory ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-64 bg-white/5 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {projects.map((project) => (
                  <div 
                    key={project.id}
                    onClick={() => router.push(`/editor/${project.id}`)}
                    className="group bg-[#15171B]/50 border border-white/5 rounded-2xl p-4 cursor-pointer hover:border-cyan-500/50 hover:bg-[#1E2128] transition-all"
                  >
                    <div className="aspect-square bg-black/20 rounded-xl mb-4 overflow-hidden relative">
                      {project.baseImage ? (
                        <img src={project.baseImage} alt={project.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-white/20">
                          <LayoutGrid className="w-8 h-8" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 mr-3">
                        <h3 className="font-medium text-white truncate text-sm mb-1">{project.name}</h3>
                        <p className="text-xs text-white/40">{new Date(project.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors shrink-0">
                        <ArrowRight className="w-4 h-4 text-white/40 group-hover:text-cyan-400" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Footer Badge */}
        <div className="mt-12">
          <div className="px-6 py-3 rounded-full border border-cyan-500/30 bg-cyan-950/10 flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400 fill-cyan-400" />
            <span className="text-cyan-100 text-sm font-medium">Powered by FIBO JSON-Native Control</span>
          </div>
        </div>

      </main>

      <footer className="p-6 text-center text-white/20 text-sm">
        Structura.ai — Designed for Architects & Innovators v1.0-alpha
      </footer>

      {/* Describe Layout Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-[#15171B] border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-medium text-white">
              Describe Your Layout
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Enter a detailed description of the layout you want to create. Be as specific as possible about rooms, dimensions, and features.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-6">
            <div>
              <label className="text-sm font-medium text-white/90 mb-2 block">
                Layout Description
              </label>
              <textarea
                placeholder="e.g., A 3-bedroom apartment with an open kitchen, living room, and two bathrooms..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) {
                    e.preventDefault();
                    handleSubmitPrompt();
                  }
                }}
                rows={6}
                className="w-full rounded-md border border-white/10 bg-[#1E2128] px-3 py-2 text-white placeholder:text-white/40 focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20 focus-visible:ring-[3px] outline-none resize-none transition-[color,box-shadow]"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-white/90 mb-3 block">
                Color Palette (4 colors)
              </label>
              <div className="flex gap-4">
                {colors.map((color, index) => (
                  <div key={index} className="flex-1">
                    <div className="relative group">
                      <div
                        className="w-full h-16 rounded-lg border-2 border-white/20 cursor-pointer transition-all hover:border-cyan-500/50 hover:scale-105"
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          const input = document.getElementById(`color-${index}`) as HTMLInputElement;
                          input?.click();
                        }}
                      />
                      <input
                        id={`color-${index}`}
                        type="color"
                        value={color}
                        onChange={(e) => updateColor(index, e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="mt-2 text-center">
                        <input
                          type="text"
                          value={colorInputs[index]}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Allow typing hex codes (with or without #)
                            if (/^#?[0-9A-F]{0,6}$/i.test(value)) {
                              const hexValue = value.startsWith('#') ? value : `#${value}`;
                              updateColorInput(index, hexValue);
                            }
                          }}
                          onBlur={(e) => {
                            const value = e.target.value;
                            // Validate and fix on blur
                            if (/^#?[0-9A-F]{6}$/i.test(value)) {
                              const hexValue = value.startsWith('#') ? value : `#${value}`;
                              updateColor(index, hexValue);
                            } else {
                              // Reset to current color if invalid
                              updateColorInput(index, colors[index]);
                            }
                          }}
                          className="w-full text-xs text-center bg-[#1E2128] border border-white/10 rounded px-2 py-1 text-white focus-visible:border-cyan-500/50 focus-visible:outline-none"
                          placeholder="#000000"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                setPrompt('');
                const defaultColors = ['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b'];
                setColors(defaultColors);
                setColorInputs(defaultColors);
              }}
              className="bg-transparent border-white/10 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitPrompt}
              disabled={!prompt.trim() || isGenerating}
              className="bg-cyan-500 hover:bg-cyan-600 text-white border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? 'Generating...' : 'Generate Layout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
