'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Video,
  Image as ImageIcon,
  Sliders,
  Play,
  Languages,
  Loader2,
  Plus,
  Volume2,
  Music,
  ShoppingBag,
  Flame,
  Upload,
  Wand2,
  Globe,
  X,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Layers,
  Cpu,
  Columns,
  ArrowRight,
} from 'lucide-react';
import {
  PromptConfig,
  GenerationMode,
  TaskMode,
  ExtensionStrategy,
  GenerationStyle,
  ImagePrecisionMode,
} from '../types';

interface PromptStudioProps {
  onAddToQueue: (config: PromptConfig, autoStart: boolean) => void;
  isConnected: boolean;
  gpuName?: string;
  vramTotalMb?: number;
  incomingImageForVideo?: {
    url: string;
    filename: string;
    promptText?: string;
    timestamp: number;
  } | null;
}

// -------------------------------------------------------------
// Presets by Task Mode (Including 4K Image Studio!)
// -------------------------------------------------------------
const IMAGE_4K_PRESETS = [
  {
    name: '💎 ภาพถ่ายสินค้าโฆษณา 4K',
    prompt:
      'Ultra-high-resolution 4K commercial product photography of a luxury glass serum bottle on wet black marble, crystal clear water droplets, dramatic studio rim lighting, razor-sharp reflections, photorealistic.',
    mode: 't2i' as GenerationMode,
  },
  {
    name: '📸 นางแบบแฟชั่นสตูดิโอ 4K',
    prompt:
      'Editorial high-fashion portrait of a stunning Asian model in modern luxury designer attire, natural skin texture and pores, soft golden hour studio lighting, medium format camera 100MP look, 4K native.',
    mode: 't2i' as GenerationMode,
  },
  {
    name: '🍹 อาหาร & เครื่องดื่มพรีเมียม',
    prompt:
      'Commercial food photography, iced matcha latte with rich creamy milk swirl in a crystal glass, condensation droplets, sunlit wooden cafe table, shallow depth of field, vibrant colors, 4K.',
    mode: 't2i' as GenerationMode,
  },
  {
    name: '🪄 แก้ไขฉากหลังสินค้า (<Picture 1>)',
    prompt:
      'Edit <Picture 1> by placing the subject onto a luxury sunlit travertine stone podium surrounded by soft tropical palm shadows and crystal water ripples, studio commercial lighting, 4K.',
    mode: 'i2i' as GenerationMode,
  },
];

const TIKTOK_PRESETS = [
  {
    name: '🧴 สกินแคร์ / เซรั่ม',
    prompt:
      'Commercial product advertisement for a glowing luxury skincare glass dropper bottle, water splash droplets in slow motion, studio beauty lighting, ultra-detailed glass reflections, elegant pastel background, 4k commercial grade.',
    audio:
      'gentle satisfying water droplet splash, soothing spa background ambiance, crisp high-end cosmetic aesthetic sound',
  },
  {
    name: '👗 แฟชั่น / เสื้อผ้า',
    prompt:
      'Trendy fashion model posing smoothly in streetwear outfit, urban neon city street at golden hour, dynamic smooth camera orbit, vibrant colors, premium commercial look.',
    audio:
      'upbeat modern lofi fashion beat, subtle ambient city atmosphere, trendy clean acoustic resonance',
  },
  {
    name: '🎧 หูฟัง / เทคโนโลยี',
    prompt:
      'Futuristic wireless gaming headphones floating in mid-air, dynamic RGB ambient lighting pulses, magnetic dust particles, smooth 360 rotation, high-tech product commercial.',
    audio:
      'high tech electronic hum, crisp acoustic snap, futuristic spatial sound effects, bass sweep',
  },
  {
    name: '☕ กาแฟ & เครื่องดื่ม',
    prompt:
      'Iced caramel latte in a tall clear glass, rich espresso poured over ice cubes in ultra slow motion, swirling cream, soft cafe daylight, condensation on glass.',
    audio:
      'satisfying ice cube clinking in glass, pouring liquid sound, warm cozy ambient coffee shop background',
  },
];

const NSFW_MOTION_PRESETS = [
  {
    name: '🔥 Motion Mimic Dance (เต้นตามคลิป)',
    prompt:
      'Ultra-realistic cinematic shot of a stunning character seamlessly mimicking fluid graceful dance movements from reference motion, perfect anatomical proportions, natural body physics, expressive eyes, photorealistic soft rim lighting.',
    audio:
      'rhythmic sensual background groove, subtle breathing and smooth atmospheric ambient acoustics',
  },
  {
    name: '💋 Sensual Portrait (พอร์ตเทรตธรรมชาติ)',
    prompt:
      'Close-up intimate cinematic portrait, alluring gaze towards the camera, soft natural lighting, hyper-detailed skin pores and texture, gentle hair movement, photorealistic 8k.',
    audio: 'intimate soft whispering room tone, gentle relaxing ambient acoustic warmth',
  },
  {
    name: '💃 Romantic Movement',
    prompt:
      'Full body artistic movement, seductive confident stride, silk dress fluttering gracefully with natural physics, warm golden hour backlight, luxury hotel suite setting.',
    audio: 'elegant warm ambient lounge melody, gentle fabric rustle sounds, clean acoustic space',
  },
];

const MUSIC_VIDEO_PRESETS = [
  {
    name: '🌆 Synthwave Cyberpunk',
    prompt:
      'Cinematic music video, retro sports car speeding through a rain-slicked futuristic neon metropolis at night, reflections of purple and cyan billboards, dynamic cinematic tracking shot, 80s synthwave aesthetic.',
    audio:
      'heavy analog synthwave bassline, punchy 80s drum groove, arpeggiated electronic synthesizer, retro futuristic drive sound',
  },
  {
    name: '🎸 Indie Acoustic Sunset',
    prompt:
      'Acoustic musician silhouette playing guitar on a misty ocean cliff during vibrant golden sunset, dramatic clouds, wind in hair, emotional cinematic camera push-in, lens flare.',
    audio:
      'warm acoustic guitar fingerpicking, rich stereo reverb, gentle rolling ocean waves, emotive resonant strings',
  },
  {
    name: '🎆 EDM Rave Festival',
    prompt:
      'High energy festival main stage crowd, laser beams cutting through fog, confetti explosion, pulsating colorful strobe lights, euphoric ecstatic atmosphere, ultra-fast camera zoom.',
    audio:
      'massive festival EDM drop, heavy sub-bass vibration, euphoric synth leads, cheering roaring crowd ambiance',
  },
];

const AMBIENT_PRESETS = [
  {
    label: '✨ เสียงบรรยากาศนุ่มนวล',
    prompt:
      'subtle natural ambient sound, gentle cinematic background atmosphere, clean high fidelity stereo, calm peaceful acoustics',
  },
  {
    label: '🌊 คลื่นทะเล & ลม',
    prompt:
      'gentle ocean waves washing ashore, soft sea breeze, calming coastal ambiance, clear soothing water sounds',
  },
  {
    label: '☕ คาเฟ่ & สตูดิโอ',
    prompt:
      'warm cozy room tone, soft indoor acoustic atmosphere, calm peaceful background, low reverb',
  },
  {
    label: '🔇 เงียบสงบ (Minimal)',
    prompt: 'very faint soft room tone, almost silent, subtle clean background, no loud sounds',
  },
];

const IMAGE_RESOLUTIONS = [
  { label: '🔥 4K Square (1:1)', w: 4096, h: 4096, ratio: '1:1' as const, badge: '16.7 MP' },
  { label: '🖥️ 4K Landscape (16:9)', w: 3840, h: 2160, ratio: '16:9' as const, badge: 'Ultra HD' },
  { label: '📱 4K Vertical (9:16)', w: 2160, h: 3840, ratio: '9:16' as const, badge: 'TikTok 4K' },
  { label: '⚡ 2K Square Fast (1:1)', w: 2048, h: 2048, ratio: '1:1' as const, badge: 'เร็ว 2 เท่า' },
  { label: '📱 2K Vertical (9:16)', w: 1536, h: 2688, ratio: '9:16' as const, badge: 'Stories' },
  { label: '🖥️ 2K Landscape (16:9)', w: 2688, h: 1536, ratio: '16:9' as const, badge: 'Cinema' },
];

export const PromptStudio: React.FC<PromptStudioProps> = ({
  onAddToQueue,
  isConnected,
  gpuName = '',
  vramTotalMb = 0,
  incomingImageForVideo,
}) => {
  // Wizard Layout Mode: 'columns' (Canva/CapCut 1-2-3 side-by-side) or 'step' (focused single step)
  const [wizardLayout, setWizardLayout] = useState<'columns' | 'step'>('columns');
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // Core Task & Generation Mode (Default to the new 4K Image Studio!)
  const [taskMode, setTaskMode] = useState<TaskMode>('image_gen');
  const [mode, setMode] = useState<GenerationMode>('t2i');
  const [imagePrecision, setImagePrecision] = useState<ImagePrecisionMode>('auto');

  const [positivePrompt, setPositivePrompt] = useState(IMAGE_4K_PRESETS[0].prompt);
  const [audioPrompt, setAudioPrompt] = useState(TIKTOK_PRESETS[0].audio);
  const [negativePrompt] = useState(
    'blur, jitter, low quality, artifacts, watermark, cartoonish, static noise, distorted audio'
  );

  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('1:1');
  const [width, setWidth] = useState(4096);
  const [height, setHeight] = useState(4096);
  const [frames, setFrames] = useState(124);
  const [steps, setSteps] = useState(6);
  const [cfg, setCfg] = useState(1.0);
  const [seed, setSeed] = useState(42);
  const [randomizeSeed, setRandomizeSeed] = useState(true);
  const [turboLoraStrength, setTurboLoraStrength] = useState(1.0);
  const [uncensoredLoraStrength, setUncensoredLoraStrength] = useState(0.8);

  // Video Duration & Storyboard States
  const [generationStyle, setGenerationStyle] = useState<GenerationStyle>('sequential_storyboard');
  const [singlePassDuration, setSinglePassDuration] = useState<number>(5);
  const [totalDuration, setTotalDuration] = useState<number>(5);
  const [extensionStrategy, setExtensionStrategy] = useState<ExtensionStrategy>('last_frame');

  // File uploads & URL states
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [inputImageFilename, setInputImageFilename] = useState<string>('');
  const [imageSourceMode, setImageSourceMode] = useState<'file' | 'url'>('file');
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isFetchingImage, setIsFetchingImage] = useState(false);

  const [referenceVideoPreview, setReferenceVideoPreview] = useState<string | null>(null);
  const [referenceVideoFilename, setReferenceVideoFilename] = useState<string>('');

  // Translation & UI Drawer states
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const is80GB = vramTotalMb >= 70000 || gpuName.toLowerCase().includes('80gb');

  // When user clicks "Send 4K Image to Video I2V" in the Gallery
  useEffect(() => {
    if (incomingImageForVideo) {
      setTaskMode('tiktok');
      setMode('i2v');
      setWidth(576);
      setHeight(1024);
      setAspectRatio('9:16');
      setSteps(8);
      setCfg(2.0);
      setImagePreview(incomingImageForVideo.url);
      setInputImageFilename(incomingImageForVideo.filename);
      if (incomingImageForVideo.promptText) {
        setPositivePrompt(incomingImageForVideo.promptText);
      }
      setActiveStep(2);
    }
  }, [incomingImageForVideo]);

  const containsThai = (text: string) => /[\u0E00-\u0E7F]/.test(text);

  const translateText = async (text: string): Promise<string> => {
    if (!text.trim() || !containsThai(text)) return text;
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      return data.translatedText || text;
    } catch {
      return text;
    }
  };

  const handleManualTranslate = async () => {
    if (!positivePrompt.trim()) return;
    setIsTranslating(true);
    try {
      const enVisual = await translateText(positivePrompt);
      setPositivePrompt(enVisual);
      if (taskMode !== 'image_gen' && audioPrompt.trim() && containsThai(audioPrompt)) {
        const enAudio = await translateText(audioPrompt);
        setAudioPrompt(enAudio);
      }
    } finally {
      setIsTranslating(false);
    }
  };

  // Switch task mode cleanly with optimal defaults
  const handleSelectTaskMode = (newTask: TaskMode) => {
    setTaskMode(newTask);
    if (newTask === 'image_gen') {
      setMode(imagePreview ? 'i2i' : 't2i');
      setWidth(4096);
      setHeight(4096);
      setAspectRatio('1:1');
      setSteps(6);
      setCfg(1.0);
      setPositivePrompt(IMAGE_4K_PRESETS[0].prompt);
    } else if (newTask === 'tiktok') {
      setMode(imagePreview ? 'i2v' : 't2v');
      setWidth(576);
      setHeight(1024);
      setAspectRatio('9:16');
      setSteps(8);
      setCfg(2.0);
      setPositivePrompt(TIKTOK_PRESETS[0].prompt);
      setAudioPrompt(TIKTOK_PRESETS[0].audio);
    } else if (newTask === 'nsfw_motion') {
      setMode(imagePreview ? 'i2v' : 't2v');
      setWidth(576);
      setHeight(1024);
      setAspectRatio('9:16');
      setSteps(8);
      setCfg(2.0);
      setPositivePrompt(NSFW_MOTION_PRESETS[0].prompt);
      setAudioPrompt(NSFW_MOTION_PRESETS[0].audio);
    } else if (newTask === 'music_video') {
      setMode(imagePreview ? 'i2v' : 't2v');
      setWidth(1024);
      setHeight(576);
      setAspectRatio('16:9');
      setSteps(8);
      setCfg(2.0);
      setPositivePrompt(MUSIC_VIDEO_PRESETS[0].prompt);
      setAudioPrompt(MUSIC_VIDEO_PRESETS[0].audio);
    }
  };

  const handleVideoAspectRatio = (ratio: '9:16' | '16:9' | '1:1') => {
    setAspectRatio(ratio);
    if (ratio === '9:16') {
      setWidth(576);
      setHeight(1024);
    } else if (ratio === '16:9') {
      setWidth(1024);
      setHeight(576);
    } else {
      setWidth(768);
      setHeight(768);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setInputImageFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target?.result as string);
      if (taskMode === 'image_gen') {
        setMode('i2i');
      } else {
        setMode('i2v');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFetchImageFromUrl = async () => {
    if (!imageUrlInput.trim()) return;
    setIsFetchingImage(true);
    try {
      const res = await fetch('/api/fetch-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imageUrlInput.trim(), expectedType: 'image' }),
      });
      const data = await res.json();
      if (!res.ok || !data.base64) {
        throw new Error(data.error || 'ไม่สามารถดึงรูปภาพจากลิงก์นี้ได้');
      }
      setImagePreview(data.base64);
      setInputImageFilename(data.filename || 'remote_image.png');
      setMode(taskMode === 'image_gen' ? 'i2i' : 'i2v');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsFetchingImage(false);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReferenceVideoFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setReferenceVideoPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (autoStart: boolean) => {
    let finalVisualPrompt = positivePrompt.trim();
    let finalAudioPrompt = audioPrompt.trim();
    const originalThaiPrompt = containsThai(finalVisualPrompt) ? finalVisualPrompt : undefined;
    const originalThaiAudioPrompt = containsThai(finalAudioPrompt) ? finalAudioPrompt : undefined;

    if (autoTranslate && (originalThaiPrompt || originalThaiAudioPrompt)) {
      setIsTranslating(true);
      try {
        if (originalThaiPrompt) {
          finalVisualPrompt = await translateText(finalVisualPrompt);
          setPositivePrompt(finalVisualPrompt);
        }
        if (taskMode !== 'image_gen' && originalThaiAudioPrompt) {
          finalAudioPrompt = await translateText(finalAudioPrompt);
          setAudioPrompt(finalAudioPrompt);
        }
      } finally {
        setIsTranslating(false);
      }
    }

    const baseConfig: PromptConfig = {
      taskMode,
      modelEngine: taskMode,
      mode,
      imagePrecision,
      generationStyle,
      positivePrompt: finalVisualPrompt,
      audioPrompt: taskMode === 'image_gen' ? '' : finalAudioPrompt,
      negativePrompt,
      aspectRatio,
      width,
      height,
      frames:
        taskMode === 'image_gen'
          ? 1
          : generationStyle === 'single_pass_take'
          ? singlePassDuration === 15
            ? 362
            : singlePassDuration === 10
            ? 243
            : 124
          : frames,
      steps: taskMode === 'image_gen' ? 6 : steps,
      cfg: taskMode === 'image_gen' ? 1.0 : cfg,
      seed,
      randomizeSeed,
      turboLoraStrength,
      uncensoredLoraStrength,
      inputImageBase64: imagePreview || undefined,
      inputImageFilename: inputImageFilename || undefined,
      referenceVideoBase64: referenceVideoPreview || undefined,
      referenceVideoFilename: referenceVideoFilename || undefined,
      originalThaiPrompt,
      originalThaiAudioPrompt,
      totalDurationSeconds:
        taskMode === 'image_gen'
          ? 0
          : generationStyle === 'single_pass_take'
          ? singlePassDuration
          : totalDuration,
    };

    // Multi-shot sequential video support
    const numSegments = Math.max(1, Math.floor(totalDuration / 5));
    if (
      taskMode !== 'image_gen' &&
      generationStyle === 'sequential_storyboard' &&
      numSegments > 1
    ) {
      const groupId = `story_${Date.now()}`;
      for (let idx = 0; idx < numSegments; idx++) {
        onAddToQueue(
          {
            ...baseConfig,
            storyGroupId: groupId,
            segmentCount: numSegments,
            currentSegmentIndex: idx + 1,
            extensionStrategy,
            seed: baseConfig.randomizeSeed
              ? Math.floor(Math.random() * 9007199254740991)
              : baseConfig.seed + idx,
          },
          autoStart && idx === numSegments - 1
        );
      }
      return;
    }

    onAddToQueue(baseConfig, autoStart);
  };

  const currentPresets =
    taskMode === 'image_gen'
      ? IMAGE_4K_PRESETS
      : taskMode === 'tiktok'
      ? TIKTOK_PRESETS
      : taskMode === 'nsfw_motion'
      ? NSFW_MOTION_PRESETS
      : MUSIC_VIDEO_PRESETS;

  return (
    <div className="bg-studio-900 border border-studio-800 rounded-2xl p-5 shadow-lg space-y-5">
      {/* ================================================================= */}
      {/* WIZARD HEADER & STEP PROGRESS BAR (1 -> 2 -> 3)                   */}
      {/* ================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-studio-800 pb-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>สตูดิโอสร้างภาพ 4K & วิดีโอพร้อมเสียง (Guided 1-2-3 Wizard)</span>
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            ทำตาม 3 ขั้นตอนง่ายๆ ด้านล่าง: เลือกประเภทงาน → ใส่คำสั่ง/รูปต้นแบบ → กดสั่งรันบน GPU
          </p>
        </div>

        {/* Layout Mode Switcher */}
        <div className="flex items-center space-x-1.5 bg-studio-950 p-1 rounded-xl border border-studio-800 self-start">
          <button
            type="button"
            onClick={() => setWizardLayout('columns')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              wizardLayout === 'columns'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            <span>แสดงครบ 3 ขั้นในหน้าเดียว</span>
          </button>
          <button
            type="button"
            onClick={() => setWizardLayout('step')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              wizardLayout === 'step'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>แสดงทีละขั้นตอน</span>
          </button>
        </div>
      </div>

      {/* Stepper Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => setActiveStep(1)}
          className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
            activeStep === 1
              ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
              : 'bg-studio-950 border-studio-800 text-gray-300 hover:border-studio-700'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <span
              className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                activeStep === 1 ? 'bg-indigo-600 text-white' : 'bg-studio-800 text-indigo-400'
              }`}
            >
              1
            </span>
            <div>
              <div className="text-xs font-bold">ขั้นที่ 1: เลือกประเภทงาน</div>
              <div className="text-[11px] text-indigo-300">
                {taskMode === 'image_gen'
                  ? '🖼️ สร้างภาพนิ่ง 4K (MiniMax-H3-Image)'
                  : taskMode === 'tiktok'
                  ? '📱 วิดีโอโฆษณา TikTok'
                  : taskMode === 'nsfw_motion'
                  ? '💃 วิดีโอเต้น Motion Mimic'
                  : '🎵 มิวสิกวิดีโอ & ภาพยนตร์'}
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </button>

        <button
          type="button"
          onClick={() => setActiveStep(2)}
          className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
            activeStep === 2
              ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
              : 'bg-studio-950 border-studio-800 text-gray-300 hover:border-studio-700'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <span
              className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                activeStep === 2 ? 'bg-indigo-600 text-white' : 'bg-studio-800 text-indigo-400'
              }`}
            >
              2
            </span>
            <div>
              <div className="text-xs font-bold">ขั้นที่ 2: คำสั่ง & รูปต้นแบบ</div>
              <div className="text-[11px] text-gray-400 truncate max-w-[180px]">
                {imagePreview ? `แนบรูป: ${inputImageFilename}` : 'พิมพ์ไทย/อังกฤษ แปลอัตโนมัติ'}
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </button>

        <button
          type="button"
          onClick={() => setActiveStep(3)}
          className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
            activeStep === 3
              ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
              : 'bg-studio-950 border-studio-800 text-gray-300 hover:border-studio-700'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <span
              className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                activeStep === 3 ? 'bg-indigo-600 text-white' : 'bg-studio-800 text-indigo-400'
              }`}
            >
              3
            </span>
            <div>
              <div className="text-xs font-bold">ขั้นที่ 3: ขนาดภาพ & สั่งรัน</div>
              <div className="text-[11px] text-emerald-400">
                {width}×{height} • {taskMode === 'image_gen' ? '6 Steps (~6 วิ)' : `${steps} Steps`}
              </div>
            </div>
          </div>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </button>
      </div>

      {/* ================================================================= */}
      {/* 3-COLUMN WIZARD BODY                                              */}
      {/* ================================================================= */}
      <div
        className={
          wizardLayout === 'columns'
            ? 'grid grid-cols-1 xl:grid-cols-12 gap-5 items-start'
            : 'space-y-5'
        }
      >
        {/* --------------------------------------------------------------- */}
        {/* STEP 1: CHOOSE TASK MODE & SUB-MODE                             */}
        {/* --------------------------------------------------------------- */}
        {(wizardLayout === 'columns' || activeStep === 1) && (
          <div
            onClick={() => setActiveStep(1)}
            className={`${
              wizardLayout === 'columns' ? 'xl:col-span-4' : ''
            } bg-studio-950/90 border rounded-2xl p-4 space-y-4 transition ${
              activeStep === 1 ? 'border-indigo-500/60' : 'border-studio-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                1️⃣ เลือกสิ่งที่คุณอยากสร้าง
              </span>
              <span className="text-[11px] text-gray-400">คลิกเลือก 1 โหมด</span>
            </div>

            <div className="space-y-2.5">
              {/* Card 1: 4K Image Studio (NEW!) */}
              <button
                type="button"
                onClick={() => handleSelectTaskMode('image_gen')}
                className={`w-full p-3.5 rounded-xl border text-left transition ${
                  taskMode === 'image_gen'
                    ? 'bg-gradient-to-r from-amber-500/15 via-indigo-500/15 to-purple-500/15 border-amber-400/70 shadow-md'
                    : 'bg-studio-900 border-studio-800 hover:border-studio-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ImageIcon className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-bold text-white">
                      🖼️ สร้างภาพนิ่ง 4K / แก้ไขภาพ
                    </span>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-black">
                    ใหม่! H3-Image
                  </span>
                </div>
                <p className="text-xs text-gray-300 mt-1.5 leading-relaxed">
                  สร้างภาพความละเอียดสูงสุด <strong>4096×4096 (4K แท้)</strong> หรือแก้ไขภาพด้วยรูปอ้างอิงใน{' '}
                  <strong>6 Steps (~6 วินาที)</strong>
                </p>
              </button>

              {/* Card 2: TikTok Commercial Video */}
              <button
                type="button"
                onClick={() => handleSelectTaskMode('tiktok')}
                className={`w-full p-3.5 rounded-xl border text-left transition ${
                  taskMode === 'tiktok'
                    ? 'bg-indigo-600/20 border-indigo-500 shadow-md'
                    : 'bg-studio-900 border-studio-800 hover:border-studio-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ShoppingBag className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-bold text-white">
                      📱 วิดีโอโฆษณา TikTok (พร้อมเสียง)
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                    9:16 Рекомендуем
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  สร้างคลิปโฆษณาสินค้า/นางแบบแนวตั้ง พร้อมเสียงเอฟเฟกต์สเตอริโอใน 8 Steps
                </p>
              </button>

              {/* Card 3: NSFW & Motion Mimic */}
              <button
                type="button"
                onClick={() => handleSelectTaskMode('nsfw_motion')}
                className={`w-full p-3.5 rounded-xl border text-left transition ${
                  taskMode === 'nsfw_motion'
                    ? 'bg-rose-600/20 border-rose-500 shadow-md'
                    : 'bg-studio-900 border-studio-800 hover:border-studio-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Flame className="w-4 h-4 text-rose-400" />
                    <span className="text-sm font-bold text-white">
                      💃 วิดีโอเต้นตามคลิป / Uncensored
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                    Hybrid + MysticXXX
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  ใช้รูปตัวละคร + คลิปท่าทางต้นแบบ เพื่อสร้างวิดีโอเต้นหรือเคลื่อนไหวสมจริง
                </p>
              </button>

              {/* Card 4: Music Video & Storyboard */}
              <button
                type="button"
                onClick={() => handleSelectTaskMode('music_video')}
                className={`w-full p-3.5 rounded-xl border text-left transition ${
                  taskMode === 'music_video'
                    ? 'bg-cyan-600/20 border-cyan-500 shadow-md'
                    : 'bg-studio-900 border-studio-800 hover:border-studio-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Music className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm font-bold text-white">
                      🎵 มิวสิกวิดีโอ & ภาพยนตร์ต่อเนื่อง
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                    5s – 60s
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  งานภาพยนตร์แนวนอน 16:9 รองรับการต่อความยาวหลายช็อตอัตโนมัติพร้อมดนตรี
                </p>
              </button>
            </div>

            {/* Sub-Mode Toggle inside Step 1 */}
            <div className="pt-2 border-t border-studio-800 space-y-2">
              <label className="block text-xs font-semibold text-gray-300">
                รูปแบบการตั้งต้น (Input Mode):
              </label>
              {taskMode === 'image_gen' ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('t2i')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition ${
                      mode === 't2i'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                        : 'bg-studio-900 border-studio-800 text-gray-400'
                    }`}
                  >
                    ✨ สร้างภาพใหม่ (T2I)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('i2i')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition ${
                      mode === 'i2i'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                        : 'bg-studio-900 border-studio-800 text-gray-400'
                    }`}
                  >
                    🪄 แก้ไขจากรูป (I2I)
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('t2v')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition ${
                      mode === 't2v'
                        ? 'bg-indigo-600/25 border-indigo-400 text-indigo-200'
                        : 'bg-studio-900 border-studio-800 text-gray-400'
                    }`}
                  >
                    ✍️ สร้างจากข้อความ (T2V)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('i2v')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition ${
                      mode === 'i2v'
                        ? 'bg-indigo-600/25 border-indigo-400 text-indigo-200'
                        : 'bg-studio-900 border-studio-800 text-gray-400'
                    }`}
                  >
                    🖼️ นำรูปมาขยับ (I2V)
                  </button>
                </div>
              )}
            </div>

            {wizardLayout === 'step' && (
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
              >
                ไปขั้นที่ 2: ใส่คำสั่ง & รูปต้นแบบ →
              </button>
            )}
          </div>
        )}

        {/* --------------------------------------------------------------- */}
        {/* STEP 2: PROMPT, PRESETS & REFERENCE MEDIA                       */}
        {/* --------------------------------------------------------------- */}
        {(wizardLayout === 'columns' || activeStep === 2) && (
          <div
            onClick={() => setActiveStep(2)}
            className={`${
              wizardLayout === 'columns' ? 'xl:col-span-5' : ''
            } bg-studio-950/90 border rounded-2xl p-4 space-y-4 transition ${
              activeStep === 2 ? 'border-indigo-500/60' : 'border-studio-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                2️⃣ ใส่คำสั่ง Prompt & รูปอ้างอิง
              </span>
              <label className="flex items-center space-x-1.5 text-xs text-emerald-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoTranslate}
                  onChange={(e) => setAutoTranslate(e.target.checked)}
                  className="rounded accent-emerald-500"
                />
                <span>แปลไทย → อังกฤษอัตโนมัติ</span>
              </label>
            </div>

            {/* Quick Presets Bar */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-gray-300 block">
                💡 ตัวอย่างคำสั่งสำเร็จรูป (คลิกเพื่อลองใช้ได้เลย):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {currentPresets.map((p: any, idx: number) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPositivePrompt(p.prompt);
                      if (p.audio) setAudioPrompt(p.audio);
                      if (p.mode) setMode(p.mode);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-studio-900 hover:bg-indigo-600/20 text-gray-200 hover:text-indigo-200 border border-studio-800 hover:border-indigo-500/40 text-xs transition"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Visual Prompt Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white">
                  {taskMode === 'image_gen'
                    ? 'คำบรรยายภาพ 4K (พิมพ์ภาษาไทยหรืออังกฤษได้เลย)'
                    : 'คำบรรยายฉากและท่าทางวิดีโอ (พิมพ์ไทยหรืออังกฤษ)'}
                </label>

                <div className="flex items-center space-x-1.5">
                  {taskMode === 'image_gen' && mode === 'i2i' && (
                    <button
                      type="button"
                      onClick={() =>
                        setPositivePrompt((prev) =>
                          prev.includes('<Picture 1>') ? prev : `Edit <Picture 1> ${prev}`
                        )
                      }
                      className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold"
                    >
                      + แทรก &lt;Picture 1&gt;
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleManualTranslate}
                    disabled={isTranslating}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition"
                  >
                    {isTranslating ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Languages className="w-3 h-3" />
                    )}
                    <span>แปลเป็นอังกฤษตอนนี้</span>
                  </button>
                </div>
              </div>

              <textarea
                rows={4}
                value={positivePrompt}
                onChange={(e) => setPositivePrompt(e.target.value)}
                placeholder="พิมพ์สิ่งที่ต้องการสร้างเป็นภาษาไทยหรืออังกฤษ เช่น นางแบบถือขวดเซรั่มท่ามกลางหยดน้ำ แสงสตูดิโอ 4K..."
                className="w-full rounded-xl bg-studio-900 border border-studio-800 focus:border-indigo-500 p-3 text-xs text-gray-100 leading-relaxed focus:outline-none"
              />
            </div>

            {/* Reference Image Upload Box (Shown prominently when in I2I / I2V or optional) */}
            <div className="bg-studio-900 border border-studio-800 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-200 flex items-center space-x-1.5">
                  <Upload className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {taskMode === 'image_gen'
                      ? 'รูปอ้างอิงสำหรับแก้ไขภาพ (<Picture 1>)'
                      : 'รูปภาพต้นแบบสำหรับขยับเป็นวิดีโอ (First Frame)'}
                  </span>
                </span>

                <div className="flex bg-studio-950 p-0.5 rounded-lg border border-studio-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setImageSourceMode('file')}
                    className={`px-2 py-0.5 rounded ${
                      imageSourceMode === 'file' ? 'bg-indigo-600 text-white' : 'text-gray-400'
                    }`}
                  >
                    อัปโหลดไฟล์
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageSourceMode('url')}
                    className={`px-2 py-0.5 rounded ${
                      imageSourceMode === 'url' ? 'bg-indigo-600 text-white' : 'text-gray-400'
                    }`}
                  >
                    วางลิงก์ URL
                  </button>
                </div>
              </div>

              {imagePreview ? (
                <div className="flex items-center justify-between bg-studio-950 p-2.5 rounded-xl border border-emerald-500/40">
                  <div className="flex items-center space-x-3 min-w-0">
                    <img
                      src={imagePreview}
                      alt="Reference"
                      className="w-12 h-12 rounded-lg object-cover border border-studio-700"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-emerald-300 truncate">
                        ✓ แนบรูปแล้ว: {inputImageFilename}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {taskMode === 'image_gen'
                          ? 'พร้อมใช้เป็น <Picture 1> สำหรับแก้ไขภาพ 4K'
                          : 'พร้อมใช้เป็นเฟรมแรกของวิดีโอ (Image-to-Video)'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview(null);
                      setInputImageFilename('');
                      setMode(taskMode === 'image_gen' ? 't2i' : 't2v');
                    }}
                    className="p-1.5 rounded-lg bg-studio-900 hover:bg-rose-600/20 text-gray-400 hover:text-rose-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : imageSourceMode === 'file' ? (
                <label className="flex flex-col items-center justify-center border border-dashed border-studio-700 hover:border-indigo-500 rounded-xl p-3.5 cursor-pointer bg-studio-950/60 transition">
                  <span className="text-xs text-gray-300 font-medium">
                    📤 คลิกเลือกไฟล์รูปภาพ (.png, .jpg, .webp)
                  </span>
                  <span className="text-[11px] text-gray-500 mt-0.5">
                    (หากไม่แนบรูป ระบบจะสร้างใหม่จากข้อความล้วน)
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="วางลิงก์รูปภาพ https://..."
                    className="flex-1 bg-studio-950 border border-studio-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={handleFetchImageFromUrl}
                    disabled={isFetchingImage}
                    className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
                  >
                    {isFetchingImage ? 'กำลังดึง...' : 'ดึงรูป'}
                  </button>
                </div>
              )}
            </div>

            {/* Reference Motion Video Uploader (Only when NSFW Motion Mimic is selected) */}
            {taskMode === 'nsfw_motion' && (
              <div className="bg-studio-900 border border-rose-500/30 rounded-xl p-3.5 space-y-2">
                <span className="text-xs font-bold text-rose-300 block">
                  💃 คลิปวิดีโอท่าทางต้นแบบ (Reference Motion Video - ตัวเลือกเสริม):
                </span>
                {referenceVideoPreview ? (
                  <div className="flex items-center justify-between bg-studio-950 p-2 rounded-xl border border-rose-500/40 text-xs">
                    <span className="text-emerald-300 truncate">
                      ✓ แนบคลิปท่าทางแล้ว: {referenceVideoFilename}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setReferenceVideoPreview(null);
                        setReferenceVideoFilename('');
                      }}
                      className="text-rose-400 hover:underline ml-2"
                    >
                      ลบออก
                    </button>
                  </div>
                ) : (
                  <label className="block border border-dashed border-studio-700 hover:border-rose-400 rounded-xl p-3 text-center cursor-pointer bg-studio-950/60 text-xs text-gray-300">
                    📹 คลิกอัปโหลดคลิปท่าทางต้นแบบ (.mp4)
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleVideoUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            )}

            {/* Synchronized Stereo Audio Prompt (Hidden in 4K Image Mode!) */}
            {taskMode !== 'image_gen' && (
              <div className="bg-studio-900 border border-studio-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 flex items-center space-x-1.5">
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>เสียงสเตอริโอประกอบคลิป (Audio Prompt)</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {AMBIENT_PRESETS.map((ap, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setAudioPrompt(ap.prompt)}
                      className="px-2 py-0.5 rounded bg-studio-950 hover:bg-indigo-500/20 text-[11px] text-gray-300 border border-studio-800"
                    >
                      {ap.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={audioPrompt}
                  onChange={(e) => setAudioPrompt(e.target.value)}
                  placeholder="บรรยายเสียงเพลงหรือเสียงเอฟเฟกต์ที่ต้องการ..."
                  className="w-full rounded-xl bg-studio-950 border border-studio-800 px-3 py-2 text-xs text-gray-200"
                />
              </div>
            )}

            {wizardLayout === 'step' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="px-4 py-2.5 rounded-xl border border-studio-700 text-xs text-gray-300"
                >
                  ← ย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
                >
                  ไปขั้นที่ 3: เลือกขนาด & สั่งรัน →
                </button>
              </div>
            )}
          </div>
        )}

        {/* --------------------------------------------------------------- */}
        {/* STEP 3: RESOLUTION, GPU PRECISION & LAUNCH ACTIONS              */}
        {/* --------------------------------------------------------------- */}
        {(wizardLayout === 'columns' || activeStep === 3) && (
          <div
            onClick={() => setActiveStep(3)}
            className={`${
              wizardLayout === 'columns' ? 'xl:col-span-3' : ''
            } bg-studio-950/90 border rounded-2xl p-4 space-y-4 transition ${
              activeStep === 3 ? 'border-indigo-500/60' : 'border-studio-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                3️⃣ ตั้งค่าขนาด & สั่งรัน
              </span>
              <span className="text-[11px] text-gray-400">พร้อมส่งเข้า GPU</span>
            </div>

            {/* Resolution Selector: 4K Image vs Video */}
            {taskMode === 'image_gen' ? (
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-gray-200">
                  📐 เลือกความละเอียดภาพ (สูงสุด 4K แท้):
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {IMAGE_RESOLUTIONS.map((res, idx) => {
                    const isSelected = width === res.w && height === res.h;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setWidth(res.w);
                          setHeight(res.h);
                          setAspectRatio(res.ratio);
                        }}
                        className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between transition ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-400 text-white font-bold'
                            : 'bg-studio-900 border-studio-800 text-gray-300 hover:border-studio-700'
                        }`}
                      >
                        <span>{res.label}</span>
                        <span className="font-mono text-[11px] text-amber-300">
                          {res.w}×{res.h} ({res.badge})
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Precision Selector for A100 80GB vs 40GB/L4 */}
                <div className="pt-2 space-y-1.5">
                  <label className="block text-xs font-bold text-gray-200">
                    🧠 โมเดลความละเอียดภาพ (GPU Model Selector):
                  </label>
                  <select
                    value={imagePrecision}
                    onChange={(e) => setImagePrecision(e.target.value as ImagePrecisionMode)}
                    className="w-full rounded-xl bg-studio-900 border border-studio-800 px-3 py-2 text-xs text-white"
                  >
                    <option value="auto">
                      🤖 Auto-Select ตามการ์ดจอ Colab ({is80GB ? 'A100 80GB = BF16' : 'BF16 / INT8'})
                    </option>
                    <option value="bf16_80gb">
                      💎 บังคับ Master BF16 (40.2GB — คมชัดสูงสุดสำหรับ A100 80GB)
                    </option>
                    <option value="int8_fast">
                      ⚡ บังคับ INT8 ConvRot (21GB — ประหยัด VRAM รันไวทุกการ์ดจอ)
                    </option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-200">
                    📐 สัดส่วนวิดีโอ (Aspect Ratio):
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['9:16', '16:9', '1:1'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => handleVideoAspectRatio(r)}
                        className={`py-2 rounded-xl border text-xs font-semibold transition ${
                          aspectRatio === r
                            ? 'bg-indigo-600 text-white border-indigo-400'
                            : 'bg-studio-900 border-studio-800 text-gray-300'
                        }`}
                      >
                        {r === '9:16' ? '📱 9:16' : r === '16:9' ? '🖥️ 16:9' : '⬜ 1:1'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-200">
                    ⏱️ ความยาวคลิปวิดีโอ:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[5, 10, 15].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => {
                          setTotalDuration(sec);
                          setSinglePassDuration(sec);
                        }}
                        className={`py-2 rounded-xl border text-xs font-semibold transition ${
                          totalDuration === sec
                            ? 'bg-indigo-600/30 border-indigo-400 text-white'
                            : 'bg-studio-900 border-studio-800 text-gray-300'
                        }`}
                      >
                        {sec} วินาที
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Collapsible Advanced Settings */}
            <div className="pt-2 border-t border-studio-800">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-xs text-gray-400 hover:text-white py-1"
              >
                <span className="flex items-center space-x-1.5">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>ตั้งค่าขั้นสูง (Seed, Steps, LoRA)</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition ${showAdvanced ? 'rotate-180' : ''}`}
                />
              </button>

              {showAdvanced && (
                <div className="mt-2.5 p-3 rounded-xl bg-studio-900 border border-studio-800 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Sampling Steps:</span>
                    <input
                      type="number"
                      min={4}
                      max={20}
                      value={steps}
                      onChange={(e) => setSteps(Number(e.target.value))}
                      className="w-16 bg-studio-950 border border-studio-700 rounded px-2 py-1 text-right text-white"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">สุ่ม Seed ใหม่ทุกครั้ง:</span>
                    <input
                      type="checkbox"
                      checked={randomizeSeed}
                      onChange={(e) => setRandomizeSeed(e.target.checked)}
                      className="accent-indigo-500"
                    />
                  </div>
                  {!randomizeSeed && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Seed:</span>
                      <input
                        type="number"
                        value={seed}
                        onChange={(e) => setSeed(Number(e.target.value))}
                        className="w-28 bg-studio-950 border border-studio-700 rounded px-2 py-1 text-right text-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Job Summary Box */}
            <div className="p-3 rounded-xl bg-studio-900 border border-studio-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-400">โหมดที่เลือก:</span>
                <span className="font-bold text-white">
                  {taskMode === 'image_gen'
                    ? mode === 'i2i'
                      ? '🪄 แก้ไขภาพ 4K (I2I)'
                      : '🖼️ สร้างภาพนิ่ง 4K (T2I)'
                    : `🎬 วิดีโอ (${mode.toUpperCase()})`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">ความละเอียด:</span>
                <span className="font-mono text-indigo-300">
                  {width}×{height} ({taskMode === 'image_gen' ? '6 Steps' : `${steps} Steps`})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">เวลาเรนเดอร์บน A100:</span>
                <span className="text-emerald-400 font-semibold">
                  {taskMode === 'image_gen' ? '~5 – 8 วินาที / ภาพ' : '~45 – 60 วินาที / คลิป'}
                </span>
              </div>
            </div>

            {/* Primary Launch Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={isTranslating}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/25 flex items-center justify-center space-x-2 transition"
              >
                {isTranslating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>กำลังแปลภาษาไทย → อังกฤษ...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {taskMode === 'image_gen'
                        ? '🚀 สร้างภาพ 4K ทันที (Render Now)'
                        : '🚀 สร้างวิดีโอทันที (Render Now)'}
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={isTranslating}
                className="w-full py-2.5 px-4 rounded-xl bg-studio-900 hover:bg-studio-800 text-gray-200 border border-studio-700 text-xs font-semibold flex items-center justify-center space-x-1.5 transition"
              >
                <Plus className="w-4 h-4 text-indigo-400" />
                <span>เก็บเข้าคิว Batch (เตรียมไว้รันพร้อมกัน)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
