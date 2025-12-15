"""
Quick test script to send a request to the local server.

Usage:
    # Start server first: python server.py
    # Then run this: python test_request.py
"""

import json
import requests
import time

# Server URL
BASE_URL = "http://localhost:8000"

# Test request
test_request = {
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
    "steps": 30,  # Reduced for faster testing
    "variants": 1,
    "aspect_ratio": "16:9",
    "guidance_scale": 5.0,
    "return_base64": False,  # Save to file instead
}


def test_health():
    """Test health endpoint."""
    print("Testing health endpoint...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    print()


def test_aspect_ratios():
    """Test aspect ratios endpoint."""
    print("Testing aspect ratios endpoint...")
    response = requests.get(f"{BASE_URL}/aspect-ratios")
    print(f"Status: {response.status_code}")
    ratios = response.json()["aspect_ratios"]
    print(f"Available aspect ratios: {len(ratios)}")
    for ratio, info in ratios.items():
        print(f"  {ratio}: {info['resolution']}")
    print()


def test_generate():
    """Test image generation."""
    print("Testing image generation...")
    print(f"Request: {json.dumps(test_request, indent=2)}")
    print()
    
    start_time = time.time()
    response = requests.post(
        f"{BASE_URL}/generate",
        json=test_request,
        timeout=300,  # 5 minute timeout
    )
    elapsed = time.time() - start_time
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"✓ Success!")
        print(f"Generation time: {result['generation_time']:.2f}s")
        print(f"Total time: {elapsed:.2f}s")
        print(f"Images generated: {len(result['images'])}")
        
        for i, img in enumerate(result['images'], 1):
            print(f"\nImage {i}:")
            print(f"  Filename: {img['filename']}")
            print(f"  Seed: {img['seed']}")
            if 'path' in img:
                print(f"  Path: {img['path']}")
            if 'base64' in img:
                print(f"  Base64 length: {len(img['base64'])} chars")
        
        print(f"\n✓ Check ./outputs/ directory for generated images")
    else:
        print(f"✗ Error: {response.text}")
    print()


def main():
    """Run all tests."""
    print("=" * 60)
    print("FIBO Server Test Script")
    print("=" * 60)
    print()
    
    try:
        # Test health
        test_health()
        
        # Test aspect ratios
        test_aspect_ratios()
        
        # Test generation
        test_generate()
        
    except requests.exceptions.ConnectionError:
        print("✗ Error: Could not connect to server")
        print("  Make sure the server is running: python server.py")
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()

