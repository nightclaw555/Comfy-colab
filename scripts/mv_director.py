"""
Automated AI Music Video Director Pipeline (Hybrid Local PC + Colab A100)
========================================================================
Orchestrates full-length AI Music Videos by combining:
  Phase 1 (Local PC - 0 Colab Credits):
    - Audio duration, BPM & beat/energy analysis (librosa or torchaudio/PyTorch fallback)
    - Optional vocal stem separation (Demucs) & transcription (faster-whisper)
    - AI Director Storyboarding via Gemini API (google-genai SDK, Interactions API)
      supporting gemini-4-hydrogen with automatic fallback to gemini-4-argon / gemini-3.8-flash
    - Character Reference image generation via Local FLUX Hub (http://127.0.0.1:8210)
      or Colab MiniMax-H3-Image, plus user review pause in --stage prepare

  Phase 2 (Google Colab A100 via Cloudflare Tunnel):
    - Per-shot batch video rendering using MiniMax-H3 Turbo / Hybrid workflows
    - Automatic aspect-matched reference upload & last-frame chaining
    - Per-shot checkpoint/resume in storyboard.json & retry on transient errors
    - Optional Auto-Disconnect Kill Switch (POST /auto-disconnect) on completion

  Phase 3 (Local PC - 0 Colab Credits):
    - FFmpeg per-shot duration conforming (trim / smooth PTS alignment to beat timestamps)
    - Seamless concatenation + original Flow Music master audio muxing
    - Stylized .ass Title Card + lyric subtitle burn-in (clean + subtitled MP4 exports)
"""

from __future__ import annotations

import argparse
import base64
import html as html_lib
import importlib.util
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

# Ensure clean UTF-8 logs on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Environment & Binary Resolution
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_LOCAL_FLUX_OUTPUTS = Path(r"C:\Users\Administrator\comfyui-flux2-dashboard\outputs")

ASPECT_PRESETS: Dict[str, Tuple[int, int]] = {
    "16:9": (1024, 576),
    "9:16": (576, 1024),
    "1:1": (768, 768),
}

MINIMAX_FRAME_GRID = [
    (56, 2.33),
    (73, 3.04),
    (124, 5.17),
    (243, 10.12),
    (362, 15.08),
]


def load_dotenv_files() -> None:
    """Load simple KEY=VALUE entries from .env files without extra dependencies."""
    candidates = [
        REPO_ROOT / ".env",
        REPO_ROOT / "scripts" / ".env",
        Path.cwd() / ".env",
    ]
    for env_path in candidates:
        if not env_path.is_file():
            continue
        try:
            for raw_line in env_path.read_text(encoding="utf-8-sig").splitlines():
                line = raw_line.strip().lstrip("\ufeff")
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip().lstrip("\ufeff")
                v = v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
        except Exception as exc:
            print(f"[Warn] Failed reading {env_path}: {exc}")


def resolve_ffmpeg() -> str:
    """Locate ffmpeg executable (system PATH or imageio_ffmpeg) and expose it on PATH."""
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        try:
            import imageio_ffmpeg  # type: ignore

            ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception as exc:
            raise RuntimeError(
                "FFmpeg was not found in PATH and imageio-ffmpeg is unavailable. "
                "Install FFmpeg or run via your .venv with imageio-ffmpeg."
            ) from exc

    ffmpeg_dir = str(Path(ffmpeg_bin).parent)
    current_path = os.environ.get("PATH", "")
    if ffmpeg_dir.lower() not in current_path.lower():
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + current_path
    return ffmpeg_bin


def has_module(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def run_cmd(cmd: List[str], cwd: Optional[Path] = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=check,
    )


def get_media_duration(ffmpeg_bin: str, media_path: Path) -> float:
    """Probe exact duration (seconds) of an audio or video file."""
    # Fast container probe via PyAV if installed
    if has_module("av"):
        try:
            import av  # type: ignore

            with av.open(str(media_path)) as container:
                if container.duration:
                    return round(container.duration / float(av.time_base), 3)
        except Exception:
            pass

    # Fallback: parse FFmpeg stderr Duration: HH:MM:SS.xx
    res = run_cmd([ffmpeg_bin, "-hide_banner", "-i", str(media_path)], check=False)
    combined = (res.stdout or "") + "\n" + (res.stderr or "")
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", combined)
    if match:
        hours, mins, secs = float(match.group(1)), float(match.group(2)), float(match.group(3))
        return round(hours * 3600.0 + mins * 60.0 + secs, 3)

    raise RuntimeError(f"Unable to determine media duration for: {media_path}")


# ---------------------------------------------------------------------------
# Phase 1.0: Flow Music / URL Audio Ingestion
# ---------------------------------------------------------------------------
UUID_REGEX = re.compile(r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})")


def _extract_meta_content(page_html: str, attr_name: str, attr_val: str) -> str:
    pattern = rf'<meta[^>]+{attr_name}=["\']{re.escape(attr_val)}["\'][^>]+content=["\']([^"\']*)["\']|<meta[^>]+content=["\']([^"\']*)["\'][^>]+{attr_name}=["\']{re.escape(attr_val)}["\']'
    m = re.search(pattern, page_html, flags=re.I)
    if not m:
        return ""
    return html_lib.unescape((m.group(1) or m.group(2) or "").strip())


def derive_project_slug(audio_arg: str, custom_project: Optional[str]) -> str:
    if custom_project:
        return re.sub(r"[^a-zA-Z0-9_-]", "_", custom_project)
    if audio_arg.startswith(("http://", "https://")):
        m = UUID_REGEX.search(audio_arg)
        if m:
            return f"flow_{m.group(1)[:8]}"
        url_path = urllib.parse.urlparse(audio_arg).path
        stem = Path(url_path).stem or "url_song"
        return re.sub(r"[^a-zA-Z0-9_-]", "_", stem)
    return re.sub(r"[^a-zA-Z0-9_-]", "_", Path(audio_arg).stem)


def resolve_audio_input(
    audio_arg: str,
    project_dir: Path,
    lyrics_file: Optional[str] = None,
) -> Tuple[Path, Dict[str, Any]]:
    """Resolve local audio file or Flow Music / HTTP URL into local audio + song_metadata.json."""
    meta_path = project_dir / "song_metadata.json"
    existing_meta: Dict[str, Any] = {}
    if meta_path.is_file():
        try:
            existing_meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            existing_meta = {}

    meta: Dict[str, Any] = {
        "title": existing_meta.get("title", ""),
        "author": existing_meta.get("author", ""),
        "sound_tags": existing_meta.get("sound_tags", ""),
        "lyrics": existing_meta.get("lyrics", ""),
        "source_url": existing_meta.get("source_url", ""),
        "audio_url": existing_meta.get("audio_url", ""),
        "local_audio_path": existing_meta.get("local_audio_path", ""),
    }

    if audio_arg.startswith(("http://", "https://")):
        meta["source_url"] = audio_arg
        uuid_match = UUID_REGEX.search(audio_arg)
        is_flow = "flowmusic.app" in audio_arg.lower()

        if is_flow or (uuid_match and not audio_arg.lower().endswith((".mp3", ".wav", ".m4a", ".ogg", ".flac"))):
            song_id = uuid_match.group(1) if uuid_match else ""
            page_url = f"https://www.flowmusic.app/song/{song_id}" if song_id else audio_arg
            print(f"[FlowMusic] Fetching song metadata & lyrics from {page_url}...")
            try:
                page_res = requests.get(page_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
                page_res.raise_for_status()
                page_html = page_res.text

                og_title = _extract_meta_content(page_html, "property", "og:title")
                musician = _extract_meta_content(page_html, "name", "music:musician")
                if og_title:
                    if musician and og_title.endswith(f" by {musician}"):
                        meta["title"] = og_title[: -(len(musician) + 4)].strip()
                    elif " by " in og_title:
                        meta["title"] = og_title.rsplit(" by ", 1)[0].strip()
                    else:
                        meta["title"] = og_title
                if musician:
                    meta["author"] = musician

                og_audio = _extract_meta_content(page_html, "property", "og:audio")
                if og_audio:
                    meta["audio_url"] = og_audio

                sound_match = re.search(r">Sound</div>\s*<div[^>]*>(.*?)</div>", page_html, flags=re.S | re.I)
                if sound_match:
                    meta["sound_tags"] = html_lib.unescape(re.sub(r"<[^>]+>", "", sound_match.group(1))).strip()

                lyrics_match = re.search(
                    r'<span[^>]*whitespace-pre-wrap[^>]*>(.*?)</span>', page_html, flags=re.S | re.I
                )
                if lyrics_match:
                    meta["lyrics"] = html_lib.unescape(re.sub(r"<[^>]+>", "", lyrics_match.group(1))).strip()
            except Exception as exc:
                print(f"[Warn] Flow Music HTML parse warning: {exc}")

            if not meta["audio_url"] and song_id:
                meta["audio_url"] = f"https://storage.googleapis.com/producer-app-public/clips/{song_id}.m4a"
        else:
            meta["audio_url"] = audio_arg

        audio_url = meta["audio_url"]
        if not audio_url:
            raise RuntimeError(f"Could not resolve downloadable audio URL from: {audio_arg}")

        ext = Path(urllib.parse.urlparse(audio_url).path).suffix or ".m4a"
        local_audio = project_dir / f"source_song{ext}"
        if local_audio.is_file() and local_audio.stat().st_size > 10000:
            print(f"[FlowMusic] Reusing cached audio -> {local_audio.name}")
        else:
            print(f"[FlowMusic] Downloading audio -> {audio_url}")
            dl = requests.get(audio_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=60, stream=True)
            dl.raise_for_status()
            with open(local_audio, "wb") as f:
                for chunk in dl.iter_content(chunk_size=1024 * 128):
                    if chunk:
                        f.write(chunk)
            print(f"[FlowMusic] Downloaded {local_audio.name} ({local_audio.stat().st_size / (1024*1024):.2f} MB)")
        audio_path = local_audio.resolve()
    else:
        audio_path = Path(audio_arg).expanduser().resolve()
        if not audio_path.is_file():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        if not meta["title"]:
            meta["title"] = audio_path.stem

    if lyrics_file:
        lpath = Path(lyrics_file).expanduser().resolve()
        if not lpath.is_file():
            raise FileNotFoundError(f"Lyrics file not found: {lpath}")
        meta["lyrics"] = lpath.read_text(encoding="utf-8-sig").strip()

    meta["local_audio_path"] = str(audio_path)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    if meta.get("title"):
        print(f"[Song] Title: {meta['title']}" + (f" (by {meta['author']})" if meta.get("author") else ""))
    if meta.get("sound_tags"):
        print(f"[Song] Sound: {meta['sound_tags'][:120]}...")
    return audio_path, meta


# ---------------------------------------------------------------------------
# Phase 1A: Audio Preparation (Duration, BPM/Beats, Optional Stems & Whisper)
# ---------------------------------------------------------------------------
def analyze_beats_and_energy(ffmpeg_bin: str, audio_path: Path, duration_sec: float) -> Dict[str, Any]:
    """Extract BPM, beat timestamps, and energy peaks using librosa or PyTorch fallback."""
    if has_module("librosa"):
        try:
            import librosa  # type: ignore
            import numpy as np  # type: ignore

            y, sr = librosa.load(str(audio_path), sr=22050, mono=True)
            tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
            beat_times = [round(float(t), 2) for t in librosa.frames_to_time(beat_frames, sr=sr)]
            rms = librosa.feature.rms(y=y)[0]
            rms_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr)
            sec_energy = []
            for s in range(max(1, int(math.ceil(duration_sec)))):
                mask = (rms_times >= s) & (rms_times < s + 1)
                val = float(rms[mask].mean()) if mask.any() else 0.0
                sec_energy.append(round(val, 4))
            bpm_val = float(tempo[0]) if hasattr(tempo, "__len__") else float(tempo)
            return {
                "engine": "librosa",
                "bpm": round(bpm_val, 1),
                "beat_count": len(beat_times),
                "beats": beat_times[:120],
                "energy_per_sec": sec_energy,
            }
        except Exception as exc:
            print(f"[Warn] librosa beat analysis failed ({exc}), falling back to PyTorch/FFmpeg...")

    # Pure PyTorch + FFmpeg PCM fallback (works cleanly with existing .venv)
    if has_module("torch"):
        try:
            import torch  # type: ignore

            sr = 16000
            proc = subprocess.run(
                [
                    ffmpeg_bin,
                    "-v",
                    "error",
                    "-i",
                    str(audio_path),
                    "-ac",
                    "1",
                    "-ar",
                    str(sr),
                    "-f",
                    "f32le",
                    "pipe:1",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=True,
            )
            pcm = torch.frombuffer(bytearray(proc.stdout), dtype=torch.float32)
            if pcm.numel() > sr:
                hop = sr // 20  # 50ms windows (20 Hz envelope)
                frames = pcm.unfold(0, hop, hop)
                rms_env = torch.sqrt(torch.mean(frames * frames, dim=1) + 1e-8)

                # Energy per 1-second bucket
                sec_energy = []
                for s in range(max(1, int(math.ceil(duration_sec)))):
                    chunk = rms_env[s * 20 : (s + 1) * 20]
                    sec_energy.append(round(float(chunk.mean().item()), 4) if chunk.numel() else 0.0)

                # Simple autocorrelation BPM estimate on onset flux
                flux = torch.clamp(rms_env[1:] - rms_env[:-1], min=0.0)
                flux = flux - flux.mean()
                min_lag = max(1, int(round(20 * 60.0 / 165.0)))  # ~165 BPM
                max_lag = min(flux.numel() // 2, int(round(20 * 60.0 / 65.0)))  # ~65 BPM
                best_bpm = 120.0
                if max_lag > min_lag + 2:
                    corrs = []
                    for lag in range(min_lag, max_lag + 1):
                        c = torch.dot(flux[:-lag], flux[lag:]).item()
                        corrs.append((c, lag))
                    _, best_lag = max(corrs, key=lambda x: x[0])
                    best_bpm = round(20.0 * 60.0 / best_lag, 1)

                # Local peaks in onset flux as beat/cut anchors
                beats = []
                step_sec = 60.0 / max(60.0, min(170.0, best_bpm))
                t = 0.0
                while t < duration_sec and len(beats) < 120:
                    beats.append(round(t, 2))
                    t += step_sec

                return {
                    "engine": "pytorch_pcm",
                    "bpm": best_bpm,
                    "beat_count": len(beats),
                    "beats": beats,
                    "energy_per_sec": sec_energy,
                }
        except Exception as exc:
            print(f"[Warn] PyTorch audio analysis failed ({exc}), using uniform beat grid.")

    return {
        "engine": "uniform_fallback",
        "bpm": 120.0,
        "beat_count": int(duration_sec / 0.5),
        "beats": [round(i * 0.5, 2) for i in range(min(120, int(duration_sec / 0.5)))],
        "energy_per_sec": [],
    }


def prepare_audio(
    ffmpeg_bin: str,
    audio_path: Path,
    project_dir: Path,
    separate_stems: bool = False,
    use_whisper: bool = False,
    has_lyrics: bool = False,
) -> Dict[str, Any]:
    """Analyze song duration/BPM and optionally separate vocal stems & run Whisper."""
    analysis_path = project_dir / "audio_analysis.json"
    duration_sec = get_media_duration(ffmpeg_bin, audio_path)
    print(f"[Audio] File: {audio_path.name} | Duration: {duration_sec:.2f}s")

    stems_dir = project_dir / "stems"
    vocals_path: Optional[Path] = None
    no_vocals_path: Optional[Path] = None

    if separate_stems:
        if has_module("demucs"):
            print("[Audio] Separating vocals/instrumental with Demucs (htdemucs)...")
            stems_dir.mkdir(parents=True, exist_ok=True)
            cmd = [
                sys.executable,
                "-m",
                "demucs",
                "-n",
                "htdemucs",
                "--two-stems=vocals",
                "-o",
                str(stems_dir),
                str(audio_path),
            ]
            res = run_cmd(cmd, check=False)
            if res.returncode == 0:
                stem_subdir = stems_dir / "htdemucs" / audio_path.stem
                v_cand = stem_subdir / "vocals.wav"
                nv_cand = stem_subdir / "no_vocals.wav"
                if v_cand.is_file():
                    vocals_path = v_cand
                if nv_cand.is_file():
                    no_vocals_path = nv_cand
                print(f"[Audio] Stems extracted: vocals={vocals_path}")
            else:
                print(f"[Warn] Demucs failed (exit {res.returncode}), continuing with master audio.")
                print(res.stderr[-400:])
        else:
            print("[Audio] Demucs not installed; skipping stem separation (run scripts/install_mv_deps.bat to enable).")

    beat_info = analyze_beats_and_energy(ffmpeg_bin, audio_path, duration_sec)
    print(f"[Audio] Beat analysis ({beat_info['engine']}): ~{beat_info['bpm']} BPM")

    whisper_segments: List[Dict[str, Any]] = []
    if use_whisper and has_lyrics:
        print("[Audio] Official lyrics already present from Flow Music / lyrics file; skipping Whisper transcription.")
    elif use_whisper:
        if has_module("faster_whisper"):
            try:
                from faster_whisper import WhisperModel  # type: ignore

                target_for_asr = vocals_path if vocals_path and vocals_path.is_file() else audio_path
                print(f"[Audio] Running faster-whisper on {target_for_asr.name}...")
                device = "cuda" if has_module("torch") else "cpu"
                compute_type = "float16" if device == "cuda" else "int8"
                model = WhisperModel("medium", device=device, compute_type=compute_type)
                segments_iter, info = model.transcribe(str(target_for_asr), vad_filter=True)
                for seg in segments_iter:
                    whisper_segments.append(
                        {
                            "start": round(float(seg.start), 2),
                            "end": round(float(seg.end), 2),
                            "text": seg.text.strip(),
                        }
                    )
                print(f"[Audio] Whisper extracted {len(whisper_segments)} lyric segments (lang={info.language}).")
            except Exception as exc:
                print(f"[Warn] faster-whisper failed ({exc}); Gemini will transcribe directly.")
        else:
            print("[Audio] faster-whisper not installed; Gemini multimodal audio will extract lyrics.")

    analysis = {
        "audio_path": str(audio_path.resolve()),
        "duration_sec": duration_sec,
        "vocals_path": str(vocals_path.resolve()) if vocals_path else None,
        "no_vocals_path": str(no_vocals_path.resolve()) if no_vocals_path else None,
        "beat_info": beat_info,
        "whisper_segments": whisper_segments,
    }
    analysis_path.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
    return analysis


def slice_shot_audio_files(ffmpeg_bin: str, source_audio: Path, project_dir: Path, shots: List[Dict[str, Any]]) -> None:
    """Slice per-shot WAV audio chunks into audio_slices/ for inspection or future lip-sync nodes."""
    slices_dir = project_dir / "audio_slices"
    slices_dir.mkdir(parents=True, exist_ok=True)
    for shot in shots:
        sid = int(shot["shot_id"])
        start = float(shot["start_sec"])
        dur = max(0.25, float(shot["end_sec"]) - start)
        out_wav = slices_dir / f"shot_{sid:03d}.wav"
        shot["audio_slice_path"] = str(out_wav.resolve())
        if out_wav.is_file() and out_wav.stat().st_size > 1000:
            continue
        cmd = [
            ffmpeg_bin,
            "-y",
            "-v",
            "error",
            "-ss",
            f"{start:.3f}",
            "-t",
            f"{dur:.3f}",
            "-i",
            str(source_audio),
            "-ac",
            "1",
            "-ar",
            "16000",
            str(out_wav),
        ]
        run_cmd(cmd, check=False)


# ---------------------------------------------------------------------------
# Phase 1B: Gemini AI Director Storyboarding (google-genai Interactions API)
# ---------------------------------------------------------------------------
STORYBOARD_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "visual_style": {"type": "string"},
        "characters": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "name": {"type": "string"},
                    "appearance_prompt": {"type": "string"},
                },
                "required": ["id", "name", "appearance_prompt"],
            },
        },
        "shots": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "shot_id": {"type": "integer"},
                    "start_sec": {"type": "number"},
                    "end_sec": {"type": "number"},
                    "section": {
                        "type": "string",
                        "enum": ["intro", "verse", "pre_chorus", "chorus", "bridge", "outro"],
                    },
                    "shot_type": {
                        "type": "string",
                        "enum": [
                            "singing_closeup",
                            "performance_medium",
                            "dance_group",
                            "narrative_action",
                            "broll_environment",
                        ],
                    },
                    "character_id": {"type": "string"},
                    "chain_from_previous": {"type": "boolean"},
                    "camera_angle": {"type": "string"},
                    "visual_prompt": {"type": "string"},
                    "audio_prompt": {"type": "string"},
                    "lyric_line": {"type": "string"},
                },
                "required": [
                    "shot_id",
                    "start_sec",
                    "end_sec",
                    "section",
                    "shot_type",
                    "character_id",
                    "chain_from_previous",
                    "camera_angle",
                    "visual_prompt",
                    "audio_prompt",
                    "lyric_line",
                ],
            },
        },
    },
    "required": ["title", "visual_style", "characters", "shots"],
}


def guess_audio_mime(audio_path: Path) -> str:
    ext = audio_path.suffix.lower()
    mapping = {
        ".mp3": "audio/mp3",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
    }
    return mapping.get(ext, "audio/mp3")


def extract_json_payload(text: str) -> Dict[str, Any]:
    """Parse JSON cleanly even if wrapped in markdown code fences."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        first = cleaned.find("{")
        last = cleaned.rfind("}")
        if first != -1 and last > first:
            return json.loads(cleaned[first : last + 1])
        raise


def duration_to_minimax_frames(duration_sec: float) -> int:
    """Snap target duration to MiniMax-H3 (17k + 5) frame grid at 24fps."""
    if duration_sec <= 2.4:
        return 56
    if duration_sec <= 3.8:
        return 73
    if duration_sec <= 6.5:
        return 124
    if duration_sec <= 11.0:
        return 243
    return 362


def sanitize_storyboard(
    raw: Dict[str, Any],
    total_duration: float,
    aspect_ratio: str,
    concept: str,
) -> Dict[str, Any]:
    """Ensure shot timestamps are contiguous from 0.0 to total_duration and attach frame targets."""
    shots = raw.get("shots") or []
    if not shots:
        raise ValueError("Gemini returned an empty shots array.")

    sanitized_shots: List[Dict[str, Any]] = []
    cursor = 0.0
    for idx, s in enumerate(shots):
        start = round(cursor, 2)
        raw_start = float(s.get("start_sec", start))
        raw_end = float(s.get("end_sec", start + 5.0))
        desired_dur = max(2.5, min(10.0, raw_end - raw_start))

        if idx == len(shots) - 1:
            end = round(total_duration, 2)
        else:
            end = round(min(total_duration, start + desired_dur), 2)

        if end <= start + 0.3:
            continue

        dur = round(end - start, 2)
        sanitized_shots.append(
            {
                "shot_id": len(sanitized_shots) + 1,
                "start_sec": start,
                "end_sec": end,
                "duration_sec": dur,
                "target_frames": duration_to_minimax_frames(dur),
                "section": s.get("section", "verse"),
                "shot_type": s.get("shot_type", "performance_medium"),
                "character_id": s.get("character_id", ""),
                "chain_from_previous": bool(s.get("chain_from_previous", False)) if len(sanitized_shots) > 0 else False,
                "camera_angle": s.get("camera_angle", "medium cinematic shot"),
                "visual_prompt": s.get("visual_prompt", "").strip(),
                "audio_prompt": s.get("audio_prompt", "").strip(),
                "lyric_line": s.get("lyric_line", "").strip(),
                "status": "pending",
                "raw_video_path": None,
            }
        )
        cursor = end
        if cursor >= total_duration - 0.15:
            break

    # If Gemini ended early, stretch final shot or append an outro shot to cover full audio
    if sanitized_shots and sanitized_shots[-1]["end_sec"] < total_duration - 0.5:
        gap = total_duration - sanitized_shots[-1]["end_sec"]
        if gap <= 3.5:
            sanitized_shots[-1]["end_sec"] = round(total_duration, 2)
            sanitized_shots[-1]["duration_sec"] = round(
                sanitized_shots[-1]["end_sec"] - sanitized_shots[-1]["start_sec"], 2
            )
            sanitized_shots[-1]["target_frames"] = duration_to_minimax_frames(
                sanitized_shots[-1]["duration_sec"]
            )
        else:
            last_start = sanitized_shots[-1]["end_sec"]
            while last_start < total_duration - 0.3:
                seg_end = round(min(total_duration, last_start + 5.0), 2)
                seg_dur = round(seg_end - last_start, 2)
                sanitized_shots.append(
                    {
                        "shot_id": len(sanitized_shots) + 1,
                        "start_sec": round(last_start, 2),
                        "end_sec": seg_end,
                        "duration_sec": seg_dur,
                        "target_frames": duration_to_minimax_frames(seg_dur),
                        "section": "outro",
                        "shot_type": "broll_environment",
                        "character_id": "",
                        "chain_from_previous": False,
                        "camera_angle": "wide atmospheric pull-back",
                        "visual_prompt": f"Atmospheric ending wide shot fading into glowing night light, {raw.get('visual_style', '')}",
                        "audio_prompt": "soft fading musical ambience, warm atmospheric stereo sound",
                        "lyric_line": "",
                        "status": "pending",
                        "raw_video_path": None,
                    }
                )
                last_start = seg_end

    return {
        "title": raw.get("title") or "AI Music Video",
        "concept": concept,
        "aspect_ratio": aspect_ratio,
        "total_duration_sec": round(total_duration, 2),
        "visual_style": raw.get("visual_style", ""),
        "characters": raw.get("characters", []),
        "shots": sanitized_shots,
    }


PLOTS_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "song_title": {"type": "string"},
        "song_analysis_th": {"type": "string"},
        "plots": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "plot_id": {"type": "integer"},
                    "title_th": {"type": "string"},
                    "logline_th": {"type": "string"},
                    "synopsis_th": {"type": "string"},
                    "visual_style": {"type": "string"},
                    "concept_prompt": {"type": "string"},
                    "recommended_aspect": {"type": "string", "enum": ["16:9", "9:16"]},
                    "main_characters": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "name_th": {"type": "string"},
                                "role_th": {"type": "string"},
                                "appearance_prompt": {"type": "string"},
                            },
                            "required": ["id", "name_th", "role_th", "appearance_prompt"],
                        },
                    },
                },
                "required": [
                    "plot_id",
                    "title_th",
                    "logline_th",
                    "synopsis_th",
                    "visual_style",
                    "concept_prompt",
                    "recommended_aspect",
                    "main_characters",
                ],
            },
        },
    },
    "required": ["song_title", "song_analysis_th", "plots"],
}


def _prepare_gemini_mp3(audio_path: Path) -> Path:
    """Create a lightweight mono 16kHz 32kbps MP3 (<=90s) for fast, reliable Gemini audio understanding."""
    ffmpeg_bin = resolve_ffmpeg()
    out_mp3 = audio_path.parent / "gemini_input.mp3"
    if out_mp3.is_file() and out_mp3.stat().st_size > 4000:
        return out_mp3
    run_cmd(
        [
            ffmpeg_bin,
            "-y",
            "-v",
            "error",
            "-t",
            "90",
            "-i",
            str(audio_path),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "32k",
            str(out_mp3),
        ],
        check=True,
    )
    return out_mp3


def _is_retryable_gemini_err(err_msg: str) -> bool:
    low = err_msg.lower()
    return any(
        k in low
        for k in [
            "not found",
            "not_found",
            "404",
            "invalid model",
            "unknown model",
            "unsupported model",
            "not supported",
            "503",
            "service_unavailable",
            "high demand",
            "429",
            "rate limit",
            "quota",
            "timed out",
            "timeout",
            "json",
            "schema",
        ]
    )


def _thinking_config_for_model(model_name: str) -> Optional[Dict[str, Any]]:
    """Use minimal/low thinking to minimize latency and avoid Free Tier 503 preemption."""
    low = model_name.lower()
    if any(k in low for k in ["flash-lite", "3.6-flash", "3-flash-preview"]):
        return {"thinking_level": "minimal"}
    if any(k in low for k in ["gemini-4-", "3.8-flash", "3.7-flash", "3.5-flash"]):
        return {"thinking_level": "low"}
    return None


def _call_gemini_structured(
    audio_path: Path,
    prompt_text: str,
    response_schema: Dict[str, Any],
    api_key: str,
    requested_model: str,
    task_label: str,
    audio_start_sec: float = 0.0,
    audio_clip_sec: float = 90.0,
    include_audio: bool = True,
) -> Tuple[Dict[str, Any], str]:
    """Shared Gemini Interactions API call with low/minimal thinking + fast 503/429 fallback."""
    from google import genai  # type: ignore
    from google.genai import types  # type: ignore

    client = genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(
            timeout=90000,
            retry_options=types.HttpRetryOptions(attempts=1),
        ),
    )

    model_chain: List[str] = []
    for candidate in [requested_model, "gemini-3.8-flash", "gemini-3.5-flash-lite"]:
        if candidate and candidate not in model_chain:
            model_chain.append(candidate)

    audio_input: Optional[Dict[str, Any]] = None
    audio_kb = 0
    if include_audio:
        ffmpeg_bin = resolve_ffmpeg()
        if audio_start_sec <= 0.05 and abs(audio_clip_sec - 90.0) < 0.1:
            gemini_audio_path = _prepare_gemini_mp3(audio_path)
        else:
            gemini_audio_path = audio_path.parent / f"gemini_slice_{int(audio_start_sec)}_{int(audio_clip_sec)}.mp3"
            if not (gemini_audio_path.is_file() and gemini_audio_path.stat().st_size > 2000):
                run_cmd(
                    [
                        ffmpeg_bin,
                        "-y",
                        "-v",
                        "error",
                        "-ss",
                        f"{audio_start_sec:.2f}",
                        "-t",
                        f"{audio_clip_sec:.2f}",
                        "-i",
                        str(audio_path),
                        "-ac",
                        "1",
                        "-ar",
                        "16000",
                        "-b:a",
                        "32k",
                        str(gemini_audio_path),
                    ],
                    check=True,
                )
        audio_kb = gemini_audio_path.stat().st_size // 1024
        b64_audio = base64.b64encode(gemini_audio_path.read_bytes()).decode("utf-8")
        audio_input = {"type": "audio", "data": b64_audio, "mime_type": "audio/mp3"}

    json_fallback_prompt = (
        f"{prompt_text}\n\n"
        f"IMPORTANT: Respond with ONLY raw valid JSON (no markdown, no explanation) strictly matching this JSON Schema:\n"
        f"{json.dumps(response_schema, ensure_ascii=False)}"
    )

    last_error: Optional[Exception] = None
    for model_name in model_chain:
        tcfg = _thinking_config_for_model(model_name)
        print(f"[Gemini] Running {task_label} with model '{model_name}' (audio={audio_kb}KB, thinking={tcfg})...")
        # Attempt prompt-JSON directly on flash-lite to minimize decoding overhead; schema+fallback on primary
        modes = (False,) if "flash-lite" in model_name.lower() else (True, False)
        for use_schema in modes:
            try:
                content_parts: List[Dict[str, Any]] = []
                if audio_input is not None:
                    content_parts.append(audio_input)
                content_parts.append({"type": "text", "text": prompt_text if use_schema else json_fallback_prompt})
                kwargs: Dict[str, Any] = {"model": model_name, "input": content_parts}
                if tcfg:
                    kwargs["generation_config"] = tcfg
                if use_schema:
                    kwargs["response_format"] = response_schema
                interaction = client.interactions.create(**kwargs)
                output_text = interaction.output_text
                if not output_text:
                    raise RuntimeError(f"Model '{model_name}' returned empty output_text.")
                return extract_json_payload(output_text), model_name
            except Exception as exc:
                last_error = exc
                err_msg = str(exc)
                if not _is_retryable_gemini_err(err_msg):
                    raise
                mode_lbl = "structured schema" if use_schema else "prompt JSON"
                print(f"[Warn] '{model_name}' ({mode_lbl}) unavailable/busy ({err_msg[:130]}).")
                if not use_schema:
                    break

    # Single fast retry on flash-lite text prompt before triggering built-in fallback
    time.sleep(1.5)
    print(f"[Warn] Retrying {task_label} on 'gemini-3.5-flash-lite' (minimal thinking, text prompt)...")
    try:
        interaction = client.interactions.create(
            model="gemini-3.5-flash-lite",
            input=[{"type": "text", "text": json_fallback_prompt}],
            generation_config={"thinking_level": "minimal"},
        )
        if interaction.output_text:
            return extract_json_payload(interaction.output_text), "gemini-3.5-flash-lite"
    except Exception as exc:
        last_error = exc

    raise RuntimeError(f"All Gemini models failed. Last error: {last_error}")


def _synthesize_plots_fallback(
    title: str,
    sound_tags: str,
    lyrics: str,
    duration_sec: float,
    bpm: float,
) -> Dict[str, Any]:
    """Local Lyric & Beat Director fallback when external Free Tier Gemini API hits 503/429."""
    lyric_excerpt = " ".join(l.strip() for l in lyrics.splitlines() if l.strip() and not l.strip().startswith("["))[:180]
    style_desc = sound_tags or f"Music track (~{bpm} BPM, {duration_sec:.0f}s)"
    return {
        "song_title": title,
        "song_analysis_th": (
            f"เพลง '{title}' ความยาว {duration_sec:.0f} วินาที (~{bpm} BPM) สไตล์ {style_desc}. "
            + (f"เนื้อหาพูดถึง: {lyric_excerpt}..." if lyric_excerpt else "")
        ),
        "plots": [
            {
                "plot_id": 1,
                "title_th": f"{title} — ฉบับแอนิเมชัน 3D แฟนตาซีมิวสิคัล",
                "logline_th": f"เรื่องราวแฟนตาซีดนตรีแนว Disney/Pixar ที่ถ่ายทอดอารมณ์และเนื้อเพลง '{title}' ผ่านเมืองเวทมนตร์และตัวละครหลักสุดมีเสน่ห์",
                "synopsis_th": "Intro เปิดฉากเมืองแฟนตาซีใต้แสงไฟมหัศจรรย์ Verse 1-2 ตัวละครหลักร้องเพลงเล่าเรื่องราวและอุปสรรคในเมือง Chorus ระเบิดพลังโชว์แสงสีและท่วงทำนอง Bridge พลิกมุมกล้องอารมณ์เข้มข้น Outro ปิดฉากด้วยภาพมุมกว้างสุดประทับใจ",
                "visual_style": "3D Disney/Pixar theatrical musical animation, rich volumetric lighting, expressive stylized characters, magical glowing dust particles, cinema-grade rendering",
                "concept_prompt": f"3D animated musical storytelling video for '{title}' ({style_desc}), rhythmic scene cuts synced to lyrics and beat",
                "recommended_aspect": "16:9",
                "main_characters": [
                    {
                        "id": "char_1",
                        "name_th": "ตัวเอกนักเล่าเรื่อง (Lead Performer)",
                        "role_th": "นักร้องนำและผู้ดำเนินเรื่อง",
                        "appearance_prompt": "Stylized 3D Pixar-style charismatic lead performer, expressive eyes, theatrical tailored coat with subtle gold trim, warm key rim lighting, crisp facial details",
                    }
                ],
            },
            {
                "plot_id": 2,
                "title_th": f"{title} — ฉบับคนแสดงจริงบนเวทีบรอดเวย์/นีออน",
                "logline_th": f"MV คนแสดงภาพยนตร์สมจริง สลับฉากระหว่างเวทีการแสดงสุดอลังการกับฉากเมืองยามค่ำคืนที่สอดรับจังหวะเพลง '{title}'",
                "synopsis_th": "Intro เปิดตัวใต้แสงสปอตไลต์บนเวทีใหญ่ Verse 1-2 เดินร้องและแสดงอารมณ์ท่ามกลางฉากเมืองนีออน Chorus เต้นและร้องประสานพลังเต็มเฟรม Bridge เล่าเรื่องย้อนอารมณ์ใกล้ชิด Outro จบด้วยช็อตโพสท่าเด่นกลางแสงไฟเวที",
                "visual_style": "Photorealistic live-action cinematic music video, grand stage spotlights and neon reflections, shallow depth of field, 35mm anamorphic cinema lens",
                "concept_prompt": f"Photorealistic live-action stage and urban performance MV for '{title}' ({style_desc})",
                "recommended_aspect": "16:9",
                "main_characters": [
                    {
                        "id": "char_1",
                        "name_th": "นักร้องนำบนเวที (Stage Lead)",
                        "role_th": "นักร้องหลัก",
                        "appearance_prompt": "Photorealistic Asian lead vocalist in sharp tailored velvet stage suit with metallic lapel accents, dramatic spotlight rim light, expressive singing posture, 35mm lens",
                    }
                ],
            },
            {
                "plot_id": 3,
                "title_th": f"{title} — ฉบับโรงละครอาร์ตสมมาตร & แฟนตาซีตลกร้าย",
                "logline_th": f"ภาพยนตร์เพลงสไตล์องค์ประกอบภาพสมมาตร สีสันจัดจ้าน เหนือจริง ถ่ายทอดเรื่องราว '{title}' ในโรงละครหุ่นเชิดจำลอง",
                "synopsis_th": "Intro ม่านโรงละครเปิดออกเผยฉากจำลองสมมาตร Verse 1-2 ตัวละครเคลื่อนไหวเป็นจังหวะดุจละครเวที Chorus องค์ประกอบฉากหมุนเปลี่ยนเหนือจริงตามท่อนฮุก Bridge แสงไฟเปลี่ยนโทนเข้มขรึม Outro ปิดม่านละครด้วยรอยยิ้มปริศนา",
                "visual_style": "Stylized symmetrical art-house miniature theater aesthetic, Wes Anderson color palette meets theatrical spotlighting, whimsical practical props, warm tungsten glow",
                "concept_prompt": f"Symmetrical art-house theatrical fantasy music video for '{title}' ({style_desc})",
                "recommended_aspect": "16:9",
                "main_characters": [
                    {
                        "id": "char_1",
                        "name_th": "วาทยกรโรงละคร (Theater Maestro)",
                        "role_th": "ผู้กำกับเวทีและนักร้อง",
                        "appearance_prompt": "Stylized theatrical maestro in symmetrical pastel-ivory and gold vintage coat, white gloves, expressive brows, warm tungsten theater lighting, crisp detail",
                    }
                ],
            },
        ],
        "gemini_model_used": "local_lyric_beat_fallback",
    }


def _parse_lyrics_sections(lyrics: str) -> List[Tuple[str, str]]:
    """Parse [Section] headers and individual lyric lines into (section_name, line_text) pairs."""
    if not lyrics or not lyrics.strip():
        return []
    current_sec = "verse"
    items: List[Tuple[str, str]] = []
    for raw_line in lyrics.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        sec_match = re.match(r"^\[([^\]]+)\]$", line)
        if sec_match:
            tag = sec_match.group(1).lower()
            if "intro" in tag:
                current_sec = "intro"
            elif "pre" in tag:
                current_sec = "pre_chorus"
            elif "chorus" in tag:
                current_sec = "chorus"
            elif "bridge" in tag:
                current_sec = "bridge"
            elif "outro" in tag:
                current_sec = "outro"
            else:
                current_sec = "verse"
            continue
        items.append((current_sec, line))
    return items


def _synthesize_storyboard_from_lyrics_and_beats(
    title: str,
    concept: str,
    style: str,
    aspect_ratio: str,
    duration_sec: float,
    bpm: float,
    lyrics: str,
    chosen_plot: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Synthesize a contiguous beat-and-lyric-aligned storyboard when Free Tier Gemini API is unavailable."""
    chars: List[Dict[str, str]] = []
    if chosen_plot and chosen_plot.get("main_characters"):
        for c in chosen_plot["main_characters"]:
            chars.append(
                {
                    "id": c["id"],
                    "name": c.get("name_th", c["id"]),
                    "appearance_prompt": c["appearance_prompt"],
                }
            )
    else:
        chars.append(
            {
                "id": "char_1",
                "name": "Lead Performer",
                "appearance_prompt": f"Charismatic lead performer matching style: {style}, crisp face details, expressive acting",
            }
        )

    parsed_lines = _parse_lyrics_sections(lyrics)
    slots: List[Tuple[float, float, str]] = []
    t = 0.0
    idx = 0
    while t < duration_sec - 0.5:
        step = 3.0 if (t < 15.0 or (idx % 3 == 2)) else 5.0
        end = min(duration_sec, round(t + step, 2))
        if duration_sec - end < 2.5:
            end = round(duration_sec, 2)
        sec_label = "intro" if t < 12.0 else ("outro" if t > duration_sec - 15.0 else "verse")
        slots.append((round(t, 2), end, sec_label))
        t = end
        idx += 1

    angles = [
        ("singing_closeup", "medium close-up slow push-in"),
        ("performance_medium", "medium tracking shot"),
        ("narrative_action", "low-angle dynamic dolly shot"),
        ("singing_closeup", "expressive orbital close-up"),
        ("broll_environment", "dramatic wide establishing visual shot"),
    ]
    shots: List[Dict[str, Any]] = []
    for i, (s, e, default_sec) in enumerate(slots):
        lyric_txt = ""
        sec = default_sec
        if parsed_lines:
            l_idx = min(len(parsed_lines) - 1, int(i * len(parsed_lines) / max(1, len(slots))))
            sec, lyric_txt = parsed_lines[l_idx]

        shot_type, cam_angle = angles[i % len(angles)]
        if i == 0:
            shot_type, cam_angle = "broll_environment", "wide establishing crane shot"
        elif lyric_txt and shot_type == "broll_environment":
            shot_type, cam_angle = "singing_closeup", "medium close-up spotlight shot"

        char_obj = chars[i % len(chars)] if shot_type != "broll_environment" else None
        char_id = char_obj["id"] if char_obj else ""
        char_desc = char_obj["appearance_prompt"] if char_obj else "grand atmospheric scenery without tiny distant faces"
        vis_prompt = (
            f"{style}. {cam_angle}, {char_desc}. "
            f"Scene inspired by: {concept[:140]}. "
            f"Rich cinematic lighting synced to {bpm:.0f} BPM rhythm."
        )
        shots.append(
            {
                "shot_id": i + 1,
                "start_sec": s,
                "end_sec": e,
                "section": sec,
                "shot_type": shot_type,
                "character_id": char_id,
                "chain_from_previous": False,
                "camera_angle": cam_angle,
                "visual_prompt": vis_prompt,
                "audio_prompt": "theatrical musical vocal performance, crisp stereo orchestra" if lyric_txt else "cinematic orchestral swell, crisp stereo atmosphere",
                "lyric_line": lyric_txt,
            }
        )

    raw_sb = {"title": title, "visual_style": style, "characters": chars, "shots": shots}
    sb = sanitize_storyboard(raw_sb, duration_sec, aspect_ratio, concept)
    if chosen_plot:
        sb["chosen_plot_id"] = chosen_plot.get("plot_id")
        sb["chosen_plot_title_th"] = chosen_plot.get("title_th")
    sb["gemini_model_used"] = "local_lyric_beat_fallback"
    return sb


SINGLE_PLOT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "song_analysis_th": {"type": "string"},
        "plot": PLOTS_SCHEMA["properties"]["plots"]["items"],
    },
    "required": ["plot"],
}

CHUNKED_PLOT_DIRECTIONS = [
    (1, "3D Disney / Pixar Animated Broadway Musical Fantasy (แอนิเมชัน 3D สไตล์ดิสนีย์/พิกซาร์ ละครเพลงเวทมนตร์เสียดสี)"),
    (2, "Photorealistic Cinematic Live-Action Grand Broadway & Neon Stage Satire (คนแสดงสมจริง เวทีบรอดเวย์/มิวสิคัลสุดอลังการ ฉากเมืองและไฟนีออน)"),
    (3, "Stylized Dark Fairy Tale / Symmetrical Art-House Puppet & Stop-Motion Theater (โรงละครแฟนตาซีตลกร้าย ภาพสมมาตรสีจัดจ้านสไตล์ภาพยนตร์อาร์ต)"),
]


def generate_mv_plots_with_gemini(
    audio_path: Path,
    analysis: Dict[str, Any],
    song_meta: Dict[str, Any],
    api_key: str,
    requested_model: str,
    user_hint: str = "",
) -> Dict[str, Any]:
    """Listen to song and pitch 3 distinct MV concepts + visual styles + character concepts."""
    duration_sec = float(analysis["duration_sec"])
    bpm = analysis.get("beat_info", {}).get("bpm", 120)
    title = song_meta.get("title") or audio_path.stem
    sound_tags = song_meta.get("sound_tags") or ""
    lyrics = song_meta.get("lyrics") or ""
    has_lyrics = bool(lyrics.strip())

    meta_block = f"Song Title: {title}\nDuration: {duration_sec:.2f}s | Detected BPM: ~{bpm}\n"
    if sound_tags:
        meta_block += f"Music Style Tags: {sound_tags}\n"
    if lyrics:
        meta_block += f"Lyrics:\n{lyrics}\n"
    if user_hint:
        meta_block += f"User Preference Hint: {user_hint}\n"

    pitch_prompt = f"""You are an award-winning Music Video Creative Director for MiniMax-H3 & FLUX AI production.
{"Study the official song metadata, lyrics, and BPM below:" if has_lyrics else "Listen carefully to the attached audio track and study the song details below:"}

{meta_block}

Task:
1. Analyze the music genre, rhythm, vocal delivery, emotional arc, and lyrical meaning (`song_analysis_th` in clear, insightful Thai).
2. Design **3 distinctly different, compelling Music Video Plot & Visual Style Pitches** (`plots` array with `plot_id` = 1, 2, 3) tailored specifically to this song:
   - Make each of the 3 plots feel genuinely different in visual medium, tone, and storytelling approach (e.g., 3D Pixar/Disney animated musical, live-action Broadway/neon stage satire, and stylized dark-fairytale/art-house theater).
   - Keep descriptions crisp and production-ready (2-3 sentences per synopsis).
   - For each plot, provide `title_th`, `logline_th`, `synopsis_th`, `visual_style` (English), `concept_prompt` (English), `recommended_aspect` (`"16:9"` or `"9:16"`), and `main_characters` (1 to 3 recurring characters with `id`, `name_th`, `role_th`, and detailed English `appearance_prompt`).

Return ONLY valid JSON matching the schema."""

    try:
        raw_plots, model_used = _call_gemini_structured(
            audio_path=audio_path,
            prompt_text=pitch_prompt,
            response_schema=PLOTS_SCHEMA,
            api_key=api_key,
            requested_model=requested_model,
            task_label="3-plot MV pitch",
            include_audio=(not has_lyrics),
        )
        if len(raw_plots.get("plots", [])) >= 3:
            for idx, p in enumerate(raw_plots.get("plots", []), start=1):
                p["plot_id"] = idx
            raw_plots["gemini_model_used"] = model_used
            raw_plots["song_title"] = raw_plots.get("song_title") or title
            return raw_plots
    except Exception as exc:
        print(f"[Warn] Combined 3-plot pitch hit transient API limits ({str(exc)[:140]}). Switching to Per-Plot Chunked Pitching...")

    # Resilient Per-Plot Chunked Generation (~250 tokens per request -> fast & resilient against 503 preemption)
    plots_list: List[Dict[str, Any]] = []
    song_analysis_th = ""
    last_model_used = requested_model
    for plot_id, direction in CHUNKED_PLOT_DIRECTIONS:
        single_prompt = f"""You are an award-winning Music Video Creative Director for MiniMax-H3 & FLUX AI production.
Song details:
{meta_block}

Design **Plot #{plot_id}** specifically in this creative direction:
{direction}

Requirements:
- Keep every field concise and vivid (1-2 sentences for logline_th, 2-3 sentences for synopsis_th covering Intro -> Verse -> Chorus -> Bridge -> Outro).
- `visual_style` and `concept_prompt` must be in detailed English optimized for MiniMax-H3 & FLUX.
- Include 1 to 3 recurring characters in `main_characters` (`id` like `"char_1"`, `name_th`, `role_th`, and specific English `appearance_prompt`).
- Also include `song_analysis_th` (2 sentences in Thai analyzing this song's musical vibe and message) if plot_id == 1.

Return ONLY valid JSON:
{{"song_analysis_th": "...", "plot": {{"plot_id": {plot_id}, "title_th": "...", "logline_th": "...", "synopsis_th": "...", "visual_style": "...", "concept_prompt": "...", "recommended_aspect": "16:9", "main_characters": [{{"id": "char_1", "name_th": "...", "role_th": "...", "appearance_prompt": "..."}}]}}}}"""

        try:
            res_obj, model_used = _call_gemini_structured(
                audio_path=audio_path,
                prompt_text=single_prompt,
                response_schema=SINGLE_PLOT_SCHEMA,
                api_key=api_key,
                requested_model=requested_model,
                task_label=f"Plot #{plot_id}/3 pitch",
                include_audio=(not has_lyrics and plot_id == 1),
            )
            last_model_used = model_used
            if not song_analysis_th and res_obj.get("song_analysis_th"):
                song_analysis_th = res_obj["song_analysis_th"]
            p_obj = res_obj.get("plot", res_obj)
            p_obj["plot_id"] = plot_id
            plots_list.append(p_obj)
            time.sleep(1.0)
        except Exception as exc:
            print(f"[Warn] Gemini Free Tier API returned 503/429 ({str(exc)[:100]}); using built-in Lyric & Beat Director fallback...")
            return _synthesize_plots_fallback(title, sound_tags, lyrics, duration_sec, float(bpm))

    return {
        "song_title": title,
        "song_analysis_th": song_analysis_th or f"บทเพลง '{title}' ({sound_tags})",
        "plots": plots_list,
        "gemini_model_used": last_model_used,
    }


def print_plots_summary(plots_data: Dict[str, Any]) -> None:
    print("\n=================================================================")
    print(f"  3 MV PLOT PITCHES — {plots_data.get('song_title', 'Untitled')}")
    print("=================================================================")
    print(f"Song Analysis: {plots_data.get('song_analysis_th', '')}\n")
    for p in plots_data.get("plots", []):
        print(f"--- [Plot {p['plot_id']}] {p['title_th']} ({p.get('recommended_aspect', '16:9')}) ---")
        print(f"  Logline : {p['logline_th']}")
        print(f"  Style   : {p['visual_style']}")
        print(f"  Synopsis: {p['synopsis_th']}")
        chars = ", ".join(f"{c['name_th']} ({c['role_th']})" for c in p.get("main_characters", []))
        print(f"  Chars   : {chars}\n")


def _build_storyboard_prompt_window(
    window_start: float,
    window_end: float,
    total_duration: float,
    bpm: float,
    beats_in_window: List[float],
    concept: str,
    style: str,
    aspect_ratio: str,
    song_meta_hint: str,
    chosen_plot_hint: str,
    whisper_hint: str,
    shot_id_start: int,
    has_lyrics: bool = False,
) -> str:
    win_dur = max(3.0, window_end - window_start)
    approx_shots = max(2, int(round(win_dur / 4.2)))
    lyric_rule = (
        '7. Use the exact provided Official Lyrics lines for `lyric_line` (do NOT re-transcribe or alter the words; use `""` for purely instrumental parts).'
        if has_lyrics
        else '7. Transcribe `lyric_line` accurately in the song\'s language (Thai/English) for the words sung in that shot\'s time window (`""` if instrumental).'
    )
    source_intro = (
        f"Plan the scene window covering timestamps **{window_start:.2f}s to {window_end:.2f}s** (out of {total_duration:.2f}s total song, ~{bpm} BPM) using the provided Official Lyrics and BPM."
        if has_lyrics
        else f"Listen to the attached audio segment covering timestamps **{window_start:.2f}s to {window_end:.2f}s** (out of {total_duration:.2f}s total song, ~{bpm} BPM)."
    )
    return f"""You are an elite Music Video Director & AI Cinematographer producing a MiniMax-H3 Music Video.
{source_intro}

Creative Brief:
- Concept / Story: {concept}
- Target Visual Style: {style}
- Aspect Ratio: {aspect_ratio}
- Beat timestamps in this window: {beats_in_window[:25]}
{song_meta_hint}{chosen_plot_hint}{whisper_hint}

Strict Technical Rules for MiniMax-H3 Video Generation:
1. Partition ONLY the window from **{window_start:.2f}s to {window_end:.2f}s** continuously (~{approx_shots} shots, starting `shot_id` at {shot_id_start}) with ZERO gaps or overlaps.
2. Each shot MUST be either ~3.0 seconds (for fast cuts, chorus beats, transitions) or ~5.0 seconds (for singing verses, emotional close-ups, narrative motion).
3. Keep `characters[]` consistent using the exact character IDs and detailed English `appearance_prompt`s.
4. CRITICAL MiniMax-H3 Framing Rule: Whenever a character is visible and singing or acting, use `singing_closeup`, `performance_medium`, or medium framing — NEVER put detailed faces tiny and far away in wide shots. Reserve `broll_environment` wide shots for landscapes, lighting beams, silhouettes, or architecture.
5. In every shot's `visual_prompt` (vivid English): repeat key character hair/outfit anchors, specify camera motion (`slow push-in`, `orbital tracking`, `low-angle dolly`), and lighting.
6. Set `chain_from_previous` to `true` ONLY when smoothly extending the same camera & character pose from the previous shot; `false` on new cuts/angles.
{lyric_rule}
8. Set `audio_prompt` in concise English describing the vocal emotion or ambient atmosphere.

Return ONLY valid JSON matching the requested schema."""


def generate_storyboard_with_gemini(
    audio_path: Path,
    analysis: Dict[str, Any],
    concept: str,
    style: str,
    aspect_ratio: str,
    api_key: str,
    requested_model: str,
    chosen_plot: Optional[Dict[str, Any]] = None,
    song_meta: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], str]:
    """Send song audio + metadata + optional chosen plot to Gemini to produce a structured MV storyboard."""
    duration_sec = float(analysis["duration_sec"])
    beat_info = analysis.get("beat_info", {})
    bpm = float(beat_info.get("bpm", 120))
    all_beats = [float(b) for b in beat_info.get("beats", [])]
    whisper_segments = analysis.get("whisper_segments", [])

    whisper_hint = ""
    if whisper_segments:
        whisper_hint = (
            "\nAdditional ASR transcript hints (verify against actual audio):\n"
            + json.dumps(whisper_segments[:80], ensure_ascii=False)
        )

    song_meta_hint = ""
    if song_meta:
        parts = []
        if song_meta.get("title"):
            parts.append(f"- Song Title: {song_meta['title']}")
        if song_meta.get("sound_tags"):
            parts.append(f"- Musical Style Tags: {song_meta['sound_tags']}")
        if song_meta.get("lyrics"):
            parts.append(f"- Official Lyrics (use these exact words for lyric_line timing!):\n{song_meta['lyrics']}")
        if parts:
            song_meta_hint = "\nSong Metadata:\n" + "\n".join(parts) + "\n"

    chosen_plot_hint = ""
    if chosen_plot:
        locked_chars = [
            {
                "id": c["id"],
                "name": c.get("name_th", c["id"]),
                "appearance_prompt": c["appearance_prompt"],
            }
            for c in chosen_plot.get("main_characters", [])
        ]
        chosen_plot_hint = (
            f"\nSelected MV Plot (#{chosen_plot.get('plot_id')}: {chosen_plot.get('title_th', '')}):\n"
            f"- Plot Synopsis: {chosen_plot.get('synopsis_th', '')}\n"
            f"- Locked Main Characters (KEEP THESE EXACT `id` VALUES and `appearance_prompt`s in `characters[]`):\n"
            f"{json.dumps(locked_chars, ensure_ascii=False, indent=2)}\n"
        )

    # For songs <= 60s try single pass; for longer songs chunk into ~45s acts to avoid Free Tier 503 preemption
    has_lyrics = bool(((song_meta or {}).get("lyrics") or "").strip())
    raw_json: Dict[str, Any] = {}
    model_name = requested_model
    used_chunked = duration_sec > 60.0

    if not used_chunked:
        try:
            prompt_single = _build_storyboard_prompt_window(
                0.0,
                duration_sec,
                duration_sec,
                bpm,
                all_beats,
                concept,
                style,
                aspect_ratio,
                song_meta_hint,
                chosen_plot_hint,
                whisper_hint,
                1,
                has_lyrics=has_lyrics,
            )
            raw_json, model_name = _call_gemini_structured(
                audio_path=audio_path,
                prompt_text=prompt_single,
                response_schema=STORYBOARD_SCHEMA,
                api_key=api_key,
                requested_model=requested_model,
                task_label="AI storyboard",
                include_audio=(not has_lyrics),
            )
        except Exception as exc:
            print(f"[Warn] Single-pass storyboard hit transient limit ({str(exc)[:140]}). Switching to Act-chunked mode...")
            used_chunked = True

    if used_chunked:
        window_size = 45.0
        windows: List[Tuple[float, float]] = []
        cur = 0.0
        while cur < duration_sec - 0.5:
            nxt = min(duration_sec, cur + window_size)
            if duration_sec - nxt < 12.0:
                nxt = duration_sec
            windows.append((round(cur, 2), round(nxt, 2)))
            cur = nxt

        merged_shots: List[Dict[str, Any]] = []
        merged_chars: List[Dict[str, Any]] = []
        merged_title = (song_meta or {}).get("title") or "AI Music Video"
        merged_style = style

        for w_idx, (ws, we) in enumerate(windows, start=1):
            w_beats = [b for b in all_beats if ws <= b <= we]
            w_prompt = _build_storyboard_prompt_window(
                ws,
                we,
                duration_sec,
                bpm,
                w_beats,
                concept,
                style,
                aspect_ratio,
                song_meta_hint,
                chosen_plot_hint,
                whisper_hint,
                len(merged_shots) + 1,
                has_lyrics=has_lyrics,
            )
            try:
                act_json, model_name = _call_gemini_structured(
                    audio_path=audio_path,
                    prompt_text=w_prompt,
                    response_schema=STORYBOARD_SCHEMA,
                    api_key=api_key,
                    requested_model=requested_model,
                    task_label=f"Storyboard Act {w_idx}/{len(windows)} ({ws:.0f}s-{we:.0f}s)",
                    audio_start_sec=ws,
                    audio_clip_sec=(we - ws),
                    include_audio=(not has_lyrics),
                )
            except Exception as exc:
                print(f"[Warn] Gemini Free Tier API returned 503/429 during storyboard ({str(exc)[:100]}); using built-in Lyric & Beat Director fallback...")
                fb_title = (song_meta or {}).get("title") or audio_path.stem
                fb_lyrics = (song_meta or {}).get("lyrics") or ""
                sb_fb = _synthesize_storyboard_from_lyrics_and_beats(
                    fb_title, concept, style, aspect_ratio, duration_sec, bpm, fb_lyrics, chosen_plot
                )
                return sb_fb, sb_fb["gemini_model_used"]
            if w_idx == 1:
                merged_title = act_json.get("title") or merged_title
                merged_style = act_json.get("visual_style") or merged_style
                merged_chars = act_json.get("characters") or []
            act_shots = act_json.get("shots") or []
            merged_shots.extend(act_shots)
            time.sleep(1.0)

        raw_json = {
            "title": merged_title,
            "visual_style": merged_style,
            "characters": merged_chars,
            "shots": merged_shots,
        }

    if chosen_plot and chosen_plot.get("main_characters") and not raw_json.get("characters"):
        raw_json["characters"] = [
            {"id": c["id"], "name": c.get("name_th", c["id"]), "appearance_prompt": c["appearance_prompt"]}
            for c in chosen_plot["main_characters"]
        ]

    storyboard = sanitize_storyboard(raw_json, duration_sec, aspect_ratio, concept)
    if song_meta and song_meta.get("title"):
        storyboard["title"] = song_meta["title"]
    if chosen_plot:
        storyboard["chosen_plot_id"] = chosen_plot.get("plot_id")
        storyboard["chosen_plot_title_th"] = chosen_plot.get("title_th")
    storyboard["gemini_model_used"] = model_name
    print(
        f"[Gemini] Storyboard created via '{model_name}': "
        f"{len(storyboard['characters'])} characters, {len(storyboard['shots'])} shots."
    )
    return storyboard, model_name


# ---------------------------------------------------------------------------
# Phase 1C: Character Reference Image Generation (Local FLUX Hub or Colab)
# ---------------------------------------------------------------------------
def is_local_flux_online(flux_url: str) -> bool:
    try:
        r = requests.get(f"{flux_url.rstrip('/')}/api/status", timeout=2.5)
        return r.status_code == 200
    except Exception:
        return False


def generate_ref_with_local_flux(
    flux_url: str,
    prompt: str,
    style: str,
    width: int,
    height: int,
    out_path: Path,
    flux_password: Optional[str] = None,
) -> bool:
    """Generate a locked character reference image on local RTX 3080 via FLUX Hub API."""
    base = flux_url.rstrip("/")
    session = requests.Session()

    if flux_password:
        try:
            auth_r = session.post(f"{base}/api/gallery/auth/login", json={"password": flux_password}, timeout=5)
            if auth_r.ok and auth_r.json().get("token"):
                session.headers["Authorization"] = f"Bearer {auth_r.json()['token']}"
        except Exception as exc:
            print(f"[Warn] FLUX Hub auth warning: {exc}")

    # Auto-start local ComfyUI backend via FLUX Hub if port 8188 is idle
    try:
        st_r = session.get(f"{base}/api/status", timeout=5)
        if st_r.ok and not st_r.json().get("comfyui", {}).get("port_active", False):
            print("[RefGen/LocalFLUX] Starting local ComfyUI backend via /api/comfyui/start...")
            session.post(f"{base}/api/comfyui/start", json={"low_vram": True}, timeout=15)
            ready = False
            for _ in range(45):
                time.sleep(2.0)
                chk = session.get(f"{base}/api/status", timeout=5)
                if chk.ok and chk.json().get("comfyui", {}).get("port_active", False):
                    ready = True
                    print("[RefGen/LocalFLUX] Local ComfyUI backend is READY on port 8188!")
                    break
            if not ready:
                raise RuntimeError("Local ComfyUI backend did not become active within 90s.")
    except RuntimeError:
        raise
    except Exception as exc:
        print(f"[Warn] Local ComfyUI pre-start check warning: {exc}")

    # Align dimensions to multiples of 16 for FLUX
    fw = max(512, (width // 16) * 16)
    fh = max(512, (height // 16) * 16)
    full_prompt = f"{style}, {prompt}, medium portrait facing camera, crisp facial details, studio key lighting, consistent character design"
    payload = {
        "prompt": full_prompt,
        "negative_prompt": "blurry, deformed face, extra fingers, text, watermark, multiple people",
        "width": fw,
        "height": fh,
        "batch_size": 1,
        "steps": 4,
        "cfg": 1.0,
        "seed": -1,
    }
    print(f"[RefGen/LocalFLUX] Requesting character portrait ({fw}x{fh})...")
    r = session.post(f"{base}/api/generate", json=payload, timeout=15)
    r.raise_for_status()

    filename: Optional[str] = None
    deadline = time.time() + 180
    while time.time() < deadline:
        sr = session.get(f"{base}/api/generate/status", timeout=5)
        sr.raise_for_status()
        st = sr.json()
        state = st.get("status")
        if state == "completed":
            imgs = st.get("result_images") or []
            if imgs:
                filename = imgs[0]
            break
        if state in ("error", "cancelled"):
            raise RuntimeError(f"Local FLUX error: {st.get('error_msg')}")
        time.sleep(1.0)

    try:
        session.post(f"{base}/api/generate/acknowledge", timeout=5)
    except Exception:
        pass

    if not filename:
        raise RuntimeError("Local FLUX completed without returning an image filename.")

    # Download via HTTP or copy directly from local outputs folder if HTTP is password-gated
    dl = session.get(f"{base}/outputs/{urllib.parse.quote(filename)}", timeout=20)
    if dl.ok and len(dl.content) > 1000:
        out_path.write_bytes(dl.content)
        print(f"[RefGen/LocalFLUX] Saved -> {out_path.name}")
        return True

    local_disk = DEFAULT_LOCAL_FLUX_OUTPUTS / filename
    if local_disk.is_file():
        shutil.copy2(local_disk, out_path)
        print(f"[RefGen/LocalFLUX] Copied from local outputs -> {out_path.name}")
        return True

    raise RuntimeError(
        f"Generated {filename} on Local FLUX, but /outputs/{filename} returned HTTP {dl.status_code}. "
        "Provide --flux-password or set FLUX_PASSWORD env var."
    )


def comfy_get_available_unets(comfy_url: str) -> List[str]:
    try:
        r = requests.get(f"{comfy_url.rstrip('/')}/object_info/UNETLoader", timeout=10)
        if r.ok:
            data = r.json()
            return list(
                data.get("UNETLoader", {})
                .get("input", {})
                .get("required", {})
                .get("unet_name", [[]])[0]
            )
    except Exception:
        pass
    return []


def build_minimax_image_workflow(prompt: str, width: int, height: int, unet_name: str, seed: int, prefix: str) -> Dict[str, Any]:
    safe_w = max(512, min(4096, (width // 32) * 32))
    safe_h = max(512, min(4096, (height // 32) * 32))
    return {
        "10": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_image_vae_fp16.safetensors"}},
        "11": {
            "class_type": "CLIPLoader",
            "inputs": {"clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", "type": "minimax", "device": "default"},
        },
        "12": {"class_type": "UNETLoader", "inputs": {"unet_name": unet_name, "weight_dtype": "default"}},
        "13": {
            "class_type": "MiniMaxH3ImageConditioning",
            "inputs": {"prompt": prompt, "width": safe_w, "height": safe_h, "clip": ["11", 0], "vae": ["10", 0]},
        },
        "14": {"class_type": "BasicGuider", "inputs": {"model": ["12", 0], "conditioning": ["13", 0]}},
        "15": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "16": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "17": {
            "class_type": "BasicScheduler",
            "inputs": {"scheduler": "simple", "steps": 6, "denoise": 1.0, "model": ["12", 0]},
        },
        "18": {
            "class_type": "SamplerCustomAdvanced",
            "inputs": {
                "noise": ["16", 0],
                "guider": ["14", 0],
                "sampler": ["15", 0],
                "sigmas": ["17", 0],
                "latent_image": ["13", 1],
            },
        },
        "19": {"class_type": "VAEDecode", "inputs": {"samples": ["18", 0], "vae": ["10", 0]}},
        "20": {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["19", 0]}},
    }


def comfy_submit_and_download(
    comfy_url: str,
    sidecar_url: Optional[str],
    workflow: Dict[str, Any],
    out_path: Path,
    timeout_sec: int = 600,
) -> Path:
    """Queue a ComfyUI workflow, wait for completion via /history, and download output."""
    base = comfy_url.rstrip("/")
    client_id = f"mv_director_{uuid.uuid4().hex[:8]}"
    res = requests.post(f"{base}/prompt", json={"prompt": workflow, "client_id": client_id}, timeout=30)
    if not res.ok:
        raise RuntimeError(f"ComfyUI /prompt rejected ({res.status_code}): {res.text[:500]}")
    prompt_id = res.json()["prompt_id"]
    print(f"[Colab/ComfyUI] Queued prompt_id={prompt_id}")

    deadline = time.time() + timeout_sec
    last_log = 0.0
    media_info: Optional[Dict[str, str]] = None

    while time.time() < deadline:
        time.sleep(4.0)
        try:
            hr = requests.get(f"{base}/history/{prompt_id}", timeout=15)
            if hr.ok:
                hist = hr.json()
                entry = hist.get(prompt_id)
                if entry:
                    status_obj = entry.get("status", {})
                    if status_obj.get("status_str") == "error":
                        raise RuntimeError(f"ComfyUI execution error: {json.dumps(status_obj)[:500]}")

                    outputs = entry.get("outputs", {})
                    for _nid, node_out in outputs.items():
                        for key in ("videos", "images", "gifs"):
                            items = node_out.get(key)
                            if items and isinstance(items, list):
                                first = items[0]
                                if isinstance(first, dict) and first.get("filename"):
                                    media_info = {
                                        "filename": first["filename"],
                                        "subfolder": first.get("subfolder", ""),
                                        "type": first.get("type", "output"),
                                    }
                                    break
                        if media_info:
                            break
                    if media_info:
                        break
        except RuntimeError:
            raise
        except Exception as exc:
            print(f"[Warn] Polling /history warning: {exc}")

        now = time.time()
        if now - last_log > 20.0:
            last_log = now
            gpu_note = ""
            if sidecar_url:
                try:
                    sr = requests.get(f"{sidecar_url.rstrip('/')}/stats", timeout=4)
                    if sr.ok:
                        gs = sr.json()
                        gpu_note = f" | GPU: {gs.get('utilization_gpu_pct', '?')}% VRAM {gs.get('memory_used_mb', '?')}/{gs.get('memory_total_mb', '?')}MB"
                except Exception:
                    pass
            print(f"  ...rendering ({int(timeout_sec - (deadline - now))}s elapsed){gpu_note}")

    if not media_info:
        raise TimeoutError(f"Timed out after {timeout_sec}s waiting for prompt_id={prompt_id}")

    params = urllib.parse.urlencode(
        {
            "filename": media_info["filename"],
            "subfolder": media_info["subfolder"],
            "type": media_info["type"],
        }
    )
    view_url = f"{base}/view?{params}"
    dl = requests.get(view_url, timeout=120, stream=True)
    if not dl.ok and sidecar_url:
        dl = requests.get(
            f"{sidecar_url.rstrip('/')}/outputs/{urllib.parse.quote(media_info['filename'])}",
            timeout=120,
            stream=True,
        )
    dl.raise_for_status()

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        for chunk in dl.iter_content(chunk_size=1024 * 256):
            if chunk:
                f.write(chunk)
    return out_path


def prepare_character_refs(
    storyboard: Dict[str, Any],
    project_dir: Path,
    ref_engine: str,
    flux_url: str,
    flux_password: Optional[str],
    comfy_url: Optional[str],
    sidecar_url: Optional[str],
    width: int,
    height: int,
) -> None:
    """Create or reuse locked character reference images in <project_dir>/refs/."""
    refs_dir = project_dir / "refs"
    refs_dir.mkdir(parents=True, exist_ok=True)
    characters = storyboard.get("characters") or []
    if not characters:
        print("[RefGen] No characters defined in storyboard.")
        return

    chosen_engine = ref_engine
    if chosen_engine == "auto":
        if is_local_flux_online(flux_url):
            chosen_engine = "local_flux"
        elif comfy_url:
            chosen_engine = "colab_minimax"
        else:
            chosen_engine = "none"

    print(f"[RefGen] Reference Engine: {chosen_engine}")
    style = storyboard.get("visual_style", "")

    img_unet = "minimax_h3_image_pruned_int8_convrot.safetensors"
    if chosen_engine == "colab_minimax" and comfy_url:
        unets = comfy_get_available_unets(comfy_url)
        for cand in [
            "minimax_h3_image_pruned_bf16.safetensors",
            "minimax_h3_image_pruned_int8_convrot.safetensors",
            "minimax_h3_image_auto.safetensors",
        ]:
            if cand in unets:
                img_unet = cand
                break

    generated_local = False
    for char in characters:
        cid = re.sub(r"[^a-zA-Z0-9_-]", "_", char["id"])
        ref_path = refs_dir / f"{cid}.png"
        char["ref_image_path"] = str(ref_path.resolve())
        if ref_path.is_file() and ref_path.stat().st_size > 5000:
            print(f"[RefGen] Reusing existing ref -> {ref_path.name}")
            continue

        if chosen_engine == "none":
            print(f"[RefGen] Skipped auto-gen for '{cid}'. You can place your own {ref_path} before rendering.")
            continue

        prompt = char.get("appearance_prompt", "")
        if chosen_engine == "local_flux":
            generate_ref_with_local_flux(flux_url, prompt, style, width, height, ref_path, flux_password)
            generated_local = True
        elif chosen_engine == "colab_minimax":
            if not comfy_url:
                raise ValueError("--comfy-url is required for --ref-engine colab_minimax")
            wf = build_minimax_image_workflow(
                f"{style}, {prompt}, character portrait facing camera, studio lighting",
                width * 2,
                height * 2,
                img_unet,
                seed=int(time.time()) % 1000000,
                prefix=f"MV_Ref_{cid}",
            )
            comfy_submit_and_download(comfy_url, sidecar_url, wf, ref_path, timeout_sec=300)

    if generated_local and chosen_engine == "local_flux":
        try:
            requests.post(f"{flux_url.rstrip('/')}/api/comfyui/free-memory", timeout=10)
            print("[RefGen/LocalFLUX] Released local RTX 3080 VRAM via /api/comfyui/free-memory.")
        except Exception as exc:
            print(f"[Warn] Local FLUX VRAM cleanup warning: {exc}")


# ---------------------------------------------------------------------------
# Phase 2: Colab A100 MiniMax-H3 Batch Video Rendering
# ---------------------------------------------------------------------------
def build_minimax_video_workflow(
    prompt: str,
    audio_prompt: str,
    width: int,
    height: int,
    length_frames: int,
    steps: int,
    seed: int,
    filename_prefix: str,
    first_frame_uploaded: Optional[str] = None,
    use_hybrid: bool = False,
    low_vram: bool = False,
) -> Dict[str, Any]:
    """Build ComfyUI API graph matching Comfy-colab's MiniMax-H3 Music Video workflow."""
    safe_w = max(256, min(1344, (width // 32) * 32))
    safe_h = max(256, min(1344, (height // 32) * 32))
    effective_audio = audio_prompt.strip() or (
        "subtle cinematic musical atmosphere, clean high fidelity stereo, rich resonance"
    )
    full_prompt = f"{prompt.strip()}\n\nAudio: {effective_audio}"
    unet_name = (
        "minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors"
        if use_hybrid
        else "minimax_h3_fl2va_pruned_int8_convrot.safetensors"
    )

    graph: Dict[str, Any] = {
        "119": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_video_vae_fp16.safetensors"}},
        "120": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_audio_vae_fp32.safetensors"}},
        "121": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["125", 0], "vae": ["120", 0]}},
        "122": {"class_type": "VAEDecode", "inputs": {"samples": ["125", 0], "vae": ["119", 0]}},
        "127": {"class_type": "UNETLoader", "inputs": {"unet_name": unet_name, "weight_dtype": "default"}},
        "128": {
            "class_type": "CLIPLoader",
            "inputs": {"clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", "type": "minimax", "device": "default"},
        },
        "134": {
            "class_type": "MiniMaxH3TurboLoRA",
            "inputs": {
                "model": ["127", 0],
                "lora_name": "minimax_h3_turbo_4step_ema_ckpt850.safetensors",
                "strength": 1.0,
                "low_vram": low_vram,
            },
        },
        "131": {
            "class_type": "MiniMaxH3ImageToVideo",
            "inputs": {
                "prompt": full_prompt,
                "width": safe_w,
                "height": safe_h,
                "length": length_frames,
                "clip": ["128", 0],
                "vae": ["119", 0],
            },
        },
        "126": {"class_type": "BasicGuider", "inputs": {"model": ["134", 0], "conditioning": ["131", 0]}},
        "135": {"class_type": "MiniMaxH3TurboSampler", "inputs": {}},
        "129": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "124": {
            "class_type": "BasicScheduler",
            "inputs": {"scheduler": "simple", "steps": steps, "denoise": 1.0, "model": ["134", 0]},
        },
        "125": {
            "class_type": "SamplerCustomAdvanced",
            "inputs": {
                "noise": ["129", 0],
                "guider": ["126", 0],
                "sampler": ["135", 0],
                "sigmas": ["124", 0],
                "latent_image": ["131", 1],
            },
        },
        "130": {
            "class_type": "CreateVideo",
            "inputs": {"fps": 24, "audio_fps": 8, "images": ["122", 0], "audio": ["121", 0]},
        },
        "92": {
            "class_type": "SaveVideo",
            "inputs": {"filename_prefix": filename_prefix, "format": "auto", "codec": "auto", "video": ["130", 0]},
        },
    }

    if first_frame_uploaded:
        graph["140"] = {"class_type": "LoadImage", "inputs": {"image": first_frame_uploaded}}
        graph["131"]["inputs"]["first_frame"] = ["140", 0]

    return graph


def upload_image_to_comfy(comfy_url: str, image_path: Path) -> str:
    url = f"{comfy_url.rstrip('/')}/upload/image"
    with open(image_path, "rb") as f:
        files = {"image": (image_path.name, f, "image/png")}
        data = {"overwrite": "true"}
        res = requests.post(url, files=files, data=data, timeout=60)
    res.raise_for_status()
    payload = res.json()
    sub = payload.get("subfolder", "").strip()
    name = payload.get("name", image_path.name)
    return f"{sub}/{name}" if sub else name


def prepare_aspect_matched_png(ffmpeg_bin: str, src_img: Path, dst_img: Path, width: int, height: int) -> Path:
    cmd = [
        ffmpeg_bin,
        "-y",
        "-v",
        "error",
        "-i",
        str(src_img),
        "-vf",
        f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1",
        "-frames:v",
        "1",
        str(dst_img),
    ]
    run_cmd(cmd, check=True)
    return dst_img


def extract_last_frame_local(ffmpeg_bin: str, video_path: Path, out_png: Path) -> Path:
    cmd = [
        ffmpeg_bin,
        "-y",
        "-v",
        "error",
        "-sseof",
        "-0.1",
        "-i",
        str(video_path),
        "-frames:v",
        "1",
        "-q:v",
        "2",
        str(out_png),
    ]
    run_cmd(cmd, check=True)
    return out_png


def save_storyboard(storyboard_path: Path, storyboard: Dict[str, Any]) -> None:
    storyboard_path.write_text(json.dumps(storyboard, ensure_ascii=False, indent=2), encoding="utf-8")


def render_shots_on_colab(
    ffmpeg_bin: str,
    storyboard: Dict[str, Any],
    storyboard_path: Path,
    project_dir: Path,
    comfy_url: str,
    sidecar_url: Optional[str],
    width: int,
    height: int,
    steps: int,
    use_hybrid: bool,
    max_retries: int,
    auto_disconnect: bool,
    explicit_size: bool = False,
    wait_for_colab: bool = False,
    max_shots: Optional[int] = None,
    aspect_ratio: str = "16:9",
) -> int:
    """Batch render pending shots on Colab ComfyUI (auto-adapting for A100/L4/T4 VRAM) and save locally."""
    base = comfy_url.rstrip("/")
    stat_data: Dict[str, Any] = {}
    wait_deadline = time.time() + (900 if wait_for_colab else 0)

    while True:
        try:
            stat_res = requests.get(f"{base}/system_stats", headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
            if stat_res.status_code == 200:
                stat_data = stat_res.json()
                break
            if not wait_for_colab or time.time() >= wait_deadline:
                stat_res.raise_for_status()
            print(f"[Colab] Tunnel returned HTTP {stat_res.status_code} (Colab still booting/downloading)... retrying in 10s")
        except Exception as exc:
            if not wait_for_colab or time.time() >= wait_deadline:
                raise
            print(f"[Colab] Waiting for {base} ({str(exc)[:100]})... retrying in 10s")
        time.sleep(10.0)

    # Detect GPU VRAM to auto-adapt T4 (<20GB) vs L4/A100
    gpu_name = "Colab GPU"
    vram_gb = 0.0
    devices = stat_data.get("devices") or []
    if devices and isinstance(devices, list):
        dev0 = devices[0]
        gpu_name = dev0.get("name", gpu_name)
        vram_total = float(dev0.get("vram_total", 0) or 0)
        if vram_total > 0:
            vram_gb = vram_total / (1024**3)
    if vram_gb <= 0 and sidecar_url:
        try:
            sr = requests.get(f"{sidecar_url.rstrip('/')}/stats", timeout=6)
            if sr.ok:
                sd = sr.json()
                gpu_name = sd.get("name", gpu_name)
                vram_gb = float(sd.get("memory_total_mb", 0) or 0) / 1024.0
        except Exception:
            pass

    low_vram_mode = False
    render_w, render_h = width, height
    shot_timeout_sec = 720
    if 0 < vram_gb < 20.0:
        low_vram_mode = True
        shot_timeout_sec = 1200
        if not explicit_size and (width * height) > (768 * 448):
            t4_presets = {"16:9": (768, 448), "9:16": (448, 768), "1:1": (576, 576)}
            render_w, render_h = t4_presets.get(aspect_ratio, (768, 448))
        print(
            f"[Colab/T4 Low-VRAM] Detected {gpu_name} ({vram_gb:.1f}GB). "
            f"Enabling low_vram=True, timeout={shot_timeout_sec}s, render size={render_w}x{render_h} "
            f"(conformed cleanly to {width}x{height} on assemble)."
        )
    else:
        print(f"[Colab] Connected to {gpu_name} ({vram_gb:.1f}GB VRAM) at {base}")

    avail_unets = comfy_get_available_unets(base)
    effective_hybrid = use_hybrid and ("minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors" in avail_unets)
    if use_hybrid and not effective_hybrid:
        print("[Warn] Hybrid model not present on Colab; using minimax_h3_fl2va_pruned_int8_convrot.safetensors.")

    shots_dir = project_dir / "shots"
    refs_dir = project_dir / "refs"
    shots_dir.mkdir(parents=True, exist_ok=True)
    refs_dir.mkdir(parents=True, exist_ok=True)

    safe_project = re.sub(r"[^a-zA-Z0-9_-]", "_", project_dir.name)
    shots = storyboard["shots"]
    failures = 0
    rendered_count = 0

    for idx, shot in enumerate(shots):
        if max_shots is not None and rendered_count >= max_shots:
            print(f"[Colab] Reached --max-shots {max_shots}; pausing cleanly (rerun to continue remaining shots).")
            break

        sid = int(shot["shot_id"])
        raw_out = shots_dir / f"shot_{sid:03d}_raw.mp4"
        if shot.get("status") == "completed" and raw_out.is_file() and raw_out.stat().st_size > 10000:
            print(f"[Shot {sid:03d}/{len(shots)}] Already completed, skipping.")
            continue

        print(
            f"\n[Shot {sid:03d}/{len(shots)}] {shot['start_sec']:.2f}s->{shot['end_sec']:.2f}s "
            f"({shot['shot_type']} | {shot['target_frames']}f @ {render_w}x{render_h})"
        )

        # Resolve First Frame (last frame chain OR character reference portrait)
        uploaded_frame_name: Optional[str] = None
        local_frame_to_upload: Optional[Path] = None

        if shot.get("chain_from_previous") and idx > 0:
            prev_vid = shots_dir / f"shot_{int(shots[idx - 1]['shot_id']):03d}_raw.mp4"
            if prev_vid.is_file() and prev_vid.stat().st_size > 10000:
                chain_png = refs_dir / f"chain_to_{sid:03d}.png"
                extract_last_frame_local(ffmpeg_bin, prev_vid, chain_png)
                local_frame_to_upload = chain_png

        if local_frame_to_upload is None and shot.get("character_id"):
            cid = re.sub(r"[^a-zA-Z0-9_-]", "_", shot["character_id"])
            char_ref = refs_dir / f"{cid}.png"
            if char_ref.is_file():
                fit_png = refs_dir / f"{cid}_{render_w}x{render_h}.png"
                if not fit_png.is_file():
                    prepare_aspect_matched_png(ffmpeg_bin, char_ref, fit_png, render_w, render_h)
                local_frame_to_upload = fit_png

        visual_prompt = shot["visual_prompt"]
        if shot["shot_type"] in ("singing_closeup", "performance_medium") and shot.get("lyric_line"):
            visual_prompt += (
                ", expressive singing directly toward the camera, natural lip-sync mouth movement, "
                "authentic facial emotion matching vocal rhythm"
            )

        success = False
        last_err: Optional[Exception] = None
        for attempt in range(1, max_retries + 2):
            try:
                if local_frame_to_upload is not None:
                    uploaded_frame_name = upload_image_to_comfy(base, local_frame_to_upload)

                seed = int(time.time() * 1000 + sid * 97 + attempt) % 2147483647
                wf = build_minimax_video_workflow(
                    prompt=visual_prompt,
                    audio_prompt=shot.get("audio_prompt", ""),
                    width=render_w,
                    height=render_h,
                    length_frames=int(shot.get("target_frames", 124)),
                    steps=steps,
                    seed=seed,
                    filename_prefix=f"MV_{safe_project}_shot_{sid:03d}",
                    first_frame_uploaded=uploaded_frame_name,
                    use_hybrid=effective_hybrid,
                    low_vram=low_vram_mode,
                )
                comfy_submit_and_download(base, sidecar_url, wf, raw_out, timeout_sec=shot_timeout_sec)
                if raw_out.is_file() and raw_out.stat().st_size > 10000:
                    shot["status"] = "completed"
                    shot["raw_video_path"] = str(raw_out.resolve())
                    save_storyboard(storyboard_path, storyboard)
                    print(f"[Shot {sid:03d}] Saved ({raw_out.stat().st_size / (1024*1024):.2f} MB)")
                    success = True
                    rendered_count += 1
                    break
                raise RuntimeError("Downloaded output file is empty or missing.")
            except Exception as exc:
                last_err = exc
                print(f"[Warn] Shot {sid:03d} attempt {attempt} failed: {exc}")
                time.sleep(5.0)

        if not success:
            failures += 1
            shot["status"] = "failed"
            shot["error"] = str(last_err)
            save_storyboard(storyboard_path, storyboard)

    if auto_disconnect and sidecar_url:
        if failures == 0:
            print("[Colab] All shots completed! Triggering Colab Kill Switch (/auto-disconnect)...")
            try:
                requests.post(f"{sidecar_url.rstrip('/')}/auto-disconnect", json={}, timeout=10)
            except Exception as exc:
                print(f"[Warn] Auto-disconnect request error: {exc}")
        else:
            print(f"[Warn] Skipping auto-disconnect because {failures} shot(s) failed; rerun to resume.")

    return failures


# ---------------------------------------------------------------------------
# Phase 3: FFmpeg Assembly, Master Audio Mux & ASS Subtitle Burn-in
# ---------------------------------------------------------------------------
def format_ass_time(seconds: float) -> str:
    sec = max(0.0, seconds)
    hrs = int(sec // 3600)
    mins = int((sec % 3600) // 60)
    secs = sec % 60.0
    cs = int(round((secs - int(secs)) * 100))
    if cs >= 100:
        cs = 99
    return f"{hrs}:{mins:02d}:{int(secs):02d}.{cs:02d}"


def escape_ass_text(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", r"\{").replace("}", r"\}").replace("\n", r"\N")


def write_ass_subtitles(storyboard: Dict[str, Any], ass_path: Path, width: int, height: int) -> None:
    """Generate styled .ass file with opening Title Card + Thai/English lyric lines."""
    title = storyboard.get("title", "AI Music Video")
    font_size = max(24, int(round(height * 0.048)))
    title_size = max(36, int(round(height * 0.085)))
    margin_v = max(28, int(round(height * 0.06)))

    header = f"""[Script Info]
Title: {title}
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Lyric,Tahoma,{font_size},&H00FFFFFF,&H000000FF,&H00141414,&H80000000,-1,0,0,0,100,100,0,0,1,2.2,1.2,2,40,40,{margin_v},1
Style: TitleCard,Tahoma,{title_size},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,2,0,1,3.0,2.0,5,40,40,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: List[str] = []

    # Opening Title Card (0.3s -> 3.5s)
    total_dur = float(storyboard.get("total_duration_sec", 10.0))
    title_end = min(3.5, max(1.5, total_dur * 0.35))
    events.append(
        f"Dialogue: 1,{format_ass_time(0.2)},{format_ass_time(title_end)},TitleCard,,0,0,0,,{{\\fad(350,450)}}{escape_ass_text(title)}"
    )

    for shot in storyboard.get("shots", []):
        lyric = (shot.get("lyric_line") or "").strip()
        if not lyric:
            continue
        start = float(shot["start_sec"])
        end = float(shot["end_sec"])
        if end - start < 0.3:
            continue
        events.append(
            f"Dialogue: 0,{format_ass_time(start)},{format_ass_time(end)},Lyric,,0,0,0,,{{\\fad(120,120)}}{escape_ass_text(lyric)}"
        )

    ass_path.write_text(header + "\n".join(events) + "\n", encoding="utf-8-sig")


def assemble_final_mv(
    ffmpeg_bin: str,
    storyboard: Dict[str, Any],
    audio_path: Path,
    project_dir: Path,
    width: int,
    height: int,
    allow_partial: bool = False,
) -> Dict[str, Path]:
    """Conform every shot to exact beat duration, mux original song audio, and burn subtitles."""
    shots_dir = project_dir / "shots"
    conformed_files: List[Path] = []

    for shot in storyboard.get("shots", []):
        sid = int(shot["shot_id"])
        raw_path = Path(shot.get("raw_video_path") or (shots_dir / f"shot_{sid:03d}_raw.mp4"))
        if not raw_path.is_file():
            if allow_partial:
                print(f"[Assemble] Skipping missing shot {sid:03d} (--allow-partial)")
                continue
            raise FileNotFoundError(f"Missing rendered shot video: {raw_path}")

        target_dur = max(0.3, float(shot["end_sec"]) - float(shot["start_sec"]))
        raw_dur = get_media_duration(ffmpeg_bin, raw_path)
        conformed = shots_dir / f"shot_{sid:03d}_conformed.mp4"

        vf_parts = [
            f"scale={width}:{height}:force_original_aspect_ratio=increase",
            f"crop={width}:{height}",
            "setsar=1",
        ]
        if raw_dur < target_dur - 0.04 and raw_dur > 0.2:
            stretch = target_dur / raw_dur
            vf_parts.insert(0, f"setpts={stretch:.6f}*PTS")

        cmd = [
            ffmpeg_bin,
            "-y",
            "-v",
            "error",
            "-i",
            str(raw_path),
            "-vf",
            ",".join(vf_parts),
            "-t",
            f"{target_dur:.3f}",
            "-r",
            "24",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-an",
            str(conformed),
        ]
        run_cmd(cmd, check=True)
        conformed_files.append(conformed)

    if not conformed_files:
        raise RuntimeError("No conformed shot videos available for assembly.")

    concat_list = project_dir / "concat_list.txt"
    concat_lines = [f"file '{p.resolve().as_posix()}'" for p in conformed_files]
    concat_list.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")

    video_track = project_dir / "video_track.mp4"
    run_cmd(
        [
            ffmpeg_bin,
            "-y",
            "-v",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_list),
            "-c",
            "copy",
            str(video_track),
        ],
        check=True,
    )

    clean_mv = project_dir / "final_mv_clean.mp4"
    run_cmd(
        [
            ffmpeg_bin,
            "-y",
            "-v",
            "error",
            "-i",
            str(video_track),
            "-i",
            str(audio_path),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "256k",
            "-shortest",
            str(clean_mv),
        ],
        check=True,
    )
    print(f"[Assemble] Clean master MV -> {clean_mv}")

    ass_path = project_dir / "subtitles.ass"
    write_ass_subtitles(storyboard, ass_path, width, height)

    subtitled_mv = project_dir / "final_mv_subtitled.mp4"
    # Execute inside project_dir with relative filenames to avoid Windows drive-letter colon escaping bugs in libass
    run_cmd(
        [
            ffmpeg_bin,
            "-y",
            "-v",
            "error",
            "-i",
            clean_mv.name,
            "-vf",
            f"ass={ass_path.name}",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "copy",
            subtitled_mv.name,
        ],
        cwd=project_dir,
        check=True,
    )
    print(f"[Assemble] Subtitled master MV -> {subtitled_mv}")

    return {"clean": clean_mv, "subtitled": subtitled_mv, "ass": ass_path}


# ---------------------------------------------------------------------------
# Self-Test Mode (Offline Verification)
# ---------------------------------------------------------------------------
def run_self_test() -> None:
    print("=== Running mv_director.py Offline Self-Test ===")
    ffmpeg_bin = resolve_ffmpeg()
    print(f"[OK] Resolved FFmpeg: {ffmpeg_bin}")

    import google.genai as genai  # type: ignore

    print(f"[OK] Imported google-genai v{getattr(genai, '__version__', 'unknown')}")

    with tempfile.TemporaryDirectory(prefix="mv_selftest_") as tmp:
        pdir = Path(tmp)
        shots_dir = pdir / "shots"
        shots_dir.mkdir(parents=True, exist_ok=True)

        # Create 6-second synthetic stereo audio file
        audio_wav = pdir / "test_song.wav"
        run_cmd(
            [
                ffmpeg_bin,
                "-y",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=6.0",
                "-ac",
                "2",
                str(audio_wav),
            ],
            check=True,
        )

        # Run audio preparation
        analysis = prepare_audio(ffmpeg_bin, audio_wav, pdir, separate_stems=False, use_whisper=False)
        assert 5.8 <= analysis["duration_sec"] <= 6.2, f"Unexpected duration: {analysis['duration_sec']}"
        print(f"[OK] Audio analysis passed (duration={analysis['duration_sec']}s, bpm={analysis['beat_info']['bpm']})")

        # Create two 3-second synthetic shot clips
        shot1 = shots_dir / "shot_001_raw.mp4"
        shot2 = shots_dir / "shot_002_raw.mp4"
        for idx, (sp, color) in enumerate([(shot1, "0x1e293b"), (shot2, "0x3b0764")], start=1):
            run_cmd(
                [
                    ffmpeg_bin,
                    "-y",
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    f"color=c={color}:s=640x360:d=3.0:r=24",
                    "-f",
                    "lavfi",
                    "-i",
                    "anullsrc=r=44100:cl=stereo",
                    "-t",
                    "3.0",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    str(sp),
                ],
                check=True,
            )

        mock_raw = {
            "title": "Test MV นางตานี / ORBIS",
            "visual_style": "3D Pixar cinematic night lighting",
            "characters": [{"id": "char_1", "name": "Lead", "appearance_prompt": "Test character"}],
            "shots": [
                {
                    "shot_id": 1,
                    "start_sec": 0.0,
                    "end_sec": 3.0,
                    "section": "intro",
                    "shot_type": "singing_closeup",
                    "character_id": "char_1",
                    "chain_from_previous": False,
                    "camera_angle": "medium close-up",
                    "visual_prompt": "Test shot 1",
                    "audio_prompt": "Test audio 1",
                    "lyric_line": "ใต้แสงจันทร์คืนเพ็ญ...",
                },
                {
                    "shot_id": 2,
                    "start_sec": 3.0,
                    "end_sec": 6.0,
                    "section": "chorus",
                    "shot_type": "performance_medium",
                    "character_id": "char_1",
                    "chain_from_previous": True,
                    "camera_angle": "medium tracking",
                    "visual_prompt": "Test shot 2",
                    "audio_prompt": "Test audio 2",
                    "lyric_line": "Shine brighter than the neon lights",
                },
            ],
        }
        sb = sanitize_storyboard(mock_raw, analysis["duration_sec"], "16:9", "self test")
        slice_shot_audio_files(ffmpeg_bin, audio_wav, pdir, sb["shots"])
        outputs = assemble_final_mv(ffmpeg_bin, sb, audio_wav, pdir, 640, 360)

        for k, out_file in outputs.items():
            assert out_file.is_file() and out_file.stat().st_size > 1000, f"Missing output {k}: {out_file}"
        final_dur = get_media_duration(ffmpeg_bin, outputs["subtitled"])
        assert 5.5 <= final_dur <= 6.5, f"Unexpected final MV duration: {final_dur}"
        print(f"[OK] FFmpeg assembly + .ass Thai/EN subtitle burn-in passed (duration={final_dur}s)")

    print("=== All Self-Tests Passed! ===")


# ---------------------------------------------------------------------------
# Main CLI
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Automated AI Music Video Director (Gemini 4 + Local Prep/Assembly + Colab A100 MiniMax-H3)"
    )
    parser.add_argument("--self-test", action="store_true", help="Run offline self-test verifying SDK, FFmpeg, and subtitle burn-in.")
    parser.add_argument("--audio", type=str, help="Local song path (.mp3/.wav/.m4a) OR Flow Music URL (https://www.flowmusic.app/song/<id>).")
    parser.add_argument("--lyrics-file", type=str, default=None, help="Optional UTF-8 lyrics text file to supply/override lyrics.")
    parser.add_argument("--concept", type=str, default="Cinematic emotional performance music video", help="MV story/theme concept (or hint for --stage pitch).")
    parser.add_argument(
        "--style",
        type=str,
        default="Photorealistic K-pop music video, glossy studio & neon night lighting, 35mm cinema lens",
        help="Visual style (e.g. 3D Pixar animation or photorealistic K-pop MV).",
    )
    parser.add_argument("--project", type=str, default=None, help="Project folder name under outputs/mv_projects/ (defaults to audio stem or Flow ID).")
    parser.add_argument(
        "--stage",
        choices=["all", "pitch", "prepare", "render", "assemble"],
        default="all",
        help="pitch=AI listens & pitches 3 plots; prepare=Storyboard+Refs (0 Colab credits); render=Colab A100 shots; assemble=FFmpeg final MV; all=full pipeline.",
    )
    parser.add_argument("--plot-choice", type=int, choices=[1, 2, 3], default=None, help="Select plot 1, 2, or 3 from plots.json for --stage prepare.")
    parser.add_argument("--force-plots", action="store_true", help="Regenerate plots.json even if it already exists.")
    parser.add_argument("--aspect", choices=["16:9", "9:16", "1:1"], default=None, help="Video aspect ratio (defaults to plot recommendation or 16:9).")
    parser.add_argument("--width", type=int, default=None, help="Override video width (multiple of 32).")
    parser.add_argument("--height", type=int, default=None, help="Override video height (multiple of 32).")
    parser.add_argument("--steps", type=int, default=8, help="MiniMax-H3 sampling steps (default: 8).")
    parser.add_argument("--use-hybrid", action="store_true", help="Use MiniMax-H3 Hybrid FL2VA/Ref2VA checkpoint if available on Colab.")

    parser.add_argument("--gemini-model", type=str, default=os.environ.get("GEMINI_MODEL", "gemini-4-hydrogen"), help="Primary Gemini model.")
    parser.add_argument("--gemini-api-key", type=str, default=None, help="Gemini API key (defaults to GEMINI_API_KEY env var).")
    parser.add_argument("--force-storyboard", action="store_true", help="Regenerate storyboard.json even if it already exists.")

    parser.add_argument("--separate-stems", action="store_true", help="Run Demucs locally to separate vocals/instrumental stems.")
    parser.add_argument("--use-whisper", action="store_true", help="Run faster-whisper locally to provide lyric timestamp hints.")

    parser.add_argument(
        "--ref-engine",
        choices=["auto", "local_flux", "colab_minimax", "none"],
        default="auto",
        help="Where to generate character reference images.",
    )
    parser.add_argument("--flux-url", type=str, default=os.environ.get("FLUX_URL", "http://127.0.0.1:8210"), help="Local FLUX Hub base URL.")
    parser.add_argument("--flux-password", type=str, default=os.environ.get("FLUX_PASSWORD"), help="Optional Local FLUX Hub gallery password.")

    parser.add_argument(
        "--comfy-url",
        type=str,
        default=os.environ.get("COMFY_URL", "https://comfy-api.ayaigaldie.site"),
        help="Colab ComfyUI Cloudflare URL (defaults to permanent Named Tunnel).",
    )
    parser.add_argument(
        "--sidecar-url",
        type=str,
        default=os.environ.get("SIDECAR_URL", "https://sidecar.ayaigaldie.site"),
        help="Colab Sidecar Cloudflare URL (defaults to permanent Named Tunnel).",
    )
    parser.add_argument("--wait-for-colab", action="store_true", help="Wait up to 15m for Colab tunnel to come online.")
    parser.add_argument("--max-shots", type=int, default=None, help="Render at most N pending shots in this run (e.g. 4 for test on T4).")
    parser.add_argument("--auto-disconnect", action="store_true", help="Trigger Colab Kill Switch after all shots render cleanly.")
    parser.add_argument("--max-retries", type=int, default=2, help="Retries per shot on transient Colab errors.")
    parser.add_argument("--allow-partial", action="store_true", help="Allow assembling MV even if some shots are missing.")
    return parser.parse_args()


def main() -> int:
    load_dotenv_files()
    args = parse_args()

    if args.self_test:
        run_self_test()
        return 0

    if not args.audio:
        print("Error: --audio <song_path_or_flowmusic_url> is required (unless running --self-test).", file=sys.stderr)
        return 2

    ffmpeg_bin = resolve_ffmpeg()
    proj_slug = derive_project_slug(args.audio, args.project)
    project_dir = REPO_ROOT / "outputs" / "mv_projects" / proj_slug
    project_dir.mkdir(parents=True, exist_ok=True)
    storyboard_path = project_dir / "storyboard.json"
    plots_path = project_dir / "plots.json"

    audio_path, song_meta = resolve_audio_input(args.audio, project_dir, args.lyrics_file)

    chosen_plot: Optional[Dict[str, Any]] = None
    if args.plot_choice is not None:
        if not plots_path.is_file():
            raise FileNotFoundError(f"plots.json not found at {plots_path}. Run --stage pitch first.")
        plots_data = json.loads(plots_path.read_text(encoding="utf-8"))
        for p in plots_data.get("plots", []):
            if int(p.get("plot_id", 0)) == args.plot_choice:
                chosen_plot = p
                break
        if not chosen_plot:
            raise ValueError(f"Plot choice {args.plot_choice} not found in {plots_path}.")

    effective_aspect = args.aspect or (chosen_plot.get("recommended_aspect") if chosen_plot else None) or "16:9"
    if effective_aspect not in ASPECT_PRESETS:
        effective_aspect = "16:9"
    default_w, default_h = ASPECT_PRESETS[effective_aspect]
    width = max(256, ((args.width or default_w) // 32) * 32)
    height = max(256, ((args.height or default_h) // 32) * 32)

    print("=================================================================")
    print(f"  AI Music Video Director | Project: {proj_slug}")
    print(f"  Stage: {args.stage} | Size: {width}x{height} ({effective_aspect})")
    print(f"  Project Folder: {project_dir}")
    print("=================================================================")

    has_lyrics = bool((song_meta.get("lyrics") or "").strip())

    # ---- STAGE 0: PITCH 3 PLOTS (0 Colab Credits) ----
    if args.stage == "pitch":
        analysis = prepare_audio(
            ffmpeg_bin=ffmpeg_bin,
            audio_path=audio_path,
            project_dir=project_dir,
            separate_stems=args.separate_stems,
            use_whisper=args.use_whisper,
            has_lyrics=has_lyrics,
        )
        if plots_path.is_file() and not args.force_plots:
            print(f"[Director] Loading existing 3-plot pitch: {plots_path}")
            plots_data = json.loads(plots_path.read_text(encoding="utf-8"))
        else:
            api_key = args.gemini_api_key or os.environ.get("GEMINI_API_KEY")
            if not api_key:
                raise RuntimeError("Missing Gemini API key. Set GEMINI_API_KEY env var or pass --gemini-api-key.")
            user_hint = "" if args.concept == "Cinematic emotional performance music video" else args.concept
            plots_data = generate_mv_plots_with_gemini(
                audio_path=audio_path,
                analysis=analysis,
                song_meta=song_meta,
                api_key=api_key,
                requested_model=args.gemini_model,
                user_hint=user_hint,
            )
            plots_path.write_text(json.dumps(plots_data, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[Director] Saved 3 MV plots -> {plots_path}")

        print_plots_summary(plots_data)
        print(
            f"Next step: pick your favorite plot (1, 2, or 3) and run:\n"
            f"  run_mv_director.bat --stage prepare --audio \"{args.audio}\" --project \"{proj_slug}\" --plot-choice <1|2|3>"
        )
        return 0

    # ---- STAGE 1: PREPARE (Audio + Gemini Storyboard + Refs) ----
    if args.stage in ("all", "prepare"):
        analysis = prepare_audio(
            ffmpeg_bin=ffmpeg_bin,
            audio_path=audio_path,
            project_dir=project_dir,
            separate_stems=args.separate_stems,
            use_whisper=args.use_whisper,
            has_lyrics=has_lyrics,
        )

        if storyboard_path.is_file() and not args.force_storyboard:
            print(f"[Director] Loading existing storyboard: {storyboard_path}")
            storyboard = json.loads(storyboard_path.read_text(encoding="utf-8"))
        else:
            api_key = args.gemini_api_key or os.environ.get("GEMINI_API_KEY")
            if not api_key:
                raise RuntimeError("Missing Gemini API key. Set GEMINI_API_KEY env var or pass --gemini-api-key.")
            effective_concept = chosen_plot["concept_prompt"] if chosen_plot else args.concept
            effective_style = chosen_plot["visual_style"] if chosen_plot else args.style
            storyboard, _ = generate_storyboard_with_gemini(
                audio_path=audio_path,
                analysis=analysis,
                concept=effective_concept,
                style=effective_style,
                aspect_ratio=effective_aspect,
                api_key=api_key,
                requested_model=args.gemini_model,
                chosen_plot=chosen_plot,
                song_meta=song_meta,
            )
            save_storyboard(storyboard_path, storyboard)
            print(f"[Director] Saved storyboard -> {storyboard_path}")

        slice_source = Path(analysis["vocals_path"]) if analysis.get("vocals_path") else audio_path
        slice_shot_audio_files(ffmpeg_bin, slice_source, project_dir, storyboard["shots"])
        save_storyboard(storyboard_path, storyboard)

        prepare_character_refs(
            storyboard=storyboard,
            project_dir=project_dir,
            ref_engine=args.ref_engine,
            flux_url=args.flux_url,
            flux_password=args.flux_password,
            comfy_url=args.comfy_url,
            sidecar_url=args.sidecar_url,
            width=width,
            height=height,
        )
        save_storyboard(storyboard_path, storyboard)

        if args.stage == "prepare":
            print("\n[Done - Prepare Stage (0 Colab Credits Used)]")
            print(f"1. Review/edit shots & lyrics in: {storyboard_path}")
            print(f"2. Check/replace character portraits in: {project_dir / 'refs'}")
            print(
                f"3. Next, start Colab A100 and run:\n"
                f"   --stage render --audio \"{args.audio}\" --project \"{proj_slug}\" "
                f"--comfy-url <COMFY_TUNNEL_URL> --sidecar-url <SIDECAR_TUNNEL_URL> --auto-disconnect"
            )
            return 0
    else:
        if not storyboard_path.is_file():
            raise FileNotFoundError(f"Storyboard not found at {storyboard_path}. Run --stage prepare first.")
        storyboard = json.loads(storyboard_path.read_text(encoding="utf-8"))

    # ---- STAGE 2: RENDER SHOTS ON COLAB A100 ----
    if args.stage in ("all", "render"):
        if not args.comfy_url:
            raise RuntimeError("Missing --comfy-url (or COMFY_URL env var) for Colab rendering.")
        failures = render_shots_on_colab(
            ffmpeg_bin=ffmpeg_bin,
            storyboard=storyboard,
            storyboard_path=storyboard_path,
            project_dir=project_dir,
            comfy_url=args.comfy_url,
            sidecar_url=args.sidecar_url,
            width=width,
            height=height,
            steps=args.steps,
            use_hybrid=args.use_hybrid,
            max_retries=args.max_retries,
            auto_disconnect=args.auto_disconnect,
            explicit_size=bool(args.width or args.height),
            wait_for_colab=args.wait_for_colab,
            max_shots=args.max_shots,
            aspect_ratio=effective_aspect,
        )
        if failures > 0 and not args.allow_partial:
            print(f"[Error] {failures} shot(s) failed. Re-run --stage render to resume remaining shots.")
            return 1
        if args.stage == "render":
            print("\n[Done - Render Stage] Run --stage assemble next to stitch final MV.")
            return 0

    # ---- STAGE 3: ASSEMBLE FINAL MV ----
    if args.stage in ("all", "assemble"):
        outputs = assemble_final_mv(
            ffmpeg_bin=ffmpeg_bin,
            storyboard=storyboard,
            audio_path=audio_path,
            project_dir=project_dir,
            width=width,
            height=height,
            allow_partial=args.allow_partial,
        )
        print("\n=================================================================")
        print("  MUSIC VIDEO COMPLETE!")
        print(f"  Clean MV     : {outputs['clean']}")
        print(f"  Subtitled MV : {outputs['subtitled']}")
        print("=================================================================")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
