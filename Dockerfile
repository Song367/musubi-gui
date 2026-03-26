FROM python:3.10-slim

# 设置无交互安装并设置时区
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Shanghai

# 核心依赖升级：加入 libgl1 和 libglib2.0-0 以支持 opencv-python 等重库
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    git \
    nano \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ----------------- 究极炼丹炉依赖包 ----------------- #
# 1. 回退到官方最稳定认证的 CUDA 12.4 引擎（因为高版本源缺少部分依赖记录会导致 pip 冲突）
# 并先更新 pip 确保依赖解析器不会抽风
RUN pip install -U pip && \
    pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu124

# 2. 从 musubi-tuner 的官方 pyproject.toml 中提取的全部深度学习、视觉及工具底层依赖
RUN pip install --no-cache-dir \
    "accelerate==1.6.0" "av==14.0.1" "bitsandbytes" "diffusers==0.32.1" \
    "einops==0.7.0" "huggingface-hub==0.34.3" "opencv-python==4.10.0.84" \
    "pillow>=11.3.0" "safetensors==0.4.5" "toml==0.10.2" "tqdm==4.67.1" \
    "transformers==4.56.1" "voluptuous==0.15.2" "ftfy==6.3.1" "easydict==1.13" \
    "sentencepiece==0.2.1" \
    "ascii-magic==2.3.0" "matplotlib==3.10.0" "tensorboard" "prompt-toolkit==3.0.51"
# -------------------------------------------------- #


# 复制并在最尾端安装 UI 后端的专属要求（如果有额外缺失的话）
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt huggingface_hub

# 复制前端和后端源码
COPY backend /app/backend
COPY frontend /app/frontend

EXPOSE 8001
WORKDIR /app/backend

# 启动 Uvicorn 网页服务
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
