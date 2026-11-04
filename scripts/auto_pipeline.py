import json
import urllib.request
import subprocess
import time
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

COMFY_URL = "https://comfy-api.ayaigaldie.site"
SIDECAR_URL = "https://sidecar.ayaigaldie.site"
HEADERS_JSON = {"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"}
HEADERS_GEN = {"User-Agent": "Mozilla/5.0"}

def get_outputs():
    req = urllib.request.Request(f"{SIDECAR_URL}/outputs", headers=HEADERS_GEN)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return [x["filename"] for x in data.get("outputs", [])]
    except Exception as e:
        print(f"Error checking outputs: {e}")
        return []

def download_file(filename, local_path):
    url = f"{SIDECAR_URL}/outputs/{filename}"
    print(f"Downloading {url} to {local_path}...")
    req = urllib.request.Request(url, headers=HEADERS_GEN)
    with urllib.request.urlopen(req, timeout=60) as resp, open(local_path, "wb") as f:
        f.write(resp.read())
    print(f"Downloaded {local_path} ({os.path.getsize(local_path)} bytes)")

def extract_last_frame(video_path, out_png):
    cmd = ["ffmpeg", "-y", "-sseof", "-0.1", "-i", video_path, "-update", "1", "-q:v", "2", out_png]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    print(f"Extracted last frame to {out_png}")

def upload_image(image_path):
    import urllib.parse
    # Use curl.exe for multipart upload reliability
    cmd = ["curl.exe", "-s", "-H", "User-Agent: Mozilla/5.0", "-F", f"image=@{image_path}", "-F", "overwrite=true", f"{COMFY_URL}/upload/image"]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    print(f"Uploaded {image_path}: {res.stdout.strip()}")

def queue_prompt(prompt_workflow):
    data = json.dumps({"prompt": prompt_workflow}).encode("utf-8")
    req = urllib.request.Request(f"{COMFY_URL}/prompt", data=data, headers=HEADERS_JSON)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))

def build_i2v_workflow(image_name, prompt_text, neg_prompt, seed, filename_prefix, width=576, height=1024, length=124, steps=8):
    return {
        "1": {
            "inputs": {
                "unet_name": "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
                "weight_dtype": "default"
            },
            "class_type": "UNETLoader"
        },
        "2": {
            "inputs": {
                "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
                "type": "minimax"
            },
            "class_type": "CLIPLoader"
        },
        "3": {
            "inputs": {
                "vae_name": "minimax_h3_video_vae_fp16.safetensors"
            },
            "class_type": "VAELoader"
        },
        "4": {
            "inputs": {
                "vae_name": "minimax_h3_audio_vae_fp32.safetensors"
            },
            "class_type": "VAELoader"
        },
        "5": {
            "inputs": {
                "lora_name": "minimax_h3_turbo_4step_ema_ckpt850.safetensors",
                "strength_model": 1.0,
                "model": ["1", 0]
            },
            "class_type": "LoraLoaderModelOnly"
        },
        "6": {
            "inputs": {
                "image": image_name
            },
            "class_type": "LoadImage"
        },
        "7": {
            "inputs": {
                "clip": ["2", 0],
                "vae": ["3", 0],
                "prompt": prompt_text,
                "width": width,
                "height": height,
                "length": length,
                "first_frame": ["6", 0]
            },
            "class_type": "MiniMaxH3ImageToVideo"
        },
        "8": {
            "inputs": {
                "text": neg_prompt,
                "clip": ["2", 0]
            },
            "class_type": "CLIPTextEncode"
        },
        "10": {
            "inputs": {
                "seed": seed,
                "steps": steps,
                "cfg": 2.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
                "model": ["5", 0],
                "positive": ["7", 0],
                "negative": ["8", 0],
                "latent_image": ["7", 1]
            },
            "class_type": "KSampler"
        },
        "11": {
            "inputs": {
                "samples": ["10", 0],
                "vae": ["3", 0]
            },
            "class_type": "VAEDecode"
        },
        "12": {
            "inputs": {
                "samples": ["10", 0],
                "vae": ["4", 0]
            },
            "class_type": "VAEDecodeAudio"
        },
        "13": {
            "inputs": {
                "images": ["11", 0],
                "audio": ["12", 0],
                "frame_rate": 24.0,
                "loop_count": 0,
                "filename_prefix": filename_prefix,
                "format": "video/h264-mp4",
                "pingpong": False,
                "save_output": True
            },
            "class_type": "VHS_VideoCombine"
        }
    }

def merge_videos(v1, v2, v3, out_final):
    list_txt = "outputs/merge_list.txt"
    with open(list_txt, "w") as f:
        f.write(f"file '{os.path.abspath(v1)}'\n")
        f.write(f"file '{os.path.abspath(v2)}'\n")
        f.write(f"file '{os.path.abspath(v3)}'\n")
    
    cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_txt, "-c", "copy", out_final]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        # Re-encode fallback
        cmd_re = [
            "ffmpeg", "-y",
            "-i", v1, "-i", v2, "-i", v3,
            "-filter_complex", "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]",
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
            out_final
        ]
        subprocess.run(cmd_re, check=True)
    print(f"🎉 Successfully merged 3 clips into: {out_final}")

def run_pipeline():
    os.makedirs("outputs", exist_ok=True)
    print("⏳ Step 1: Waiting for Part 2 to complete...")
    part2_file = None
    for _ in range(60):
        outs = get_outputs()
        for f in outs:
            if "Part2" in f and f.endswith("-audio.mp4"):
                part2_file = f
                break
        if part2_file:
            break
        time.sleep(10)
    
    if not part2_file:
        print("Timeout waiting for Part 2.")
        return

    print(f"✅ Found Part 2 output: {part2_file}")
    time.sleep(2)
    local_part2 = "outputs/Cat_Moonwalk_Part2.mp4"
    download_file(part2_file, local_part2)

    print("🖼️ Step 2: Extracting last frame of Part 2...")
    part2_frame = "outputs/part2_last_frame.png"
    extract_last_frame(local_part2, part2_frame)

    print("📤 Step 3: Uploading part2_last_frame.png to ComfyUI...")
    upload_image(part2_frame)

    print("🚀 Step 4: Queueing Part 3 (Final Spin & Pose)...")
    p3 = "Vertical 9:16 cinematic slow motion. The domestic black cat finishes its smooth moonwalk, performs a quick elegant 360-degree spin on one hind paw, and lands in an iconic Michael Jackson style freeze pose, flicking its ear with attitude. The cat looks directly into the camera with confident glowing green eyes. Beautiful studio lighting, realistic fur dynamics, crisp focus, cinematic color grading."
    neg = "extra limbs, extra legs, deformed paws, mutated anatomy, unnatural distortion, blurry, jerky motion, low quality, artifacts, cartoonish, 3d render, watermark, text, out of frame"
    wf3 = build_i2v_workflow("part2_last_frame.png", p3, neg, 42109286, "Cat_Moonwalk_Part3")
    q_res = queue_prompt(wf3)
    print(f"Part 3 Queued: {q_res}")

    print("⏳ Step 5: Waiting for Part 3 to complete...")
    part3_file = None
    for _ in range(60):
        outs = get_outputs()
        for f in outs:
            if "Part3" in f and f.endswith("-audio.mp4"):
                part3_file = f
                break
        if part3_file:
            break
        time.sleep(10)

    if not part3_file:
        print("Timeout waiting for Part 3.")
        return

    print(f"✅ Found Part 3 output: {part3_file}")
    time.sleep(2)
    local_part3 = "outputs/Cat_Moonwalk_Part3.mp4"
    download_file(part3_file, local_part3)

    print("🎬 Step 6: Concatenating all 3 clips into final 15s video...")
    final_output = "outputs/Cat_Moonwalk_15s_Final.mp4"
    merge_videos("outputs/Cat_Moonwalk_Part1.mp4", local_part2, local_part3, final_output)
    print(f"🎉 FINAL COMPLETE: {final_output} ({os.path.getsize(final_output)} bytes)")

if __name__ == "__main__":
    run_pipeline()
