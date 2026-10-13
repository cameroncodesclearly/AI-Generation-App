"""Reference NAS analyzer: yt-dlp download + faster-whisper transcript + ffmpeg frames.

Implements the contract in README.md. Deliberately small so it can be merged into an existing
research container.
"""
import base64
import json
import os
import shutil
import subprocess
import tempfile
from typing import Optional

import uvicorn
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

TOKEN = os.environ.get("ANALYZER_TOKEN", "change-me")
FRAME_COUNT = int(os.environ.get("FRAME_COUNT", "12"))
_model = None


def whisper():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), device="auto", compute_type="int8")
    return _model


class Req(BaseModel):
    url: Optional[str] = None
    file_url: Optional[str] = None
    note: Optional[str] = None
    want: list[str] = ["transcript", "frames", "metadata"]


app = FastAPI()


def download(src: str, workdir: str) -> tuple[str, dict]:
    out = os.path.join(workdir, "video.%(ext)s")
    cmd = ["yt-dlp", "-f", "bv*[height<=720]+ba/b[height<=720]/b", "--merge-output-format", "mp4",
           "--no-playlist", "--print-json", "-o", out, src]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if p.returncode != 0:
        raise HTTPException(422, f"download failed: {p.stderr[-400:]}")
    meta = json.loads(p.stdout.strip().splitlines()[-1]) if p.stdout.strip() else {}
    for f in os.listdir(workdir):
        if f.startswith("video."):
            return os.path.join(workdir, f), meta
    raise HTTPException(500, "downloaded file not found")


def duration_of(path: str) -> float:
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True)
    try:
        return float(p.stdout.strip())
    except ValueError:
        return 0.0


def frames(path: str, dur: float, workdir: str) -> list[dict]:
    n = max(4, min(FRAME_COUNT, int(dur) or FRAME_COUNT))
    out = []
    for i in range(n):
        t = (dur * (i + 0.5)) / n if dur else i
        fp = os.path.join(workdir, f"f{i}.jpg")
        subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", path, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "5", fp], check=False)
        if os.path.exists(fp):
            with open(fp, "rb") as fh:
                out.append({"t": round(t, 2), "image": "data:image/jpeg;base64," + base64.b64encode(fh.read()).decode()})
    return out


def transcribe(path: str) -> str:
    segments, _ = whisper().transcribe(path, vad_filter=True)
    lines = []
    for s in segments:
        m, sec = divmod(int(s.start), 60)
        lines.append(f"[{m:02d}:{sec:02d}] {s.text.strip()}")
    return "\n".join(lines) or "No speech"


@app.post("/analyze")
def analyze(req: Req, authorization: str = Header(default="")):
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(401, "bad token")
    src = req.url or req.file_url
    if not src:
        raise HTTPException(400, "url or file_url required")
    workdir = tempfile.mkdtemp(prefix="ccs-")
    try:
        path, meta = download(src, workdir)
        dur = duration_of(path)
        res = {"duration": dur, "title": meta.get("title"), "author": meta.get("uploader") or meta.get("channel"), "platform": meta.get("extractor_key", "").lower() or None}
        if "transcript" in req.want:
            res["transcript"] = transcribe(path)
        if "frames" in req.want:
            res["frames"] = frames(path, dur, workdir)
        return res
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


@app.get("/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8090")))
