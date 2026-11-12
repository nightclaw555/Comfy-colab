"""
Download MiniMax-H3 Turbo models directly to local ComfyUI models directory.
Supports aria2c (if available) or built-in resumable Python streaming.
"""

import os
import sys
import shutil
import urllib.request

MODELS_CONFIG = [
    {
        "category": "text_encoders",
        "filename": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        "url": "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        "expected_gb": 14.9,
        "required": True,
        "description": "MiniMax Text Encoder (Qwen3-VL 32B NVFP4 AWQ)"
    },
    {
        "category": "diffusion_models",
        "filename": "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
        "url": "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
        "expected_gb": 19.9,
        "required": True,
        "description": "MiniMax-H3 Turbo Diffusion Model (INT8 Pruned)"
    },
    {
        "category": "vae",
        "filename": "minimax_h3_video_vae_fp16.safetensors",
        "url": "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors",
        "expected_gb": 4.9,
        "required": True,
        "description": "MiniMax-H3 Video VAE Decoder (FP16)"
    },
    {
        "category": "vae",
        "filename": "minimax_h3_audio_vae_fp32.safetensors",
        "url": "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors",
        "expected_gb": 0.58,
        "required": True,
        "description": "MiniMax-H3 Stereo Audio VAE Decoder (FP32)"
    },
    {
        "category": "loras",
        "filename": "minimax_h3_turbo_4step_ema_ckpt850.safetensors",
        "url": "https://huggingface.co/larryvrh/MiniMax-H3-Turbo-Lora/resolve/main/minimax_h3_turbo_4step_ema_ckpt850.safetensors",
        "expected_gb": 0.74,
        "required": True,
        "description": "Turbo Acceleration LoRA (8-Step Fast Inference)"
    },
    {
        "category": "diffusion_models",
        "filename": "minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors",
        "url": "https://huggingface.co/smhfacct/Minimax-H3-fl2va-ref2va-hybrid-models/resolve/main/minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors",
        "expected_gb": 19.9,
        "required": False,
        "description": "[Optional] NSFW & Motion Mimic Hybrid Model"
    },
    {
        "category": "loras",
        "filename": "MysticXXX_MMH3-V4.safetensors",
        "url": "https://huggingface.co/lynaNSFW/mysticxxx_MM_H3/resolve/main/MysticXXX_MMH3-V4.safetensors",
        "expected_gb": 0.7,
        "required": False,
        "description": "[Optional] Mystic Motion/Character LoRA"
    },
    {
        "category": "vae",
        "filename": "minimax_h3_image_vae_fp16.safetensors",
        "url": "https://huggingface.co/Comfy-Org/MiniMax-H3-Image/resolve/main/vae/minimax_h3_image_vae_fp16.safetensors",
        "expected_gb": 0.65,
        "required": False,
        "description": "[Image Studio] MiniMax-H3-Image 24-Channel Image VAE (FP16)"
    },
    {
        "category": "diffusion_models",
        "filename": "minimax_h3_image_pruned_int8_convrot.safetensors",
        "url": "https://huggingface.co/Comfy-Org/MiniMax-H3-Image/resolve/main/diffusion_models/minimax_h3_image_pruned_int8_convrot.safetensors",
        "expected_gb": 21.0,
        "required": False,
        "description": "[Image Studio] MiniMax-H3-Image 4K DiT Model (INT8 Fast ~21GB)"
    }
]

def find_comfy_root(provided_path=None):
    if provided_path and os.path.isdir(provided_path):
        return os.path.abspath(provided_path)

    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "ComfyUI")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ComfyUI")),
        r"C:\ComfyUI_windows_portable\ComfyUI",
        r"D:\ComfyUI_windows_portable\ComfyUI",
        r"E:\ComfyUI_windows_portable\ComfyUI",
    ]
    for c in candidates:
        if os.path.isdir(c) and os.path.exists(os.path.join(c, "main.py")):
            return c

    print("\n[?] ไม่พบโฟลเดอร์ ComfyUI อัตโนมัติ")
    val = input("กรุณาระบุ Path ของโฟลเดอร์ ComfyUI ในเครื่องของคุณ: ").strip()
    if val and os.path.isdir(val):
        return os.path.abspath(val)
    raise FileNotFoundError("ไม่พบโฟลเดอร์ ComfyUI")

def download_file(url, target_path, expected_gb):
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    expected_bytes = int(expected_gb * 1024 * 1024 * 1024)

    if os.path.exists(target_path):
        size = os.path.getsize(target_path)
        if size >= (expected_bytes * 0.95):
            print(f"⚡ [พบไฟล์สมบูรณ์แล้ว] {os.path.basename(target_path)} ({size / (1024**3):.2f} GB) ข้ามการดาวน์โหลด")
            return

    # Check for aria2c
    aria2c_bin = shutil.which("aria2c")
    if aria2c_bin:
        print(f"🚀 ดาวน์โหลดด้วย aria2c (16 connections)...")
        cmd = [
            aria2c_bin, "-c", "-x", "16", "-s", "16", "-k", "1M",
            "--console-log-level=warn", "--summary-interval=10",
            url, "-d", os.path.dirname(target_path), "-o", os.path.basename(target_path)
        ]
        import subprocess
        res = subprocess.run(cmd)
        if res.returncode == 0:
            print(f"✅ ดาวน์โหลดสำเร็จ: {os.path.basename(target_path)}")
            return
        print("⚠️ aria2c ล้มเหลว เปลี่ยนไปใช้ Python download...")

    # Resumable Python download
    print(f"📥 กำลังดาวน์โหลดผ่าน Python: {os.path.basename(target_path)}...")
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
    existing_bytes = 0
    if os.path.exists(target_path):
        existing_bytes = os.path.getsize(target_path)
        if existing_bytes > 0:
            headers["Range"] = f"bytes={existing_bytes}-"
            print(f"   🔄 ต่อจากการดาวน์โหลดเดิมที่ {existing_bytes / (1024**2):.1f} MB...")

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            total_size = resp.getheader("Content-Length")
            total_bytes = int(total_size) + existing_bytes if total_size else expected_bytes
            mode = "ab" if existing_bytes > 0 else "wb"
            downloaded = existing_bytes

            with open(target_path, mode) as f:
                chunk_size = 4 * 1024 * 1024  # 4MB buffer
                last_print = 0
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    # Print progress every 5% or 50MB
                    if downloaded - last_print > 50 * 1024 * 1024:
                        pct = (downloaded / total_bytes * 100) if total_bytes else 0
                        print(f"   [{pct:5.1f}%] {downloaded / (1024**3):.2f} / {total_bytes / (1024**3):.2f} GB", end="\r")
                        last_print = downloaded

            print(f"\n✅ ดาวน์โหลดสำเร็จ: {os.path.basename(target_path)} ({downloaded / (1024**3):.2f} GB)")
    except Exception as e:
        print(f"\n❌ เกิดข้อผิดพลาดขณะดาวน์โหลด {os.path.basename(target_path)}: {e}")
        print("คุณสามารถใช้ Browser หรือ IDM โหลด URL ด้านล่างแล้วนำไปวางที่โฟลเดอร์ปลายทางได้:")
        print(f"URL: {url}")
        print(f"Target: {target_path}\n")

def main():
    print("=" * 70)
    print(" 📥 ComfyUI MiniMax-H3 Turbo — Local Models Downloader")
    print("=" * 70)

    provided = sys.argv[1] if len(sys.argv) > 1 else None
    comfy_dir = find_comfy_root(provided)
    print(f"📁 โฟลเดอร์ ComfyUI: {comfy_dir}")

    models_dir = os.path.join(comfy_dir, "models")
    if not os.path.isdir(models_dir):
        os.makedirs(models_dir, exist_ok=True)

    print("\nกรุณาเลือกระดับแพ็กเกจโมเดล:")
    print(" [1] มาตรฐาน (Base Studio ~41 GB) - แนะนำสำหรับ T2V + I2V + Audio สเตอริโอ")
    print(" [2] สตูดิโอเต็มรูปแบบ (Full Studio ~61 GB) - เพิ่ม NSFW & Hybrid Motion Model")
    choice = input("\nเลือกหมายเลข [1/2] (กด Enter เลือก 1): ").strip()

    include_optional = (choice == "2")

    for m in MODELS_CONFIG:
        if not m["required"] and not include_optional:
            continue

        target_dir = os.path.join(models_dir, m["category"])
        target_file = os.path.join(target_dir, m["filename"])
        print("\n" + "-" * 70)
        print(f"🎯 {m['description']}")
        print(f"📂 ปลายทาง: models/{m['category']}/{m['filename']} (~{m['expected_gb']} GB)")
        download_file(m["url"], target_file, m["expected_gb"])

    print("\n" + "=" * 70)
    print(" 🎉 ดาวน์โหลดโมเดลทั้งหมดพร้อมใช้งานแล้วในเครื่องของคุณ!")
    print("=" * 70)

if __name__ == "__main__":
    main()
