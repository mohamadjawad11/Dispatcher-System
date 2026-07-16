FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --default-timeout=120 --retries 5 -r requirements.txt

COPY app ./app

EXPOSE 8000

# The Next.js app calls POST {AI_SERVICE_URL}/v1/exceptions:analyze
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
