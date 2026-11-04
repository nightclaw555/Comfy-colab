"""
Colab Sidecar Agent for ComfyUI A100 Studio
- Monitors GPU VRAM, Utilization, and Temperature
- Monitors ComfyUI process status on port 8188
- Provides Auto-Disconnect / Kill Switch endpoint for Google Colab (Direct TBE Unassign + Fallback)
- Serves generated output metadata
"""

import os
import sys
import time
import json
import shutil
import threading
import subprocess
from typing import Optional
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import uvicorn

app = FastAPI(title="Colab Sidecar Agent", version="1.2.0")

# Enable CORS for Web App communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

START_TIME = time.time()
OUTPUT_DIR = os.environ.get("COMFY_OUTPUT_DIR", "/content/ComfyUI/output")
RCLONE_CONF_PATH = os.environ.get("RCLONE_CONF_PATH", "/content/rclone.conf")
RCLONE_REMOTE_DEST = os.environ.get("RCLONE_REMOTE_DEST", "mygdrive:ComfyUI_Studio/outputs")
_SYNCED_FILES: dict[str, tuple[int, float]] = {}
_SYNC_LOCK = threading.Lock()


def sync_outputs_to_gdrive(force_all: bool = False):
    """Push newly rendered videos/images from Colab SSD to Google Drive (mygdrive:ComfyUI_Studio/outputs) via Rclone."""
    if not os.path.exists(RCLONE_CONF_PATH) or not os.path.exists(OUTPUT_DIR):
        return
    if not shutil.which("rclone"):
        return

    with _SYNC_LOCK:
        try:
            if force_all:
                subprocess.run(
                    [
                        "rclone", "copy", OUTPUT_DIR, RCLONE_REMOTE_DEST,
                        "--config", RCLONE_CONF_PATH,
                        "--transfers", "8",
                        "--drive-chunk-size", "128M",
                        "--include", "*.{mp4,webm,mkv,png,jpg,jpeg,webp}",
                        "--quiet"
                    ],
                    timeout=60,
                    check=False
                )
                return

            for fname in os.listdir(OUTPUT_DIR):
                if not fname.lower().endswith((".mp4", ".webm", ".mkv", ".png", ".jpg", ".jpeg", ".webp")):
                    continue
                fpath = os.path.join(OUTPUT_DIR, fname)
                if not os.path.isfile(fpath):
                    continue
                stat = os.stat(fpath)
                # Ensure file is non-empty and finished writing (at least 1.5s old)
                if stat.st_size < 1024 or (time.time() - stat.st_mtime) < 1.5:
                    continue
                sig = (stat.st_size, stat.st_mtime)
                if _SYNCED_FILES.get(fname) == sig:
                    continue

                res = subprocess.run(
                    [
                        "rclone", "copyto", fpath, f"{RCLONE_REMOTE_DEST}/{fname}",
                        "--config", RCLONE_CONF_PATH,
                        "--drive-chunk-size", "128M",
                        "--quiet"
                    ],
                    timeout=45,
                    check=False
                )
                if res.returncode == 0:
                    _SYNCED_FILES[fname] = sig
                    print(f"[Rclone Auto-Sync] Synced {fname} ({stat.st_size / (1024*1024):.2f} MB) -> {RCLONE_REMOTE_DEST}")
        except Exception as e:
            print(f"[Rclone Auto-Sync] Warning: {e}")


def _rclone_watcher_daemon():
    while True:
        time.sleep(3.0)
        sync_outputs_to_gdrive(force_all=False)


threading.Thread(target=_rclone_watcher_daemon, daemon=True).start()


def get_gpu_info():
    """Extract GPU information using nvidia-smi."""
    try:
        cmd = [
            "nvidia-smi",
            "--query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu",
            "--format=csv,noheader,nounits"
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        line = res.stdout.strip().split("\n")[0]
        parts = [p.strip() for p in line.split(",")]
        return {
            "name": parts[0],
            "memory_total_mb": float(parts[1]),
            "memory_used_mb": float(parts[2]),
            "memory_free_mb": float(parts[3]),
            "utilization_gpu_pct": float(parts[4]),
            "temperature_c": float(parts[5]),
        }
    except Exception as e:
        return {
            "name": "GPU Unavailable or Not Found",
            "memory_total_mb": 0.0,
            "memory_used_mb": 0.0,
            "memory_free_mb": 0.0,
            "utilization_gpu_pct": 0.0,
            "temperature_c": 0.0,
            "error": str(e)
        }


def check_comfy_running(port: int = 8188) -> bool:
    """Check if ComfyUI is listening on port 8188."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.0)
        return s.connect_ex(("127.0.0.1", port)) == 0


def find_tbe_addr() -> Optional[str]:
    """Find Colab internal runtime manager address."""
    # 1. From environment variable
    addr = os.environ.get("TBE_RUNTIME_ADDR")
    if addr:
        return addr

    # 2. From config file saved during notebook launch
    cfg_path = "/content/sidecar_config.json"
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, "r") as f:
                cfg = json.load(f)
                if cfg.get("TBE_RUNTIME_ADDR"):
                    return cfg["TBE_RUNTIME_ADDR"]
        except Exception:
            pass

    # 3. From /proc environment dumps of other processes (e.g. PID 1 or kernel)
    try:
        if os.path.exists("/proc"):
            pids = [1] + [int(p) for p in os.listdir("/proc") if p.isdigit() and p != "1"]
            for pid in pids:
                env_file = f"/proc/{pid}/environ"
                if os.path.exists(env_file):
                    try:
                        with open(env_file, "rb") as ef:
                            env_data = ef.read().decode("utf-8", errors="ignore")
                            for item in env_data.split("\0"):
                                if item.startswith("TBE_RUNTIME_ADDR="):
                                    val = item.split("=", 1)[1].strip()
                                    if val:
                                        return val
                    except Exception:
                        continue
    except Exception:
        pass

    return None


def perform_unassign():
    """
    Safely and completely unassign Google Colab runtime:
    1. Wait 1.5s so HTTP response reaches caller via Cloudflare.
    2. Direct HTTP POST to internal Colab unassign API (http://${TBE_RUNTIME_ADDR}/unassign),
       bypassing _output.eval_js which fails in standalone background processes.
    3. Terminate Cloudflare Tunnel & ComfyUI to immediately halt GPU usage and network traffic.
    4. Force container termination (kill PID 1) to ensure Colab releases the VM instance.
    """
    time.sleep(1.5)
    print("Flushing all rendered outputs to Google Drive via Rclone before unassign...")
    try:
        sync_outputs_to_gdrive(force_all=True)
    except Exception as e:
        print(f"Pre-unassign Rclone flush warning: {e}")

    print("Executing Google Colab runtime unassign...")

    # Step 1: Direct POST to Colab unassign API
    tbe_addr = find_tbe_addr()
    if tbe_addr:
        print(f"Calling Colab backend unassign at http://{tbe_addr}/unassign ...")
        try:
            import urllib.request
            req = urllib.request.Request(f"http://{tbe_addr}/unassign", data=b"", method="POST")
            with urllib.request.urlopen(req, timeout=5) as resp:
                print(f"Colab internal unassign endpoint returned status: {resp.status}")
        except Exception as e:
            print(f"Error calling internal unassign endpoint: {e}")
    else:
        print("TBE_RUNTIME_ADDR not found, proceeding to process and container termination...")

    # Step 2: Stop GPU compute & close network tunnels immediately
    print("Terminating cloudflared tunnel and ComfyUI...")
    try:
        subprocess.run(["pkill", "-9", "-f", "cloudflared"], check=False)
        subprocess.run(["fuser", "-k", "-9", "8188/tcp"], check=False)
        subprocess.run(["fuser", "-k", "-9", "8189/tcp"], check=False)
    except Exception as e:
        print(f"Error stopping services: {e}")

    # Step 3: Container termination fallback (kill PID 1)
    time.sleep(1.0)
    print("Terminating container PID 1 to ensure Colab releases VM...")
    try:
        os.system("kill -9 1 > /dev/null 2>&1 || kill -9 -1 > /dev/null 2>&1")
    except Exception as e:
        print(f"Error killing PID 1: {e}")
        os._exit(0)


@app.get("/")
@app.get("/health")
def health_check():
    """System health and quick overview."""
    gpu = get_gpu_info()
    uptime_sec = time.time() - START_TIME
    comfy_alive = check_comfy_running(8188)
    return {
        "status": "online",
        "uptime_seconds": round(uptime_sec, 1),
        "uptime_formatted": f"{int(uptime_sec // 3600)}h {int((uptime_sec % 3600) // 60)}m {int(uptime_sec % 60)}s",
        "gpu": gpu,
        "comfy_running": comfy_alive,
        "comfy_port": 8188
    }


@app.get("/stats")
def stats():
    """Comprehensive GPU and memory stats."""
    return get_gpu_info()


@app.post("/shutdown")
@app.post("/auto-disconnect")
def shutdown_colab(background_tasks: BackgroundTasks):
    """
    Auto-Disconnect Kill Switch:
    Immediately unassigns the Colab instance to prevent wasting Compute Units.
    """
    background_tasks.add_task(perform_unassign)
    return {
        "success": True,
        "message": "Shutdown signal accepted. Colab runtime will unassign in 2 seconds to preserve Compute Units.",
        "timestamp": time.time()
    }


@app.get("/outputs")
def list_outputs():
    """List generated video and image files in the outputs directory."""
    if not os.path.exists(OUTPUT_DIR):
        return {"outputs": [], "directory": OUTPUT_DIR}

    files = []
    for f in sorted(os.listdir(OUTPUT_DIR), reverse=True):
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


class MergeVideosRequest(BaseModel):
    video1: Optional[str] = None
    video2: Optional[str] = None
    videos: Optional[list[str]] = None
    output_filename: Optional[str] = None


@app.post("/videos/merge")
def merge_videos(req: MergeVideosRequest):
    """
    Merge multiple 5-second videos seamlessly using FFmpeg concat.
    Supports either filenames residing in OUTPUT_DIR or relative paths.
    """
    if not os.path.exists(OUTPUT_DIR):
        raise HTTPException(status_code=400, detail="Outputs directory does not exist")

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
        p3 = os.path.join("/content/drive/MyDrive/ComfyUI_Studio/outputs", base_v)
        if os.path.isfile(p3):
            return p3
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

    list_path = f"/content/merge_{ts}.txt"
    try:
        with open(list_path, "w") as f:
            for p in paths:
                f.write(f"file '{p}'\n")

        cmd_fast = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", list_path, "-c", "copy", out_path
        ]
        res = subprocess.run(cmd_fast, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

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
            try: os.remove(list_path)
            except Exception: pass

    stat = os.stat(out_path)
    threading.Thread(target=sync_outputs_to_gdrive, kwargs={"force_all": True}, daemon=True).start()
    return {
        "success": True,
        "filename": out_name,
        "size_mb": round(stat.st_size / (1024 * 1024), 2),
        "url": f"/outputs/{out_name}",
        "message": f"Successfully merged {len(paths)} video clips seamlessly!"
    }


class ExtractFrameRequest(BaseModel):
    video: str
    output_filename: Optional[str] = None


@app.post("/videos/extract_last_frame")
def extract_last_frame(req: ExtractFrameRequest):
    """
    Extract the very last frame of a video using FFmpeg and save it as PNG
    to both ComfyUI input/ and output/ directories for direct sequential generation.
    """
    if not os.path.exists(OUTPUT_DIR):
        raise HTTPException(status_code=400, detail="Outputs directory does not exist")

    def resolve_path(v: str) -> str:
        if os.path.isabs(v) and os.path.isfile(v): return v
        base_v = os.path.basename(v)
        p1 = os.path.join(OUTPUT_DIR, base_v)
        if os.path.isfile(p1): return p1
        p2 = os.path.join(OUTPUT_DIR, "video", base_v)
        if os.path.isfile(p2): return p2
        raise HTTPException(status_code=404, detail=f"Video file not found: {v}")

    src_video = resolve_path(req.video)
    ts = int(time.time())
    out_name = req.output_filename or f"last_frame_{ts}.png"
    if not out_name.endswith(".png"):
        out_name += ".png"

    input_dir = "/content/ComfyUI/input"
    os.makedirs(input_dir, exist_ok=True)
    out_path_input = os.path.join(input_dir, out_name)
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
        "message": "Last frame extracted successfully!"
    }


COMFY_LOG_FILE = os.environ.get("COMFY_LOG_FILE", "/content/comfyui.log")


@app.get("/logs/comfyui")
def get_comfyui_logs(lines: int = 150):
    """Return the last N lines of ComfyUI console logs with error detection."""
    target_path = COMFY_LOG_FILE
    if not os.path.exists(target_path):
        if os.path.exists("comfyui.log"):
            target_path = "comfyui.log"
        elif os.path.exists("/content/sidecar.log"):
            target_path = "/content/sidecar.log"
        else:
            return {
                "exists": False,
                "logs": f"Log file not found at {COMFY_LOG_FILE}. ComfyUI may still be launching.",
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


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8189
    print(f"Starting Colab Sidecar Agent on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
