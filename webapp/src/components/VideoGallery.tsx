'use client';

import React, { useState } from 'react';
import {
  Film,
  Download,
  Copy,
  Check,
  Volume2,
  HardDrive,
  Layers,
  Sparkles,
  Play,
} from 'lucide-react';
import { QueueItem } from '../types';
import { MergeModal, VideoOption } from './MergeModal';

interface VideoGalleryProps {
  completedItems: QueueItem[];
  sidecarUrl?: string;
}

interface LocalVideoFile {
  filename: string;
  sizeMb: string;
  createdAt: number;
  url: string;
}

export const VideoGallery: React.FC<VideoGalleryProps> = ({ completedItems, sidecarUrl = '' }) => {
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(
    completedItems.length > 0 ? completedItems[0] : null
  );
  const [selectedLocalVideo, setSelectedLocalVideo] = useState<LocalVideoFile | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [localVideos, setLocalVideos] = useState<LocalVideoFile[]>([]);

  // Merge modal state
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergePreselect1, setMergePreselect1] = useState<string | undefined>();
  const [mergePreselect2, setMergePreselect2] = useState<string | undefined>();

  // Fetch local saved videos from project's `outputs/` folder automatically
  React.useEffect(() => {
    fetch('/api/gdrive-videos')
      .then((res) => res.json())
      .then((data) => {
        if (data.videos) {
          setLocalVideos(data.videos);
          if (!selectedLocalVideo && data.videos.length > 0) {
            setSelectedLocalVideo(data.videos[0]);
          }
        }
      })
      .catch(() => {});
  }, [completedItems]);

  // Keep selectedItem synced when a new item finishes
  React.useEffect(() => {
    if (completedItems.length > 0) {
      setSelectedItem(completedItems[completedItems.length - 1]);
      setSelectedLocalVideo(null);
    }
  }, [completedItems.length]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Collect all available video candidates for merging
  const availableVideos: VideoOption[] = [
    ...completedItems
      .filter((i) => i.outputVideoUrl)
      .map((i) => ({
        id: i.id,
        filename: i.outputFilename || `video_${i.id}.mp4`,
        title: i.config.positivePrompt,
        url: i.outputVideoUrl!,
      })),
    ...localVideos.map((lv) => ({
      id: lv.filename,
      filename: lv.filename,
      title: lv.filename,
      url: lv.url,
    })),
  ];

  if (completedItems.length === 0 && localVideos.length === 0) {
    return (
      <div className="bg-studio-900 border border-studio-800 rounded-xl p-8 text-center">
        <Film className="w-10 h-10 text-gray-600 mx-auto mb-2" />
        <h4 className="text-sm font-semibold text-gray-300">Studio Video Gallery (Google Drive G: Auto-Save)</h4>
        <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
          เมื่อเรนเดอร์เสร็จ วิดีโอจะถูกเซฟลงไดรฟ์ความเร็วสูง <code className="text-gray-400">G:\ComfyUI_Studio\outputs</code> อัตโนมัติโดยไม่ต้องกดดาวน์โหลดซ้ำ
        </p>
      </div>
    );
  }

  const activeVideo = selectedLocalVideo ? null : selectedItem || completedItems[0];
  const activeLocal = selectedLocalVideo || (!activeVideo && localVideos.length > 0 ? localVideos[0] : null);

  return (
    <div className="bg-studio-900 border border-studio-800 rounded-xl p-5 shadow-sm space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-800 pb-3">
        <div className="flex items-center space-x-2">
          <Film className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-white">Rendered Studio Outputs</h3>
          <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-mono">
            {Math.max(completedItems.length, localVideos.length)} videos
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3">
          {availableVideos.length >= 2 && (
            <button
              onClick={() => {
                setMergePreselect1(activeVideo?.outputFilename || activeLocal?.filename || availableVideos[0]?.filename);
                setMergePreselect2(availableVideos[1]?.filename);
                setIsMergeModalOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition"
              title="ผสานคลิปช็อตละ 5 วินาทีมารวมกันเป็นคลิปยาว (10s, 30s, 1 นาที หรือ 2 นาที) แบบ Lossless"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>🎬 รวมคลิป / ต่อความยาว (10s – 2 นาที)</span>
            </button>
          )}

          <span className="text-[11px] text-emerald-400 flex items-center space-x-1">
            <HardDrive className="w-3.5 h-3.5" />
            <span>Auto-Saved to G:\ComfyUI_Studio\outputs</span>
          </span>
        </div>
      </div>

      {/* Main Player Display */}
      {activeVideo && activeVideo.outputVideoUrl ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-studio-950 rounded-xl overflow-hidden border border-studio-800 flex items-center justify-center relative">
            <video
              key={activeVideo.outputVideoUrl}
              src={activeVideo.outputVideoUrl}
              controls
              autoPlay
              loop
              className="max-h-[460px] w-full object-contain"
            />
          </div>

          <div className="flex flex-col justify-between space-y-4 bg-studio-950/60 p-4 rounded-xl border border-studio-800">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-semibold">
                  {activeVideo.config.mode.toUpperCase()}
                </span>
                <span className="text-xs text-gray-400">
                  {activeVideo.config.width}x{activeVideo.config.height} • {activeVideo.config.steps} Steps
                </span>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                  Prompt
                </span>
                <p className="text-xs text-gray-200 bg-studio-900 p-2.5 rounded-lg border border-studio-800 leading-relaxed max-h-36 overflow-y-auto">
                  {activeVideo.config.positivePrompt}
                </p>
              </div>

              {activeVideo.config.audioPrompt && (
                <div>
                  <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider block mb-1 flex items-center space-x-1">
                    <Volume2 className="w-3 h-3" />
                    <span>Synchronized Audio</span>
                  </span>
                  <p className="text-xs text-indigo-200 bg-indigo-950/40 p-2 rounded-lg border border-indigo-900/50">
                    {activeVideo.config.audioPrompt}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-studio-800">
              <div className="flex items-center gap-2">
                <a
                  href={activeVideo.outputVideoUrl}
                  download={activeVideo.outputFilename || 'studio_video.mp4'}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save MP4</span>
                </a>

                {availableVideos.length >= 2 && (
                  <button
                    onClick={() => {
                      setMergePreselect1(activeVideo.outputFilename);
                      setIsMergeModalOpen(true);
                    }}
                    className="flex items-center space-x-1 px-3 py-2 rounded-lg bg-studio-850 hover:bg-studio-800 text-purple-300 hover:text-white border border-studio-700 text-xs font-medium transition"
                    title="นำคลิปนี้ไปต่อกับคลิปอื่นให้เป็น 10 วินาที"
                  >
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    <span>ต่อคลิปนี้ (10s)</span>
                  </button>
                )}

                <button
                  onClick={() => handleCopy(activeVideo.config.positivePrompt, activeVideo.id)}
                  className="p-2 rounded-lg bg-studio-850 hover:bg-studio-800 text-gray-300 hover:text-white border border-studio-700 transition"
                  title="Copy Prompt"
                >
                  {copiedId === activeVideo.id ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : activeLocal ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-studio-950 rounded-xl overflow-hidden border border-studio-800 flex items-center justify-center relative">
            <video
              key={activeLocal.url}
              src={activeLocal.url}
              controls
              autoPlay
              loop
              className="max-h-[460px] w-full object-contain"
            />
          </div>
          <div className="bg-studio-950/60 p-4 rounded-xl border border-studio-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-semibold">
                  Saved in Google Drive (G:)
                </span>
              </div>
              <p className="text-xs text-gray-300 font-mono mb-2 break-all">{activeLocal.filename}</p>
              <p className="text-xs text-gray-500">File size: {activeLocal.sizeMb} MB</p>
              <p className="text-xs text-gray-500 mt-2">
                Path: <code className="text-indigo-300">G:\ComfyUI_Studio\outputs\{activeLocal.filename}</code>
              </p>
            </div>

            <div className="space-y-2 mt-4">
              <a
                href={activeLocal.url}
                download={activeLocal.filename}
                className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download MP4</span>
              </a>

              {availableVideos.length >= 2 && (
                <button
                  onClick={() => {
                    setMergePreselect1(activeLocal.filename);
                    setIsMergeModalOpen(true);
                  }}
                  className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg bg-studio-850 hover:bg-studio-800 text-purple-300 hover:text-white border border-studio-700 text-xs font-medium transition"
                >
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>ต่อคลิปนี้กับคลิปอื่น (10s)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Session Videos Strip */}
      {completedItems.length > 1 && (
        <div className="pt-2">
          <span className="text-xs font-medium text-gray-400 mb-2 block">Current Session Videos:</span>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {completedItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedLocalVideo(null);
                  setSelectedItem(item);
                }}
                className={`relative rounded-lg overflow-hidden border shrink-0 w-36 h-24 bg-studio-950 transition text-left group ${
                  !selectedLocalVideo && activeVideo?.id === item.id
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                    : 'border-studio-800 hover:border-studio-700'
                }`}
              >
                {item.outputVideoUrl ? (
                  <video
                    src={item.outputVideoUrl}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100"
                    muted
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                    Video Ready
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-1.5">
                  <span className="text-[10px] text-gray-200 truncate font-medium">
                    {item.config.positivePrompt}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Local Disk Videos Strip */}
      {localVideos.length > 0 && (
        <div className="pt-2 border-t border-studio-800/60">
          <span className="text-xs font-medium text-gray-400 mb-2 block">
            Saved in <code className="text-indigo-300">G:\ComfyUI_Studio\outputs\</code> ({localVideos.length}):
          </span>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {localVideos.map((vid) => (
              <button
                key={vid.filename}
                onClick={() => setSelectedLocalVideo(vid)}
                className={`relative rounded-lg overflow-hidden border shrink-0 w-36 h-24 bg-studio-950 transition text-left group ${
                  activeLocal?.filename === vid.filename
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'border-studio-800 hover:border-studio-700'
                }`}
              >
                <video
                  src={vid.url}
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100"
                  muted
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-1.5">
                  <span className="text-[10px] text-gray-200 truncate font-mono">
                    {vid.filename}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Merge Modal */}
      <MergeModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        availableVideos={availableVideos}
        sidecarUrl={sidecarUrl}
        initialVideo1={mergePreselect1}
        initialVideo2={mergePreselect2}
        onMergedSuccess={(newVid) => {
          fetch('/api/gdrive-videos')
            .then((r) => r.json())
            .then((d) => {
              if (d.videos) setLocalVideos(d.videos);
            })
            .catch(() => {});
        }}
      />
    </div>
  );
};
