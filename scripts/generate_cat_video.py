import json
import urllib.request
import time
import sys

COMFY_URL = "https://comfy-api.ayaigaldie.site"
SIDECAR_URL = "https://sidecar.ayaigaldie.site"
HEADERS = {"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"}

def build_t2v_workflow(prompt_text, neg_prompt, seed, filename_prefix, width=576, height=1024, length=124, steps=8):
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
        "7": {
            "inputs": {
                "text": prompt_text,
                "clip": ["2", 0]
            },
            "class_type": "CLIPTextEncode"
        },
        "8": {
            "inputs": {
                "text": neg_prompt,
                "clip": ["2", 0]
            },
            "class_type": "CLIPTextEncode"
        },
        "9": {
            "inputs": {
                "width": width,
                "height": height,
                "length": length
            },
            "class_type": "EmptyMiniMaxH3LatentAV"
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
                "latent_image": ["9", 0]
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
    req = urllib.request.Request(f"{COMFY_URL}/prompt", data=data, headers=HEADERS)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        print(f"ComfyUI Validation Error ({e.code}):", error_body)
        return {"error": error_body, "code": e.code}

if __name__ == "__main__":
    p1 = "Vertical 9:16 cinematic video, photorealistic National Geographic quality. A sleek domestic short-haired black cat with shiny black fur and striking bright green eyes standing upright on two hind legs on a polished hardwood floor. The black cat smoothly begins a flawless moonwalk glide backwards across the wooden floor, executing the classic dance move with its paws. Warm cozy indoor lighting, shallow depth of field, fluid and natural feline physics, 4k resolution, hyper-detailed fur texture."
    neg = "extra limbs, extra legs, deformed paws, mutated anatomy, unnatural distortion, blurry, jerky motion, low quality, artifacts, cartoonish, 3d render, watermark, text, out of frame"

    wf = build_t2v_workflow(p1, neg, 42109284, "Cat_Moonwalk_Part1")
    print("Sending workflow to ComfyUI for validation...")
    res = queue_prompt(wf)
    print("Result:", json.dumps(res, indent=2))
