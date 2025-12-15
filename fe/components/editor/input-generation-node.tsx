'use client';

import { memo, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Play, Settings, Loader2, Image as ImageIcon, X, Camera, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { uploadImage } from '@/app/actions/upload';
import { Slider } from '@/components/ui/slider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export type InputNodeData = {
  label: string;
  prompt?: string;
  numberOfOutputs?: number;
  referenceImages?: string[]; // Array of URLs/base64 strings
  viewType?: '3d' | 'room';
  cameraAngle?: {
    position: string;
    fov: number;
  };
  lighting?: {
    type: 'natural' | 'warm' | 'cool' | 'dramatic' | 'soft';
    intensity: number;
  };
  isGenerating?: boolean;
  onRun?: () => void;
  onPromptChange?: (prompt: string) => void;
  onAddReferenceImage?: (image: string) => void;
  onRemoveReferenceImage?: (index: number) => void;
  onOutputsChange?: (count: number) => void;
  onViewTypeChange?: (type: '3d' | 'room') => void;
  onCameraChange?: (camera: { position: string; fov: number }) => void;
  onLightingChange?: (lighting: { type: 'natural' | 'warm' | 'cool' | 'dramatic' | 'soft'; intensity: number }) => void;
};

const CAMERA_POSITIONS = [
  { id: 'eye-level', label: 'Eye Level' },
  { id: 'birds-eye', label: 'Birds Eye' },
  { id: 'low-angle', label: 'Low Angle' },
  { id: 'corner', label: 'Corner' },
];

const LIGHTING_TYPES = [
  { id: 'natural', label: 'Natural', icon: '☀️' },
  { id: 'warm', label: 'Warm', icon: '🔥' },
  { id: 'cool', label: 'Cool', icon: '❄️' },
  { id: 'dramatic', label: 'Dramatic', icon: '🌙' },
  { id: 'soft', label: 'Soft', icon: '✨' },
];

export const InputGenerationNode = memo(({ data, selected }: NodeProps<Node<InputNodeData>>) => {
  const [localPrompt, setLocalPrompt] = useState(data.prompt || '');


  const [isUploading, setIsUploading] = useState(false);

  const handlePromptBlur = () => {
    if (data.onPromptChange) {
      data.onPromptChange(localPrompt);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && data.onAddReferenceImage) {
      try {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        const url = await uploadImage(formData);
        data.onAddReferenceImage(url);
      } catch (error) {
        console.error('Failed to upload image:', error);
      } finally {
        setIsUploading(false);
      }
    }
    e.target.value = '';
  };

  const hasReferenceImages = data.referenceImages && data.referenceImages.length > 0;

  // Defaults if not provided (safety)
  const camera = data.cameraAngle || { position: 'eye-level', fov: 75 };
  const lighting = data.lighting || { type: 'natural', intensity: 80 };

  return (
    <div 
      className={cn(
        "bg-[#1E2128] rounded-lg border-2 transition-all min-w-[320px] max-w-[360px]",
        selected ? "border-blue-500 shadow-blue-500/50" : "border-white/10",
        data.isGenerating && "ring-2 ring-blue-500/50 animate-pulse"
      )}
    >
      {/* Reference Image Input Handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="reference"
        className="w-3 h-3 !bg-purple-500 !border-2 !border-white"
        style={{ top: '30%' }}
      />

      {/* Header */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-blue-600/20 to-cyan-600/20">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center">
            <ImageIcon className="w-3 h-3 text-white" />
          </div>
          <span className="text-xs font-semibold text-white/90 uppercase tracking-wide">
            {data.label}
          </span>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-3 space-y-4">
        {/* Reference Images Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-[10px] text-white/40 uppercase tracking-wide">Reference Images</span>
            </div>
            
            <label className="cursor-pointer text-[10px] text-blue-400 hover:text-blue-300 transition-colors font-medium flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                <span className="text-xs leading-none">+</span>
              </div>
              Add Image
              <input 
                type="file" 
                className="hidden" 
                accept="image/*"
                onChange={handleImageUpload}
              />
            </label>
          </div>
          
          {hasReferenceImages ? (
            <div className={cn(
              "grid gap-2",
              data.referenceImages!.length === 1 ? "grid-cols-1" : "grid-cols-2"
            )}>
              {data.referenceImages!.map((img, idx) => (
                <div key={idx} className="relative aspect-[4/3] rounded-md overflow-hidden bg-[#0F1115] border border-purple-500/30 group">
                  <img
                    src={img}
                    alt={`Reference ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => data.onRemoveReferenceImage?.(idx)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-red-500/80 text-white flex items-center justify-center border border-white/20 transition-all opacity-0 group-hover:opacity-100"
                    title="Remove image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <label className={cn(
              "flex flex-col items-center justify-center w-full aspect-[4/3] rounded-md border border-dashed bg-[#0F1115] transition-all cursor-pointer",
              isUploading 
                ? "border-blue-500/50 cursor-wait" 
                : "text-white/20 border-white/10 hover:bg-[#15171B] hover:text-white/40 hover:border-white/20"
            )}>
              {isUploading ? (
                <>
                  <Loader2 className="w-8 h-8 mb-2 animate-spin text-blue-500" />
                  <span className="text-[10px] font-medium text-blue-500">Uploading...</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                  <span className="text-[10px] font-medium">Upload Reference Image</span>
                </>
              )}
              <input 
                type="file" 
                className="hidden" 
                accept="image/*"
                onChange={handleImageUpload}
                disabled={isUploading}
              />
            </label>
          )}
        </div>

        {/* Prompt Input */}
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-[10px] text-white/40 uppercase tracking-wide">Prompt</span>
          </div>
          <textarea
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            onBlur={handlePromptBlur}
            placeholder="Describe what you want to generate..."
            className="w-full h-20 bg-[#0F1115] border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder:text-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
          />
        </div>

        {/* View Type Tabs */}
        <div className="space-y-1">
          <span className="text-[10px] text-white/40 uppercase tracking-wide">View Type</span>
          <Tabs 
            value={data.viewType || '3d'} 
            onValueChange={(value) => data.onViewTypeChange?.(value as '3d' | 'room')}
            className="w-full"
          >
            <TabsList className="w-full bg-[#0F1115] border border-white/10">
              <TabsTrigger value="3d" className="flex-1 text-xs data-[state=active]:bg-blue-600">
                3D View
              </TabsTrigger>
              <TabsTrigger value="room" className="flex-1 text-xs data-[state=active]:bg-blue-600">
                Room View
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Number of Outputs */}
        <div className="space-y-1">
          <span className="text-[10px] text-white/40 uppercase tracking-wide">Outputs</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((num) => (
              <button
                key={num}
                onClick={() => data.onOutputsChange?.(num)}
                className={cn(
                  "flex-1 py-1.5 rounded text-xs font-medium transition-all",
                  (data.numberOfOutputs || 1) === num
                    ? "bg-blue-600 text-white"
                    : "bg-[#0F1115] text-white/60 hover:bg-[#1A1D25] hover:text-white border border-white/10"
                )}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Settings Accordion */}
        <Accordion type="single" collapsible className="w-full border-none">
          <AccordionItem value="advanced" className="border-none">
            <AccordionTrigger className="py-2 text-[10px] text-white/60 hover:text-white uppercase tracking-wide hover:no-underline font-normal">
              Advanced Settings
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              {/* Camera Settings */}
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Camera className="w-3 h-3 text-blue-400" />
                  <span className="text-[10px] text-white/40 uppercase tracking-wide">Camera</span>
                </div>
                
                <div className="grid grid-cols-2 gap-1.5">
                  {CAMERA_POSITIONS.map((pos) => (
                    <button
                      key={pos.id}
                      onClick={() => data.onCameraChange?.({ ...camera, position: pos.id })}
                      className={cn(
                        "py-1.5 px-2 rounded border text-[10px] transition-all truncate",
                        camera.position === pos.id
                          ? "border-blue-500 bg-blue-500/10 text-white"
                          : "border-white/10 bg-[#0F1115] text-white/60 hover:text-white hover:bg-[#1A1D25]"
                      )}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
                
                <div className="flex items-center gap-2 pt-1">
                   <span className="text-[10px] text-white/40 min-w-[30px]">FOV</span>
                   <Slider
                      value={[camera.fov]}
                      onValueChange={(val) => data.onCameraChange?.({ ...camera, fov: val[0] })}
                      min={30}
                      max={120}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-[10px] text-white/60 w-[24px] text-right">{camera.fov}°</span>
                </div>
              </div>

              {/* Lighting Settings */}
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Sun className="w-3 h-3 text-yellow-400" />
                  <span className="text-[10px] text-white/40 uppercase tracking-wide">Lighting</span>
                </div>
                
                <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                  {LIGHTING_TYPES.map((light) => (
                    <button
                      key={light.id}
                      onClick={() => data.onLightingChange?.({ ...lighting, type: light.id as any })}
                      className={cn(
                        "flex-1 min-w-[50px] py-1.5 rounded border text-center transition-all",
                        lighting.type === light.id
                          ? "border-yellow-500 bg-yellow-500/10 text-white"
                          : "border-white/10 bg-[#0F1115] text-white/60 hover:text-white hover:bg-[#1A1D25]"
                      )}
                      title={light.label}
                    >
                      <div className="text-sm mb-0.5">{light.icon}</div>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                   <span className="text-[10px] text-white/40 min-w-[30px]">Int</span>
                   <Slider
                      value={[lighting.intensity]}
                      onValueChange={(val) => data.onLightingChange?.({ ...lighting, intensity: val[0] })}
                      min={0}
                      max={100}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-[10px] text-white/60 w-[24px] text-right">{lighting.intensity}%</span>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Run Button */}
      <div className="px-3 pb-3">
        <Button
          onClick={data.onRun}
          disabled={data.isGenerating || !localPrompt.trim()}
          className={cn(
            "w-full h-9 text-xs font-medium transition-all",
            data.isGenerating
              ? "bg-blue-600 cursor-not-allowed"
              : "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-[0_0_15px_rgba(37,99,235,0.3)]"
          )}
        >
          {data.isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-1.5" />
              Run Generation
            </>
          )}
        </Button>
      </div>

      {/* Output Handles (right side) */}
      {Array.from({ length: data.numberOfOutputs || 1 }).map((_, idx) => (
        <Handle
          key={`output-${idx}`}
          type="source"
          position={Position.Right}
          id={`output-${idx}`}
          className="w-3 h-3 !bg-cyan-500 !border-2 !border-white"
          style={{ 
            top: `${30 + (idx * (40 / (data.numberOfOutputs || 1)))}%`,
          }}
        />
      ))}
    </div>
  );
});

InputGenerationNode.displayName = 'InputGenerationNode';

