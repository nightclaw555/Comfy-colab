import json
import urllib.request
import sys

COMFY_URL = "https://comfy-api.ayaigaldie.site"
HEADERS_JSON = {"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"}

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

def queue_prompt(prompt_workflow):
    data = json.dumps({"prompt": prompt_workflow}).encode("utf-8")
    req = urllib.request.Request(f"{COMFY_URL}/prompt", data=data, headers=HEADERS_JSON)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))

if __name__ == "__main__":
    p3 = "Vertical 9:16 cinematic slow motion. The domestic black cat finishes its smooth moonwalk, performs a quick elegant 360-degree spin on one hind paw, and lands in an iconic Michael Jackson style freeze pose, flicking its ear with attitude. The cat looks directly into the camera with confident glowing green eyes. Beautiful studio lighting, realistic fur dynamics, crisp focus, cinematic color grading."
    neg = "extra limbs, extra legs, deformed paws, mutated anatomy, unnatural distortion, blurry, jerky motion, low quality, artifacts, cartoonish, 3d render, watermark, text, out of frame"

    wf3 = build_i2v_workflow("part2_last_frame.png", p3, neg, 42109286, "Cat_Moonwalk_Part3")
    res = queue_prompt(wf3)
    print("Part 3 Queue Result:", json.dumps(res, indent=2))
