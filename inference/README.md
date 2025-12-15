# FIBO Worker Template for RunPod

This is a RunPod serverless worker for deploying the FIBO image generation model with Cloudflare R2 storage.

## Features

- ✅ FIBO inference-only (no VLM support needed)
- ✅ Direct JSON prompt input
- ✅ Multiple aspect ratios support
- ✅ Multiple variants per request
- ✅ Cloudflare R2/S3 upload with public URLs
- ✅ CUDA 12.8 + PyTorch 2.8 support
- ✅ TeaCache support for faster inference
- ✅ **Local FastAPI server for testing before deployment**

## Requirements

- Python 3.10+
- CUDA 12.8
- Cloudflare R2 (or S3-compatible storage)

## Local Testing (Before Deployment)

Test your setup locally before deploying to RunPod:

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Start local server
python server.py

# 3. Test with the test script
python test_request.py

# Or visit interactive docs
open http://localhost:8000/docs
```

See [LOCAL_TESTING.md](./LOCAL_TESTING.md) for complete testing guide.

## Setup

### 1. Environment Variables

Set these environment variables in RunPod:

```bash
# Required: R2 Storage
R2_ENDPOINT_URL=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_URL=https://your-domain.r2.dev

# Optional: Model Configuration
FIBO_MODEL_NAME=briaai/FIBO
ENABLE_TEACACHE=false
TEACACHE_THRESHOLD=1.0
```

### 2. Build Docker Image

```bash
docker build -t your-username/fibo-worker:latest .
docker push your-username/fibo-worker:latest
```

### 3. Deploy to RunPod

1. Create a new template in RunPod
2. Use your Docker image
3. Add environment variables
4. Deploy as serverless endpoint

## API Usage

### Input Format

```json
{
  "input": {
    "json_prompt": {
      "short_description": "A serene mountain landscape at sunset",
      "style_medium": "photography",
      "artistic_style": "realistic",
      "lighting": "golden hour",
      "color_palette": "warm tones",
      "composition": "rule of thirds",
      "camera_angle": "eye level",
      "mood": "peaceful",
      "subject": "mountain landscape",
      "background": "sky with clouds"
    },
    "seed": 42,
    "steps": 50,
    "variants": 1,
    "aspect_ratio": "16:9",
    "guidance_scale": 5.0
  }
}
```

### Parameters

- `json_prompt` (required): FIBO structured prompt as JSON object
- `seed` (optional): Random seed, -1 for random (default: -1)
- `steps` (optional): Number of inference steps, 1-100 (default: 50)
- `variants` (optional): Number of images to generate, 1-10 (default: 1)
- `aspect_ratio` (optional): Aspect ratio string (default: "1:1")
- `guidance_scale` (optional): CFG scale (default: 5.0)

### Supported Aspect Ratios

- `1:1` - 1024x1024
- `16:9` - 1344x768
- `9:16` - 768x1344
- `4:3` - 1152x896
- `3:4` - 896x1152
- `21:9` - 1280x800
- `9:21` - 800x1280
- `5:4` - 1088x960
- `4:5` - 960x1088
- `3:2` - 1216x832
- `2:3` - 832x1216

### Output Format

```json
{
  "images": [
    {
      "url": "https://your-domain.r2.dev/fibo-uuid.png",
      "seed": 42,
      "filename": "fibo-uuid.png"
    }
  ],
  "generation_time": 12.34,
  "parameters": {
    "steps": 50,
    "guidance_scale": 5.0,
    "aspect_ratio": "16:9",
    "variants": 1
  }
}
```

## Testing Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export R2_ENDPOINT_URL=...
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...
export R2_BUCKET_NAME=...
export R2_PUBLIC_URL=...

# Run handler
python handler.py
```

## Performance

- Cold start: ~10-15 seconds (model loading)
- Generation time: ~3-10 seconds per image (depending on steps)
- With TeaCache: ~30% faster with minimal quality loss

## License

See LICENSE file for details.
