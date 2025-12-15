'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useProjectStore } from '@/store/use-project-store';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Loader2, ChevronUp, ChevronDown, Code, Wand2, X } from 'lucide-react';
import { JsonPanel } from './json-panel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function CanvasArea() {
  const params = useParams();
  const projectId = params?.id as string;
  const { versions, currentVersionId, isGenerating, startGeneration, finishGeneration } = useProjectStore();
  const [isJsonSheetOpen, setIsJsonSheetOpen] = useState(false);
  const [isRefineOpen, setIsRefineOpen] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState('');
  
  const currentVersion = versions.find(v => v.id === currentVersionId);
  const currentConfig = currentVersion?.config || {};

  const handleRefine = async () => {
    if (!refinePrompt.trim() || !currentVersionId || !projectId) return;

    startGeneration();
    setIsRefineOpen(false);

    try {
      // Step 1: Generate JSON from prompt
      const jsonResponse = await fetch('/api/scene/generate-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'refine',
          prompt: refinePrompt,
          json_prompt: currentConfig,
          parent_id: currentVersionId,
        }),
      });

      if (!jsonResponse.ok) {
        const errorData = await jsonResponse.json();
        throw new Error(errorData.error || 'Failed to generate JSON');
      }

      const jsonData = await jsonResponse.json();

      // Step 2: Render image from JSON
      const renderResponse = await fetch('/api/scene/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json_prompt: jsonData.json_prompt,
          seed: Math.floor(Math.random() * 10000),
          steps: 50,
          variants: 1,
        }),
      });

      if (!renderResponse.ok) {
        const errorData = await renderResponse.json();
        throw new Error(errorData.error || 'Failed to render image');
      }

      const renderData = await renderResponse.json();

      // Step 3: Save version to database
      const versionResponse = await fetch(`/api/projects/${projectId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Refined: ${refinePrompt.substring(0, 30)}${refinePrompt.length > 30 ? '...' : ''}`,
          type: 'refine',
          imageUrl: renderData.images[0],
          configJson: jsonData.json_prompt,
          parentId: currentVersionId,
        }),
      });

      if (!versionResponse.ok) {
        const errorData = await versionResponse.json();
        throw new Error(errorData.error || 'Failed to save version');
      }

      const savedVersion = await versionResponse.json();

      // Step 4: Update store with new version
      const newVersion = {
        id: savedVersion.id,
        parentId: savedVersion.parentId,
        imageUrl: savedVersion.imageUrl,
        config: savedVersion.configJson,
        name: savedVersion.name,
        type: savedVersion.type,
        createdAt: new Date(savedVersion.createdAt),
      };

      finishGeneration(newVersion);
      setRefinePrompt('');
    } catch (error) {
      console.error('Error refining:', error);
      alert(`Failed to refine: ${(error as Error).message}`);
      finishGeneration({ id: '', parentId: null, imageUrl: '', config: {}, name: '', type: '' });
    }
  };

  return (
    <div className="flex-1 relative bg-[#2A2A2A] flex flex-col items-center justify-center overflow-hidden">
      <AnimatePresence mode="wait">
        {isGenerating ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 text-white/60"
          >
            <Loader2 className="w-12 h-12 animate-spin" />
            <p className="text-sm">Generating your design...</p>
          </motion.div>
        ) : currentVersion ? (
          <motion.div
            key={currentVersion.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className={cn(
              "relative w-full h-full flex items-center justify-center p-8 transition-all",
              isJsonSheetOpen ? "pb-[400px]" : "pb-8"
            )}
          >
            <div className="relative max-w-5xl max-h-full">
              <Image
                src={currentVersion.imageUrl}
                alt={currentVersion.name}
                width={1200}
                height={800}
                className="object-contain rounded-lg shadow-2xl"
                priority
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-white/40 text-center"
          >
            <p>Select a version or generate a new design</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Refine Panel */}
      {!isGenerating && currentVersion && (
        <AnimatePresence>
          {!isRefineOpen ? (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={() => setIsRefineOpen(true)}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-full shadow-[0_0_30px_rgba(168,85,247,0.5)] hover:shadow-[0_0_40px_rgba(168,85,247,0.7)] transition-all duration-300"
            >
              <Wand2 className="w-5 h-5" />
              <span className="font-medium">Refine with AI</span>
            </motion.button>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 w-[480px] max-w-[90vw]"
            >
              <div className="bg-[#15171B] rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/10 p-4 space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-purple-400" />
                    <h3 className="text-sm font-semibold text-white">Refine with AI</h3>
                  </div>
                  <button
                    onClick={() => setIsRefineOpen(false)}
                    className="text-white/40 hover:text-white/80 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Text Area */}
                <textarea
                  value={refinePrompt}
                  onChange={(e) => setRefinePrompt(e.target.value)}
                  placeholder="E.g., Make the living room more spacious, add a window..."
                  className="w-full h-20 bg-[#0F1115] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
                  autoFocus
                />

                {/* Action Button */}
                <Button
                  onClick={handleRefine}
                  disabled={!refinePrompt.trim()}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white border-0 shadow-[0_0_20px_rgba(168,85,247,0.3)] h-9 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate Refinement
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* JSON Logic Sheet - Accordion from bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-50">
        {/* Toggle Button */}
        <button
          onClick={() => setIsJsonSheetOpen(!isJsonSheetOpen)}
          className="w-full bg-[#15171B] border-t border-white/10 hover:bg-[#1E2128] transition-colors px-4 py-3 flex items-center justify-between text-white/80 hover:text-white"
        >
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4" />
            <span className="text-sm font-medium">JSON Logic</span>
          </div>
          {isJsonSheetOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </button>

        {/* Sheet Content */}
        <AnimatePresence>
          {isJsonSheetOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 400, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="bg-[#0B0C0E] border-t border-white/10 overflow-hidden"
            >
              <div className="h-[400px] flex flex-col">
                <div className="p-2 border-b border-white/5 bg-[#15171B] flex items-center gap-2">
                  <span className="text-xs font-mono text-green-400">
                    {currentVersion ? `"style": "${(currentConfig as { style?: string })?.style || 'default'}"` : 'No version selected'}
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  <JsonPanel json={currentConfig} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

