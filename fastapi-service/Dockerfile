# FastAPI FMS gateway (G14).
FROM python:3.12-slim

WORKDIR /app

# Install dependencies first so the layer is cached across code-only changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# main.py exposes `app`; load_dotenv() is a no-op when env vars come from compose.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
