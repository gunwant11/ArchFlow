"""
Helper script to download FIBO model to network volume.
Run this once on a pod with your network volume mounted.
"""

import os
import sys
from pathlib import Path

from huggingface_hub import snapshot_download


def download_model(model_name: str, cache_dir: str):
    """Download model to cache directory."""
    print(f"Downloading model: {model_name}")
    print(f"Cache directory: {cache_dir}")
    print("-" * 60)
    
    cache_path = Path(cache_dir)
    cache_path.mkdir(parents=True, exist_ok=True)
    
    # Only download files needed for inference with diffusers
    # This excludes training scripts, docs, .git files, etc.
    allow_patterns = [
        "*.json",                    # Config files (model_index.json, config.json, etc.)
        "*.safetensors",            # Model weights (preferred format)
        "*.bin",                     # Model weights (fallback format)
        "*.txt",                     # Tokenizer files, vocab files
        "*.model",                   # Tokenizer models (e.g., sentencepiece)
        "tokenizer/*",              # Tokenizer files in subdirectory
        "scheduler/*",              # Scheduler configs
        "text_encoder/*",           # Text encoder files
        "text_encoder_2/*",         # Second text encoder if exists
        "unet/*",                   # UNet model files
        "vae/*",                    # VAE files
        "feature_extractor/*",      # Feature extractor if needed
        "safety_checker/*",         # Safety checker if needed
        "*.png",                    # Example images (optional, small)
        "*.jpg",                    # Example images (optional, small)
    ]
    
    print("Downloading only inference-required files...")
    print("(Excluding training scripts, docs, git files, etc.)")
    
    # Download model using HuggingFace Hub
    downloaded_path = snapshot_download(
        repo_id=model_name,
        cache_dir=cache_dir,
        local_dir=cache_path / model_name.replace("/", "--"),
        local_dir_use_symlinks=False,
        allow_patterns=allow_patterns,
    )
    
    print("-" * 60)
    print(f"✓ Model downloaded successfully to: {downloaded_path}")
    print(f"✓ Set MODEL_CACHE_DIR={cache_dir} in your RunPod environment")
    
    return downloaded_path


if __name__ == "__main__":
    # Get model name from environment or use default
    model_name = os.getenv("FIBO_MODEL_NAME", "briaai/FIBO")
    
    # Get cache directory from command line or environment
    if len(sys.argv) > 1:
        cache_dir = sys.argv[1]
    else:
        cache_dir = os.getenv("MODEL_CACHE_DIR", "/runpod-volume/models")
    
    if not cache_dir:
        print("Error: Please provide cache directory")
        print("Usage: python download_model.py /path/to/cache")
        print("Or set MODEL_CACHE_DIR environment variable")
        sys.exit(1)
    
    try:
        download_model(model_name, cache_dir)
    except Exception as e:
        print(f"Error downloading model: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

