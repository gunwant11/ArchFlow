import { Plus, Hand, Settings, Palette, Home, Box, Info, MousePointer2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { useProjectStore } from '@/store/use-project-store';
import { COLOR_PALETTES, INTERIOR_STYLES, MATERIALS } from '@/lib/constants';

type Tool = 'select' | 'add' | 'pan';

type NodeToolbarProps = {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  onAddNode: () => void;
};



export function NodeToolbar({ activeTool, onToolChange, onAddNode }: NodeToolbarProps) {
  const { globalSettings, updateGlobalSettings } = useProjectStore();

  const toggleMaterial = (materialId: string) => {
    const currentMaterials = globalSettings.materials;
    const newMaterials = currentMaterials.includes(materialId)
      ? currentMaterials.filter(m => m !== materialId)
      : [...currentMaterials, materialId];
    
    updateGlobalSettings({ materials: newMaterials });
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2 bg-[#1E2128] border border-white/10 rounded-lg p-2 shadow-xl">
        {/* Core Tools */}
        <div className="flex flex-col gap-2 border-b border-white/10 pb-2 mb-1">
           <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onAddNode}
                className="w-14 h-14 flex flex-col items-center justify-center rounded-md transition-all gap-1 bg-[#15171B] text-white/60 hover:text-white hover:bg-[#2A2F3A]"
              >
                <Plus className="w-5 h-5" />
                <span className="text-[9px] font-medium leading-none">Add</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#0F1115] border-white/10 text-white">
              Add Node
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onToolChange('select')}
                className={cn(
                  'w-14 h-14 flex flex-col items-center justify-center rounded-md transition-all gap-1',
                  activeTool === 'select'
                    ? 'bg-cyan-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.5)]'
                    : 'bg-[#15171B] text-white/60 hover:text-white hover:bg-[#2A2F3A]'
                )}
              >
                <MousePointer2 className="w-5 h-5" />
                <span className="text-[9px] font-medium leading-none">Select</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#0F1115] border-white/10 text-white">
              Select
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onToolChange('pan')}
                className={cn(
                  'w-14 h-14 flex flex-col items-center justify-center rounded-md transition-all gap-1',
                  activeTool === 'pan'
                    ? 'bg-cyan-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.5)]'
                    : 'bg-[#15171B] text-white/60 hover:text-white hover:bg-[#2A2F3A]'
                )}
              >
                <Hand className="w-5 h-5" />
                <span className="text-[9px] font-medium leading-none">Pan</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#0F1115] border-white/10 text-white">
              Pan
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Global Settings Tools */}
        <div className="w-8 h-[1px] bg-white/10 rounded-full mx-auto" />
        
        {/* Color Palette */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button className="w-14 h-14 flex flex-col items-center justify-center rounded-md transition-all gap-1 bg-[#15171B] text-white/60 hover:text-white hover:bg-[#2A2F3A]">
                  <Palette className="w-5 h-5 text-purple-400" />
                  <span className="text-[9px] font-medium leading-none">Colors</span>
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#0F1115] border-white/10 text-white">
              Color Palette
            </TooltipContent>
          </Tooltip>
          <PopoverContent side="right" align="start" sideOffset={20} className="w-[300px] border-white/10 bg-[#1E2128]">
            <div className="space-y-4">
              <h4 className="font-medium text-white text-sm flex items-center gap-2">
                <Palette className="w-4 h-4 text-purple-400" /> Color Palette
              </h4>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {COLOR_PALETTES.map((palette) => (
                  <button
                    key={palette.name}
                    onClick={() => updateGlobalSettings({ colorPalette: palette.colors })}
                    className={cn(
                      "w-full p-2 rounded border transition-all flex items-center justify-between group hover:border-purple-500/50",
                      JSON.stringify(globalSettings.colorPalette) === JSON.stringify(palette.colors)
                        ? "border-purple-500 bg-purple-500/10"
                        : "border-white/10 bg-[#15171B]"
                    )}
                  >
                    <span className="text-xs text-white/80">{palette.name}</span>
                    <div className="flex gap-1">
                      {Object.values(palette.colors).slice(0, 3).map((color, idx) => (
                        <div
                          key={idx}
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Interior Style */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button className="w-14 h-14 flex flex-col items-center justify-center rounded-md transition-all gap-1 bg-[#15171B] text-white/60 hover:text-white hover:bg-[#2A2F3A]">
                  <Home className="w-5 h-5 text-cyan-400" />
                  <span className="text-[9px] font-medium leading-none">Style</span>
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#0F1115] border-white/10 text-white">
              Interior Style
            </TooltipContent>
          </Tooltip>
          <PopoverContent side="right" align="start" sideOffset={20} className="w-[280px] border-white/10 bg-[#1E2128]">
            <div className="space-y-4">
              <h4 className="font-medium text-white text-sm flex items-center gap-2">
                <Home className="w-4 h-4 text-cyan-400" /> Interior Style
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {INTERIOR_STYLES.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => updateGlobalSettings({ interiorStyle: style.id as any })}
                    className={cn(
                      "p-3 rounded border transition-all text-center",
                      globalSettings.interiorStyle === style.id
                        ? "border-cyan-500 bg-cyan-500/10"
                        : "border-white/10 bg-[#15171B] hover:border-cyan-500/50"
                    )}
                  >
                    <div className="text-xl mb-1">{style.icon}</div>
                    <div className="text-[10px] text-white/80">{style.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Materials */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button className="w-14 h-14 flex flex-col items-center justify-center rounded-md transition-all gap-1 bg-[#15171B] text-white/60 hover:text-white hover:bg-[#2A2F3A]">
                  <Box className="w-5 h-5 text-green-400" />
                  <span className="text-[9px] font-medium leading-none">Material</span>
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#0F1115] border-white/10 text-white">
              Materials
            </TooltipContent>
          </Tooltip>
          <PopoverContent side="right" align="start" sideOffset={20} className="w-[280px] border-white/10 bg-[#1E2128]">
            <div className="space-y-4">
              <h4 className="font-medium text-white text-sm flex items-center gap-2">
                <Box className="w-4 h-4 text-green-400" /> Materials
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {MATERIALS.map((material) => (
                  <button
                    key={material.id}
                    onClick={() => toggleMaterial(material.id)}
                    className={cn(
                      "p-3 rounded border transition-all text-center",
                      globalSettings.materials.includes(material.id)
                        ? "border-green-500 bg-green-500/10"
                        : "border-white/10 bg-[#15171B] hover:border-green-500/50"
                    )}
                  >
                    <div className="text-xl mb-1">{material.icon}</div>
                    <div className="text-[10px] text-white/80">{material.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

      </div>
    </TooltipProvider>
  );
}

