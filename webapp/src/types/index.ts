export type GenerationMode = 't2v' | 'i2v' | 't2i' | 'i2i';
export type TaskMode = 'tiktok' | 'nsfw_motion' | 'music_video' | 'image_gen';
export type ExtensionStrategy = 'last_frame' | 'multi_angle' | 'storyboard';
export type GenerationStyle = 'sequential_storyboard' | 'single_pass_take';
export type ModelEngine = TaskMode | 'minimax' | 'wan22' | 'wan21'; // Backward compatibility
export type ImagePrecisionMode = 'auto' | 'bf16_80gb' | 'int8_fast';

export interface PromptConfig {
  taskMode: TaskMode;
  modelEngine?: ModelEngine;
  mode: GenerationMode;
  generationStyle?: GenerationStyle;
  imagePrecision?: ImagePrecisionMode;
  positivePrompt: string;
  audioPrompt: string;
  negativePrompt: string;
  aspectRatio: '16:9' | '9:16' | '1:1' | '21:9' | '4:3' | '3:4';
  width: number;
  height: number;
  frames: number;
  steps: number;
  cfg: number;
  seed: number;
  randomizeSeed: boolean;
  turboLoraStrength: number;
  uncensoredLoraStrength: number;
  inputImageBase64?: string;
  inputImageFilename?: string;
  referenceVideoBase64?: string;
  referenceVideoFilename?: string;
  originalThaiPrompt?: string;
  originalThaiAudioPrompt?: string;

  // Multi-shot Sequential Extension (5s + 5s + 5s... up to 1-2 minutes)
  totalDurationSeconds?: number;
  segmentCount?: number;
  currentSegmentIndex?: number;
  extensionStrategy?: ExtensionStrategy;
  storyboardPrompts?: string[];
  storyGroupId?: string;
  masterAnchorImageFilename?: string;
  masterAnchorImageBase64?: string;
  lockMasterCharacter?: boolean;
}

export type QueueItemStatus = 'pending' | 'uploading' | 'queued' | 'rendering' | 'completed' | 'failed';

export interface QueueItem {
  id: string;
  createdAt: number;
  config: PromptConfig;
  status: QueueItemStatus;
  progress?: number; // 0-100
  promptId?: string;
  error?: string;
  outputVideoUrl?: string;
  outputFilename?: string;
  durationSeconds?: number;
}

export interface GpuStats {
  name: string;
  memory_total_mb: number;
  memory_used_mb: number;
  memory_free_mb: number;
  utilization_gpu_pct: number;
  temperature_c: number;
}

export interface SidecarHealth {
  status: string;
  uptime_seconds: number;
  uptime_formatted: string;
  gpu?: GpuStats;
  comfy_running: boolean;
}

export interface ConnectionConfig {
  comfyUrl: string;
  sidecarUrl: string;
  isConnected: boolean;
  isSidecarConnected: boolean;
  gpuStats?: GpuStats;
  lastChecked?: number;
}
