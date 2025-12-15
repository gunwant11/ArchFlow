"""
FastAPI Server for Local Testing
Run this locally to test FIBO inference before deploying to RunPod.

Usage:
    python server.py

Then visit: http://localhost:8000/docs
"""

import gc
import io
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import torch
import uvicorn
from diffusers import BriaFiboPipeline
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image
from pydantic import BaseModel, Field

# Initialize FastAPI app
app = FastAPI(
    title="FIBO Image Generation API",
    description="Local testing server for FIBO model inference",
    version="1.0.0",
)

# Aspect ratio to resolution mapping
ASPECT_RATIOS = {
    "1:1": (1024, 1024),
    "16:9": (1344, 768),
    "9:16": (768, 1344),
    "4:3": (1152, 896),
    "3:4": (896, 1152),
    "21:9": (1280, 800),
    "9:21": (800, 1280),
    "5:4": (1088, 960),
    "4:5": (960, 1088),
    "3:2": (1216, 832),
    "2:3": (832, 1216),
}

# Global pipeline instance
PIPELINE = None
OUTPUT_DIR = Path("./outputs")
OUTPUT_DIR.mkdir(exist_ok=True)


# GPU Memory Management Utilities
def get_gpu_memory_info():
    """Get current GPU memory usage."""
    if not torch.cuda.is_available():
        return None
    
    return {
        "allocated_gb": torch.cuda.memory_allocated() / 1024**3,
        "reserved_gb": torch.cuda.memory_reserved() / 1024**3,
        "max_allocated_gb": torch.cuda.max_memory_allocated() / 1024**3,
    }


def clear_gpu_memory():
    """Aggressively clear GPU memory."""
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()
    gc.collect()


def log_memory_usage(stage: str):
    """Log current GPU memory usage."""
    memory_info = get_gpu_memory_info()
    if memory_info:
        print(f"[{stage}] GPU Memory: "
              f"Allocated={memory_info['allocated_gb']:.2f}GB, "
              f"Reserved={memory_info['reserved_gb']:.2f}GB, "
              f"Peak={memory_info['max_allocated_gb']:.2f}GB")


# Request/Response Models
class GenerateRequest(BaseModel):
    json_prompt: Dict[str, Any] = Field(..., description="FIBO structured prompt")
    seed: int = Field(-1, description="Random seed, -1 for random")
    steps: int = Field(50, ge=1, le=100, description="Number of inference steps")
    variants: int = Field(1, ge=1, le=10, description="Number of images to generate")
    aspect_ratio: str = Field("1:1", description="Aspect ratio (e.g., '16:9', '1:1')")
    guidance_scale: float = Field(5.0, description="Classifier-free guidance scale")
    negative_prompt: str = Field("", description="Negative prompt (optional)")
    return_base64: bool = Field(False, description="Return base64 encoded images instead of files")

    class Config:
        json_schema_extra = {
            "example": {
                "json_prompt": {
                    "short_description": "A serene mountain landscape at sunset",
                    "style_medium": "photography",
                    "artistic_style": "realistic",
                    "lighting": "golden hour",
                    "color_palette": "warm tones",
                    "mood": "peaceful",
                },
                "seed": 42,
                "steps": 50,
                "variants": 1,
                "aspect_ratio": "16:9",
                "guidance_scale": 5.0,
            }
        }


class ImageResult(BaseModel):
    filename: str
    seed: int
    path: Optional[str] = None
    base64: Optional[str] = None


class GenerateResponse(BaseModel):
    images: List[ImageResult]
    generation_time: float
    parameters: Dict[str, Any]


# Helper functions
def parse_resolution(aspect_ratio: Optional[str] = None) -> tuple[int, int]:
    """Parse aspect ratio or return default resolution."""
    if not aspect_ratio:
        return ASPECT_RATIOS["1:1"]
    
    aspect_ratio = aspect_ratio.strip()
    if aspect_ratio in ASPECT_RATIOS:
        return ASPECT_RATIOS[aspect_ratio]
    
    # Try to parse as "width:height"
    parts = aspect_ratio.replace("x", ":").split(":")
    if len(parts) == 2:
        try:
            width, height = int(parts[0].strip()), int(parts[1].strip())
            # Find closest standard resolution
            for ratio, (w, h) in ASPECT_RATIOS.items():
                if abs(width / height - w / h) < 0.1:
                    return (w, h)
        except ValueError:
            pass
    
    # Default to 1:1
    return ASPECT_RATIOS["1:1"]


def generate_image(
    json_prompt: Dict[str, Any],
    seed: int,
    steps: int,
    aspect_ratio: Optional[str],
    guidance_scale: float,
    negative_prompt: str = "",
) -> Image.Image:
    """Generate a single image with FIBO."""
    # Parse resolution
    width, height = parse_resolution(aspect_ratio)
    
    # Convert dict to JSON string
    if isinstance(json_prompt, dict):
        json_prompt_str = json.dumps(json_prompt)
    else:
        json_prompt_str = json_prompt
    
    # Set seed for reproducibility
    generator = None
    if seed >= 0:
        generator = torch.Generator(device="cuda" if torch.cuda.is_available() else "cpu").manual_seed(seed)
    
    # Generate image with torch.no_grad() to prevent gradient accumulation
    with torch.no_grad():
        result = PIPELINE(
            prompt=json_prompt_str,
            num_inference_steps=steps,
            negative_prompt=negative_prompt,
            generator=generator,
            width=width,
            height=height,
            guidance_scale=guidance_scale,
        )
    
    # Get the image and immediately delete the result object
    image = result.images[0]
    del result
    
    return image


# API Endpoints
@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "FIBO Image Generation API",
        "version": "1.0.0",
        "status": "ready" if PIPELINE else "initializing",
        "endpoints": {
            "docs": "/docs",
            "generate": "/generate",
            "health": "/health",
        },
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    if PIPELINE is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    health_info = {
        "status": "healthy",
        "cuda_available": torch.cuda.is_available(),
        "device": str(torch.cuda.get_device_name(0)) if torch.cuda.is_available() else "cpu",
    }
    
    # Add GPU memory info if available
    memory_info = get_gpu_memory_info()
    if memory_info:
        health_info["gpu_memory"] = memory_info
    
    return health_info


@app.get("/aspect-ratios")
async def list_aspect_ratios():
    """List available aspect ratios."""
    return {
        "aspect_ratios": {
            ratio: {"width": w, "height": h, "resolution": f"{w}x{h}"}
            for ratio, (w, h) in ASPECT_RATIOS.items()
        }
    }


@app.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest):
    """
    Generate images using FIBO model.
    
    Images are saved to ./outputs/ directory.
    """
    if PIPELINE is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Log initial memory state
        log_memory_usage("Start of request")
        
        # Validate inputs
        if request.variants < 1 or request.variants > 10:
            raise HTTPException(status_code=400, detail="variants must be between 1 and 10")
        
        if request.steps < 1 or request.steps > 100:
            raise HTTPException(status_code=400, detail="steps must be between 1 and 100")
        
        # Generate images
        results = []
        start_time = time.perf_counter()
        
        for i in range(request.variants):
            # Use provided seed or generate random seed for each variant
            import random
            variant_seed = request.seed if request.seed >= 0 else random.randint(0, 2**32 - 1)
            if request.variants > 1 and request.seed >= 0:
                variant_seed = request.seed + i
            
            # Set seed for reproducibility
            if variant_seed >= 0:
                random.seed(variant_seed)
                torch.manual_seed(variant_seed)
                if torch.cuda.is_available():
                    torch.cuda.manual_seed_all(variant_seed)
            
            print(f"Generating variant {i+1}/{request.variants} with seed {variant_seed}")
            log_memory_usage(f"Before generation {i+1}")
            
            # Generate image
            image = generate_image(
                json_prompt=request.json_prompt,
                seed=variant_seed,
                steps=request.steps,
                aspect_ratio=request.aspect_ratio,
                guidance_scale=request.guidance_scale,
                negative_prompt=request.negative_prompt,
            )
            
            # Save or encode image immediately to release memory
            filename = f"fibo-{uuid.uuid4()}.png"
            
            if request.return_base64:
                # Convert to base64
                import base64
                buffer = io.BytesIO()
                image.save(buffer, format="PNG")
                buffer.seek(0)
                base64_str = base64.b64encode(buffer.read()).decode()
                buffer.close()
                
                results.append({
                    "filename": filename,
                    "seed": variant_seed,
                    "base64": base64_str,
                })
            else:
                # Save to disk
                output_path = OUTPUT_DIR / filename
                image.save(output_path)
                
                results.append({
                    "filename": filename,
                    "seed": variant_seed,
                    "path": str(output_path),
                })
            
            # Explicitly delete the image to free memory
            del image
            
            # Clear GPU cache after each generation
            clear_gpu_memory()
            log_memory_usage(f"After generation {i+1}")
            
            print(f"Generated: {filename}")
        
        elapsed = time.perf_counter() - start_time
        
        # Final memory cleanup
        clear_gpu_memory()
        log_memory_usage("End of request")
        
        return {
            "images": results,
            "generation_time": elapsed,
            "parameters": {
                "steps": request.steps,
                "guidance_scale": request.guidance_scale,
                "aspect_ratio": request.aspect_ratio,
                "variants": request.variants,
            },
        }
    
    except Exception as e:
        print(f"Error generating images: {str(e)}")
        import traceback
        traceback.print_exc()
        # Clean up on error
        clear_gpu_memory()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/image/{filename}")
async def get_image(filename: str):
    """Retrieve a generated image by filename."""
    image_path = OUTPUT_DIR / filename
    
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Return image as streaming response
    def iterfile():
        with open(image_path, "rb") as f:
            yield from f
    
    return StreamingResponse(iterfile(), media_type="image/png")


# Startup event
@app.on_event("startup")
async def startup_event():
    """Load model on startup."""
    global PIPELINE
    
    print("=" * 60)
    print("FIBO Server Initialization")
    print("=" * 60)
    
    try:
        if not torch.cuda.is_available():
            print("⚠ WARNING: CUDA not available, running on CPU (will be very slow)")
            device = "cpu"
        else:
            print(f"✓ CUDA available: {torch.cuda.get_device_name(0)}")
            device = "cuda"
        
        # Get model path
        model_name = os.getenv("FIBO_MODEL_NAME", "briaai/FIBO")
        cache_dir = os.getenv("MODEL_CACHE_DIR")
        
        if cache_dir:
            print(f"→ Using cache directory: {cache_dir}")
            os.environ["HF_HOME"] = cache_dir
        
        print(f"→ Loading model: {model_name}")
        load_start = time.perf_counter()
        
        PIPELINE = BriaFiboPipeline.from_pretrained(
            model_name,
            torch_dtype=torch.bfloat16 if device == "cuda" else torch.float32,
        )
        PIPELINE.to(device)
        
        load_time = time.perf_counter() - load_start
        print(f"✓ Model loaded in {load_time:.2f}s")
        
        # MEMORY OPTIMIZATION: Try to enable VAE tiling if available
        # Note: BriaFiboPipeline may not support all standard diffusers optimizations
        if device == "cuda" and hasattr(PIPELINE, 'enable_vae_tiling'):
            try:
                print(f"✓ Enabling VAE tiling (reduces VRAM usage for high-res images)")
                PIPELINE.enable_vae_tiling()
            except Exception as e:
                print(f"⚠ Could not enable VAE tiling: {e}")
        
        # MEMORY OPTIMIZATION: Try to enable attention slicing if available
        if device == "cuda" and hasattr(PIPELINE, 'enable_attention_slicing'):
            attention_slice = os.getenv("ATTENTION_SLICE", "auto")
            if attention_slice.lower() != "none":
                try:
                    slice_size = attention_slice if attention_slice != "auto" else "auto"
                    print(f"✓ Enabling attention slicing: {slice_size}")
                    PIPELINE.enable_attention_slicing(slice_size=slice_size if slice_size != "auto" else None)
                except Exception as e:
                    print(f"⚠ Could not enable attention slicing: {e}")
        
        # Enable TeaCache if configured
        enable_teacache = os.getenv("ENABLE_TEACACHE", "false").lower() == "true"
        if enable_teacache:
            teacache_threshold = float(os.getenv("TEACACHE_THRESHOLD", "1.0"))
            print(f"✓ Enabling TeaCache with threshold={teacache_threshold}")
            PIPELINE.enable_teacache(num_inference_steps=50, rel_l1_thresh=teacache_threshold)
        
        # Enable CPU offload if configured (aggressive memory saving)
        enable_cpu_offload = os.getenv("ENABLE_CPU_OFFLOAD", "false").lower() == "true"
        if enable_cpu_offload:
            print(f"✓ Enabling CPU offload (aggressive VRAM reduction, slower inference)")
            PIPELINE.enable_model_cpu_offload()
        
        # Log initial memory usage
        log_memory_usage("Model loaded")
        
        print("=" * 60)
        print("✓ Server ready!")
        print("=" * 60)
        print(f"→ API docs: http://localhost:8000/docs")
        print(f"→ Output directory: {OUTPUT_DIR.absolute()}")
        print("=" * 60)
        
    except Exception as e:
        print(f"✗ Failed to load model: {str(e)}")
        import traceback
        traceback.print_exc()
        # Don't raise - let server start anyway so health endpoint works
        PIPELINE = None


# Main entry point
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Run FIBO inference server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development")
    
    args = parser.parse_args()
    
    uvicorn.run(
        "server:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )
