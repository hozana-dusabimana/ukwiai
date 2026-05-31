FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TF_CPP_MIN_LOG_LEVEL=2

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# REQUIREMENTS selects the dependency set. Default = full (CNN + OWLv2), used by
# dev and CI on x86. Production on the ARM64 box passes requirements.prod.txt
# (heuristic-only), which omits tensorflow/torch (no aarch64 wheels, unused at
# runtime when AI_FORCE_HEURISTIC + AI_DISABLE_OBJDET are set).
ARG REQUIREMENTS=requirements.txt
COPY requirements*.txt ./
RUN pip install --no-cache-dir --default-timeout=300 --retries 10 -r ${REQUIREMENTS}

COPY . .

RUN mkdir -p /app/models /app/storage/uploads

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
