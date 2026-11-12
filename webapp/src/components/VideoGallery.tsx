'use client';

import React, { useState } from 'react';
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
  ExternalLink,
  Trash2,
  EyeOff,
} from 'lucide-react';
import { QueueItem } from '../types';
import { MergeModal, VideoOption } from './MergeModal';

interface VideoGalleryProps {
  completedItems: QueueItem[];
  sidecarUrl?: string;
  onSendImageToVideo?: (imageUrl: string, filename: string, promptText?: string) => void;
  onClearQueueHistory?: () => void;
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

function isImageFile(filenameOrUrl?: string): boolean {
  if (!filenameOrUrl) return false;
  const lower = filenameOrUrl.toLowerCase();
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.includes('filename=minimax_h3_4k') ||
    lower.includes('image%2f')
  );
}

export const VideoGallery: React.FC<VideoGalleryProps> = ({
  completedItems,
  sidecarUrl = '',
  onSendImageToVideo,
  onClearQueueHistory,
}) => {
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(
    completedItems.length > 0 ? completedItems[0] : null
  );
  const [selectedLocalMedia, setSelectedLocalMedia] = useState<LocalMediaFile | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [localFiles, setLocalFiles] = useState<LocalMediaFile[]>([]);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video'>('all');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchLocalFiles = () => {
    fetch('/api/gdrive-videos')
      .then((res) => res.json())
      .then((data) => {
        if (data.videos) {
          setLocalFiles(data.videos);
        }
      })
      .catch(() => {});
  };

  const handleClearAllHistory = async () => {
    const confirmed = window.confirm(
      '⚠️ ยืนยันการลบประวัติและไฟล์รูป/คลิปทั้งหมดใน Gallery หรือไม่?\n(เหมาะสำหรับเคลียร์งานแนว NSFW หรือล้างพื้นที่จัดเก็บ ผลงานในเครื่องจะถูกลบทันที)'
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await fetch('/api/gdrive-videos?all=true', { method: 'DELETE' });
      if (onClearQueueHistory) {
        onClearQueueHistory();
      }
      setLocalFiles([]);
      setSelectedItem(null);
      setSelectedLocalMedia(null);
    } catch (e: any) {
      alert(`เกิดข้อผิดพลาดในการลบ: ${e.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSingle = async (filename: string) => {
    const confirmed = window.confirm(`ลบไฟล์ ${filename} ออกจากประวัติและเครื่องอย่างถาวรหรือไม่?`);
    if (!confirmed) return;

    try {
      await fetch(`/api/gdrive-videos?file=${encodeURIComponent(filename)}`, { method: 'DELETE' });
      fetchLocalFiles();
      if (selectedLocalMedia?.filename === filename) {
        setSelectedLocalMedia(null);
      }
      if (selectedItem?.outputFilename === filename) {
        setSelectedItem(null);
      }
    } catch (e: any) {
      alert(`เกิดข้อผิดพลาด: ${e.message}`);
    }
  };

  // Merge modal state
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergePreselect1, setMergePreselect1] = useState<string | undefined>();
  const [mergePreselect2, setMergePreselect2] = useState<string | undefined>();

  // Fetch local saved videos & 4K images from project's `outputs/` folder automatically
  React.useEffect(() => {
    fetch('/api/gdrive-videos')
      .then((res) => res.json())
      .then((data) => {
        if (data.videos) {
          setLocalFiles(data.videos);
          if (!selectedLocalMedia && data.videos.length > 0 && completedItems.length === 0) {
            setSelectedLocalMedia(data.videos[0]);
          }
        }
      })
      .catch(() => {});
  }, [completedItems]);

  // Keep selectedItem synced when a new item finishes
  React.useEffect(() => {
    if (completedItems.length > 0) {
      setSelectedItem(completedItems[completedItems.length - 1]);
      setSelectedLocalMedia(null);
    }
  }, [completedItems.length]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Set of filenames already present in the active session queue
  const completedFilenames = new Set(
    completedItems.map((item) => item.outputFilename).filter(Boolean)
  );

  // Collect all available video candidates for merging (exclude still images)
  const availableVideos: VideoOption[] = [
    ...completedItems
      .filter((i) => i.outputVideoUrl && !isImageFile(i.outputFilename || i.outputVideoUrl))
      .map((i) => ({
        id: i.id,
        filename: i.outputFilename || `video_${i.id}.mp4`,
        title: i.config.positivePrompt,
        url: i.outputVideoUrl!,
      })),
    ...localFiles
      .filter(
        (lv) =>
          !completedFilenames.has(lv.filename) &&
          !lv.isImage &&
          !isImageFile(lv.filename)
      )
      .map((lv) => ({
        id: lv.filename,
        filename: lv.filename,
        title: lv.filename,
        url: lv.url,
      })),
  ];

  if (completedItems.length === 0 && localFiles.length === 0) {
    return (
      <div className="bg-studio-900 border border-studio-800 rounded-2xl p-8 text-center">
        <div className="flex items-center justify-center space-x-2 mb-2">
          <ImageIcon className="w-8 h-8 text-amber-400/70" />
          <Film className="w-8 h-8 text-indigo-400/70" />
        </div>
        <h4 className="text-sm font-bold text-gray-200">
          คลังผลงานสตูดิโอ (แสดงทั้งรูปภาพ 4K และวิดีโอพร้อมเสียง)
        </h4>
        <p className="text-xs text-gray-400 max-w-md mx-auto mt-1">
          เมื่อสร้างรูป 4K หรือเรนเดอร์วิดีโอเสร็จ ผลงานจะแสดงที่นี่ทันทีและถูกบันทึกอัตโนมัติลงโฟลเดอร์{' '}
          <code className="text-indigo-300">outputs/</code> ในเครื่องของคุณ
        </p>
      </div>
    );
  }

  const activeJob = selectedLocalMedia ? null : selectedItem || completedItems[0];
  const activeLocal =
    selectedLocalMedia || (!activeJob && localFiles.length > 0 ? localFiles[0] : null);

  const activeIsImage = activeJob
    ? activeJob.config.taskMode === 'image_gen' ||
      activeJob.config.mode === 't2i' ||
      activeJob.config.mode === 'i2i' ||
      isImageFile(activeJob.outputFilename || activeJob.outputVideoUrl)
    : activeLocal
    ? !!activeLocal.isImage || isImageFile(activeLocal.filename)
    : false;

  const filteredCompleted = completedItems.filter((item) => {
    const isImg =
      item.config.taskMode === 'image_gen' ||
      item.config.mode === 't2i' ||
      item.config.mode === 'i2i' ||
      isImageFile(item.outputFilename || item.outputVideoUrl);
    if (mediaFilter === 'image') return isImg;
    if (mediaFilter === 'video') return !isImg;
    return true;
  });

  const filteredLocal = localFiles.filter((lf) => {
    // Deduplicate: If this file is already represented in completedItems with full prompt metadata, omit duplicate card
    if (completedFilenames.has(lf.filename)) return false;

    const isImg = !!lf.isImage || isImageFile(lf.filename);
    if (mediaFilter === 'image') return isImg;
    if (mediaFilter === 'video') return !isImg;
    return true;
  });

  return (
    <div className="bg-studio-900 border border-studio-800 rounded-2xl p-5 shadow-sm space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-800 pb-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">คลังผลงานที่สร้างเสร็จแล้ว (Studio Gallery)</h3>
          </div>

          {/* Filter Pills */}
          <div className="flex bg-studio-950 p-1 rounded-xl border border-studio-800 text-xs">
            <button
              onClick={() => setMediaFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                mediaFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              ทั้งหมด ({filteredCompleted.length + filteredLocal.length})
            </button>
            <button
              onClick={() => setMediaFilter('image')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                mediaFilter === 'image' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              🖼️ รูปภาพ 4K
            </button>
            <button
              onClick={() => setMediaFilter('video')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                mediaFilter === 'video' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              🎬 วิดีโอ
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {availableVideos.length >= 2 && (
            <button
              onClick={() => {
                setMergePreselect1(
                  activeJob?.outputFilename || activeLocal?.filename || availableVideos[0]?.filename
                );
                setMergePreselect2(availableVideos[1]?.filename);
                setIsMergeModalOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white text-xs font-semibold shadow-md transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>🎬 รวมคลิปวิดีโอเข้าด้วยกัน (10s – 2 นาที)</span>
            </button>
          )}

          {/* Clear All History Button */}
          <button
            onClick={handleClearAllHistory}
            disabled={isDeleting || (completedItems.length === 0 && localFiles.length === 0)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-600/15 hover:bg-rose-600/30 text-rose-300 hover:text-rose-100 border border-rose-500/30 text-xs font-semibold transition disabled:opacity-40"
            title="ลบประวัติและไฟล์ทั้งหมด เหมาะสำหรับเคลียร์ผลงานแนว NSFW หรือล้างพื้นที่"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>{isDeleting ? 'กำลังล้าง...' : 'ล้างประวัติ/ไฟล์ทั้งหมด'}</span>
          </button>

          <span className="text-xs text-emerald-400 flex items-center space-x-1">
            <HardDrive className="w-3.5 h-3.5" />
            <span>บันทึกอัตโนมัติลงเครื่องแล้ว</span>
          </span>
        </div>
      </div>

      {/* Main Viewer Display (Session Item) */}
      {activeJob && activeJob.outputVideoUrl ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-studio-950 rounded-2xl overflow-hidden border border-studio-800 flex items-center justify-center relative min-h-[320px]">
            {activeIsImage ? (
              <img
                key={activeJob.outputVideoUrl}
                src={activeJob.outputVideoUrl}
                alt={activeJob.config.positivePrompt}
                className="max-h-[480px] w-full object-contain"
              />
            ) : (
              <video
                key={activeJob.outputVideoUrl}
                src={activeJob.outputVideoUrl}
                controls
                autoPlay
                loop
                className="max-h-[480px] w-full object-contain"
              />
            )}
          </div>

          <div className="flex flex-col justify-between space-y-4 bg-studio-950/60 p-4 rounded-2xl border border-studio-800">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                    activeIsImage
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  }`}
                >
                  {activeIsImage ? '🖼️ 4K Image (MiniMax-H3-Image)' : `🎬 ${activeJob.config.mode.toUpperCase()}`}
                </span>
                <span className="text-xs text-gray-400">
                  {activeJob.config.width}×{activeJob.config.height} • {activeJob.config.steps} Steps
                </span>
              </div>

              <div>
                <span className="text-xs font-semibold text-gray-400 block mb-1">คำสั่ง Prompt</span>
                <p className="text-xs text-gray-200 bg-studio-900 p-3 rounded-xl border border-studio-800 leading-relaxed max-h-36 overflow-y-auto">
                  {activeJob.config.originalThaiPrompt || activeJob.config.positivePrompt}
                </p>
              </div>

              {!activeIsImage && activeJob.config.audioPrompt && (
                <div>
                  <span className="text-xs font-semibold text-indigo-400 mb-1 flex items-center space-x-1">
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>เสียงสเตอริโอ (Audio Prompt)</span>
                  </span>
                  <p className="text-xs text-indigo-200 bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-900/50">
                    {activeJob.config.audioPrompt}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-3 border-t border-studio-800">
              {/* 1-Click Send 4K Image to Video I2V */}
              {activeIsImage && onSendImageToVideo && (
                <button
                  onClick={() =>
                    onSendImageToVideo(
                      activeJob.outputVideoUrl!,
                      activeJob.outputFilename || 'minimax_4k.png',
                      activeJob.config.positivePrompt
                    )
                  }
                  className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white text-xs font-bold transition shadow-md"
                >
                  <Wand2 className="w-4 h-4" />
                  <span>🎬 นำภาพ 4K นี้ไปสร้างวิดีโอต่อ (Send to Video I2V)</span>
                </button>
              )}

              <div className="flex items-center gap-2">
                <a
                  href={activeJob.outputVideoUrl}
                  download={
                    activeJob.outputFilename ||
                    (activeIsImage ? 'minimax_h3_4k.png' : 'studio_video.mp4')
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{activeIsImage ? 'ดาวน์โหลดรูป 4K (PNG)' : 'ดาวน์โหลดวิดีโอ (MP4)'}</span>
                </a>

                <button
                  onClick={() => handleCopy(activeJob.config.positivePrompt, activeJob.id)}
                  className="py-2 px-3 rounded-xl bg-studio-900 hover:bg-studio-800 text-gray-300 border border-studio-800 text-xs flex items-center space-x-1 transition"
                >
                  {copiedId === activeJob.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">คัดลอกแล้ว</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>คัดลอก Prompt</span>
                    </>
                  )}
                </button>

                {activeJob.outputFilename && (
                  <button
                    onClick={() => handleDeleteSingle(activeJob.outputFilename!)}
                    className="p-2 rounded-xl bg-rose-600/15 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs transition"
                    title="ลบไฟล์นี้ทิ้งถาวร"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : activeLocal ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-studio-950 rounded-2xl overflow-hidden border border-studio-800 flex items-center justify-center relative min-h-[320px]">
            {activeIsImage ? (
              <img
                key={activeLocal.url}
                src={activeLocal.url}
                alt={activeLocal.filename}
                className="max-h-[480px] w-full object-contain"
              />
            ) : (
              <video
                key={activeLocal.url}
                src={activeLocal.url}
                controls
                autoPlay
                loop
                className="max-h-[480px] w-full object-contain"
              />
            )}
          </div>

          <div className="flex flex-col justify-between space-y-4 bg-studio-950/60 p-4 rounded-2xl border border-studio-800">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <span
                  className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
                    activeIsImage
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {activeIsImage ? '🖼️ รูปภาพ 4K ในเครื่อง' : '🎬 วิดีโอในเครื่อง'}
                </span>
                <span className="text-xs text-gray-400">{activeLocal.sizeMb} MB</span>
              </div>

              <div>
                <span className="text-xs font-semibold text-gray-400 block mb-1">ชื่อไฟล์</span>
                <p className="text-xs text-gray-200 bg-studio-900 p-2.5 rounded-xl border border-studio-800 font-mono break-all">
                  {activeLocal.filename}
                </p>
              </div>

              {activeLocal.prompt && (
                <div>
                  <span className="text-xs font-semibold text-gray-400 block mb-1">Prompt ที่ใช้สร้าง</span>
                  <p className="text-xs text-gray-200 bg-studio-900 p-2.5 rounded-xl border border-studio-800 font-mono break-words line-clamp-3">
                    {activeLocal.prompt}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-3 border-t border-studio-800">
              {activeIsImage && onSendImageToVideo && (
                <button
                  onClick={() => onSendImageToVideo(activeLocal.url, activeLocal.filename, activeLocal.prompt)}
                  className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white text-xs font-bold transition shadow-md"
                >
                  <Wand2 className="w-4 h-4" />
                  <span>🎬 นำภาพ 4K นี้ไปสร้างวิดีโอต่อ (Send to Video I2V)</span>
                </button>
              )}

              <div className="flex items-center gap-2">
                <a
                  href={activeLocal.url}
                  download={activeLocal.filename}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>ดาวน์โหลดไฟล์ ({activeLocal.sizeMb} MB)</span>
                </a>

                {activeLocal.prompt && (
                  <button
                    onClick={() => handleCopy(activeLocal.prompt!, activeLocal.filename)}
                    className="py-2 px-3 rounded-xl bg-studio-900 hover:bg-studio-800 text-gray-300 border border-studio-800 text-xs flex items-center space-x-1 transition"
                  >
                    {copiedId === activeLocal.filename ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">คัดลอกแล้ว</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>คัดลอก Prompt</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={() => handleDeleteSingle(activeLocal.filename)}
                  className="p-2 rounded-xl bg-rose-600/15 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs transition"
                  title="ลบไฟล์นี้ทิ้งถาวร"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Thumbnail Strip for Session & Saved Files */}
      {(filteredCompleted.length > 0 || filteredLocal.length > 0) && (
        <div className="pt-3 border-t border-studio-800">
          <span className="text-xs text-gray-400 block mb-2 font-semibold">
            คลิกเลือกดูผลงานทั้งหมด ({filteredCompleted.length + filteredLocal.length} รายการ):
          </span>
          <div className="flex items-center gap-2.5 overflow-x-auto pb-2">
            {filteredCompleted.map((item, idx) => {
              const isImg =
                item.config.taskMode === 'image_gen' ||
                item.config.mode === 't2i' ||
                item.config.mode === 'i2i' ||
                isImageFile(item.outputFilename || item.outputVideoUrl);
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedItem(item);
                    setSelectedLocalMedia(null);
                  }}
                  className={`px-3 py-2 rounded-xl border text-left transition shrink-0 max-w-[210px] ${
                    !selectedLocalMedia && activeJob?.id === item.id
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-studio-950 border-studio-800 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <div className="text-xs font-semibold truncate flex items-center space-x-1.5">
                    <span>{isImg ? '🖼️' : '🎬'}</span>
                    <span>
                      #{idx + 1}: {item.config.originalThaiPrompt || item.config.positivePrompt}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {item.config.width}×{item.config.height} • {item.durationSeconds || 0}s
                  </div>
                </button>
              );
            })}

            {filteredLocal.map((lf) => {
              const isImg = !!lf.isImage || isImageFile(lf.filename);
              return (
                <button
                  key={lf.filename}
                  onClick={() => setSelectedLocalMedia(lf)}
                  className={`px-3 py-2 rounded-xl border text-left transition shrink-0 max-w-[220px] ${
                    selectedLocalMedia?.filename === lf.filename
                      ? 'bg-emerald-600/20 border-emerald-500 text-white'
                      : 'bg-studio-950 border-studio-800 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <div className="text-xs font-semibold truncate flex items-center space-x-1.5">
                    <span>{isImg ? '🖼️' : '🎬'}</span>
                    <span>{lf.filename}</span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{lf.sizeMb} MB</div>
                </button>
              );
            })}
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
                  setSelectedLocalMedia(data.videos[0]);
                }
              }
            })
            .catch(() => {});
        }}
      />
    </div>
  );
};
