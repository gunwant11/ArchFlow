'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Zap, ArrowRight, LayoutGrid, Clock, Send, Image as ImageIcon, X, Palette, Sparkles, Layers } from 'lucide-react';
import { Header } from '@/components/header';
import { getUserProjects, createProject } from '@/app/actions/project';
import { Button } from '@/components/ui/button';
import { COLOR_PALETTES, INTERIOR_STYLES, MATERIALS } from '@/lib/constants';

type Project = {
  id: string;
  name: string;
  createdAt: string;
  baseImage: string | null;
};

export default function HomePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // Input State
  const [prompt, setPrompt] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Options State
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState<number | 'custom'>(0);
  const [colors, setColors] = useState<string[]>(Object.values(COLOR_PALETTES[0].colors).slice(0, 4));
  const [selectedStyleId, setSelectedStyleId] = useState<string>('');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [isPaletteDropdownOpen, setIsPaletteDropdownOpen] = useState(false);
  
  const [isGenerating, setIsGenerating] = useState(false);

  // Suggested Input Example
  const SUGGESTED_INPUT = {
    imageUrl: 'https://pub-5774ad445c9041fdbcffcce48dbfdca0.r2.dev/uploads/1765844178760-f0293f3a-06d6-4b4f-a836-7cfa056a6269-Generated_Image_December_01__2025_-_12_37PM.png',
    prompt: 'create this layout of home',
    style: 'boho',
    material: 'wood',
  };

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setIsInputFocused(true);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (overrides?: {
    prompt?: string;
    styleId?: string;
    materialId?: string;
    referenceImageUrl?: string;
  }) => {
    const effectivePrompt = overrides?.prompt ?? prompt;
    const effectiveStyleId = overrides?.styleId ?? selectedStyleId;
    const effectiveMaterialId = overrides?.materialId ?? selectedMaterialId;
    const effectiveReferenceUrl = overrides?.referenceImageUrl;

    if ((!effectivePrompt.trim() && !selectedFile && !effectiveReferenceUrl) || isGenerating) return;

    setIsGenerating(true);
    
    try {
      // enhanced Prompt
      const styleObj = INTERIOR_STYLES.find(s => s.id === effectiveStyleId);
      const materialObj = MATERIALS.find(m => m.id === effectiveMaterialId);
      
      let fullPrompt = effectivePrompt;
      if (styleObj) fullPrompt += ` Style: ${styleObj.label}.`;
      if (materialObj) fullPrompt += ` Material: ${materialObj.label}.`;

      // Step 1: Create a new project
      const project = await createProject(`Project: ${effectivePrompt.substring(0, 50) || 'Untitled'}...`);

      if (!project) throw new Error('Failed to create project');
      const projectId = project.id;

      let generatedImageUrl = null;
      let referenceImageUrl = null;
      let jsonPrompt: Record<string, unknown> | undefined;

      // 1. Handle File Upload or use provided reference URL
      if (effectiveReferenceUrl) {
        referenceImageUrl = effectiveReferenceUrl;
      } else if (selectedFile) {
        try {
           const formData = new FormData();
           formData.append('file', selectedFile);
           // Dynamically import upload action
           const { uploadImage } = await import('@/app/actions/upload');
           referenceImageUrl = await uploadImage(formData);
        } catch (uploadError) {
           console.error('Failed to upload reference image', uploadError);
        }
      }

      // 2. Generate JSON Prompt (Always)
      const { generateSceneJson, renderScene } = await import('@/app/actions/scene');
      
      // First generation ALWAYS uses 'structure' (3D isometric layout)
      // This creates the BASE SCENE that all subsequent views derive from
      const generationType = 'structure';
      
      const jsonPromptData = await generateSceneJson({
          type: generationType,
          prompt: fullPrompt,
          reference_image: referenceImageUrl || undefined, 
          theme: {
            colors: colors,
            description: fullPrompt,
            style: styleObj?.label || '',
            material: materialObj?.label || ''
          },
      });

      jsonPrompt = jsonPromptData.json_prompt;

      // 3. Render Scene
      const renderData = await renderScene({
          json_prompt: jsonPrompt,
          seed: 5555,
          steps: 50,
          aspect_ratio: '1:1',
          guidance_scale: 5,
          variants: 1,
          image_url: referenceImageUrl, // Pass reference image as control
      });

      generatedImageUrl = renderData.images[0];

      if (!generatedImageUrl) throw new Error('No image URL available');

      // Use the effective style ID directly as it should now match or be mapped
      const validEnumStyles = ['general', 'boho', 'industrial', 'minimalist', 'modern'];
      const interiorStyle = validEnumStyles.includes(effectiveStyleId) ? effectiveStyleId : 'general';

      // Step 4: Update Project with generated/uploaded image and settings
      const { updateProject } = await import('@/app/actions/project');

      // Construct initial canvas state
      const inputId = crypto.randomUUID();
      const outputId = crypto.randomUUID();
      
      const initialNodes = [
        {
          id: inputId,
          type: 'inputNode',
          position: { x: 100, y: 100 },
          data: {
            label: 'Initial Input',
            prompt: effectivePrompt,
            numberOfOutputs: 1,
            viewType: '3d', // Default
            referenceImages: referenceImageUrl ? [referenceImageUrl] : [], 
          },
        },
        {
          id: outputId,
          type: 'outputNode',
          position: { x: 600, y: 100 },
          data: {
            label: 'Output 1',
            imageUrl: generatedImageUrl, 
            config: jsonPrompt || {}, 
            structuredPrompt: renderData.structuredPrompts?.[0],
            generationTime: new Date().toLocaleTimeString(),
          },
        },
      ];

      const initialEdges = [
        {
          id: `edge-${inputId}-${outputId}`,
          source: inputId,
          target: outputId,
          sourceHandle: 'output-0',
          animated: true,
          style: { stroke: '#06b6d4', strokeWidth: 2 },
        },
      ];

      const canvasState = {
        nodes: initialNodes,
        edges: initialEdges,
      };

      await updateProject(projectId, {
          baseImage: generatedImageUrl,
          colorPalette: colors, // TODO: could use effectiveColors if we add that override
          interiorStyle: interiorStyle as any,
          materials: effectiveMaterialId ? [effectiveMaterialId] : [],
          canvasState: canvasState,
      });

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
  };

  return (
    <div className="h-screen w-full bg-[#0B0C0E] flex flex-col overflow-y-auto relative">
      <Header />

      {/* Background Ambient Effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[128px] pointer-events-none" />

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-start py-20 px-8 relative z-10 w-full max-w-5xl mx-auto">
        
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold text-white mb-4 bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            Design your dream space
          </h1>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            Upload a floor plan or describe your vision. AI will generate the layout, style, and materials for you.
          </p>
        </div>


        {/* Search/input Container */}
        <div className="w-full max-w-3xl relative z-20">
          <motion.div 
            className={`
              relative bg-[#15171B]/95 backdrop-blur-xl border transition-all duration-300 rounded-3xl overflow-hidden
              ${isInputFocused || prompt || selectedFile ? 'border-cyan-500/40 shadow-[0_0_50px_-15px_rgba(6,182,212,0.1)]' : 'border-white/10 hover:border-white/20'}
            `}
            initial={false}
            animate={{ height: 'auto' }}
          >
            {/* File Preview */}
            <AnimatePresence>
              {selectedFile && filePreview && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-4 pt-4"
                >
                  <div className="relative inline-block group">
                    <img src={filePreview} alt="Upload preview" className="h-24 w-auto rounded-lg border border-white/10 object-cover" />
                    <button 
                      onClick={removeFile}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Area */}
            <div className="flex items-end gap-3 p-4">
               {/* Enhanced Upload Button */}
               <button 
                onClick={() => fileInputRef.current?.click()}
                className="group flex items-center gap-2 p-3 pr-4 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-cyan-400 transition-all border border-transparent hover:border-white/10 flex-shrink-0"
                title="Upload Floor Plan"
              >
                <div className="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center group-hover:bg-cyan-500/10 transition-colors">
                  <Upload className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">Upload Plan</span>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </button>
              
              <div className="flex-1 min-w-0 bg-black/10 rounded-xl border border-white/5 px-3 focus-within:border-cyan-500/30 transition-colors">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  placeholder="Describe your layout..."
                  className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-white placeholder:text-white/30 text-sm resize-none py-3 min-h-[56px] max-h-48"
                  rows={Math.min(Math.max(prompt.split('\n').length, 1), 5)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
              </div>

              <Button
                onClick={() => handleSubmit()}
                disabled={(!prompt.trim() && !selectedFile) || isGenerating}
                className={`
                  h-[56px] w-[56px] rounded-xl transition-all duration-300 flex-shrink-0 p-0 flex items-center justify-center
                  ${(prompt.trim() || selectedFile) && !isGenerating ? 'bg-cyan-500 text-white hover:bg-cyan-400 shadow-[0_0_20px_-5px_rgba(6,182,212,0.4)]' : 'bg-white/5 text-white/20'}
                `}
              >
                {isGenerating ? <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Send className="w-6 h-6" />}
              </Button>
            </div>

            {/* Expanded Options */}
            <AnimatePresence>
              {(isInputFocused || prompt || selectedFile) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-t border-white/5 bg-[#0F1115]/50"
                >
                  <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Color Palette Dropdown */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-white/40 uppercase tracking-wider">
                        <Palette className="w-3 h-3" /> Color Palette
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => setIsPaletteDropdownOpen(!isPaletteDropdownOpen)}
                          className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 hover:border-white/20 transition-all"
                        >
                          <span className="text-sm">
                            {selectedPaletteIndex === 'custom' ? 'Custom' : COLOR_PALETTES[selectedPaletteIndex]?.name}
                          </span>
                          <div className="flex gap-1.5">
                            {colors.slice(0, 3).map((color, i) => (
                              <div
                                key={i}
                                className="w-5 h-5 rounded-full border border-white/20"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </button>
                        
                        {/* Dropdown Panel */}
                        {isPaletteDropdownOpen && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-[#1E2128] border border-white/10 rounded-xl overflow-hidden shadow-xl z-50">
                            {COLOR_PALETTES.map((palette, index) => (
                              <button
                                key={palette.name}
                                onClick={() => {
                                  setSelectedPaletteIndex(index);
                                  setColors(Object.values(palette.colors).slice(0, 4));
                                  setIsPaletteDropdownOpen(false);
                                }}
                                className={`w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors ${
                                  selectedPaletteIndex === index ? 'bg-white/5' : ''
                                }`}
                              >
                                <span className="text-sm text-white/80">{palette.name}</span>
                                <div className="flex gap-1.5">
                                  {Object.values(palette.colors).slice(0, 3).map((color, i) => (
                                    <div
                                      key={i}
                                      className="w-5 h-5 rounded-full border border-white/20"
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>
                              </button>
                            ))}
                            {/* Custom Option */}
                            <button
                              onClick={() => {
                                setSelectedPaletteIndex('custom');
                                setIsPaletteDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors border-t border-white/5 ${
                                selectedPaletteIndex === 'custom' ? 'bg-white/5' : ''
                              }`}
                            >
                              <span className="text-sm text-white/80">Custom</span>
                              <span className="text-xs text-white/40">Pick your own</span>
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {/* Custom Color Pickers (only show when custom is selected) */}
                      {selectedPaletteIndex === 'custom' && (
                        <div className="flex gap-3 pt-2">
                          {colors.map((color, i) => (
                            <div key={i} className="relative group">
                              <input
                                type="color"
                                value={color}
                                onChange={(e) => updateColor(i, e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                              />
                              <div 
                                className="w-10 h-10 rounded-full border-2 border-white/10 group-hover:scale-110 group-hover:border-white/30 transition-all shadow-lg"
                                style={{ backgroundColor: color }} 
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Style Selection */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-white/40 uppercase tracking-wider">
                        <Sparkles className="w-3 h-3" /> Style
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {INTERIOR_STYLES.slice(0, 6).map(style => (
                          <button
                            key={style.id}
                            onClick={() => setSelectedStyleId(selectedStyleId === style.id ? '' : style.id)}
                            className={`
                              px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5
                              ${selectedStyleId === style.id 
                                ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400' 
                                : 'bg-white/5 border-white/5 text-white/50 hover:border-white/20 hover:text-white'}
                            `}
                          >
                            <span>{style.icon}</span>
                            {style.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Material Selection */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-white/40 uppercase tracking-wider">
                        <Layers className="w-3 h-3" /> Material
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {MATERIALS.slice(0, 6).map(material => (
                          <button
                            key={material.id}
                            onClick={() => setSelectedMaterialId(selectedMaterialId === material.id ? '' : material.id)}
                            className={`
                              px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5
                              ${selectedMaterialId === material.id 
                                ? 'bg-purple-500/10 border-purple-500/50 text-purple-400' 
                                : 'bg-white/5 border-white/5 text-white/50 hover:border-white/20 hover:text-white'}
                            `}
                          >
                            <span>{material.icon}</span>
                            {material.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Suggested Input Card */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full max-w-3xl mt-6"
        >
          <div className="flex items-center gap-2 mb-3 px-1">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-medium text-white/40 uppercase tracking-wider">Try this example</span>
          </div>
          <button
            onClick={() => handleSubmit({
              prompt: SUGGESTED_INPUT.prompt,
              styleId: SUGGESTED_INPUT.style,
              materialId: SUGGESTED_INPUT.material,
              referenceImageUrl: SUGGESTED_INPUT.imageUrl,
            })}
            disabled={isGenerating}
            className="w-full group relative bg-[#15171B]/80 hover:bg-[#1E2128] border border-white/5 hover:border-cyan-500/30 rounded-2xl p-4 transition-all duration-300 text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-4">
              {/* Preview Image */}
              <div className="relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden border border-white/10 group-hover:border-cyan-500/30 transition-colors">
                <img 
                  src={SUGGESTED_INPUT.imageUrl} 
                  alt="Example layout" 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/80 group-hover:text-white transition-colors mb-2">
                  "{SUGGESTED_INPUT.prompt}"
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <span>🌿</span> {SUGGESTED_INPUT.style}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <span>🪵</span> {SUGGESTED_INPUT.material}
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <div className="w-10 h-10 rounded-full bg-white/5 group-hover:bg-cyan-500/20 flex items-center justify-center transition-all duration-300 flex-shrink-0">
                {isGenerating ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-cyan-400 rounded-full animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4 text-white/40 group-hover:text-cyan-400 transition-colors" />
                )}
              </div>
            </div>
          </button>
        </motion.div>

        {/* History List Section */}
        {session?.user && (projects.length > 0 || isLoadingHistory) && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="w-full max-w-6xl mt-20"
          >
            <div className="flex items-center gap-2 mb-6 px-2">
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
        <div className="mt-20 mb-8">
          <div className="px-6 py-3 rounded-full border border-cyan-500/30 bg-cyan-950/10 flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400 fill-cyan-400" />
            <span className="text-cyan-100 text-sm font-medium">Powered by FIBO JSON-Native Control</span>
          </div>
        </div>

      </main>
    </div>
  );
}
