'use client';

import React, { useState } from 'react';
import {
  Film,
  Sparkles,
  ArrowRight,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Play,
  Layers,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Clock,
} from 'lucide-react';
import { ComfyApiClient } from '../lib/comfyApi';

export interface VideoOption {
  id: string;
  filename: string;
  title: string;
  url: string;
}

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableVideos: VideoOption[];
  sidecarUrl: string;
  initialVideo1?: string;
  initialVideo2?: string;
  onMergedSuccess?: (newVideo: { filename: string; url: string; sizeMb: number }) => void;
}

export const MergeModal: React.FC<MergeModalProps> = ({
  isOpen,
  onClose,
  availableVideos,
  sidecarUrl,
  initialVideo1,
  initialVideo2,
  onMergedSuccess,
}) => {
  const [mergeMode, setMergeMode] = useState<'quick_2' | 'multi_timeline'>('quick_2');

  // Quick 2-clip mode states
  const [video1, setVideo1] = useState<string>(
    initialVideo1 || (availableVideos.length > 0 ? availableVideos[0].filename : '')
  );
  const [video2, setVideo2] = useState<string>(
    initialVideo2 || (availableVideos.length > 1 ? availableVideos[1].filename : '')
  );

  // Multi-clip timeline mode states (for 3 to 24+ clips: 30s, 60s, 120s)
  const [timelineClips, setTimelineClips] = useState<string[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState<string>(
    availableVideos.length > 0 ? availableVideos[0].filename : ''
  );

  const [customName, setCustomName] = useState<string>('');
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergedResult, setMergedResult] = useState<{
    filename: string;
    url: string;
    sizeMb: number;
    durationEstimateSec?: number;
  } | null>(null);

  // Sync initial selections if available
  React.useEffect(() => {
    if (initialVideo1) setVideo1(initialVideo1);
    if (initialVideo2) setVideo2(initialVideo2);
    else if (!video2 && availableVideos.length > 1) {
      const other = availableVideos.find((v) => v.filename !== (initialVideo1 || video1));
      if (other) setVideo2(other.filename);
    }

    // Default timeline initialization
    if (timelineClips.length === 0 && availableVideos.length >= 2) {
      setTimelineClips([
        initialVideo1 || availableVideos[0].filename,
        initialVideo2 || availableVideos[1].filename,
      ]);
    }
  }, [initialVideo1, initialVideo2, availableVideos]);

  if (!isOpen) return null;

  const selectedOpt1 = availableVideos.find((v) => v.filename === video1);
  const selectedOpt2 = availableVideos.find((v) => v.filename === video2);

  // Timeline helpers
  const handleAddToTimeline = () => {
    if (!selectedToAdd) return;
    setTimelineClips((prev) => [...prev, selectedToAdd]);
  };

  const handleAddAllToTimeline = () => {
    setTimelineClips(availableVideos.map((v) => v.filename));
  };

  const handleRemoveFromTimeline = (index: number) => {
    setTimelineClips((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setTimelineClips((prev) => {
      const arr = [...prev];
      const temp = arr[index - 1];
      arr[index - 1] = arr[index];
      arr[index] = temp;
      return arr;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === timelineClips.length - 1) return;
    setTimelineClips((prev) => {
      const arr = [...prev];
      const temp = arr[index + 1];
      arr[index + 1] = arr[index];
      arr[index] = temp;
      return arr;
    });
  };

  const handleMerge = async () => {
    let clipsToMerge: string[] = [];

    if (mergeMode === 'quick_2') {
      if (!video1 || !video2) {
        setError('กรุณาเลือกวิดีโอทั้ง 2 คลิป (คลิปแรก 0-5 วิ และคลิปที่สอง 5-10 วิ)');
        return;
      }
      clipsToMerge = [video1, video2];
    } else {
      if (timelineClips.length < 2) {
        setError('กรุณาเพิ่มคลิปในไทม์ไลน์อย่างน้อย 2 คลิปเพื่อรวมเข้าด้วยกัน');
        return;
      }
      clipsToMerge = timelineClips;
    }

    setIsMerging(true);
    setError(null);
    setMergedResult(null);

    const estDuration = clipsToMerge.length * 5;

    try {
      const outputName = customName.trim()
        ? customName.trim().endsWith('.mp4')
          ? customName.trim()
          : `${customName.trim()}.mp4`
        : `merged_${estDuration}s_${Date.now()}.mp4`;

      const res = await ComfyApiClient.mergeVideos(
        sidecarUrl,
        clipsToMerge,
        undefined,
        outputName
      );

      if (res && res.success) {
        const cleanSidecar = sidecarUrl.replace(/\/+$/, '');
        const directUrl = `${cleanSidecar}${res.url}`;
        let finalUrl = `/api/proxy?targetUrl=${encodeURIComponent(directUrl)}`;

        // Auto-save merged video directly into G:\ComfyUI_Studio\outputs
        try {
          const saveRes = await fetch('/api/gdrive-videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ remoteUrl: directUrl, filename: res.filename }),
          });
          if (saveRes.ok) {
            const saveData = await saveRes.json();
            if (saveData.savedLocally && saveData.localUrl) {
              finalUrl = saveData.localUrl;
            }
          }
        } catch (_) {}

        const resultObj = {
          filename: res.filename,
          url: finalUrl,
          sizeMb: res.size_mb,
          durationEstimateSec: estDuration,
        };

        setMergedResult(resultObj);
        if (onMergedSuccess) onMergedSuccess(resultObj);
      } else {
        throw new Error('การรวมไฟล์ไม่สำเร็จ กรุณาตรวจสอบว่ามีไฟล์วิดีโออยู่ในโฟลเดอร์ outputs');
      }
    } catch (err: any) {
      setError(err?.message || 'เกิดข้อผิดพลาดในการรวมคลิปผ่าน FFmpeg บน Colab');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-studio-900 border border-studio-750 rounded-2xl shadow-2xl p-6 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-800 pb-4 mb-4 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <span>ระบบต่อรวมคลิปวิดีโอ (Video Stitcher)</span>
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Lossless FFmpeg
                </span>
              </h3>
              <p className="text-xs text-gray-400">
                รวมคลิปช็อตละ 5 วินาทีเข้าด้วยกันเป็นคลิปยาว (10s, 30s, 1 นาที, หรือ 2 นาที)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-studio-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        {!mergedResult && (
          <div className="flex items-center space-x-2 bg-studio-950 p-1 rounded-xl border border-studio-800 mb-4 shrink-0">
            <button
              type="button"
              onClick={() => setMergeMode('quick_2')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition ${
                mergeMode === 'quick_2'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>⚡ รวม 2 คลิปแบบเร็ว (10 วินาที)</span>
            </button>

            <button
              type="button"
              onClick={() => setMergeMode('multi_timeline')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition ${
                mergeMode === 'multi_timeline'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>🎞️ ไทม์ไลน์ต่อคลิปยาว (30s, 1–2 นาที)</span>
            </button>
          </div>
        )}

        {/* Success View */}
        {mergedResult ? (
          <div className="space-y-4 py-2 overflow-y-auto">
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  รวมคลิปสำเร็จ 100%! ความยาวรวม ~{mergedResult.durationEstimateSec || 10} วินาที (ขนาดไฟล์ {mergedResult.sizeMb} MB)
                </span>
              </div>
            </div>

            {/* Video Player Preview */}
            <div className="rounded-xl overflow-hidden border border-studio-800 bg-black flex items-center justify-center max-h-[340px]">
              <video
                src={mergedResult.url}
                controls
                autoPlay
                className="w-full max-h-[340px] object-contain"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <a
                href={mergedResult.url}
                download={mergedResult.filename}
                className="flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs transition shadow-lg shadow-emerald-600/20"
              >
                <Download className="w-4 h-4" />
                <span>ดาวน์โหลดคลิปฉบับเต็ม ({mergedResult.filename})</span>
              </a>

              <button
                type="button"
                onClick={() => setMergedResult(null)}
                className="px-4 py-2.5 rounded-xl bg-studio-800 hover:bg-studio-700 text-gray-300 hover:text-white border border-studio-700 text-xs font-medium transition"
              >
                รวมชุดอื่นต่อ
              </button>
            </div>
          </div>
        ) : (
          /* Selection & Merge Form */
          <div className="space-y-4 overflow-y-auto pr-1">
            {/* Quick 2-clip Mode */}
            {mergeMode === 'quick_2' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                {/* Slot 1: First 5s */}
                <div className="bg-studio-950 p-4 rounded-xl border border-studio-800 space-y-2">
                  <span className="text-xs font-semibold text-indigo-400 flex items-center space-x-1.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px] font-bold">1</span>
                    <span>คลิปท่อนแรก (0 – 5 วินาที)</span>
                  </span>

                  <select
                    value={video1}
                    onChange={(e) => setVideo1(e.target.value)}
                    className="w-full bg-studio-900 border border-studio-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
                  >
                    {availableVideos.map((v) => (
                      <option key={v.id} value={v.filename}>
                        {v.filename} ({v.title.slice(0, 30)}...)
                      </option>
                    ))}
                  </select>

                  {selectedOpt1?.url && (
                    <div className="rounded-lg overflow-hidden border border-studio-800 bg-black/40 h-24 flex items-center justify-center">
                      <video src={selectedOpt1.url} className="w-full h-full object-cover" muted />
                    </div>
                  )}
                </div>

                {/* Slot 2: Next 5s */}
                <div className="bg-studio-950 p-4 rounded-xl border border-studio-800 space-y-2">
                  <span className="text-xs font-semibold text-purple-400 flex items-center space-x-1.5">
                    <span className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] font-bold">2</span>
                    <span>คลิปท่อนต่อ (5 – 10 วินาที)</span>
                  </span>

                  <select
                    value={video2}
                    onChange={(e) => setVideo2(e.target.value)}
                    className="w-full bg-studio-900 border border-studio-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500"
                  >
                    {availableVideos.map((v) => (
                      <option key={v.id} value={v.filename}>
                        {v.filename} ({v.title.slice(0, 30)}...)
                      </option>
                    ))}
                  </select>

                  {selectedOpt2?.url && (
                    <div className="rounded-lg overflow-hidden border border-studio-800 bg-black/40 h-24 flex items-center justify-center">
                      <video src={selectedOpt2.url} className="w-full h-full object-cover" muted />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Multi-Clip Timeline Mode (30s, 60s, 120s) */}
            {mergeMode === 'multi_timeline' && (
              <div className="space-y-3 bg-studio-950/70 p-4 rounded-xl border border-studio-800">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-studio-800 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold text-white">
                      ลำดับช็อตบนไทม์ไลน์ ({timelineClips.length} ช็อต)
                    </span>
                    <span className="text-[11px] font-mono text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">
                      รวม ~{timelineClips.length * 5} วินาที ({((timelineClips.length * 5) / 60).toFixed(1)} นาที)
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={handleAddAllToTimeline}
                      className="text-[10px] px-2 py-1 rounded bg-studio-900 hover:bg-studio-800 text-gray-300 border border-studio-700 transition"
                      title="เพิ่มคลิปทั้งหมดที่มีในแกลเลอรีเข้าไทม์ไลน์ตามลำดับ"
                    >
                      + เพิ่มทั้งหมด
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimelineClips([])}
                      className="text-[10px] px-2 py-1 rounded bg-studio-900 hover:bg-rose-950/50 text-gray-400 hover:text-rose-300 border border-studio-700 transition"
                    >
                      ล้าง
                    </button>
                  </div>
                </div>

                {/* Add Clip Bar */}
                <div className="flex items-center gap-2">
                  <select
                    value={selectedToAdd}
                    onChange={(e) => setSelectedToAdd(e.target.value)}
                    className="flex-1 bg-studio-900 border border-studio-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500"
                  >
                    {availableVideos.map((v) => (
                      <option key={v.id} value={v.filename}>
                        {v.filename}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddToTimeline}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center space-x-1 shrink-0 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่มเข้าไทม์ไลน์</span>
                  </button>
                </div>

                {/* Timeline Items List */}
                {timelineClips.length === 0 ? (
                  <p className="text-xs text-gray-500 py-6 text-center">
                    ยังไม่มีคลิปในไทม์ไลน์ เลือกคลิปด้านบนแล้วกด "เพิ่มเข้าไทม์ไลน์"
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {timelineClips.map((fname, idx) => (
                      <div
                        key={`${fname}-${idx}`}
                        className="flex items-center justify-between p-2 rounded-lg bg-studio-900 border border-studio-800 hover:border-purple-500/40 text-xs transition"
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-mono text-gray-300 truncate max-w-[280px]">
                            {fname}
                          </span>
                          <span className="text-[10px] text-gray-500 font-mono shrink-0">
                            ({idx * 5}s – {(idx + 1) * 5}s)
                          </span>
                        </div>

                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMoveUp(idx)}
                            disabled={idx === 0}
                            className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-20"
                            title="เลื่อนขึ้น"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveDown(idx)}
                            disabled={idx === timelineClips.length - 1}
                            className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-20"
                            title="เลื่อนลง"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromTimeline(idx)}
                            className="p-1 rounded text-gray-500 hover:text-rose-400"
                            title="ลบออกจากไทม์ไลน์"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Custom Filename */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                ชื่อไฟล์ผลลัพธ์ (Optional)
              </label>
              <input
                type="text"
                placeholder={
                  mergeMode === 'quick_2'
                    ? 'เช่น tiktok_ad_10s_final.mp4'
                    : `เช่น story_${timelineClips.length * 5}s_master.mp4`
                }
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full px-3 py-1.5 bg-studio-950 border border-studio-750 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-studio-800">
              <button
                type="button"
                onClick={onClose}
                disabled={isMerging}
                className="px-4 py-2 rounded-xl bg-studio-800 hover:bg-studio-750 text-gray-300 text-xs font-medium transition"
              >
                ยกเลิก
              </button>

              <button
                type="button"
                onClick={handleMerge}
                disabled={
                  isMerging ||
                  (mergeMode === 'quick_2' ? !video1 || !video2 : timelineClips.length < 2)
                }
                className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/25 transition disabled:opacity-50"
              >
                {isMerging ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>กำลังผสานวิดีโอ (Lossless FFmpeg)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {mergeMode === 'quick_2'
                        ? 'รวมคลิปเป็น 10 วินาทีทันที'
                        : `รวม ${timelineClips.length} คลิป (~${timelineClips.length * 5} วินาที) ทันที`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
