'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Film,
  Image as ImageIcon,
  Download,
  Copy,
  Check,
  Volume2,
  HardDrive,
  Sparkles,
  Play,
  Wand2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  X,
  LayoutGrid,
  Columns,
} from 'lucide-react';
import { QueueItem } from '../types';
import { ComfyApiClient } from '../lib/comfyApi';
import { MergeModal, VideoOption } from './MergeModal';

interface VideoGalleryProps {
  completedItems: QueueItem[];
  sidecarUrl?: string;
  onSendImageToVideo?: (imageUrl: string, filename: string, promptText?: string) => void;
  onClearQueueHistory?: () => void;
  onDeleteQueueItem?: (itemId: string, filename?: string) => void;
}

interface LocalMediaFile {
  filename: string;
  isImage?: boolean;
  sizeMb: string;
  createdAt: number;
  url: string;
  prompt?: string;
  originalThaiPrompt?: string;
}

interface GalleryMediaItem {
  id: string;
  source: 'session' | 'local';
  isImage: boolean;
  isNsfwImage: boolean;
  url: string;
  filename?: string;
  prompt: string;
  rawPrompt: string;
  audioPrompt?: string;
  badgeText: string;
  metaText: string;
  downloadName: string;
  queueItem?: QueueItem;
  localFile?: LocalMediaFile;
}

function isImageFile(filenameOrUrl?: string): boolean {
  if (!filenameOrUrl) return false;
  const lower = filenameOrUrl.toLowerCase();
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.includes('filename=minimax_h3_4k') ||
    lower.includes('filename=nsfw_') ||
    lower.includes('image%2f')
  );
}

function isNsfwFilename(filename?: string): boolean {
  if (!filename) return false;
  return filename.toLowerCase().includes('nsfw');
}

export const VideoGallery: React.FC<VideoGalleryProps> = ({
  completedItems,
  sidecarUrl = '',
  onSendImageToVideo,
  onClearQueueHistory,
  onDeleteQueueItem,
}) => {
  const [localFiles, setLocalFiles] = useState<LocalMediaFile[]>([]);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video'>('all');
  const [viewMode, setViewMode] = useState<'slide' | 'grid'>('slide');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Inline Stage Zoom & Pan
  const [stageZoom, setStageZoom] = useState<number>(1);
  const [stagePan, setStagePan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const stageDragRef = useRef<{
    dragging: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ dragging: false, moved: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  // Fullscreen Lightbox Modal + Zoom/Pan
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxZoom, setLightboxZoom] = useState<number>(1);
  const [lightboxPan, setLightboxPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isLightboxDragging, setIsLightboxDragging] = useState(false);
  const lightboxDragRef = useRef<{
    dragging: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ dragging: false, moved: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  // Touch swipe tracking (for mobile/trackpad)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Merge modal state
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergePreselect1, setMergePreselect1] = useState<string | undefined>();
  const [mergePreselect2, setMergePreselect2] = useState<string | undefined>();

  const prevCompletedCountRef = useRef<number>(completedItems.length);

  const fetchLocalFiles = useCallback(() => {
    fetch('/api/gdrive-videos')
      .then((res) => res.json())
      .then((data) => {
        if (data.videos) {
          setLocalFiles(data.videos);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch local saved videos & images on mount and whenever completedItems updates
  useEffect(() => {
    fetchLocalFiles();
  }, [completedItems, fetchLocalFiles]);

  // Build unified deduplicated media list (newest session items first, then saved local files)
  const allMedia: GalleryMediaItem[] = useMemo(() => {
    const completedFilenames = new Set(
      completedItems.map((item) => item.outputFilename).filter(Boolean)
    );

    const sessionMedia: GalleryMediaItem[] = [...completedItems]
      .reverse()
      .filter((item) => Boolean(item.outputVideoUrl))
      .map((item) => {
        const isImg =
          item.config.taskMode === 'image_gen' ||
          item.config.taskMode === 'nsfw_image' ||
          item.config.mode === 't2i' ||
          item.config.mode === 'i2i' ||
          isImageFile(item.outputFilename || item.outputVideoUrl);
        const isNsfwImg =
          item.config.taskMode === 'nsfw_image' || isNsfwFilename(item.outputFilename);

        const badgeText = isNsfwImg
          ? '🔞 NSFW Image'
          : isImg
          ? '🖼️ 4K Image'
          : `🎬 ${item.config.mode.toUpperCase()}`;

        return {
          id: `session:${item.id}`,
          source: 'session',
          isImage: isImg,
          isNsfwImage: isNsfwImg,
          url: item.outputVideoUrl!,
          filename: item.outputFilename,
          prompt: item.config.originalThaiPrompt || item.config.positivePrompt,
          rawPrompt: item.config.positivePrompt,
          audioPrompt: item.config.audioPrompt,
          badgeText,
          metaText: `${item.config.width}×${item.config.height} • ${item.config.steps} Steps${
            item.durationSeconds ? ` • ${item.durationSeconds}s` : ''
          }`,
          downloadName:
            item.outputFilename || (isImg ? 'studio_image.png' : 'studio_video.mp4'),
          queueItem: item,
        };
      });

    const savedMedia: GalleryMediaItem[] = localFiles
      .filter((lf) => !completedFilenames.has(lf.filename))
      .map((lf) => {
        const isImg = !!lf.isImage || isImageFile(lf.filename);
        const isNsfwImg = isImg && isNsfwFilename(lf.filename);
        const badgeText = isNsfwImg
          ? '🔞 NSFW Image'
          : isImg
          ? '🖼️ รูปภาพในเครื่อง'
          : '🎬 วิดีโอในเครื่อง';

        return {
          id: `local:${lf.filename}`,
          source: 'local',
          isImage: isImg,
          isNsfwImage: isNsfwImg,
          url: lf.url,
          filename: lf.filename,
          prompt: lf.originalThaiPrompt || lf.prompt || lf.filename,
          rawPrompt: lf.prompt || '',
          badgeText,
          metaText: `${lf.sizeMb} MB`,
          downloadName: lf.filename,
          localFile: lf,
        };
      });

    return [...sessionMedia, ...savedMedia];
  }, [completedItems, localFiles]);

  const imageCount = useMemo(() => allMedia.filter((m) => m.isImage).length, [allMedia]);
  const videoCount = useMemo(() => allMedia.filter((m) => !m.isImage).length, [allMedia]);

  const filteredMedia = useMemo(() => {
    if (mediaFilter === 'image') return allMedia.filter((m) => m.isImage);
    if (mediaFilter === 'video') return allMedia.filter((m) => !m.isImage);
    return allMedia;
  }, [allMedia, mediaFilter]);

  // Auto-select newest item when a new generation completes
  useEffect(() => {
    if (completedItems.length > prevCompletedCountRef.current && completedItems.length > 0) {
      const newest = completedItems[completedItems.length - 1];
      setActiveId(`session:${newest.id}`);
    }
    prevCompletedCountRef.current = completedItems.length;
  }, [completedItems]);

  // Resolve activeIndex & activeMedia cleanly
  const activeIndex = useMemo(() => {
    if (filteredMedia.length === 0) return -1;
    if (!activeId) return 0;
    const idx = filteredMedia.findIndex((m) => m.id === activeId);
    return idx >= 0 ? idx : 0;
  }, [filteredMedia, activeId]);

  const activeMedia = activeIndex >= 0 ? filteredMedia[activeIndex] : null;

  // Reset inline & lightbox zoom/pan whenever active item changes
  useEffect(() => {
    setStageZoom(1);
    setStagePan({ x: 0, y: 0 });
    setLightboxZoom(1);
    setLightboxPan({ x: 0, y: 0 });
  }, [activeMedia?.id]);

  const goToIndex = useCallback(
    (nextIndex: number) => {
      if (filteredMedia.length === 0) return;
      const wrapped = (nextIndex + filteredMedia.length) % filteredMedia.length;
      setActiveId(filteredMedia[wrapped].id);
    },
    [filteredMedia]
  );

  const handlePrev = useCallback(() => {
    if (filteredMedia.length <= 1) return;
    goToIndex(activeIndex - 1);
  }, [filteredMedia.length, activeIndex, goToIndex]);

  const handleNext = useCallback(() => {
    if (filteredMedia.length <= 1) return;
    goToIndex(activeIndex + 1);
  }, [filteredMedia.length, activeIndex, goToIndex]);

  // Body scroll lock & keyboard shortcuts
  useEffect(() => {
    if (isLightboxOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsLightboxOpen(false);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePrev();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleNext();
        } else if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          setLightboxZoom((z) => Math.min(5, Number((z + 0.5).toFixed(2))));
        } else if (e.key === '-') {
          e.preventDefault();
          setLightboxZoom((z) => {
            const next = Math.max(1, Number((z - 0.5).toFixed(2)));
            if (next === 1) setLightboxPan({ x: 0, y: 0 });
            return next;
          });
        } else if (e.key === '0') {
          e.preventDefault();
          setLightboxZoom(1);
          setLightboxPan({ x: 0, y: 0 });
        }
      };

      window.addEventListener('keydown', onKeyDown);
      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', onKeyDown);
      };
    }

    // Outside Lightbox: allow ArrowLeft/ArrowRight slide when not typing in an input
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (filteredMedia.length <= 1) return;
      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLightboxOpen, filteredMedia.length, handlePrev, handleNext]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearAllHistory = async () => {
    const confirmed = window.confirm(
      '⚠️ ยืนยันการลบประวัติและไฟล์รูป/คลิปทั้งหมดใน Gallery หรือไม่?\n(เหมาะสำหรับเคลียร์งานแนว NSFW หรือล้างพื้นที่จัดเก็บ ผลงานในเครื่องจะถูกลบทันที)'
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const [localRes] = await Promise.all([
        fetch('/api/gdrive-videos?all=true', { method: 'DELETE' }),
        sidecarUrl ? ComfyApiClient.deleteRemoteOutput(sidecarUrl, undefined, true) : Promise.resolve(null),
      ]);
      const localData = await localRes.json().catch(() => ({}));
      if (!localRes.ok || localData.success === false) {
        alert(`แจ้งเตือนการลบไฟล์ในเครื่อง: ${localData.message || localData.error || 'ไม่สามารถลบไฟล์ทั้งหมดได้'}`);
      }
      if (onClearQueueHistory) {
        onClearQueueHistory();
      }
      setLocalFiles([]);
      setActiveId(null);
      setIsLightboxOpen(false);
      fetchLocalFiles();
    } catch (e: any) {
      alert(`เกิดข้อผิดพลาดในการลบ: ${e.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSingle = async (item: GalleryMediaItem) => {
    const label = item.filename || item.prompt || 'รายการนี้';
    const confirmed = window.confirm(`ลบ ${label} ออกจากประวัติและเครื่องอย่างถาวรหรือไม่?`);
    if (!confirmed) return;

    try {
      let localOk = true;
      let localErrMsg = '';
      if (item.filename) {
        const [localRes] = await Promise.all([
          fetch(`/api/gdrive-videos?file=${encodeURIComponent(item.filename)}`, { method: 'DELETE' }),
          sidecarUrl ? ComfyApiClient.deleteRemoteOutput(sidecarUrl, item.filename, false) : Promise.resolve(null),
        ]);
        const localData = await localRes.json().catch(() => ({}));
        if (!localRes.ok || localData.success === false) {
          localOk = false;
          localErrMsg = localData.message || localData.error || 'ไม่พบไฟล์ในโฟลเดอร์ outputs';
        }
      }

      if (item.source === 'local' && !localOk) {
        alert(`ไม่สามารถลบไฟล์ ${item.filename} ได้: ${localErrMsg}`);
        fetchLocalFiles();
        return;
      }

      if (onDeleteQueueItem) {
        onDeleteQueueItem(item.queueItem?.id || item.id, item.filename);
      }
      if (item.filename) {
        setLocalFiles((prev) => prev.filter((lf) => lf.filename !== item.filename));
      }
      if (activeMedia?.id === item.id) {
        setActiveId(null);
        setIsLightboxOpen(false);
      }
      fetchLocalFiles();
    } catch (e: any) {
      alert(`เกิดข้อผิดพลาด: ${e.message}`);
    }
  };

  // Collect all available video candidates for merging (exclude still images)
  const availableVideos: VideoOption[] = useMemo(() => {
    return allMedia
      .filter((m) => !m.isImage && Boolean(m.url))
      .map((m) => ({
        id: m.id,
        filename: m.filename || `video_${m.id}.mp4`,
        title: m.prompt,
        url: m.url,
      }));
  }, [allMedia]);

  // Inline stage zoom & drag handlers
  const handleStageZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStageZoom((z) => Math.min(4, Number((z + 0.5).toFixed(2))));
  };

  const handleStageZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStageZoom((z) => {
      const next = Math.max(1, Number((z - 0.5).toFixed(2)));
      if (next === 1) setStagePan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleStageReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStageZoom(1);
    setStagePan({ x: 0, y: 0 });
  };

  const handleStagePointerDown = (e: React.PointerEvent) => {
    if (!activeMedia?.isImage || stageZoom <= 1) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    stageDragRef.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origX: stagePan.x,
      origY: stagePan.y,
    };
  };

  const handleStagePointerMove = (e: React.PointerEvent) => {
    if (!stageDragRef.current.dragging) return;
    const dx = e.clientX - stageDragRef.current.startX;
    const dy = e.clientY - stageDragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      stageDragRef.current.moved = true;
    }
    setStagePan({
      x: stageDragRef.current.origX + dx,
      y: stageDragRef.current.origY + dy,
    });
  };

  const handleStagePointerUp = (e: React.PointerEvent) => {
    if (stageDragRef.current.dragging) {
      stageDragRef.current.dragging = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Lightbox zoom, wheel & pan handlers
  const handleLightboxWheel = (e: React.WheelEvent) => {
    if (!activeMedia?.isImage) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.35 : -0.35;
    setLightboxZoom((z) => {
      const next = Math.min(5, Math.max(1, Number((z + delta).toFixed(2))));
      if (next === 1) setLightboxPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleLightboxPointerDown = (e: React.PointerEvent) => {
    if (!activeMedia?.isImage || lightboxZoom <= 1) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsLightboxDragging(true);
    lightboxDragRef.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origX: lightboxPan.x,
      origY: lightboxPan.y,
    };
  };

  const handleLightboxPointerMove = (e: React.PointerEvent) => {
    if (!lightboxDragRef.current.dragging) return;
    const dx = e.clientX - lightboxDragRef.current.startX;
    const dy = e.clientY - lightboxDragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      lightboxDragRef.current.moved = true;
    }
    setLightboxPan({
      x: lightboxDragRef.current.origX + dx,
      y: lightboxDragRef.current.origY + dy,
    });
  };

  const handleLightboxPointerUp = (e: React.PointerEvent) => {
    if (lightboxDragRef.current.dragging) {
      lightboxDragRef.current.dragging = false;
      setIsLightboxDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  if (allMedia.length === 0) {
    return (
      <div className="bg-studio-900 border border-studio-800 rounded-2xl p-8 text-center">
        <div className="flex items-center justify-center space-x-2 mb-2">
          <ImageIcon className="w-8 h-8 text-amber-400/70" />
          <Film className="w-8 h-8 text-indigo-400/70" />
        </div>
        <h4 className="text-sm font-bold text-gray-200">
          คลังผลงานสตูดิโอ (แสดงทั้งรูปภาพ 4K, NSFW และวิดีโอพร้อมเสียง)
        </h4>
        <p className="text-xs text-gray-400 max-w-md mx-auto mt-1">
          เมื่อสร้างรูปหรือเรนเดอร์วิดีโอเสร็จ ผลงานจะแสดงที่นี่ทันที พร้อมโหมด Slide, Grid และซูมดูรายละเอียดเต็มจอ
        </p>
      </div>
    );
  }

  return (
    <div className="bg-studio-900 border border-studio-800 rounded-2xl p-5 shadow-sm space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-800 pb-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">คลังผลงานสตูดิโอ (Studio Gallery)</h3>
          </div>

          {/* Filter Pills */}
          <div className="flex bg-studio-950 p-1 rounded-xl border border-studio-800 text-xs">
            <button
              type="button"
              onClick={() => setMediaFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                mediaFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              ทั้งหมด ({allMedia.length})
            </button>
            <button
              type="button"
              onClick={() => setMediaFilter('image')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                mediaFilter === 'image' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              🖼️ รูปภาพ ({imageCount})
            </button>
            <button
              type="button"
              onClick={() => setMediaFilter('video')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                mediaFilter === 'video' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              🎬 วิดีโอ ({videoCount})
            </button>
          </div>

          {/* View Mode Switcher: Slide vs Grid */}
          <div className="flex bg-studio-950 p-1 rounded-xl border border-studio-800 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('slide')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg font-medium transition ${
                viewMode === 'slide' ? 'bg-studio-800 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
              title="โหมดสไลด์พร้อมดูรายละเอียด"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>สไลด์</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg font-medium transition ${
                viewMode === 'grid' ? 'bg-studio-800 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
              title="โหมดตารางดูรวมหลายภาพ"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>ตาราง</span>
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {availableVideos.length >= 2 && (
            <button
              type="button"
              onClick={() => {
                setMergePreselect1(
                  (!activeMedia?.isImage ? activeMedia?.filename : undefined) ||
                    availableVideos[0]?.filename
                );
                setMergePreselect2(availableVideos[1]?.filename);
                setIsMergeModalOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white text-xs font-semibold shadow-md transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>🎬 รวมคลิปวิดีโอ (10s – 2 นาที)</span>
            </button>
          )}

          {/* Clear All History Button */}
          <button
            type="button"
            onClick={handleClearAllHistory}
            disabled={isDeleting || allMedia.length === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-600/15 hover:bg-rose-600/30 text-rose-300 hover:text-rose-100 border border-rose-500/30 text-xs font-semibold transition disabled:opacity-40"
            title="ลบประวัติและไฟล์ทั้งหมด เหมาะสำหรับเคลียร์ผลงานแนว NSFW หรือล้างพื้นที่"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>{isDeleting ? 'กำลังล้าง...' : 'ล้างประวัติ/ไฟล์ทั้งหมด'}</span>
          </button>

          <span className="text-xs text-emerald-400 hidden sm:flex items-center space-x-1">
            <HardDrive className="w-3.5 h-3.5" />
            <span>บันทึกอัตโนมัติลงเครื่องแล้ว</span>
          </span>
        </div>
      </div>

      {/* Empty Filter State */}
      {filteredMedia.length === 0 ? (
        <div className="py-10 text-center text-xs text-gray-400 border border-dashed border-studio-800 rounded-2xl">
          ไม่มีผลงานในหมวดหมู่นี้ ลองเลือกตัวกรอง &quot;ทั้งหมด&quot; ด้านบนครับ
        </div>
      ) : viewMode === 'slide' && activeMedia ? (
        <>
          {/* SLIDE / THEATER VIEW */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Main Interactive Viewer Stage */}
            <div
              className="lg:col-span-2 bg-black/80 rounded-2xl overflow-hidden border border-studio-800 flex items-center justify-center relative min-h-[420px] max-h-[600px] group select-none"
              onTouchStart={(e) => {
                if (stageZoom > 1) return;
                touchStartRef.current = {
                  x: e.touches[0].clientX,
                  y: e.touches[0].clientY,
                };
              }}
              onTouchEnd={(e) => {
                if (stageZoom > 1 || !touchStartRef.current) return;
                const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
                touchStartRef.current = null;
                if (Math.abs(dx) > 50) {
                  if (dx > 0) handlePrev();
                  else handleNext();
                }
              }}
            >
              {/* Top-left Counter Badge */}
              <div className="absolute top-3 left-3 z-20 flex items-center space-x-2 pointer-events-none">
                <span className="px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-[11px] font-mono text-white shadow">
                  {activeIndex + 1} / {filteredMedia.length}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold backdrop-blur-md border shadow ${
                    activeMedia.isNsfwImage
                      ? 'bg-rose-950/80 text-rose-200 border-rose-500/40'
                      : activeMedia.isImage
                      ? 'bg-amber-950/80 text-amber-200 border-amber-500/40'
                      : 'bg-indigo-950/80 text-indigo-200 border-indigo-500/40'
                  }`}
                >
                  {activeMedia.badgeText}
                </span>
              </div>

              {/* Top-right Zoom & Fullscreen Floating Toolbar */}
              <div
                className="absolute top-3 right-3 z-20 flex items-center space-x-1 bg-black/75 backdrop-blur-md border border-white/15 rounded-xl p-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                {activeMedia.isImage && (
                  <>
                    <button
                      type="button"
                      onClick={handleStageZoomOut}
                      disabled={stageZoom <= 1}
                      title="ซูมออก"
                      className="p-1.5 rounded-lg text-gray-200 hover:bg-white/10 disabled:opacity-35 transition"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-1.5 text-[11px] font-mono text-gray-200 min-w-[42px] text-center">
                      {Math.round(stageZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={handleStageZoomIn}
                      disabled={stageZoom >= 4}
                      title="ซูมเข้า"
                      className="p-1.5 rounded-lg text-gray-200 hover:bg-white/10 disabled:opacity-35 transition"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    {stageZoom > 1 && (
                      <button
                        type="button"
                        onClick={handleStageReset}
                        title="รีเซ็ตขนาดเดิม"
                        className="p-1.5 rounded-lg text-amber-300 hover:bg-white/10 transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <div className="w-px h-4 bg-white/15 mx-0.5" />
                  </>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsLightboxOpen(true);
                  }}
                  title="เปิดเต็มจอ (Fullscreen Lightbox)"
                  className="flex items-center space-x-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600/80 hover:bg-indigo-500 transition"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">เต็มจอ</span>
                </button>
              </div>

              {/* Left / Right Slide Arrows */}
              {filteredMedia.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrev();
                    }}
                    title="รายการก่อนหน้า (←)"
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/65 hover:bg-indigo-600 text-white border border-white/15 shadow-xl transition opacity-85 group-hover:opacity-100"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNext();
                    }}
                    title="รายการถัดไป (→)"
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/65 hover:bg-indigo-600 text-white border border-white/15 shadow-xl transition opacity-85 group-hover:opacity-100"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              {/* Active Media Canvas */}
              {activeMedia.isImage ? (
                <div
                  className={`w-full h-[460px] sm:h-[520px] flex items-center justify-center overflow-hidden ${
                    stageZoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
                  }`}
                  onPointerDown={handleStagePointerDown}
                  onPointerMove={handleStagePointerMove}
                  onPointerUp={handleStagePointerUp}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (stageZoom > 1) {
                      setStageZoom(1);
                      setStagePan({ x: 0, y: 0 });
                    } else {
                      setStageZoom(2.5);
                    }
                  }}
                  onClick={() => {
                    if (stageDragRef.current.moved) {
                      stageDragRef.current.moved = false;
                      return;
                    }
                    if (stageZoom === 1) {
                      setIsLightboxOpen(true);
                    }
                  }}
                >
                  <img
                    key={activeMedia.url}
                    src={activeMedia.url}
                    alt={activeMedia.prompt || activeMedia.filename || 'Generated Image'}
                    draggable={false}
                    style={{
                      transform: `translate3d(${stagePan.x}px, ${stagePan.y}px, 0) scale(${stageZoom})`,
                      transition: stageDragRef.current.dragging ? 'none' : 'transform 160ms ease-out',
                    }}
                    className="max-h-full max-w-full object-contain select-none"
                  />
                </div>
              ) : (
                <video
                  key={activeMedia.url}
                  src={activeMedia.url}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="max-h-[520px] w-full object-contain"
                />
              )}

              {/* Bottom Hint for Images */}
              {activeMedia.isImage && (
                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition">
                  <span className="px-3 py-1 rounded-full bg-black/70 border border-white/10 text-[10px] text-gray-300 backdrop-blur-sm whitespace-nowrap">
                    คลิกเพื่อดูเต็มจอ • ดับเบิลคลิกเพื่อซูม 2.5x {stageZoom > 1 ? '• ลากเพื่อเลื่อนภาพ' : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Right Info & Actions Panel */}
            <div className="flex flex-col justify-between space-y-4 bg-studio-950/60 p-4 rounded-2xl border border-studio-800">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                      activeMedia.isNsfwImage
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : activeMedia.isImage
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    }`}
                  >
                    {activeMedia.badgeText}
                  </span>
                  <span className="text-xs text-gray-400">{activeMedia.metaText}</span>
                </div>

                {activeMedia.filename && (
                  <div>
                    <span className="text-[11px] font-semibold text-gray-400 block mb-1">ชื่อไฟล์</span>
                    <p className="text-[11px] text-gray-300 bg-studio-900 px-2.5 py-1.5 rounded-lg border border-studio-800 font-mono break-all">
                      {activeMedia.filename}
                    </p>
                  </div>
                )}

                <div>
                  <span className="text-xs font-semibold text-gray-400 block mb-1">คำสั่ง Prompt</span>
                  <p className="text-xs text-gray-200 bg-studio-900 p-3 rounded-xl border border-studio-800 leading-relaxed max-h-40 overflow-y-auto">
                    {activeMedia.prompt}
                  </p>
                </div>

                {!activeMedia.isImage && activeMedia.audioPrompt && (
                  <div>
                    <span className="text-xs font-semibold text-indigo-400 mb-1 flex items-center space-x-1">
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>เสียงสเตอริโอ (Audio Prompt)</span>
                    </span>
                    <p className="text-xs text-indigo-200 bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-900/50">
                      {activeMedia.audioPrompt}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-3 border-t border-studio-800">
                {/* Fullscreen Zoom Button */}
                <button
                  type="button"
                  onClick={() => setIsLightboxOpen(true)}
                  className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-studio-800 hover:bg-studio-700 text-white text-xs font-semibold border border-studio-700 transition"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    {activeMedia.isImage
                      ? '🔍 ดูเต็มจอ & ซูมรายละเอียด (สูงสุด 500%)'
                      : '🎬 ดูคลิปเต็มจอ (Fullscreen Player)'}
                  </span>
                </button>

                {/* 1-Click Send Image to Video I2V */}
                {activeMedia.isImage && onSendImageToVideo && (
                  <button
                    type="button"
                    onClick={() =>
                      onSendImageToVideo(
                        activeMedia.url,
                        activeMedia.filename || 'studio_image.png',
                        activeMedia.rawPrompt || activeMedia.prompt
                      )
                    }
                    className={`w-full flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl text-white text-xs font-bold transition shadow-md ${
                      activeMedia.isNsfwImage
                        ? 'bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-500 hover:to-purple-500'
                        : 'bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500'
                    }`}
                  >
                    <Wand2 className="w-4 h-4" />
                    <span>
                      {activeMedia.isNsfwImage
                        ? '💃 นำภาพไปสร้างวิดีโอ NSFW Motion Mimic'
                        : '🎬 นำภาพ 4K นี้ไปสร้างวิดีโอต่อ (I2V)'}
                    </span>
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <a
                    href={activeMedia.url}
                    download={activeMedia.downloadName}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{activeMedia.isImage ? 'ดาวน์โหลดรูป' : 'ดาวน์โหลดวิดีโอ'}</span>
                  </a>

                  {activeMedia.rawPrompt && (
                    <button
                      type="button"
                      onClick={() => handleCopy(activeMedia.rawPrompt, activeMedia.id)}
                      className="py-2 px-3 rounded-xl bg-studio-900 hover:bg-studio-800 text-gray-300 border border-studio-800 text-xs flex items-center space-x-1 transition"
                    >
                      {copiedId === activeMedia.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">คัดลอกแล้ว</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>คัดลอก</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteSingle(activeMedia)}
                    className="p-2 rounded-xl bg-rose-600/15 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs transition"
                    title="ลบไฟล์นี้ทิ้งถาวร"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Visual Thumbnail Filmstrip */}
          <div className="pt-3 border-t border-studio-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400 font-semibold">
                🎞️ แถบภาพสไลด์ทั้งหมด ({filteredMedia.length} รายการ) — คลิกเพื่อสลับ หรือกดปุ่มลูกศร ← / →
              </span>
              {filteredMedia.length > 1 && (
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="px-2 py-1 rounded-lg bg-studio-950 hover:bg-studio-800 border border-studio-800 text-xs text-gray-300 flex items-center space-x-1 transition"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>ก่อนหน้า</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-2 py-1 rounded-lg bg-studio-950 hover:bg-studio-800 border border-studio-800 text-xs text-gray-300 flex items-center space-x-1 transition"
                  >
                    <span>ถัดไป</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 overflow-x-auto pb-2">
              {filteredMedia.map((item, idx) => {
                const isSelected = idx === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveId(item.id)}
                    className={`relative w-24 h-28 rounded-xl overflow-hidden shrink-0 border transition group bg-studio-950 ${
                      isSelected
                        ? item.isNsfwImage
                          ? 'border-rose-400 ring-2 ring-rose-500/60 shadow-lg'
                          : 'border-indigo-400 ring-2 ring-indigo-500/60 shadow-lg'
                        : 'border-studio-800 opacity-75 hover:opacity-100 hover:border-studio-600'
                    }`}
                  >
                    {item.isImage ? (
                      <img
                        src={item.url}
                        alt={item.prompt}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <>
                        <video
                          src={item.url}
                          muted
                          preload="metadata"
                          playsInline
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <div className="p-1.5 rounded-full bg-black/70 border border-white/25 text-white">
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Index & type badge */}
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-mono text-white">
                      #{idx + 1}
                    </span>
                    <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/75 text-[10px]">
                      {item.isNsfwImage ? '🔞' : item.isImage ? '🖼️' : '🎬'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        /* GRID VIEW */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {filteredMedia.map((item, idx) => {
            const isSelected = idx === activeIndex;
            return (
              <div
                key={item.id}
                onClick={() => {
                  setActiveId(item.id);
                  setIsLightboxOpen(true);
                }}
                className={`group relative rounded-2xl overflow-hidden border bg-studio-950 cursor-pointer transition shadow-sm hover:shadow-xl ${
                  isSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-500/40'
                    : 'border-studio-800 hover:border-indigo-500/60'
                }`}
              >
                <div className="aspect-[4/5] w-full bg-black relative overflow-hidden">
                  {item.isImage ? (
                    <img
                      src={item.url}
                      alt={item.prompt}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <>
                      <video
                        src={item.url}
                        muted
                        preload="metadata"
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                        <div className="p-3 rounded-full bg-black/70 border border-white/25 text-white group-hover:scale-110 transition">
                          <Play className="w-5 h-5 fill-current" />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Top Badges */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                    <span className="px-2 py-0.5 rounded-full bg-black/75 text-[10px] font-mono text-white border border-white/10">
                      #{idx + 1}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        item.isNsfwImage
                          ? 'bg-rose-950/85 text-rose-200 border-rose-500/40'
                          : item.isImage
                          ? 'bg-amber-950/85 text-amber-200 border-amber-500/40'
                          : 'bg-indigo-950/85 text-indigo-200 border-indigo-500/40'
                      }`}
                    >
                      {item.badgeText}
                    </span>
                  </div>

                  {/* Hover Action Overlay */}
                  <div
                    className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/95 via-black/70 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition flex items-center justify-between gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveId(item.id);
                        setIsLightboxOpen(true);
                      }}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center justify-center space-x-1 transition"
                    >
                      <ZoomIn className="w-3 h-3" />
                      <span>ซูมดู</span>
                    </button>

                    {item.isImage && onSendImageToVideo && (
                      <button
                        type="button"
                        onClick={() =>
                          onSendImageToVideo(
                            item.url,
                            item.filename || 'studio_image.png',
                            item.rawPrompt || item.prompt
                          )
                        }
                        title="ส่งไปสร้างวิดีโอต่อ"
                        className="p-1.5 rounded-lg bg-rose-600/85 hover:bg-rose-500 text-white transition"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <a
                      href={item.url}
                      download={item.downloadName}
                      target="_blank"
                      rel="noreferrer"
                      title="ดาวน์โหลด"
                      className="p-1.5 rounded-lg bg-studio-800 hover:bg-studio-700 text-gray-200 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>

                    <button
                      type="button"
                      onClick={() => handleDeleteSingle(item)}
                      title="ลบไฟล์"
                      className="p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-600 text-rose-300 hover:text-white transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card Footer Caption */}
                <div className="p-2.5 space-y-0.5">
                  <p className="text-[11px] font-medium text-gray-200 truncate">
                    {item.prompt}
                  </p>
                  <p className="text-[10px] text-gray-500 font-mono truncate">{item.metaText}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FULLSCREEN INTERACTIVE LIGHTBOX MODAL */}
      {isLightboxOpen && activeMedia && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col select-none"
          onClick={() => setIsLightboxOpen(false)}
        >
          {/* Top Lightbox Toolbar */}
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-studio-950/90 border-b border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              <span className="px-2.5 py-1 rounded-full bg-white/10 text-xs font-mono text-white shrink-0">
                {activeIndex + 1} / {filteredMedia.length}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold shrink-0 ${
                  activeMedia.isNsfwImage
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : activeMedia.isImage
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                }`}
              >
                {activeMedia.badgeText}
              </span>
              <span className="text-xs text-gray-400 font-mono truncate hidden sm:inline">
                {activeMedia.filename || activeMedia.metaText}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeMedia.isImage && (
                <div className="flex items-center space-x-1 bg-studio-900 border border-white/15 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxZoom((z) => {
                        const next = Math.max(1, Number((z - 0.5).toFixed(2)));
                        if (next === 1) setLightboxPan({ x: 0, y: 0 });
                        return next;
                      })
                    }
                    disabled={lightboxZoom <= 1}
                    title="ซูมออก (-)"
                    className="p-1.5 rounded-lg text-gray-200 hover:bg-white/10 disabled:opacity-35"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="px-2 text-xs font-mono text-white min-w-[48px] text-center">
                    {Math.round(lightboxZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxZoom((z) => Math.min(5, Number((z + 0.5).toFixed(2))))
                    }
                    disabled={lightboxZoom >= 5}
                    title="ซูมเข้า (+)"
                    className="p-1.5 rounded-lg text-gray-200 hover:bg-white/10 disabled:opacity-35"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (lightboxZoom === 2) {
                        setLightboxZoom(1);
                        setLightboxPan({ x: 0, y: 0 });
                      } else {
                        setLightboxZoom(2);
                      }
                    }}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold text-gray-200 hover:bg-white/10"
                  >
                    2x
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLightboxZoom(1);
                      setLightboxPan({ x: 0, y: 0 });
                    }}
                    title="พอดีจอ (0)"
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold text-amber-300 hover:bg-white/10"
                  >
                    Fit
                  </button>
                </div>
              )}

              {activeMedia.isImage && onSendImageToVideo && (
                <button
                  type="button"
                  onClick={() => {
                    setIsLightboxOpen(false);
                    onSendImageToVideo(
                      activeMedia.url,
                      activeMedia.filename || 'studio_image.png',
                      activeMedia.rawPrompt || activeMedia.prompt
                    );
                  }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white text-xs font-bold transition"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">ทำวิดีโอต่อ (I2V)</span>
                </button>
              )}

              <a
                href={activeMedia.url}
                download={activeMedia.downloadName}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ดาวน์โหลด</span>
              </a>

              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                title="ปิด (Esc)"
                className="p-2 rounded-xl bg-studio-900 hover:bg-rose-600 text-gray-300 hover:text-white border border-white/15 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main Lightbox Stage */}
          <div
            className="flex-1 relative flex items-center justify-center overflow-hidden p-4"
            onWheel={handleLightboxWheel}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              if (lightboxZoom > 1) return;
              touchStartRef.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
              };
            }}
            onTouchEnd={(e) => {
              if (lightboxZoom > 1 || !touchStartRef.current) return;
              const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
              touchStartRef.current = null;
              if (Math.abs(dx) > 50) {
                if (dx > 0) handlePrev();
                else handleNext();
              }
            }}
          >
            {filteredMedia.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  title="ก่อนหน้า (←)"
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full bg-black/70 hover:bg-indigo-600 text-white border border-white/20 shadow-2xl transition"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  title="ถัดไป (→)"
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-3 rounded-full bg-black/70 hover:bg-indigo-600 text-white border border-white/20 shadow-2xl transition"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}

            {activeMedia.isImage ? (
              <div
                className={`w-full h-full flex items-center justify-center overflow-hidden ${
                  lightboxZoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
                }`}
                onPointerDown={handleLightboxPointerDown}
                onPointerMove={handleLightboxPointerMove}
                onPointerUp={handleLightboxPointerUp}
                onDoubleClick={() => {
                  if (lightboxZoom > 1) {
                    setLightboxZoom(1);
                    setLightboxPan({ x: 0, y: 0 });
                  } else {
                    setLightboxZoom(2.5);
                  }
                }}
              >
                <img
                  key={activeMedia.url}
                  src={activeMedia.url}
                  alt={activeMedia.prompt}
                  draggable={false}
                  style={{
                    transform: `translate3d(${lightboxPan.x}px, ${lightboxPan.y}px, 0) scale(${lightboxZoom})`,
                    transition: isLightboxDragging ? 'none' : 'transform 140ms ease-out',
                  }}
                  className="max-h-[75vh] max-w-[92vw] object-contain select-none rounded-lg shadow-2xl"
                />
              </div>
            ) : (
              <video
                key={activeMedia.url}
                src={activeMedia.url}
                controls
                autoPlay
                loop
                playsInline
                className="max-h-[75vh] max-w-[90vw] rounded-xl shadow-2xl"
              />
            )}
          </div>

          {/* Bottom Caption + Lightbox Thumbnail Strip */}
          <div
            className="px-4 py-2.5 bg-studio-950/90 border-t border-white/10 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <p className="text-gray-300 truncate max-w-3xl">{activeMedia.prompt}</p>
              <span className="text-[11px] text-gray-500 font-mono">
                ← → เลื่อน • Scroll / ดับเบิลคลิก ซูม • ลากเพื่อเลื่อนภาพ • Esc ปิด
              </span>
            </div>

            {filteredMedia.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {filteredMedia.map((item, idx) => {
                  const isSelected = idx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveId(item.id)}
                      className={`relative w-14 h-14 rounded-lg overflow-hidden shrink-0 border transition ${
                        isSelected
                          ? 'border-indigo-400 ring-2 ring-indigo-500/70'
                          : 'border-white/15 opacity-55 hover:opacity-100'
                      }`}
                    >
                      {item.isImage ? (
                        <img
                          src={item.url}
                          alt={item.prompt}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <>
                          <video
                            src={item.url}
                            muted
                            preload="metadata"
                            playsInline
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <Play className="w-3 h-3 text-white fill-current" />
                          </div>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <MergeModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        availableVideos={availableVideos}
        sidecarUrl={sidecarUrl}
        initialVideo1={mergePreselect1}
        initialVideo2={mergePreselect2}
        onMergedSuccess={() => {
          fetch('/api/gdrive-videos')
            .then((res) => res.json())
            .then((data) => {
              if (data.videos) {
                setLocalFiles(data.videos);
                if (data.videos.length > 0) {
                  setActiveId(`local:${data.videos[0].filename}`);
                }
              }
            })
            .catch(() => {});
        }}
      />
    </div>
  );
};
