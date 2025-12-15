FROM runpod/base:1.0.2-cuda1281-ubuntu2204

# Set working directory
WORKDIR /app

# Set python3.11 as the default python
RUN ln -sf $(which python3.11) /usr/local/bin/python && \
    ln -sf $(which python3.11) /usr/local/bin/python3

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt /app/requirements.txt

# Install Python dependencies with CUDA 12.8 index
RUN python3.11 -m pip install --upgrade pip && \
    python3.11 -m pip install --no-cache-dir -r /app/requirements.txt \
    --extra-index-url https://download.pytorch.org/whl/cu128

# Copy handler
COPY handler.py /app/handler.py

# Run the handler
CMD python3.11 -u /app/handler.py
