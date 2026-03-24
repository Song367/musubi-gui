FROM python:3.10-slim

# 设置无交互安装并设置时区
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Shanghai

# 安装系统基础依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    git \
    nano \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 先复制 requirements 以利用 Docker 缓存
COPY backend/requirements.txt /app/backend/requirements.txt

# 安装 Python 依赖，注意这里补充了代码中用到的 huggingface_hub
RUN pip install --no-cache-dir -r backend/requirements.txt huggingface_hub

# 复制前端和后端源码
COPY backend /app/backend
COPY frontend /app/frontend

# 暴露给宿主机的端口
EXPOSE 8001

# 进入 backend 目录以正确读取相对路径
WORKDIR /app/backend

# 启动 Uvicorn，将 host 设置为 0.0.0.0 允许外部访问
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
