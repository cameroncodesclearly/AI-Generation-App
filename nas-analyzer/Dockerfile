FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
ENV WHISPER_MODEL=small ANALYZER_TOKEN=change-me PORT=8090 FRAME_COUNT=12
EXPOSE 8090
CMD ["python", "server.py"]
