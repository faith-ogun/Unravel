# Unravel API: the ADK agents + FastAPI server, for Cloud Run.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run sets $PORT (default 8080). uvicorn binds it on all interfaces.
CMD exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}
