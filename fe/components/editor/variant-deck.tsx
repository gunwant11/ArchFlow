'use client';

import { motion } from 'framer-motion';
import { useProjectStore } from '@/store/use-project-store';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export function VariantDeck() {
  const { versions, currentVersionId, selectVersion } = useProjectStore();
  
  const currentVersion = versions.find(v => v.id === currentVersionId);
  const siblings = currentVersion 
    ? versions.filter(v => v.parentId === currentVersion.parentId)
    : [];

  // If only 1 variant (itself), don't show deck unless we want to show "history"
  if (siblings.length <= 1) return null;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="absolute bottom-8 left-8 right-8 flex justify-center pointer-events-none"
    >
        <div className="bg-[#15171B]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2 pointer-events-auto shadow-2xl">
            <div className="flex items-center gap-1 mb-2 px-2">
                <span className="text-[10px] font-medium text-white/60 uppercase tracking-wider">Variant Deck</span>
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-1 px-1 max-w-[600px] scrollbar-hide">
                {siblings.map((variant, idx) => {
                    const isSelected = variant.id === currentVersionId;
                    return (
                        <button
                            key={variant.id}
                            onClick={() => selectVersion(variant.id)}
                            className={cn(
                                "group relative flex-shrink-0 w-32 rounded-lg overflow-hidden transition-all border-2",
                                isSelected ? "border-cyan-500 ring-2 ring-cyan-500/20 scale-105" : "border-transparent hover:border-white/20 opacity-70 hover:opacity-100"
                            )}
                        >
                            <div className="aspect-video relative bg-[#1E2128]">
                                <Image
                                    src={variant.imageUrl}
                                    alt={variant.name}
                                    fill
                                    className="object-cover"
                                />
                                <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                            </div>
                            <div className="bg-[#1E2128] p-1.5 text-left">
                                <p className="text-[10px] font-medium text-white truncate">Variation {idx + 1}</p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    </motion.div>
  );
}
