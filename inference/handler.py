"""FIBO Image Generation Handler with R2 Storage"""

import gc
import json
import os
import random
import time
import uuid
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Optional

import boto3
import runpod
import torch
from botocore.client import Config
from diffusers import BriaFiboPipeline
from huggingface_hub import login
from PIL import Image

# Aspect ratio to resolution mapping (width, height)
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


def upload_to_r2(image: Image.Image, filename: str) -> str:
    """Upload image to Cloudflare R2 and return public URL."""
    # Get R2 credentials from environment
    r2_endpoint = os.getenv("R2_ENDPOINT_URL")
    r2_access_key = os.getenv("R2_ACCESS_KEY_ID")
    r2_secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
    r2_bucket = os.getenv("R2_BUCKET_NAME")
    r2_public_url = os.getenv("R2_PUBLIC_URL")  # e.g., https://yourdomain.r2.dev
    
    if not all([r2_endpoint, r2_access_key, r2_secret_key, r2_bucket]):
        raise ValueError("R2 credentials not configured. Please set R2_* environment variables.")
    
    # Create S3 client for R2
    s3_client = boto3.client(
        "s3",
        endpoint_url=r2_endpoint,
        aws_access_key_id=r2_access_key,
        aws_secret_access_key=r2_secret_key,
        config=Config(signature_version="s3v4"),
    )
    
    # Convert image to bytes
    img_byte_arr = BytesIO()
    image.save(img_byte_arr, format="PNG")
    img_byte_arr.seek(0)
    
    # Upload to R2
    s3_client.upload_fileobj(
        img_byte_arr,
        r2_bucket,
        filename,
        ExtraArgs={"ContentType": "image/png"},
    )
    
    # Return public URL
    if r2_public_url:
        return f"{r2_public_url.rstrip('/')}/{filename}"
    else:
        return f"{r2_endpoint}/{r2_bucket}/{filename}"


def get_model_path() -> str:
    """
    Get the model path, checking network volume first, then fallback to HF Hub.
    
    Priority:
    1. Network volume path (if MODEL_CACHE_DIR is set)
    2. HuggingFace Hub model name
    """
    model_name = os.getenv("FIBO_MODEL_NAME", "briaai/FIBO")
    cache_dir = os.getenv("MODEL_CACHE_DIR")
    
    # Check if network volume is configured
    if cache_dir:
        cache_path = Path(cache_dir)
        # Check if model exists in cache
        # HuggingFace cache structure: models--<org>--<model>/snapshots/<hash>
        model_cache_name = model_name.replace("/", "--")
        potential_paths = [
            cache_path / model_cache_name,  # Direct path
            cache_path / f"models--{model_cache_name}",  # HF cache structure
        ]
        
        for path in potential_paths:
            if path.exists():
                print(f"✓ Found model in network volume: {path}")
                # Check for snapshots directory (HF cache structure)
                snapshots_dir = path / "snapshots"
                if snapshots_dir.exists():
                    # Get the latest snapshot
                    snapshots = list(snapshots_dir.iterdir())
                    if snapshots:
                        latest = max(snapshots, key=lambda p: p.stat().st_mtime)
                        print(f"✓ Using snapshot: {latest.name}")
                        return str(latest)
                return str(path)
        
        print(f"⚠ Model not found in network volume: {cache_dir}")
        print(f"⚠ Will download from HuggingFace Hub (this will be slow on first run)")
        print(f"⚠ Consider pre-downloading the model to the volume")
        # Set cache dir for HF to use the volume
        os.environ["HF_HOME"] = str(cache_path)
    
    print(f"→ Loading model from HuggingFace Hub: {model_name}")
    return model_name


def generate_image(
    pipeline,
    json_prompt: str,
    seed: int,
    steps: int,
    aspect_ratio: Optional[str],
    guidance_scale: float,
    negative_prompt: str = "",
) -> Image.Image:
    """Generate a single image with FIBO."""
    # Parse resolution
    width, height = parse_resolution(aspect_ratio)
    
    # Convert dict to JSON string if needed
    if isinstance(json_prompt, dict):
        json_prompt = json.dumps(json_prompt)
    
    # Set seed for reproducibility
    generator = None
    if seed >= 0:
        generator = torch.Generator(device="cuda").manual_seed(seed)
    
    # Generate image with torch.no_grad() to prevent gradient accumulation
    with torch.no_grad():
        result = pipeline(
            prompt=json_prompt,
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


def handler(job):
    """Handler function for FIBO image generation."""
    try:
        # Log initial memory state
        log_memory_usage("Start of request")
        
        job_input = job["input"]
        
        # Parse input parameters
        json_prompt = job_input.get("json_prompt")
        seed = job_input.get("seed", -1)
        steps = job_input.get("steps", 50)
        variants = job_input.get("variants", 1)
        aspect_ratio = job_input.get("aspect_ratio", "1:1")
        guidance_scale = job_input.get("guidance_scale", 5.0)
        negative_prompt = job_input.get("negative_prompt", "")
        
        # Validate inputs
        if not json_prompt:
            return {"error": "json_prompt is required"}
        
        if variants < 1 or variants > 10:
            return {"error": "variants must be between 1 and 10"}
        
        if steps < 1 or steps > 100:
            return {"error": "steps must be between 1 and 100"}
        
        # Generate images
        results = []
        start_time = time.perf_counter()
        
        for i in range(variants):
            # Use provided seed or generate random seed for each variant
            variant_seed = seed if seed >= 0 else random.randint(0, 2**32 - 1)
            if variants > 1 and seed >= 0:
                # Add offset for multiple variants with fixed seed
                variant_seed = seed + i
            
            print(f"Generating variant {i+1}/{variants} with seed {variant_seed}")
            log_memory_usage(f"Before generation {i+1}")
            
            # Generate image
            image = generate_image(
                pipeline=PIPELINE,
                json_prompt=json_prompt,
                seed=variant_seed,
                steps=steps,
                aspect_ratio=aspect_ratio,
                guidance_scale=guidance_scale,
                negative_prompt=negative_prompt,
            )
            
            # Upload to R2 immediately and release image memory
            filename = f"fibo-{uuid.uuid4()}.png"
            url = upload_to_r2(image, filename)
            
            results.append({
                "url": url,
                "seed": variant_seed,
                "filename": filename,
            })
            
            # Explicitly delete the image to free memory
            del image
            
            # Clear GPU cache after each generation
            clear_gpu_memory()
            log_memory_usage(f"After generation {i+1}")
            
            print(f"Generated and uploaded: {url}")
        
        elapsed = time.perf_counter() - start_time
        
        # Final memory cleanup
        clear_gpu_memory()
        log_memory_usage("End of request")
        
        return {
            "images": results,
            "generation_time": elapsed,
            "parameters": {
                "steps": steps,
                "guidance_scale": guidance_scale,
                "aspect_ratio": aspect_ratio,
                "variants": variants,
            },
        }
    
    except Exception as e:
        print(f"Error in handler: {str(e)}")
        import traceback
        traceback.print_exc()
        # Clean up on error
        clear_gpu_memory()
        return {"error": str(e)}


# Initialize pipeline on startup
print("=" * 60)
print("FIBO Worker Initialization")
print("=" * 60)

PIPELINE = None

try:
    # Login to Hugging Face if token is provided (required for gated models)
    hf_token = os.getenv("HF_TOKEN")
    if hf_token:
        print("Logging in to Hugging Face...")
        login(token=hf_token)
        print("✓ Successfully logged in to Hugging Face")
    else:
        print("⚠ No HF_TOKEN provided - skipping Hugging Face login")
        print("  (This is fine if the model is not gated)")
    
    assert torch.cuda.is_available(), "CUDA not available"
    print(f"✓ CUDA available: {torch.cuda.get_device_name(0)}")
    
    # Get model path (network volume or HF Hub)
    model_path = get_model_path()
    
    print(f"Loading FIBO pipeline from: {model_path}")
    load_start = time.perf_counter()
    
    PIPELINE = BriaFiboPipeline.from_pretrained(
        model_path,
        torch_dtype=torch.bfloat16,
    )
    PIPELINE.to("cuda")
    
    load_time = time.perf_counter() - load_start
    print(f"✓ FIBO pipeline loaded in {load_time:.2f}s")
    
    # MEMORY OPTIMIZATION: Try to enable VAE tiling if available
    # Note: BriaFiboPipeline may not support all standard diffusers optimizations
    if hasattr(PIPELINE, 'enable_vae_tiling'):
        try:
            print(f"✓ Enabling VAE tiling (reduces VRAM usage for high-res images)")
            PIPELINE.enable_vae_tiling()
        except Exception as e:
            print(f"⚠ Could not enable VAE tiling: {e}")
    
    # MEMORY OPTIMIZATION: Try to enable attention slicing if available
    if hasattr(PIPELINE, 'enable_attention_slicing'):
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
    print("✓ Worker ready to process requests")
    print("=" * 60)
    
except Exception as e:
    print(f"✗ Failed to load FIBO pipeline: {str(e)}")
    import traceback
    traceback.print_exc()
    raise

# Start RunPod serverless handler
runpod.serverless.start({"handler": handler})
