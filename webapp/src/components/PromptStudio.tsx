'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Video,
  Image as ImageIcon,
  Sliders,
  Play,
  RotateCcw,
  Languages,
  Loader2,
  CheckCircle2,
  Plus,
  Volume2,
  Shield,
  Film,
  Music,
  ShoppingBag,
  Flame,
  Upload,
  Clapperboard,
  Link2,
  Camera,
  Layers,
  Clock,
  Wand2,
  AlertTriangle,
} from 'lucide-react';
import { PromptConfig, GenerationMode, TaskMode, ExtensionStrategy, GenerationStyle } from '../types';

interface PromptStudioProps {
  onAddToQueue: (config: PromptConfig, autoStart: boolean) => void;
  isConnected: boolean;
}

// -------------------------------------------------------------
// Presets by Task Mode
// -------------------------------------------------------------
const TIKTOK_PRESETS = [
  {
    name: '🧴 สกินแคร์ / เซรั่ม',
    prompt: 'Commercial product advertisement for a glowing luxury skincare glass dropper bottle, water splash droplets in slow motion, studio beauty lighting, ultra-detailed glass reflections, elegant pastel background, 4k commercial grade.',
    audio: 'gentle satisfying water droplet splash, soothing spa background ambiance, crisp high-end cosmetic aesthetic sound',
  },
  {
    name: '👗 แฟชั่น / เสื้อผ้า',
    prompt: 'Trendy fashion model posing smoothly in streetwear outfit, urban neon city street at golden hour, dynamic smooth camera orbit, vibrant colors, premium commercial look.',
    audio: 'upbeat modern lofi fashion beat, subtle ambient city atmosphere, trendy clean acoustic resonance',
  },
  {
    name: '🎧 หูฟัง / เทคโนโลยี',
    prompt: 'Futuristic wireless gaming headphones floating in mid-air, dynamic RGB ambient lighting pulses, magnetic dust particles, smooth 360 rotation, high-tech product commercial.',
    audio: 'high tech electronic hum, crisp acoustic snap, futuristic spatial sound effects, bass sweep',
  },
  {
    name: '☕ กาแฟ & เครื่องดื่ม',
    prompt: 'Iced caramel latte in a tall clear glass, rich espresso poured over ice cubes in ultra slow motion, swirling cream, soft cafe daylight, condensation on glass.',
    audio: 'satisfying ice cube clinking in glass, pouring liquid sound, warm cozy ambient coffee shop background',
  },
];

const NSFW_MOTION_PRESETS = [
  {
    name: '🔥 Motion Mimic Dance (ทำท่าทางตามคลิป)',
    prompt: 'Ultra-realistic cinematic shot of a stunning character seamlessly mimicking fluid graceful dance movements from reference motion, perfect anatomical proportions, natural body physics, expressive eyes, photorealistic soft rim lighting.',
    audio: 'rhythmic sensual background groove, subtle breathing and smooth atmospheric ambient acoustics',
  },
  {
    name: '💋 Sensual Portrait (เสน่ห์ธรรมชาติ)',
    prompt: 'Close-up intimate cinematic portrait, alluring gaze towards the camera, soft natural lighting, hyper-detailed skin pores and texture, gentle hair movement, photorealistic 8k.',
    audio: 'intimate soft whispering room tone, gentle relaxing ambient acoustic warmth',
  },
  {
    name: '💃 Romantic Movement',
    prompt: 'Full body artistic movement, seductive confident stride, silk dress fluttering gracefully with natural physics, warm golden hour backlight, luxury hotel suite setting.',
    audio: 'elegant warm ambient lounge melody, gentle fabric rustle sounds, clean acoustic space',
  },
];

const MUSIC_VIDEO_PRESETS = [
  {
    name: '🌆 Synthwave Cyberpunk',
    prompt: 'Cinematic music video, retro sports car speeding through a rain-slicked futuristic neon metropolis at night, reflections of purple and cyan billboards, dynamic cinematic tracking shot, 80s synthwave aesthetic.',
    audio: 'heavy analog synthwave bassline, punchy 80s drum groove, arpeggiated electronic synthesizer, retro futuristic drive sound',
  },
  {
    name: '🎸 Indie Acoustic Sunset',
    prompt: 'Acoustic musician silhouette playing guitar on a misty ocean cliff during vibrant golden sunset, dramatic clouds, wind in hair, emotional cinematic camera push-in, lens flare.',
    audio: 'warm acoustic guitar fingerpicking, rich stereo reverb, gentle rolling ocean waves, emotive resonant strings',
  },
  {
    name: '🎆 EDM Rave Festival',
    prompt: 'High energy festival main stage crowd, laser beams cutting through fog, confetti explosion, pulsating colorful strobe lights, euphoric ecstatic atmosphere, ultra-fast camera zoom.',
    audio: 'massive festival EDM drop, heavy sub-bass vibration, euphoric synth leads, cheering roaring crowd ambiance',
  },
  {
    name: '🎻 Epic Dark Orchestral',
    prompt: 'Dramatic slow-motion cinematic movie trailer shot, cloaked figure walking through ancient gothic castle ruins, lightning illuminates thunderous rain, soaring cinematic grandeur.',
    audio: 'thunderous orchestral timpani drums, dark gothic cello swell, dramatic choir voices, rain and rolling thunder acoustics',
  },
];

const AMBIENT_PRESETS = [
  {
    label: '✨ Universal Ambient',
    prompt: 'subtle natural ambient sound, gentle cinematic background atmosphere, clean high fidelity stereo, calm peaceful acoustics',
  },
  {
    label: '🌊 คลื่นทะเล & ลม',
    prompt: 'gentle ocean waves washing ashore, soft sea breeze, calming coastal ambiance, clear soothing water sounds',
  },
  {
    label: '🌲 ป่า & ธรรมชาติ',
    prompt: 'gentle forest breeze through trees, soft rustling leaves, distant peaceful birds, relaxing outdoor nature acoustics',
  },
  {
    label: '☕ คาเฟ่ & สตูดิโอ',
    prompt: 'warm cozy room tone, soft indoor acoustic atmosphere, calm peaceful background, low reverb',
  },
  {
    label: '🔇 Minimal Silent',
    prompt: 'very faint soft room tone, almost silent, subtle clean background, no loud sounds',
  },
];

export const PromptStudio: React.FC<PromptStudioProps> = ({ onAddToQueue, isConnected }) => {
  const [taskMode, setTaskMode] = useState<TaskMode>('tiktok');
  const [mode, setMode] = useState<GenerationMode>('t2v');

  const [positivePrompt, setPositivePrompt] = useState(TIKTOK_PRESETS[0].prompt);
  const [audioPrompt, setAudioPrompt] = useState(TIKTOK_PRESETS[0].audio);
  const [negativePrompt, setNegativePrompt] = useState(
    'blur, jitter, low quality, artifacts, watermark, cartoonish, static noise, distorted audio, clipped sound, out of sync'
  );

  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('9:16');
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(768);
  const [frames, setFrames] = useState(56);
  const [steps, setSteps] = useState(8);
  const [cfg, setCfg] = useState(2.0);
  const [seed, setSeed] = useState(42);
  const [randomizeSeed, setRandomizeSeed] = useState(true);
  const [turboLoraStrength, setTurboLoraStrength] = useState(1.0);
  const [uncensoredLoraStrength, setUncensoredLoraStrength] = useState(0.8);

  // Video Duration & Generation Style States
  const [generationStyle, setGenerationStyle] = useState<GenerationStyle>('sequential_storyboard');
  const [singlePassDuration, setSinglePassDuration] = useState<number>(10);
  const [totalDuration, setTotalDuration] = useState<number>(5);
  const [extensionStrategy, setExtensionStrategy] = useState<ExtensionStrategy>('last_frame');
  const [storyboardPrompts, setStoryboardPrompts] = useState<string[]>([]);
  const [lockMasterCharacter, setLockMasterCharacter] = useState<boolean>(true);
  const [activeShotTab, setActiveShotTab] = useState<number>(0);

  // File uploads
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [inputImageFilename, setInputImageFilename] = useState<string>('input.png');

  const [referenceVideoPreview, setReferenceVideoPreview] = useState<string | null>(null);
  const [referenceVideoFilename, setReferenceVideoFilename] = useState<string>('');

  const [autoTranslate, setAutoTranslate] = useState(true);
  const [isTranslatingVisual, setIsTranslatingVisual] = useState(false);
  const [isTranslatingAudio, setIsTranslatingAudio] = useState(false);
  const [isTranslatingAll, setIsTranslatingAll] = useState(false);
  const [isSplittingStoryboard, setIsSplittingStoryboard] = useState(false);

  const segmentCount = Math.max(1, Math.floor(totalDuration / 5));

  const updateShotPrompt = (index: number, val: string) => {
    setStoryboardPrompts((prev) => {
      const arr = [...prev];
      while (arr.length < segmentCount) arr.push('');
      arr[index] = val;
      return arr;
    });
    if (index === 0) {
      setPositivePrompt(val);
    }
  };

  const handleDuplicatePromptToAll = () => {
    const base = positivePrompt.trim();
    if (!base) return;
    const newArr = Array(segmentCount).fill(base);
    setStoryboardPrompts(newArr);
  };

  const handleApplyCinematicFlow = () => {
    const CINEMATIC_FLOW = [
      'establishing wide cinematic shot, atmospheric depth, ambient lighting',
      'medium tracking shot smoothly following the character, natural movements',
      'intimate close-up portrait highlighting facial expression, fine details',
      'low angle dynamic hero perspective, dramatic shadows and depth',
      'over-the-shoulder tracking perspective, engaging focal depth',
      'smooth slow-motion pan with soft volumetric light and lens bloom',
      'high angle overhead perspective, artistic cinematic composition',
      'side profile elegant tracking motion, golden hour illumination',
      'intimate macro detail shot, hyper-realistic fine textures',
      'dynamic orbital camera sweep around the subject, vibrant atmosphere',
      'wide panoramic continuous movement, breathtaking view',
      'resolving climax hero shot, striking cinematic poise, gorgeous lighting',
    ];
    const base = positivePrompt.trim() || 'Cinematic scene with character';
    const newArr: string[] = [];
    for (let i = 0; i < segmentCount; i++) {
      const angle = CINEMATIC_FLOW[i % CINEMATIC_FLOW.length];
      newArr.push(`${base}, ${angle}`);
    }
    setStoryboardPrompts(newArr);
    if (newArr[0]) setPositivePrompt(newArr[0]);
    setExtensionStrategy('storyboard');
  };

  const handleAutoSplitStoryboard = async () => {
    if (!positivePrompt.trim()) return;
    setIsSplittingStoryboard(true);
    try {
      const segCount = Math.floor(totalDuration / 5);
      const res = await fetch('/api/split-storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: positivePrompt,
          segmentCount: segCount,
          taskMode,
        }),
      });
      const data = await res.json();
      if (data.success && data.segments && data.segments.length > 0) {
        setPositivePrompt(data.segments[0]);
        setStoryboardPrompts(data.segments);
        setExtensionStrategy('storyboard');
      }
    } catch (e) {
      console.error('Error splitting storyboard:', e);
    } finally {
      setIsSplittingStoryboard(false);
    }
  };

  const containsThai = (text: string) => /[\u0E00-\u0E7F]/.test(text || '');

  // -------------------------------------------------------------
  // Task Mode Switcher
  // -------------------------------------------------------------
  const handleTaskModeChange = (newMode: TaskMode) => {
    setTaskMode(newMode);

    if (newMode === 'tiktok') {
      setAspectRatio('9:16');
      setWidth(512);
      setHeight(768);
      setFrames(56);
      setSteps(8);
      setCfg(2.0);
      setPositivePrompt(TIKTOK_PRESETS[0].prompt);
      setAudioPrompt(TIKTOK_PRESETS[0].audio);
      setMode('i2v'); // Usually TikTok starts with product image
    } else if (newMode === 'nsfw_motion') {
      setAspectRatio('9:16');
      setWidth(512);
      setHeight(768);
      setFrames(56);
      setSteps(8);
      setCfg(2.0);
      setPositivePrompt(NSFW_MOTION_PRESETS[0].prompt);
      setAudioPrompt(NSFW_MOTION_PRESETS[0].audio);
      setUncensoredLoraStrength(0.85);
      setMode('i2v');
    } else if (newMode === 'music_video') {
      setAspectRatio('16:9');
      setWidth(768);
      setHeight(512);
      setFrames(73); // ~3 seconds @ 24fps
      setSteps(8);
      setCfg(2.0);
      setPositivePrompt(MUSIC_VIDEO_PRESETS[0].prompt);
      setAudioPrompt(MUSIC_VIDEO_PRESETS[0].audio);
      setMode('t2v');
    }
  };

  const handleAspectChange = (ratio: '16:9' | '9:16' | '1:1') => {
    setAspectRatio(ratio);
    if (ratio === '16:9') {
      setWidth(768);
      setHeight(512);
    } else if (ratio === '9:16') {
      setWidth(512);
      setHeight(768);
    } else {
      setWidth(768);
      setHeight(768);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setInputImageFilename(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReferenceVideoFilename(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceVideoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const translateSingleField = async (field: 'visual' | 'audio') => {
    const textToTranslate = field === 'visual' ? positivePrompt : audioPrompt;
    if (!textToTranslate.trim()) return;

    if (field === 'visual') setIsTranslatingVisual(true);
    else setIsTranslatingAudio(true);

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToTranslate }),
      });
      const data = await res.json();
      if (data.success && data.translatedText) {
        if (field === 'visual') setPositivePrompt(data.translatedText);
        else setAudioPrompt(data.translatedText);
      }
    } catch (e) {
      console.error('Translation error:', e);
    } finally {
      if (field === 'visual') setIsTranslatingVisual(false);
      else setIsTranslatingAudio(false);
    }
  };

  const translateBothFields = async () => {
    setIsTranslatingAll(true);
    try {
      const promises: Promise<any>[] = [];
      if (containsThai(positivePrompt)) {
        promises.push(
          fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: positivePrompt }),
          })
            .then((r) => r.json())
            .then((data) => {
              if (data.success && data.translatedText) setPositivePrompt(data.translatedText);
            })
        );
      }
      if (containsThai(audioPrompt)) {
        promises.push(
          fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: audioPrompt }),
          })
            .then((r) => r.json())
            .then((data) => {
              if (data.success && data.translatedText) setAudioPrompt(data.translatedText);
            })
        );
      }
      await Promise.all(promises);
    } catch (e) {
      console.error('Translate all error:', e);
    } finally {
      setIsTranslatingAll(false);
    }
  };

  const handleQueueWithTranslation = async (autoStart: boolean) => {
    let finalPrompt = positivePrompt;
    let finalAudio = audioPrompt;
    const originalThaiP = containsThai(positivePrompt) ? positivePrompt : undefined;
    const originalThaiA = containsThai(audioPrompt) ? audioPrompt : undefined;

    if (autoTranslate && (originalThaiP || originalThaiA)) {
      setIsTranslatingAll(true);
      try {
        const promises: Promise<any>[] = [];
        if (originalThaiP) {
          promises.push(
            fetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: positivePrompt }),
            })
              .then((r) => r.json())
              .then((data) => {
                if (data.success && data.translatedText) finalPrompt = data.translatedText;
              })
          );
        }
        if (originalThaiA) {
          promises.push(
            fetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: audioPrompt }),
            })
              .then((r) => r.json())
              .then((data) => {
                if (data.success && data.translatedText) finalAudio = data.translatedText;
              })
          );
        }
        await Promise.all(promises);
      } catch (err) {
        console.error('Auto translate failed, using original:', err);
      } finally {
        setIsTranslatingAll(false);
      }
    }

    if (generationStyle === 'single_pass_take') {
      const targetFrames = singlePassDuration === 15 ? 362 : (singlePassDuration === 10 ? 243 : 124);
      const config: PromptConfig = {
        taskMode,
        modelEngine: taskMode,
        mode,
        generationStyle: 'single_pass_take',
        positivePrompt: finalPrompt,
        audioPrompt: finalAudio,
        negativePrompt,
        aspectRatio,
        width,
        height,
        frames: targetFrames,
        steps,
        cfg,
        seed: randomizeSeed ? Math.floor(Math.random() * 9007199254740991) : seed,
        randomizeSeed,
        turboLoraStrength,
        uncensoredLoraStrength,
        inputImageBase64: mode === 'i2v' ? imagePreview || undefined : undefined,
        inputImageFilename: mode === 'i2v' ? inputImageFilename : undefined,
        referenceVideoBase64: taskMode === 'nsfw_motion' ? referenceVideoPreview || undefined : undefined,
        referenceVideoFilename: taskMode === 'nsfw_motion' && referenceVideoPreview ? referenceVideoFilename : undefined,
        originalThaiPrompt: originalThaiP,
        originalThaiAudioPrompt: originalThaiA,
        totalDurationSeconds: singlePassDuration,
        segmentCount: 1,
        currentSegmentIndex: 1,
      };

      onAddToQueue(config, autoStart);
      return;
    }

    if (totalDuration > 5) {
      const segCount = Math.floor(totalDuration / 5);
      const storyGroupId = `story_${Date.now()}`;

      const masterAnchorFilename = mode === 'i2v' ? inputImageFilename : undefined;
      const masterAnchorBase64 = mode === 'i2v' ? (imagePreview || undefined) : undefined;

      const CINEMATIC_ANGLES = [
        'establishing wide angle cinematic view, soft volumetric lighting',
        'medium tracking shot smoothly following the character, natural movements',
        'intimate close-up portrait highlighting facial expression, 8k crisp details',
        'low angle dynamic hero perspective, dramatic shadows and depth',
        'over-the-shoulder tracking perspective, engaging focal depth',
        'smooth slow-motion pan, elegant ambient lighting, soft bokeh',
        'high angle overhead perspective, artistic composition',
        'side profile elegant tracking motion, golden hour illumination',
      ];

      for (let s = 1; s <= segCount; s++) {
        let segPrompt = finalPrompt;
        if (extensionStrategy === 'storyboard') {
          if (storyboardPrompts[s - 1]?.trim()) {
            segPrompt = storyboardPrompts[s - 1].trim();
          }
        } else if (extensionStrategy === 'multi_angle') {
          const angle = CINEMATIC_ANGLES[(s - 1) % CINEMATIC_ANGLES.length];
          segPrompt = s === 1 ? finalPrompt : `${finalPrompt}, ${angle}`;
        }

        const segConfig: PromptConfig = {
          taskMode,
          modelEngine: taskMode,
          mode: s === 1 ? mode : (extensionStrategy === 'last_frame' ? 'i2v' : mode),
          positivePrompt: segPrompt,
          audioPrompt: finalAudio,
          negativePrompt,
          aspectRatio,
          width,
          height,
          frames: 124, // 5.1s
          steps,
          cfg,
          seed: randomizeSeed ? Math.floor(Math.random() * 9007199254740991) : (seed + s * 10),
          randomizeSeed,
          turboLoraStrength,
          uncensoredLoraStrength,
          inputImageBase64: s === 1 ? (mode === 'i2v' ? imagePreview || undefined : undefined) : (lockMasterCharacter ? masterAnchorBase64 : undefined),
          inputImageFilename: s === 1 ? (mode === 'i2v' ? inputImageFilename : undefined) : (lockMasterCharacter ? masterAnchorFilename : undefined),
          masterAnchorImageBase64: lockMasterCharacter ? masterAnchorBase64 : undefined,
          masterAnchorImageFilename: lockMasterCharacter ? masterAnchorFilename : undefined,
          lockMasterCharacter,
          referenceVideoBase64: taskMode === 'nsfw_motion' ? referenceVideoPreview || undefined : undefined,
          referenceVideoFilename: taskMode === 'nsfw_motion' && referenceVideoPreview ? referenceVideoFilename : undefined,
          originalThaiPrompt: originalThaiP,
          originalThaiAudioPrompt: originalThaiA,
          totalDurationSeconds: totalDuration,
          segmentCount: segCount,
          currentSegmentIndex: s,
          extensionStrategy,
          storyboardPrompts,
          storyGroupId,
        };

        onAddToQueue(segConfig, s === 1 && autoStart);
      }
    } else {
      const config: PromptConfig = {
        taskMode,
        modelEngine: taskMode,
        mode,
        positivePrompt: finalPrompt,
        audioPrompt: finalAudio,
        negativePrompt,
        aspectRatio,
        width,
        height,
        frames,
        steps,
        cfg,
        seed,
        randomizeSeed,
        turboLoraStrength,
        uncensoredLoraStrength,
        inputImageBase64: mode === 'i2v' ? imagePreview || undefined : undefined,
        inputImageFilename: mode === 'i2v' ? inputImageFilename : undefined,
        referenceVideoBase64: taskMode === 'nsfw_motion' ? referenceVideoPreview || undefined : undefined,
        referenceVideoFilename: taskMode === 'nsfw_motion' && referenceVideoPreview ? referenceVideoFilename : undefined,
        originalThaiPrompt: originalThaiP,
        originalThaiAudioPrompt: originalThaiA,
        totalDurationSeconds: 5,
        segmentCount: 1,
        currentSegmentIndex: 1,
      };

      onAddToQueue(config, autoStart);
    }
  };

  return (
    <div className="bg-studio-900 border border-studio-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
      {/* 1. Header: 3 Task Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-studio-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white tracking-wide">
              MINIMAX-H3 TASK PROFILE (A100 SSD)
            </h3>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            เลือกประเภทงานที่ต้องการ ระบบจะปรับแต่งโมเดล สัดส่วน และท่อส่งภาพ+เสียงให้อัตโนมัติ
          </p>
        </div>

        {/* Task Tabs */}
        <div className="flex bg-studio-950 p-1 rounded-xl border border-studio-800">
          <button
            type="button"
            onClick={() => handleTaskModeChange('tiktok')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              taskMode === 'tiktok'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>📱 โฆษณา TikTok</span>
          </button>

          <button
            type="button"
            onClick={() => handleTaskModeChange('nsfw_motion')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              taskMode === 'nsfw_motion'
                ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>🔞 NSFW Motion Mimic</span>
          </button>

          <button
            type="button"
            onClick={() => handleTaskModeChange('music_video')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              taskMode === 'music_video'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>🎬 Music Video</span>
          </button>
        </div>
      </div>

      {/* Task Description Banner */}
      <div className="p-3 rounded-xl border text-xs flex items-center justify-between"
        style={{
          backgroundColor:
            taskMode === 'tiktok'
              ? 'rgba(99, 102, 241, 0.08)'
              : taskMode === 'nsfw_motion'
              ? 'rgba(244, 63, 94, 0.08)'
              : 'rgba(6, 182, 212, 0.08)',
          borderColor:
            taskMode === 'tiktok'
              ? 'rgba(99, 102, 241, 0.25)'
              : taskMode === 'nsfw_motion'
              ? 'rgba(244, 63, 94, 0.25)'
              : 'rgba(6, 182, 212, 0.25)',
        }}
      >
        <span className="flex items-center gap-2">
          {taskMode === 'tiktok' && (
            <>
              <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="text-indigo-300">
                <strong>โหมด TikTok Ads:</strong> สปีดไวพิเศษ 8-Step (~35s บน A100), สัดส่วน 9:16, เน้นความคมชัดของสินค้า/นางแบบ พร้อมเสียงแวดล้อมสเตอริโอในตัว
              </span>
            </>
          )}
          {taskMode === 'nsfw_motion' && (
            <>
              <Flame className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-rose-300">
                <strong>โหมด NSFW Motion Mimic:</strong> ใช้โมเดล Hybrid (smhfacct) + Veda-Sparse รองรับทั้งรูปคุมหน้าตัวละคร และคลิป Reference สำหรับก๊อปปี้ท่าทาง
              </span>
            </>
          )}
          {taskMode === 'music_video' && (
            <>
              <Music className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-cyan-300">
                <strong>โหมด Music Video:</strong> ผสานการสังเคราะห์ภาพ Cinematic 24fps เข้ากับเสียงดนตรีบีทสเตอริโอ ให้จังหวะภาพและการเคลื่อนไหวสัมพันธ์กับเสียงเพลง
              </span>
            </>
          )}
        </span>

        <span className="hidden md:inline-block px-2.5 py-1 rounded bg-black/40 text-[11px] font-mono text-gray-300 border border-white/10">
          MiniMax DiT 33B + Qwen-3VL 32B
        </span>
      </div>

      {/* 2. Generation Mode Switcher (T2V / I2V) */}
      <div className="flex items-center justify-between border-b border-studio-800 pb-3">
        <div className="flex items-center space-x-3">
          <div className="flex bg-studio-950 p-1 rounded-lg border border-studio-800">
            <button
              onClick={() => setMode('t2v')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                mode === 't2v' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Text-to-Video</span>
            </button>
            <button
              onClick={() => setMode('i2v')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                mode === 'i2v' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>
                {taskMode === 'tiktok'
                  ? 'Image-to-Video (รูปสินค้า/นางแบบ)'
                  : taskMode === 'nsfw_motion'
                  ? 'Character + Motion Reference'
                  : 'Image-to-Video (ภาพเปิดซีน)'}
              </span>
            </button>
          </div>
          <span className="text-xs text-gray-400 hidden sm:inline">
            {mode === 't2v'
              ? 'พิมพ์คำบรรยายเพื่อสร้างคลิปวิดีโอจากศูนย์'
              : 'อัปโหลดรูปภาพต้นฉบับเพื่อให้ AI รักษาความเป๊ะของตัวละคร/สินค้า'}
          </span>
        </div>

        <div className="text-xs text-gray-400 font-mono">
          8-Step Turbo Active (CFG 2.0)
        </div>
      </div>

      {/* 3. Preset Quick Buttons */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-400 flex items-center space-x-1.5">
            <Clapperboard className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              {taskMode === 'tiktok'
                ? 'พรีเซ็ตโฆษณาสินค้า TikTok ยอดนิยม:'
                : taskMode === 'nsfw_motion'
                ? 'พรีเซ็ตสรีระ & ท่าทางเลียนแบบ (NSFW Motion):'
                : 'พรีเซ็ตสไตล์ดนตรี & มิวสิควิดีโอ (Cinematic MV):'}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {taskMode === 'tiktok' &&
            TIKTOK_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setPositivePrompt(p.prompt);
                  setAudioPrompt(p.audio);
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-studio-950 hover:bg-studio-800 text-gray-300 hover:text-white border border-studio-800 hover:border-indigo-500/40 transition"
              >
                {p.name}
              </button>
            ))}

          {taskMode === 'nsfw_motion' &&
            NSFW_MOTION_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setPositivePrompt(p.prompt);
                  setAudioPrompt(p.audio);
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-studio-950 hover:bg-studio-800 text-gray-300 hover:text-white border border-studio-800 hover:border-rose-500/40 transition"
              >
                {p.name}
              </button>
            ))}

          {taskMode === 'music_video' &&
            MUSIC_VIDEO_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setPositivePrompt(p.prompt);
                  setAudioPrompt(p.audio);
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-studio-950 hover:bg-studio-800 text-gray-300 hover:text-white border border-studio-800 hover:border-cyan-500/40 transition"
              >
                {p.name}
              </button>
            ))}
        </div>
      </div>

      {/* 4. Upload Area (for I2V or Reference Video) */}
      {mode === 'i2v' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-studio-950/60 border border-studio-800">
          {/* First Frame / Character Image */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                {taskMode === 'tiktok'
                  ? 'รูปสินค้า / นางแบบตั้งต้น (First Frame)'
                  : taskMode === 'nsfw_motion'
                  ? 'รูปตัวละครอ้างอิง (Character Reference)'
                  : 'ภาพเปิดซีนเริ่มต้น (First Frame)'}
              </span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
              />
              {imagePreview && (
                <div className="w-12 h-12 rounded-lg overflow-hidden border border-studio-700 shrink-0">
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              AI จะขยับฟิสิกส์ การเคลื่อนไหวของกล้อง และรายละเอียดต่อเนื่องจากภาพนี้
            </p>
          </div>

          {/* Reference Video (Only for NSFW Motion Mimic) */}
          {taskMode === 'nsfw_motion' && (
            <div>
              <label className="block text-xs font-semibold text-rose-300 mb-1.5 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-rose-400" />
                <span>คลิปวิดีโออ้างอิงท่าทาง (Motion Mimic Video - Optional)</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  onChange={handleVideoUpload}
                  className="text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-rose-600 file:text-white hover:file:bg-rose-500 cursor-pointer"
                />
                {referenceVideoPreview && (
                  <span className="text-[11px] text-rose-400 font-mono">
                    ✓ {referenceVideoFilename}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                (ไม่บังคับ) หากใส่คลิป ตัวละครด้านซ้ายจะทำท่าทาง เลียนแบบการขยับตามคลิปนี้
              </p>
            </div>
          )}
        </div>
      )}

      {/* 5. Prompt Fields */}
      <div className="space-y-4">
        {/* Visual Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-gray-300 flex items-center space-x-1.5">
              <span>Visual Prompt (คำบรรยายภาพและการเคลื่อนไหว)</span>
            </label>
            <div className="flex items-center space-x-2">
              {totalDuration > 5 && (
                <button
                  type="button"
                  onClick={handleAutoSplitStoryboard}
                  disabled={isSplittingStoryboard || !positivePrompt.trim()}
                  className="text-[11px] px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-purple-900/60 to-pink-900/60 hover:from-purple-800 hover:to-pink-800 text-purple-200 hover:text-white border border-purple-500/40 flex items-center space-x-1.5 transition disabled:opacity-40 shadow-sm"
                  title="วิเคราะห์เนื้อเรื่องแล้วตัดแบ่งเป็นช็อตๆ สำหรับคลิปยาวอัตโนมัติ"
                >
                  {isSplittingStoryboard ? (
                    <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                  ) : (
                    <Wand2 className="w-3 h-3 text-purple-400" />
                  )}
                  <span>✨ AI ตัดแบ่งช็อตอัตโนมัติ</span>
                </button>
              )}
              {containsThai(positivePrompt) && (
                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-medium">
                  ตรวจพบภาษาไทย
                </span>
              )}
              <button
                type="button"
                onClick={() => translateSingleField('visual')}
                disabled={isTranslatingVisual || !positivePrompt.trim()}
                className="text-[11px] px-2 py-0.5 rounded bg-indigo-900/50 hover:bg-indigo-800 text-indigo-300 hover:text-white border border-indigo-700/50 flex items-center space-x-1 transition disabled:opacity-40"
              >
                {isTranslatingVisual ? (
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                ) : (
                  <Languages className="w-3 h-3 text-indigo-400" />
                )}
                <span>แปลเป็นอังกฤษ</span>
              </button>
            </div>
          </div>
          <textarea
            rows={3}
            value={positivePrompt}
            onChange={(e) => setPositivePrompt(e.target.value)}
            className="w-full px-3 py-2 bg-studio-950 border border-studio-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        {/* Synchronized Audio Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-indigo-300 flex items-center space-x-1.5">
              <Volume2 className="w-3.5 h-3.5" />
              <span>Synchronized Audio Prompt (เสียงประกอบ / จังหวะดนตรี / แอมเบียนต์)</span>
            </label>
            <div className="flex items-center space-x-2">
              {containsThai(audioPrompt) && (
                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-medium">
                  ตรวจพบภาษาไทย
                </span>
              )}
              <button
                type="button"
                onClick={() => translateSingleField('audio')}
                disabled={isTranslatingAudio || !audioPrompt.trim()}
                className="text-[11px] px-2 py-0.5 rounded bg-indigo-900/50 hover:bg-indigo-800 text-indigo-300 hover:text-white border border-indigo-700/50 flex items-center space-x-1 transition disabled:opacity-40"
              >
                {isTranslatingAudio ? (
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                ) : (
                  <Languages className="w-3 h-3 text-indigo-400" />
                )}
                <span>แปลเป็นอังกฤษ</span>
              </button>
            </div>
          </div>

          {/* Quick Ambient Chips */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-[10px] text-gray-400">คีย์ลัดเสียง:</span>
            {AMBIENT_PRESETS.map((ap) => (
              <button
                key={ap.label}
                type="button"
                onClick={() => setAudioPrompt(ap.prompt)}
                className={`text-[10px] px-2.5 py-0.5 rounded-full border transition ${
                  audioPrompt === ap.prompt
                    ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/60 font-semibold'
                    : 'bg-studio-900 hover:bg-studio-800 text-gray-400 hover:text-gray-200 border-studio-700'
                }`}
              >
                {ap.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={audioPrompt}
            onChange={(e) => setAudioPrompt(e.target.value)}
            className="w-full px-3 py-2 bg-studio-950 border border-studio-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
          />
          <span className="text-[10px] text-gray-500 block mt-1">
            💡 โมเดล MiniMax-H3 จะสังเคราะห์ภาพและเสียงพร้อมกัน โดยจังหวะภาพจะสอดคล้องกับรายละเอียดเสียงที่คุณระบุ
          </span>
        </div>

        {/* Negative Prompt */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1">
            Negative Prompt
          </label>
          <input
            type="text"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            className="w-full px-3 py-1.5 bg-studio-950 border border-studio-700/80 rounded-lg text-xs text-gray-300 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 6. LoRA Adapters & Creative Booster Controls */}
      <div className="bg-studio-950/70 p-4 rounded-xl border border-studio-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-purple-400" />
            <h4 className="text-xs font-semibold text-gray-200">
              LoRA Adapters & Uncensored Controls
            </h4>
          </div>
          <span className="text-[11px] text-gray-400">
            Turbo LoRA (8-Step) + MysticXXX / PinkCherry Booster
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Turbo LoRA */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>MiniMax H3 Turbo LoRA:</span>
              <span className="font-mono text-indigo-400">{turboLoraStrength.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={turboLoraStrength}
              onChange={(e) => setTurboLoraStrength(parseFloat(e.target.value))}
              className="w-full accent-indigo-500 h-1.5 bg-studio-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Uncensored Booster */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Uncensored / Anatomy Booster:</span>
              <span className="font-mono text-purple-400">{uncensoredLoraStrength.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.5"
              step="0.1"
              value={uncensoredLoraStrength}
              onChange={(e) => setUncensoredLoraStrength(parseFloat(e.target.value))}
              className="w-full accent-purple-500 h-1.5 bg-studio-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* 7. Video Duration & Generation Mode Selector */}
      <div className="bg-studio-950 p-3 rounded-xl border border-studio-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-bold text-gray-200">
              โหมดการสร้างความยาววิดีโอ (Video Duration Mode)
            </h4>
          </div>

          <div className="flex items-center space-x-1 bg-studio-900 p-1 rounded-lg border border-studio-800">
            <button
              type="button"
              onClick={() => setGenerationStyle('sequential_storyboard')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center space-x-1.5 ${
                generationStyle === 'sequential_storyboard'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>🎬 Multi-Shot Storyboard (5s+5s ปลอดภัย 100%)</span>
            </button>

            <button
              type="button"
              onClick={() => setGenerationStyle('single_pass_take')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center space-x-1.5 ${
                generationStyle === 'single_pass_take'
                  ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>⚡ Single-Take One-Pass (เทคเดียว 10s–15s 🔥 High-RAM)</span>
            </button>
          </div>
        </div>

        {/* Warning Alert if Single-Pass Mode is Selected */}
        {generationStyle === 'single_pass_take' && (
          <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/50 text-amber-200 text-xs flex items-start space-x-3 shadow-lg animate-in fade-in">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <div className="font-bold text-amber-300 flex items-center gap-2">
                <span>⚡ โหมด Single-Take (เทคเดียวยาวรวด {singlePassDuration} วินาที):</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-[10px] font-mono border border-amber-500/30">
                  {singlePassDuration === 15 ? '362 เฟรม' : singlePassDuration === 10 ? '243 เฟรม' : '124 เฟรม'} (24 fps)
                </span>
              </div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                โหมดนี้สั่งให้โมเดล MiniMax DiT คำนวณ 3D Spatial-Temporal Attention รวดเดียวใน GPU ครั้งเดียวโดยไม่มีการตัดต่อ ทำให้การเคลื่อนไหวของกล้องเป็น One-Take สมบูรณ์แบบ
              </p>
              <p className="text-[11px] font-bold text-amber-300 bg-black/60 px-2.5 py-1.5 rounded-lg border border-amber-500/40 flex items-center gap-1.5">
                <span>⚠️ แนะนำให้เปิด A100 High-RAM (80GB) ทุกครั้งถ้าใช้โหมดนี้</span>
                <span className="font-normal text-gray-300">(เพื่อป้องกันปัญหา CUDA Out of Memory เนื่องจาก Attention Matrix ขยายแบบก้าวกระโดด)</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 8. Advanced Parameters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
        {/* Aspect Ratio */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Aspect Ratio</label>
          <div className="grid grid-cols-3 gap-1 bg-studio-950 p-1 rounded-lg border border-studio-800 text-xs text-center font-medium">
            {(['9:16', '16:9', '1:1'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleAspectChange(r)}
                className={`py-1 rounded ${
                  aspectRatio === r ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {r === '9:16' ? (taskMode === 'tiktok' ? '9:16 ⭐' : '9:16') : r}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-gray-500 block mt-1">{width}x{height} px</span>
        </div>

        {/* Steps */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Steps: <span className="text-white font-mono">{steps}</span>
          </label>
          <input
            type="range"
            min="4"
            max="12"
            step="1"
            value={steps}
            onChange={(e) => setSteps(parseInt(e.target.value))}
            className="w-full h-1.5 bg-studio-800 rounded-lg cursor-pointer mt-2 accent-indigo-500"
          />
          <span className="text-[10px] text-gray-500 block mt-1">Recommended: 8 steps</span>
        </div>

        {/* CFG Scale */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            CFG Scale: <span className="text-white font-mono">{cfg.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="1.0"
            max="4.0"
            step="0.1"
            value={cfg}
            onChange={(e) => setCfg(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-studio-800 rounded-lg cursor-pointer mt-2 accent-indigo-500"
          />
          <span className="text-[10px] text-gray-500 block mt-1">Recommended: 2.0</span>
        </div>

        {/* Total Duration / Extension Selector */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center justify-between">
            <span>Duration (ความยาว)</span>
            {generationStyle === 'single_pass_take' ? (
              <span className="text-[10px] text-amber-400 font-bold font-mono">Single-Take</span>
            ) : totalDuration > 5 ? (
              <span className="text-[10px] text-purple-400 font-bold font-mono">Multi-Shot</span>
            ) : null}
          </label>

          {generationStyle === 'single_pass_take' ? (
            <select
              value={singlePassDuration}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setSinglePassDuration(val);
                setFrames(val === 15 ? 362 : val === 10 ? 243 : 124);
              }}
              className="w-full px-2 py-1.5 bg-studio-950 border border-amber-500/50 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 font-medium"
            >
              <option value={5}>5 วิ (124 เฟรม - มาตรฐาน A100 40GB)</option>
              <option value={10}>10 วิ (243 เฟรม 🔥 แนะนำ A100 High-RAM)</option>
              <option value={15}>15 วิ (362 เฟรม 🔥 แนะนำ A100 High-RAM)</option>
            </select>
          ) : (
            <select
              value={totalDuration}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setTotalDuration(val);
                if (val === 5) setFrames(124);
              }}
              className="w-full px-2 py-1.5 bg-studio-950 border border-studio-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
            >
              <option value={5}>5 วิ (1 ช็อต - 124 เฟรม)</option>
              <option value={10}>10 วิ (2 ช็อต: 5s + 5s ⭐)</option>
              <option value={15}>15 วิ (3 ช็อต: 15 วินาที)</option>
              <option value={30}>30 วิ (6 ช็อต: 30 วินาที - คลิปสั้น TikTok / Reel)</option>
              <option value={60}>60 วิ (12 ช็อต: 1 นาที - สตอรี่/โฆษณาเต็ม 🌟)</option>
              <option value={120}>120 วิ (24 ช็อต: 2 นาที - Music Video / ไคลแมกซ์ 🎬)</option>
            </select>
          )}

          <div className="flex items-center space-x-1 mt-1 text-[10px] text-gray-400">
            <input
              type="checkbox"
              id="randSeed"
              checked={randomizeSeed}
              onChange={(e) => setRandomizeSeed(e.target.checked)}
              className="rounded accent-indigo-500"
            />
            <label htmlFor="randSeed" className="cursor-pointer">Randomize Seed</label>
          </div>
        </div>
      </div>

      {/* Multi-Segment Shot Chaining Panel (Appears when Multi-Shot & Duration > 5s) */}
      {generationStyle === 'sequential_storyboard' && totalDuration > 5 && (
        <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/40 to-pink-950/40 p-4 rounded-xl border border-indigo-500/30 space-y-3 animate-in fade-in">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <h4 className="text-xs font-bold text-white tracking-wide">
                จัดการสร้างคลิปต่อเนื่อง {totalDuration} วินาที ({Math.floor(totalDuration / 5)} ช็อต • ป้องกัน VRAM ล้น 100%)
              </h4>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">
                {totalDuration >= 60 ? `${(totalDuration / 60).toFixed(1)} นาที` : `${totalDuration} วินาที`} ({Math.floor(totalDuration / 5)} x 5s)
              </span>
            </div>
          </div>

          <p className="text-[11px] text-gray-400">
            ระบบจะส่งคำสั่งเจนทีละช็อต (5 วินาที / 124 เฟรม) ไปยัง Colab A100 เพื่อความเสถียรสูงสุด เมื่อครบทุกช็อตจะทำการรวมเป็นคลิปสมบูรณ์ให้อัตโนมัติ
          </p>

          {/* Master Anchor Character Lock (Crucial for 30s, 60s, 120s videos) */}
          <div className="flex items-center justify-between bg-black/40 p-2.5 rounded-lg border border-purple-500/30 text-xs">
            <div className="flex items-center space-x-2.5">
              <Shield className="w-4 h-4 text-purple-400 shrink-0" />
              <div>
                <span className="text-purple-200 font-semibold">🔒 Master Anchor Character Reference</span>
                <p className="text-[10px] text-gray-400">
                  ล็อกใบหน้าและชุดตัวละครหลักเดิมไว้ตลอดทุกช็อต เพื่อป้องกันปัญหาหน้าตาเพี้ยนหรือเปลี่ยนคนเมื่อทำคลิปยาว 1-2 นาที
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-3">
              <input
                type="checkbox"
                checked={lockMasterCharacter}
                onChange={(e) => setLockMasterCharacter(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          {/* 3 Extension Strategies */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Strategy 1: Seamless Last Frame */}
            <button
              type="button"
              onClick={() => setExtensionStrategy('last_frame')}
              className={`p-3 rounded-xl border text-left transition ${
                extensionStrategy === 'last_frame'
                  ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                  : 'bg-studio-950/60 border-studio-800 text-gray-400 hover:border-studio-700'
              }`}
            >
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-indigo-300 mb-1">
                <Link2 className="w-3.5 h-3.5" />
                <span>1. ต่อเนื่องจากเฟรมสุดท้าย ⭐</span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                ดึงเฟรมท้ายของช็อตก่อนหน้ามารันต่ออัตโนมัติ ท่าทาง แสง และชุดเนียนกริบ ไร้รอยต่อ
              </p>
            </button>

            {/* Strategy 2: Multi-Angle Cuts */}
            <button
              type="button"
              onClick={() => setExtensionStrategy('multi_angle')}
              className={`p-3 rounded-xl border text-left transition ${
                extensionStrategy === 'multi_angle'
                  ? 'bg-purple-600/20 border-purple-500 text-white shadow-md'
                  : 'bg-studio-950/60 border-studio-800 text-gray-400 hover:border-studio-700'
              }`}
            >
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-purple-300 mb-1">
                <Camera className="w-3.5 h-3.5" />
                <span>2. สลับมุมกล้องภาพยนตร์</span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                คุมตัวละครเดิม แต่ตัดสลับมุมกล้อง (Establishing ➡️ Medium ➡️ Close-up ➡️ Climax)
              </p>
            </button>

            {/* Strategy 3: Storyboard Beats */}
            <button
              type="button"
              onClick={() => setExtensionStrategy('storyboard')}
              className={`p-3 rounded-xl border text-left transition ${
                extensionStrategy === 'storyboard'
                  ? 'bg-pink-600/20 border-pink-500 text-white shadow-md'
                  : 'bg-studio-950/60 border-studio-800 text-gray-400 hover:border-studio-700'
              }`}
            >
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-pink-300 mb-1">
                <Film className="w-3.5 h-3.5" />
                <span>3. ระบุบทแยกแต่ละช็อต (Storyboard)</span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                กำหนด Prompt เฉพาะเจาะจงให้แต่ละช็อต เล่าเรื่องราวเป็นฉากๆ ต่อเนื่องจนจบเรื่อง
              </p>
            </button>
          </div>

          {/* Storyboard Prompts if mode 3 is selected */}
          {extensionStrategy === 'storyboard' && (
            <div className="space-y-3 pt-2 border-t border-indigo-900/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                  <Clapperboard className="w-3.5 h-3.5 text-pink-400" />
                  <span>คำบรรยาย Storyboard ({Math.floor(totalDuration / 5)} ช็อต):</span>
                </span>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleAutoSplitStoryboard}
                    disabled={isSplittingStoryboard || !positivePrompt.trim()}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-pink-900/50 hover:bg-pink-800 text-pink-200 border border-pink-500/40 flex items-center space-x-1.5 transition disabled:opacity-40 shadow-sm"
                    title={`วิเคราะห์เนื้อเรื่องยาวแล้วตัดแบ่งเป็น ${Math.floor(totalDuration / 5)} ช็อตอัตโนมัติ`}
                  >
                    {isSplittingStoryboard ? (
                      <Loader2 className="w-3 h-3 animate-spin text-pink-400" />
                    ) : (
                      <Wand2 className="w-3 h-3 text-pink-400" />
                    )}
                    <span>✨ AI ตัดแบ่ง {Math.floor(totalDuration / 5)} ช็อต</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleApplyCinematicFlow}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 border border-purple-500/30 flex items-center space-x-1 transition shadow-sm"
                    title="ใส่เทคนิคมุมกล้องภาพยนตร์ต่อเนื่อง (Establishing, Tracking, Close-up, Climax) ให้อัตโนมัติ"
                  >
                    <Camera className="w-3 h-3 text-purple-400" />
                    <span>🎥 เติมมุมกล้องภาพยนตร์</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDuplicatePromptToAll}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-studio-900 hover:bg-studio-800 text-gray-300 border border-studio-700 flex items-center space-x-1 transition"
                    title="คัดลอก Prompt จากช็อตที่ 1 ไปยังทุกช็อต"
                  >
                    <Layers className="w-3 h-3 text-gray-400" />
                    <span>📋 ก็อปปี้ไปทุกช็อต</span>
                  </button>
                </div>
              </div>

              {/* Shot Navigator Pills when > 4 shots */}
              {Math.floor(totalDuration / 5) > 4 && (
                <div className="flex items-center gap-1 overflow-x-auto pb-1 pt-1 scrollbar-thin">
                  {Array.from({ length: Math.floor(totalDuration / 5) }).map((_, idx) => {
                    const isFilled = idx === 0 ? !!positivePrompt.trim() : !!storyboardPrompts[idx]?.trim();
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(`shot-field-${idx}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 transition ${
                          isFilled
                            ? 'bg-purple-950/60 text-purple-300 border-purple-600/40'
                            : 'bg-studio-950 text-gray-500 border-studio-800 hover:border-gray-600'
                        }`}
                      >
                        {idx + 1}: {idx * 5}-{(idx + 1) * 5}s {isFilled && '✓'}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Dynamic Shot Inputs List */}
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {Array.from({ length: Math.floor(totalDuration / 5) }).map((_, idx) => {
                  const shotNum = idx + 1;
                  const startSec = idx * 5;
                  const endSec = (idx + 1) * 5;
                  const val = idx === 0 ? positivePrompt : (storyboardPrompts[idx] || '');

                  return (
                    <div
                      key={idx}
                      id={`shot-field-${idx}`}
                      className="p-2.5 rounded-lg bg-studio-950/80 border border-studio-800 hover:border-indigo-500/30 transition space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-mono font-semibold flex items-center gap-1.5 text-indigo-300">
                          <span>🎬 ช็อตที่ {shotNum} ({startSec} – {endSec} วินาที):</span>
                          {idx === 0 && (
                            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 rounded">
                              ฉากเปิด
                            </span>
                          )}
                          {shotNum === Math.floor(totalDuration / 5) && (
                            <span className="text-[10px] text-pink-400 bg-pink-500/10 px-1.5 rounded">
                              ฉากจบ / ไคลแมกซ์
                            </span>
                          )}
                        </label>

                        {/* Quick Camera Tags */}
                        <div className="flex items-center gap-1">
                          {[
                            { label: '+ ซูมเข้า', tag: ', slow zoom in towards subject' },
                            { label: '+ แพนขวา', tag: ', smooth camera panning right' },
                            { label: '+ มุมเงย', tag: ', dynamic low angle dramatic view' },
                            { label: '+ โคลสอัพ', tag: ', intimate close-up on face, shallow depth of field' },
                          ].map((t) => (
                            <button
                              key={t.label}
                              type="button"
                              onClick={() => {
                                const curr = idx === 0 ? positivePrompt : (storyboardPrompts[idx] || '');
                                updateShotPrompt(idx, `${curr}${t.tag}`);
                              }}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-studio-900 hover:bg-studio-800 text-gray-400 hover:text-white border border-studio-800"
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <input
                        type="text"
                        value={val}
                        onChange={(e) => updateShotPrompt(idx, e.target.value)}
                        placeholder={
                          idx === 0
                            ? 'คำบรรยายช็อตเริ่มต้น...'
                            : `คำบรรยายเหตุการณ์ในช็อตที่ ${shotNum}...`
                        }
                        className="w-full px-3 py-1.5 bg-studio-900 border border-studio-700/80 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 8. Action Buttons & Auto-Translate */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-studio-800">
        <div className="flex items-center space-x-2 bg-studio-950 px-3 py-1.5 rounded-lg border border-studio-800">
          <Languages className={`w-3.5 h-3.5 ${autoTranslate ? 'text-indigo-400' : 'text-gray-500'}`} />
          <label htmlFor="autoTranslate" className="text-xs text-gray-300 cursor-pointer select-none">
            Auto-Translate ภาษาไทยเป็นอังกฤษก่อนเจน
          </label>
          <input
            type="checkbox"
            id="autoTranslate"
            checked={autoTranslate}
            onChange={(e) => setAutoTranslate(e.target.checked)}
            className="rounded accent-indigo-500 cursor-pointer ml-1"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(containsThai(positivePrompt) || containsThai(audioPrompt)) && (
            <button
              type="button"
              onClick={translateBothFields}
              disabled={isTranslatingAll}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700 text-xs font-medium transition disabled:opacity-50"
            >
              {isTranslatingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Languages className="w-3.5 h-3.5" />
              )}
              <span>แปลไทยทั้งหมด</span>
            </button>
          )}

          <button
            type="button"
            disabled={isTranslatingAll}
            onClick={() => handleQueueWithTranslation(false)}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-studio-800 hover:bg-studio-700 text-gray-200 font-medium text-xs border border-studio-700 transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4 text-indigo-400" />
            <span>Add to Batch Queue</span>
          </button>

          <button
            type="button"
            disabled={isTranslatingAll}
            onClick={() => handleQueueWithTranslation(true)}
            className="flex items-center space-x-2 px-6 py-2.5 rounded-xl text-white font-semibold text-xs shadow-lg bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 shadow-indigo-500/25 transition disabled:opacity-50"
          >
            {isTranslatingAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            <span>Generate Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
