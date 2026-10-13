# NAS analyzer bridge (optional)

The studio can analyze videos two ways:

1. **Direct (default):** the uploaded file, a direct `.mp4` link or a YouTube link is handed to a Gemini
   model on OpenRouter, which watches the video and audio itself. No extra infrastructure.
2. **NAS bridge:** for TikTok / Instagram / X links (which can't be fetched from a Worker), the Worker
   calls a small container on your Synology NAS that downloads the video with `yt-dlp`, transcribes it
   with `faster-whisper`, samples frames with `ffmpeg`, and returns everything as JSON. The Worker then
   sends the transcript + frames (or the direct video URL) to OpenRouter for the structured analysis.

If your research app's container already does this, you only need to add the `/analyze` endpoint below
(or a thin proxy in front of it) and set `NAS_ANALYZER_URL` + `NAS_ANALYZER_TOKEN` on the Worker.

## Contract

```
POST {NAS_ANALYZER_URL}/analyze
Authorization: Bearer {NAS_ANALYZER_TOKEN}
Content-Type: application/json

{ "url": "https://www.tiktok.com/@x/video/123",   // or
  "file_url": "https://studio.example.com/files/signed/...",  // time-limited link to an uploaded file
  "note": "what the team member cares about",
  "want": ["transcript", "frames", "metadata"] }
```

Response (200):

```
{ "transcript": "[00:00] ... with timestamps",
  "duration": 31.4,
  "title": "...", "author": "@handle", "platform": "tiktok",
  "frames": [ { "t": 0.0, "image": "data:image/jpeg;base64,..." }, ... ],   // 8-16 frames, ~640px wide
  "video_url": "https://nas.example.com/cache/abc.mp4"   // optional: a public, short-lived URL to the mp4
}
```

Return `{ "error": "..." }` with a 4xx/5xx status on failure. If `video_url` is returned and is reachable
from the public internet, the Worker will prefer sending the actual video to the model (better visual
analysis). Otherwise it uses transcript + frames.

## Running the reference container

```
cd nas-analyzer
docker build -t ccs-analyzer .
docker run -d --name ccs-analyzer -p 8090:8090 -e ANALYZER_TOKEN=change-me -e WHISPER_MODEL=small ccs-analyzer
```

Expose it with Synology's reverse proxy (or a Cloudflare Tunnel, which is the cleanest: no open ports),
then on the Worker:

```
wrangler secret put NAS_ANALYZER_URL      # https://analyzer.yourdomain.com
wrangler secret put NAS_ANALYZER_TOKEN    # change-me
```
