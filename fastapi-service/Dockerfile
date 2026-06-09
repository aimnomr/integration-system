# FastAPI FMS gateway (G14).
# Stays on glibc -slim (not alpine): psycopg2-binary only ships manylinux
# wheels, so alpine/musl would force a source build + toolchain.
FROM python:3.12-slim

# Lean runtime: no .pyc files, unbuffered logs, no pip cache or version chatter.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies first so the layer is cached across code-only changes.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Drop privileges.
RUN useradd --no-create-home --uid 1000 appuser
USER appuser

EXPOSE 8000

# main.py exposes `app`; load_dotenv() is a no-op when env vars come from compose.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
