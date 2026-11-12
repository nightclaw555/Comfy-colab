import { PromptConfig } from '../types';

export function buildComfyPrompt(config: PromptConfig): Record<string, any> {
  const mode = config.taskMode || (config.modelEngine as any) || 'tiktok';

  if (mode === 'image_gen' || config.mode === 't2i' || config.mode === 'i2i') {
    return buildImageGenWorkflow(config);
  }
  if (mode === 'nsfw_motion') {
    return buildNsfwMotionWorkflow(config);
  }
  if (mode === 'music_video') {
    return buildMusicVideoWorkflow(config);
  }
  // Default to TikTok Ads workflow
  return buildTikTokWorkflow(config);
}

// -------------------------------------------------------------
// Common Utilities for MiniMax-H3
// -------------------------------------------------------------
function prepareMiniMaxCommon(config: PromptConfig) {
  const seed = config.randomizeSeed
    ? Math.floor(Math.random() * 9007199254740991)
    : (config.seed || 42);

  const DEFAULT_UNIVERSAL_AMBIENT =
    'subtle natural ambient sound, gentle cinematic background atmosphere, clean high fidelity stereo, calm peaceful acoustics, no harsh noise';
  const effectiveAudio =
    config.audioPrompt && config.audioPrompt.trim()
      ? config.audioPrompt.trim()
      : DEFAULT_UNIVERSAL_AMBIENT;
  const promptText = `${config.positivePrompt}\n\nAudio: ${effectiveAudio}`;

  // MiniMax H3 resolution constraint: multiples of 32, max 1344x768
  let safeWidth = Math.floor(config.width / 32) * 32;
  let safeHeight = Math.floor(config.height / 32) * 32;
  if (safeWidth > 1344) safeWidth = 1344;
  if (safeHeight > 1344) safeHeight = 1344;

  // MiniMax H3 frame length constraint: (17k + 5) grid at 24fps
  // 56 frames (~2.3s), 73 frames (~3.0s), 124 frames (~5.1s), 243 frames (~10.1s Single-Pass), 362 frames (~15.1s Single-Pass)
  let safeLength = 124;
  if (config.frames <= 56) safeLength = 56;
  else if (config.frames <= 81) safeLength = 73;
  else if (config.frames <= 150) safeLength = 124;
  else if (config.frames <= 260) safeLength = 243;
  else safeLength = 362;

  return { seed, promptText, safeWidth, safeHeight, safeLength };
}

// -------------------------------------------------------------
// 1. TikTok Commercial Ads Workflow (Super Fast 8-step, 9:16)
// -------------------------------------------------------------
function buildTikTokWorkflow(config: PromptConfig): Record<string, any> {
  const { seed, promptText, safeWidth, safeHeight, safeLength } = prepareMiniMaxCommon(config);

  const graph: Record<string, any> = {
    // Video VAE
    "119": {
      "class_type": "VAELoader",
      "inputs": {
        "vae_name": "minimax_h3_video_vae_fp16.safetensors"
      }
    },
    // Audio VAE
    "120": {
      "class_type": "VAELoader",
      "inputs": {
        "vae_name": "minimax_h3_audio_vae_fp32.safetensors"
      }
    },
    // Audio Decoder
    "121": {
      "class_type": "VAEDecodeAudio",
      "inputs": {
        "samples": ["125", 0],
        "vae": ["120", 0]
      }
    },
    // Video Decoder
    "122": {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": ["125", 0],
        "vae": ["119", 0]
      }
    },
    // Base Diffusion Model (FL2VA Pruned Int8 for high visual sharpness)
    "127": {
      "class_type": "UNETLoader",
      "inputs": {
        "unet_name": "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
        "weight_dtype": "default"
      }
    },
    // Text Encoder (Qwen3-VL 32B)
    "128": {
      "class_type": "CLIPLoader",
      "inputs": {
        "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        "type": "minimax",
        "device": "default"
      }
    },
    // MiniMax H3 Turbo LoRA (8-Step Acceleration)
    "134": {
      "class_type": "MiniMaxH3TurboLoRA",
      "inputs": {
        "model": ["127", 0],
        "lora_name": "minimax_h3_turbo_4step_ema_ckpt850.safetensors",
        "strength": config.turboLoraStrength || 1.0,
        "low_vram": false
      }
    },
    // Joint Conditioning & Latent Generator
    "131": {
      "class_type": "MiniMaxH3ImageToVideo",
      "inputs": {
        "prompt": promptText,
        "width": safeWidth,
        "height": safeHeight,
        "length": safeLength,
        "clip": ["128", 0],
        "vae": ["119", 0]
      }
    },
    // Guider
    "126": {
      "class_type": "BasicGuider",
      "inputs": {
        "model": ["134", 0],
        "conditioning": ["131", 0]
      }
    },
    // Sampler
    "135": {
      "class_type": "MiniMaxH3TurboSampler",
      "inputs": {}
    },
    // Noise Generator
    "129": {
      "class_type": "RandomNoise",
      "inputs": {
        "noise_seed": seed
      }
    },
    // Scheduler
    "124": {
      "class_type": "BasicScheduler",
      "inputs": {
        "scheduler": "simple",
        "steps": config.steps || 8,
        "denoise": 1.0,
        "model": ["134", 0]
      }
    },
    // Sampler Advanced
    "125": {
      "class_type": "SamplerCustomAdvanced",
      "inputs": {
        "noise": ["129", 0],
        "guider": ["126", 0],
        "sampler": ["135", 0],
        "sigmas": ["124", 0],
        "latent_image": ["131", 1]
      }
    },
    // Synced Video Container
    "130": {
      "class_type": "CreateVideo",
      "inputs": {
        "fps": 24,
        "audio_fps": 8,
        "images": ["122", 0],
        "audio": ["121", 0]
      }
    },
    // Save Video
    "92": {
      "class_type": "SaveVideo",
      "inputs": {
        "filename_prefix": "video/TikTok_Ad",
        "format": "auto",
        "codec": "auto",
        "video": ["130", 0]
      }
    }
  };

  // Image-to-Video: Product or model reference
  if (config.mode === 'i2v' && config.inputImageFilename && config.inputImageFilename.trim() !== '' && config.inputImageFilename !== 'input.png') {
    graph["140"] = {
      "class_type": "LoadImage",
      "inputs": {
        "image": config.inputImageFilename
      }
    };
    graph["131"]["inputs"]["first_frame"] = ["140", 0];
  }

  return graph;
}

// -------------------------------------------------------------
// 2. NSFW Reference & Motion Mimic Workflow (Hybrid Model + MysticXXX)
// -------------------------------------------------------------
function buildNsfwMotionWorkflow(config: PromptConfig): Record<string, any> {
  const { seed, promptText, safeWidth, safeHeight, safeLength } = prepareMiniMaxCommon(config);

  const graph: Record<string, any> = {
    // Video VAE
    "119": {
      "class_type": "VAELoader",
      "inputs": {
        "vae_name": "minimax_h3_video_vae_fp16.safetensors"
      }
    },
    // Audio VAE
    "120": {
      "class_type": "VAELoader",
      "inputs": {
        "vae_name": "minimax_h3_audio_vae_fp32.safetensors"
      }
    },
    // Audio Decoder
    "121": {
      "class_type": "VAEDecodeAudio",
      "inputs": {
        "samples": ["125", 0],
        "vae": ["120", 0]
      }
    },
    // Video Decoder
    "122": {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": ["125", 0],
        "vae": ["119", 0]
      }
    },
    // Base Checkpoint: smhfacct Hybrid (or fallback to fl2va if single model loaded)
    "127": {
      "class_type": "UNETLoader",
      "inputs": {
        "unet_name": "minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors",
        "weight_dtype": "default"
      }
    },
    // Text Encoder (Qwen3-VL 32B)
    "128": {
      "class_type": "CLIPLoader",
      "inputs": {
        "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        "type": "minimax",
        "device": "default"
      }
    },
    // Turbo LoRA
    "134": {
      "class_type": "MiniMaxH3TurboLoRA",
      "inputs": {
        "model": ["127", 0],
        "lora_name": "minimax_h3_turbo_4step_ema_ckpt850.safetensors",
        "strength": config.turboLoraStrength || 1.0,
        "low_vram": false
      }
    },
    // Uncensored / Anatomy Booster LoRA (MysticXXX)
    "136": {
      "class_type": "LoraLoaderModelOnly",
      "inputs": {
        "model": ["134", 0],
        "lora_name": "MysticXXX_MMH3-V4.safetensors",
        "strength_model": config.uncensoredLoraStrength ?? 0.8
      }
    },
    // Joint Conditioning & Latent Generator
    "131": {
      "class_type": "MiniMaxH3ImageToVideo",
      "inputs": {
        "prompt": promptText,
        "width": safeWidth,
        "height": safeHeight,
        "length": safeLength,
        "clip": ["128", 0],
        "vae": ["119", 0]
      }
    },
    // Guider (connected to the chained uncensored model)
    "126": {
      "class_type": "BasicGuider",
      "inputs": {
        "model": ["136", 0],
        "conditioning": ["131", 0]
      }
    },
    // Sampler
    "135": {
      "class_type": "MiniMaxH3TurboSampler",
      "inputs": {}
    },
    // Noise Generator
    "129": {
      "class_type": "RandomNoise",
      "inputs": {
        "noise_seed": seed
      }
    },
    // Scheduler
    "124": {
      "class_type": "BasicScheduler",
      "inputs": {
        "scheduler": "simple",
        "steps": config.steps || 8,
        "denoise": 1.0,
        "model": ["136", 0]
      }
    },
    // Sampler Advanced
    "125": {
      "class_type": "SamplerCustomAdvanced",
      "inputs": {
        "noise": ["129", 0],
        "guider": ["126", 0],
        "sampler": ["135", 0],
        "sigmas": ["124", 0],
        "latent_image": ["131", 1]
      }
    },
    // Synced Video Container
    "130": {
      "class_type": "CreateVideo",
      "inputs": {
        "fps": 24,
        "audio_fps": 8,
        "images": ["122", 0],
        "audio": ["121", 0]
      }
    },
    // Save Video
    "92": {
      "class_type": "SaveVideo",
      "inputs": {
        "filename_prefix": "video/NSFW_Motion_Mimic",
        "format": "auto",
        "codec": "auto",
        "video": ["130", 0]
      }
    }
  };

  // Attach Character Reference Image
  if (config.mode === 'i2v' && config.inputImageFilename && config.inputImageFilename.trim() !== '' && config.inputImageFilename !== 'input.png') {
    graph["140"] = {
      "class_type": "LoadImage",
      "inputs": {
        "image": config.inputImageFilename
      }
    };
    graph["131"]["inputs"]["first_frame"] = ["140", 0];
  }

  // Attach Reference Video for motion mimic if supplied
  if (config.referenceVideoFilename) {
    graph["141"] = {
      "class_type": "VHS_LoadVideo",
      "inputs": {
        "video": config.referenceVideoFilename,
        "force_rate": 24,
        "force_size": "Custom",
        "custom_width": safeWidth,
        "custom_height": safeHeight,
        "frame_load_cap": safeLength,
        "skip_first_frames": 0,
        "select_every_nth": 1
      }
    };
    // Feed reference frames into conditioning if custom node is enabled
    graph["131"]["inputs"]["reference_images"] = ["141", 0];
  }

  return graph;
}

// -------------------------------------------------------------
// 3. Music Video Workflow (High Fidelity Cinematic + Precision Audio Sync)
// -------------------------------------------------------------
function buildMusicVideoWorkflow(config: PromptConfig): Record<string, any> {
  const { seed, promptText, safeWidth, safeHeight, safeLength } = prepareMiniMaxCommon(config);

  const graph: Record<string, any> = {
    // Video VAE
    "119": {
      "class_type": "VAELoader",
      "inputs": {
        "vae_name": "minimax_h3_video_vae_fp16.safetensors"
      }
    },
    // Audio VAE
    "120": {
      "class_type": "VAELoader",
      "inputs": {
        "vae_name": "minimax_h3_audio_vae_fp32.safetensors"
      }
    },
    // Audio Decoder
    "121": {
      "class_type": "VAEDecodeAudio",
      "inputs": {
        "samples": ["125", 0],
        "vae": ["120", 0]
      }
    },
    // Video Decoder
    "122": {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": ["125", 0],
        "vae": ["119", 0]
      }
    },
    // Base Diffusion Model: High-Resolution FL2VA
    "127": {
      "class_type": "UNETLoader",
      "inputs": {
        "unet_name": "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
        "weight_dtype": "default"
      }
    },
    // Text Encoder (Qwen3-VL 32B)
    "128": {
      "class_type": "CLIPLoader",
      "inputs": {
        "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        "type": "minimax",
        "device": "default"
      }
    },
    // Acceleration (Turbo LoRA / PDD)
    "134": {
      "class_type": "MiniMaxH3TurboLoRA",
      "inputs": {
        "model": ["127", 0],
        "lora_name": "minimax_h3_turbo_4step_ema_ckpt850.safetensors",
        "strength": config.turboLoraStrength || 1.0,
        "low_vram": false
      }
    },
    // Joint Conditioning & Latent Generator
    "131": {
      "class_type": "MiniMaxH3ImageToVideo",
      "inputs": {
        "prompt": promptText,
        "width": safeWidth,
        "height": safeHeight,
        "length": safeLength,
        "clip": ["128", 0],
        "vae": ["119", 0]
      }
    },
    // Guider
    "126": {
      "class_type": "BasicGuider",
      "inputs": {
        "model": ["134", 0],
        "conditioning": ["131", 0]
      }
    },
    // Sampler
    "135": {
      "class_type": "MiniMaxH3TurboSampler",
      "inputs": {}
    },
    // Noise Generator
    "129": {
      "class_type": "RandomNoise",
      "inputs": {
        "noise_seed": seed
      }
    },
    // Scheduler (Configured for 8 steps rhythm consistency)
    "124": {
      "class_type": "BasicScheduler",
      "inputs": {
        "scheduler": "simple",
        "steps": config.steps || 8,
        "denoise": 1.0,
        "model": ["134", 0]
      }
    },
    // Sampler Advanced
    "125": {
      "class_type": "SamplerCustomAdvanced",
      "inputs": {
        "noise": ["129", 0],
        "guider": ["126", 0],
        "sampler": ["135", 0],
        "sigmas": ["124", 0],
        "latent_image": ["131", 1]
      }
    },
    // Synced Video Container
    "130": {
      "class_type": "CreateVideo",
      "inputs": {
        "fps": 24,
        "audio_fps": 8,
        "images": ["122", 0],
        "audio": ["121", 0]
      }
    },
    // Save Video
    "92": {
      "class_type": "SaveVideo",
      "inputs": {
        "filename_prefix": "video/Music_Video_Studio",
        "format": "auto",
        "codec": "auto",
        "video": ["130", 0]
      }
    }
  };

  // Optional First Frame for MV opening shot
  if (config.mode === 'i2v' && config.inputImageFilename && config.inputImageFilename.trim() !== '' && config.inputImageFilename !== 'input.png') {
    graph["140"] = {
      "class_type": "LoadImage",
      "inputs": {
        "image": config.inputImageFilename
      }
    };
    graph["131"]["inputs"]["first_frame"] = ["140", 0];
  }

  return graph;
}

// -------------------------------------------------------------
// 4. MiniMax-H3-Image Workflow (4K Ultra-HD Text-to-Image & Multi-Ref Edit in 6 Steps)
// -------------------------------------------------------------
function buildImageGenWorkflow(config: PromptConfig): Record<string, any> {
  const seed = config.randomizeSeed
    ? Math.floor(Math.random() * 9007199254740991)
    : (config.seed || 42);

  // MiniMax-H3-Image supports native up to 4096x4096 (multiples of 32)
  let safeWidth = Math.max(512, Math.floor((config.width || 2048) / 32) * 32);
  let safeHeight = Math.max(512, Math.floor((config.height || 2048) / 32) * 32);
  if (safeWidth > 4096) safeWidth = 4096;
  if (safeHeight > 4096) safeHeight = 4096;

  // Colab auto-symlinks minimax_h3_image_auto.safetensors to BF16 (on A100 80GB) or INT8 (on 40GB/24GB)
  let unetName = 'minimax_h3_image_pruned_bf16.safetensors';
  if (config.imagePrecision === 'int8_fast') {
    unetName = 'minimax_h3_image_pruned_int8_convrot.safetensors';
  } else if (config.imagePrecision === 'bf16_80gb') {
    unetName = 'minimax_h3_image_pruned_bf16.safetensors';
  }

  const graph: Record<string, any> = {
    // 24-Channel Image VAE
    "10": {
      "class_type": "VAELoader",
      "inputs": {
        "vae_name": "minimax_h3_image_vae_fp16.safetensors"
      }
    },
    // Shared Qwen3-VL 32B Text Encoder
    "11": {
      "class_type": "CLIPLoader",
      "inputs": {
        "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        "type": "minimax",
        "device": "default"
      }
    },
    // MiniMax-H3-Image DiT (BF16 on A100 80GB / INT8 on 40GB-24GB via Colab Auto-Select & Alias)
    "12": {
      "class_type": "UNETLoader",
      "inputs": {
        "unet_name": unetName,
        "weight_dtype": "default"
      }
    },
    // Native MiniMaxH3ImageConditioning (T2I + Multi-Ref Image Editing)
    "13": {
      "class_type": "MiniMaxH3ImageConditioning",
      "inputs": {
        "prompt": config.positivePrompt,
        "width": safeWidth,
        "height": safeHeight,
        "clip": ["11", 0],
        "vae": ["10", 0]
      }
    },
    // Guider (CFG-distilled at 1.0, no negative prompt needed)
    "14": {
      "class_type": "BasicGuider",
      "inputs": {
        "model": ["12", 0],
        "conditioning": ["13", 0]
      }
    },
    // Sampler (Euler for 6-step distilled PDD)
    "15": {
      "class_type": "KSamplerSelect",
      "inputs": {
        "sampler_name": "euler"
      }
    },
    // Noise
    "16": {
      "class_type": "RandomNoise",
      "inputs": {
        "noise_seed": seed
      }
    },
    // Scheduler (6 steps simple schedule)
    "17": {
      "class_type": "BasicScheduler",
      "inputs": {
        "scheduler": "simple",
        "steps": config.steps || 6,
        "denoise": 1.0,
        "model": ["12", 0]
      }
    },
    // Advanced Sampler
    "18": {
      "class_type": "SamplerCustomAdvanced",
      "inputs": {
        "noise": ["16", 0],
        "guider": ["14", 0],
        "sampler": ["15", 0],
        "sigmas": ["17", 0],
        "latent_image": ["13", 1]
      }
    },
    // Decode 24-channel Latent to RGB Image
    "19": {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": ["18", 0],
        "vae": ["10", 0]
      }
    },
    // Save Ultra-HD Image
    "20": {
      "class_type": "SaveImage",
      "inputs": {
        "filename_prefix": "image/MiniMax_H3_4K",
        "images": ["19", 0]
      }
    }
  };

  // Image Editing / Reference Mode (if user attached an image)
  if ((config.mode === 'i2i' || config.mode === 'i2v') && config.inputImageFilename && config.inputImageFilename.trim() !== '' && config.inputImageFilename !== 'input.png') {
    graph["21"] = {
      "class_type": "LoadImage",
      "inputs": {
        "image": config.inputImageFilename
      }
    };
    graph["13"]["inputs"]["image_1"] = ["21", 0];
  }

  return graph;
}
