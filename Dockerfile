FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (e.g. for psycopg2, lightgbm)
RUN apt-get update && apt-get install -y \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Expose ports for API and UI
EXPOSE 8000
EXPOSE 8501

CMD ["bash"]
