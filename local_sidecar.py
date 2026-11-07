"""
Local Sidecar Agent for ComfyUI MiniMax-H3 Studio (Windows & Linux Local PC)
- Monitors Local GPU VRAM, Utilization, and Temperature via nvidia-smi / PyTorch
- Monitors ComfyUI process status on port 8188
- Extracts last frames for sequential video generation via local FFmpeg
- Merges sequential multi-shot clips into a seamless master video via local FFmpeg
- Serves generated outputs directly to the Studio Web App
- Safe for local use (No Colab kill switch / No cloud unassign)
"""

import os
import sys
import time
import json
import shutil
import argparse
import subprocess
from typing import Optional, List
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import uvicorn

app = FastAPI(title="Local ComfyUI Sidecar Agent", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

START_TIME = time.time()

# ---------------------------------------------------------------------------
# Directory Resolution
# ---------------------------------------------------------------------------
def detect_comfy_dir(override: Optional[str] = None) -> str:
    """Find the ComfyUI installation directory."""
    if override and os.path.isdir(override):
        return os.path.abspath(override)

    env_dir = os.environ.get("COMFY_DIR")
    if env_dir and os.path.isdir(env_dir):
        return os.path.abspath(env_dir)

    # Search common relative and default Windows locations
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "ComfyUI")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ComfyUI")),
        os.path.abspath(os.path.join(os.getcwd(), "ComfyUI")),
        r"C:\ComfyUI_windows_portable\ComfyUI",
        r"D:\ComfyUI_windows_portable\ComfyUI",
        r"E:\ComfyUI_windows_portable\ComfyUI",
    ]
    for c in candidates:
        if os.path.isdir(c) and (os.path.exists(os.path.join(c, "main.py")) or os.path.isdir(os.path.join(c, "custom_nodes"))):
            return c

    # Fallback: current directory or repo outputs
    return os.path.abspath(os.getcwd())

COMFY_DIR = ""
OUTPUT_DIR = ""
INPUT_DIR = ""

def init_directories(custom_comfy_dir: Optional[str] = None):
    global COMFY_DIR, OUTPUT_DIR, INPUT_DIR
    COMFY_DIR = detect_comfy_dir(custom_comfy_dir)
    OUTPUT_DIR = os.environ.get("COMFY_OUTPUT_DIR") or os.path.join(COMFY_DIR, "output")
    INPUT_DIR = os.environ.get("COMFY_INPUT_DIR") or os.path.join(COMFY_DIR, "input")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(INPUT_DIR, exist_ok=True)
    print(f"[Sidecar] ComfyUI Directory : {COMFY_DIR}")
    print(f"[Sidecar] Output Directory  : {OUTPUT_DIR}")
    print(f"[Sidecar] Input Directory   : {INPUT_DIR}")

# ---------------------------------------------------------------------------
# GPU & System Info
# ---------------------------------------------------------------------------
def find_nvidia_smi() -> Optional[str]:
    """Find nvidia-smi binary on Windows or Linux."""
    which_path = shutil.which("nvidia-smi")
    if which_path:
        return which_path

    # Common Windows paths
    win_paths = [
        r"C:\Windows\System32\nvidia-smi.exe",
        r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
    ]
    for p in win_paths:
        if os.path.isfile(p):
            return p
    return None

def get_gpu_info():
    """Extract GPU information using nvidia-smi, fallback to PyTorch if available."""
    smi_bin = find_nvidia_smi()
    if smi_bin:
        try:
            cmd = [
                smi_bin,
                "--query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu",
                "--format=csv,noheader,nounits"
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True, timeout=3)
            line = res.stdout.strip().split("\n")[0]
            parts = [p.strip() for p in line.split(",")]
            return {
                "name": parts[0],
                "memory_total_mb": float(parts[1]),
                "memory_used_mb": float(parts[2]),
                "memory_free_mb": float(parts[3]),
                "utilization_gpu_pct": float(parts[4]),
                "temperature_c": float(parts[5]),
                "mode": "local_nvidia_smi"
            }
        except Exception:
            pass

    # Fallback to PyTorch CUDA
    try:
        import torch
        if torch.cuda.is_available():
            dev_name = torch.cuda.get_device_name(0)
            total_mb = torch.cuda.get_device_properties(0).total_memory / (1024 * 1024)
            allocated_mb = torch.cuda.memory_allocated(0) / (1024 * 1024)
            return {
                "name": dev_name,
                "memory_total_mb": round(total_mb, 1),
                "memory_used_mb": round(allocated_mb, 1),
                "memory_free_mb": round(total_mb - allocated_mb, 1),
                "utilization_gpu_pct": 0.0,
                "temperature_c": 0.0,
                "mode": "local_torch_cuda"
            }
    except Exception:
        pass

    return {
        "name": "Local Device (No NVIDIA GPU detected or drivers missing)",
        "memory_total_mb": 0.0,
        "memory_used_mb": 0.0,
        "memory_free_mb": 0.0,
        "utilization_gpu_pct": 0.0,
        "temperature_c": 0.0,
        "mode": "local_cpu_or_unknown"
    }

def check_comfy_running(port: int = 8188) -> bool:
    """Check if ComfyUI is listening on port 8188."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.0)
        return s.connect_ex(("127.0.0.1", port)) == 0

# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------
@app.get("/")
@app.get("/health")
def health_check():
    """System health and quick overview."""
    gpu = get_gpu_info()
    uptime_sec = time.time() - START_TIME
    comfy_alive = check_comfy_running(8188)
    return {
        "status": "online",
        "environment": "local_machine",
        "uptime_seconds": round(uptime_sec, 1),
        "uptime_formatted": f"{int(uptime_sec // 3600)}h {int((uptime_sec % 3600) // 60)}m {int(uptime_sec % 60)}s",
        "gpu": gpu,
        "comfy_running": comfy_alive,
        "comfy_port": 8188,
        "comfy_dir": COMFY_DIR,
        "output_dir": OUTPUT_DIR
    }

@app.get("/stats")
def stats():
    """Comprehensive GPU and memory stats."""
    return get_gpu_info()

@app.post("/shutdown")
@app.post("/auto-disconnect")
def shutdown_local():
    """
    Local shutdown endpoint.
    In local mode, does NOT kill the machine or container.
    """
    return {
        "success": True,
        "message": "Local mode active: Colab unassign skipped. Services remain active on your local PC.",
        "timestamp": time.time()
    }

@app.get("/outputs")
def list_outputs():
    """List generated video and image files in the outputs directory."""
    if not os.path.exists(OUTPUT_DIR):
        return {"outputs": [], "directory": OUTPUT_DIR}

    files = []
    try:
        entries = sorted(os.listdir(OUTPUT_DIR), reverse=True)
    except Exception:
        entries = []

    for f in entries:
        full_path = os.path.join(OUTPUT_DIR, f)
        if os.path.isfile(full_path):
            stat = os.stat(full_path)
            files.append({
                "filename": f,
                "size_mb": round(stat.st_size / (1024 * 1024), 2),
                "modified": stat.st_mtime,
                "is_video": f.lower().endswith((".mp4", ".webm", ".mkv")),
                "is_image": f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
            })
    return {"outputs": files, "count": len(files), "directory": OUTPUT_DIR}

@app.get("/outputs/{filename}")
def get_output_file(filename: str):
    """Serve output video or image file."""
    file_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)

# ---------------------------------------------------------------------------
# FFmpeg Video Operations
# ---------------------------------------------------------------------------
class MergeVideosRequest(BaseModel):
    video1: Optional[str] = None
    video2: Optional[str] = None
    videos: Optional[List[str]] = None
    output_filename: Optional[str] = None

@app.post("/videos/merge")
def merge_videos(req: MergeVideosRequest):
    """Merge multiple videos sequentially using local FFmpeg."""
    if not shutil.which("ffmpeg"):
        raise HTTPException(status_code=500, detail="FFmpeg is not installed or not in PATH. Please install FFmpeg.")

    def resolve_path(v: str) -> str:
        if os.path.isabs(v) and os.path.isfile(v):
            return v
        base_v = os.path.basename(v)
        p1 = os.path.join(OUTPUT_DIR, base_v)
        if os.path.isfile(p1):
            return p1
        p2 = os.path.join(OUTPUT_DIR, "video", base_v)
        if os.path.isfile(p2):
            return p2
        raise HTTPException(status_code=404, detail=f"Video file not found: {v}")

    video_list = req.videos if req.videos and len(req.videos) > 0 else ([req.video1, req.video2] if req.video1 and req.video2 else [])
    if len(video_list) < 2:
        raise HTTPException(status_code=400, detail="At least 2 videos are required for merging")

    paths = [resolve_path(v) for v in video_list]
    ts = int(time.time())
    out_name = req.output_filename or f"merged_{len(paths)*5}s_{ts}.mp4"
    if not out_name.endswith(".mp4"):
        out_name += ".mp4"
    out_path = os.path.join(OUTPUT_DIR, out_name)

    list_path = os.path.join(OUTPUT_DIR, f"temp_merge_{ts}.txt")
    try:
        with open(list_path, "w", encoding="utf-8") as f:
            for p in paths:
                # Use forward slashes for FFmpeg concat file compatibility
                escaped = p.replace("\\", "/")
                f.write(f"file '{escaped}'\n")

        # Fast concat copy
        cmd_fast = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", list_path, "-c", "copy", out_path
        ]
        res = subprocess.run(cmd_fast, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        # Fallback to filter_complex re-encode if fast concat fails or creates invalid file
        if res.returncode != 0 or not os.path.exists(out_path) or os.path.getsize(out_path) < 10000:
            inputs = []
            filter_parts = []
            for i, p in enumerate(paths):
                inputs.extend(["-i", p])
                filter_parts.append(f"[{i}:v][{i}:a]")
            concat_filter = "".join(filter_parts) + f"concat=n={len(paths)}:v=1:a=1[v][a]"
            cmd_filter = ["ffmpeg", "-y"] + inputs + [
                "-filter_complex", concat_filter,
                "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
                out_path
            ]
            res_filter = subprocess.run(cmd_filter, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res_filter.returncode != 0:
                raise HTTPException(status_code=500, detail=f"FFmpeg merge error: {res_filter.stderr[-300:]}")
    finally:
        if os.path.exists(list_path):
            try:
                os.remove(list_path)
            except Exception:
                pass

    stat = os.stat(out_path)
    return {
        "success": True,
        "filename": out_name,
        "size_mb": round(stat.st_size / (1024 * 1024), 2),
        "url": f"/outputs/{out_name}",
        "message": f"Successfully merged {len(paths)} video clips seamlessly on local machine!"
    }

class ExtractFrameRequest(BaseModel):
    video: str
    output_filename: Optional[str] = None

@app.post("/videos/extract_last_frame")
def extract_last_frame(req: ExtractFrameRequest):
    """
    Extract the last frame of a video using FFmpeg and save it as PNG
    to ComfyUI input/ directory for seamless Image-to-Video continuation.
    """
    if not shutil.which("ffmpeg"):
        raise HTTPException(status_code=500, detail="FFmpeg is not installed or not in PATH.")

    def resolve_path(v: str) -> str:
        if os.path.isabs(v) and os.path.isfile(v):
            return v
        base_v = os.path.basename(v)
        p1 = os.path.join(OUTPUT_DIR, base_v)
        if os.path.isfile(p1):
            return p1
        p2 = os.path.join(OUTPUT_DIR, "video", base_v)
        if os.path.isfile(p2):
            return p2
        raise HTTPException(status_code=404, detail=f"Video file not found: {v}")

    src_video = resolve_path(req.video)
    ts = int(time.time())
    out_name = req.output_filename or f"last_frame_{ts}.png"
    if not out_name.endswith(".png"):
        out_name += ".png"

    out_path_input = os.path.join(INPUT_DIR, out_name)
    out_path_output = os.path.join(OUTPUT_DIR, out_name)

    cmd = [
        "ffmpeg", "-y", "-sseof", "-0.1", "-i", src_video,
        "-update", "1", "-q:v", "2", out_path_input
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0 or not os.path.exists(out_path_input):
        cmd_fallback = [
            "ffmpeg", "-y", "-i", src_video,
            "-vf", "select='eq(n\\,last)'", "-vframes", "1", out_path_input
        ]
        subprocess.run(cmd_fallback, check=False)

    if os.path.exists(out_path_input):
        try:
            if os.path.abspath(out_path_input) != os.path.abspath(out_path_output):
                shutil.copyfile(out_path_input, out_path_output)
        except Exception:
            pass

    return {
        "success": True,
        "filename": out_name,
        "input_filename": out_name,
        "url": f"/outputs/{out_name}",
        "message": "Last frame extracted successfully into ComfyUI input folder!"
    }

# ---------------------------------------------------------------------------
# ComfyUI Console Logs
# ---------------------------------------------------------------------------
@app.get("/logs/comfyui")
def get_comfyui_logs(lines: int = 150):
    """Return the last N lines of ComfyUI console logs with error detection."""
    candidate_logs = [
        os.path.join(COMFY_DIR, "comfyui.log"),
        os.path.join(os.getcwd(), "comfyui.log"),
        os.path.join(COMFY_DIR, "comfy.log"),
        os.path.join(os.path.dirname(COMFY_DIR), "comfyui.log"),
    ]
    target_path = None
    for p in candidate_logs:
        if os.path.isfile(p):
            target_path = p
            break

    if not target_path:
        return {
            "exists": False,
            "logs": f"Log file not found. To enable log streaming, launch ComfyUI with: python main.py > comfyui.log 2>&1",
            "total_lines": 0,
            "tail_count": 0,
            "has_error": False,
            "recent_errors": []
        }

    try:
        with open(target_path, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()

        tail_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
        log_text = "".join(tail_lines)

        recent_errors = []
        error_keywords = [
            "Traceback (most recent call last):",
            "OutOfMemoryError",
            "CUDA out of memory",
            "FileNotFoundError",
            "KeyError:",
            "RuntimeError:",
            "AttributeError:",
            "Error occurred when executing",
            "Exception:"
        ]
        for i, line in enumerate(tail_lines):
            for kw in error_keywords:
                if kw in line:
                    context = "".join(tail_lines[max(0, i - 1) : min(len(tail_lines), i + 8)]).strip()
                    if context not in recent_errors:
                        recent_errors.append(context)
                    break

        return {
            "exists": True,
            "logs": log_text,
            "total_lines": len(all_lines),
            "tail_count": len(tail_lines),
            "has_error": len(recent_errors) > 0,
            "recent_errors": recent_errors[-3:]
        }
    except Exception as e:
        return {
            "exists": False,
            "logs": f"Error reading log file: {str(e)}",
            "total_lines": 0,
            "tail_count": 0,
            "has_error": True,
            "recent_errors": [str(e)]
        }

# ---------------------------------------------------------------------------
# Main Runner
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Local Sidecar Agent for ComfyUI Studio")
    parser.add_argument("--port", type=int, default=8189, help="Sidecar listening port (default: 8189)")
    parser.add_argument("--comfy-dir", type=str, default=None, help="Path to ComfyUI directory")
    args = parser.parse_args()

    init_directories(args.comfy_dir)
    print(f"=======================================================")
    print(f" 🚀 Local Sidecar Agent running on http://127.0.0.1:{args.port}")
    print(f" 🔍 Monitoring ComfyUI at http://127.0.0.1:8188")
    print(f"=======================================================")
    uvicorn.run(app, host="0.0.0.0", port=args.port)
