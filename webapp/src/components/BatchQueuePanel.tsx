'use client';

import React, { useState } from 'react';
import {
  ListOrdered,
  Play,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Power,
  Loader2,
  Video,
  Image as ImageIcon,
  FileText,
  X,
  Copy,
} from 'lucide-react';
import { QueueItem } from '../types';

interface BatchQueuePanelProps {
  queue: QueueItem[];
  isProcessing: boolean;
  autoShutdownOnFinish: boolean;
  setAutoShutdownOnFinish: (val: boolean) => void;
  onStartQueue: () => void;
  onClearQueue: () => void;
  onRemoveItem: (id: string) => void;
  isConnected: boolean;
}

export const BatchQueuePanel: React.FC<BatchQueuePanelProps> = ({
  queue,
  isProcessing,
  autoShutdownOnFinish,
  setAutoShutdownOnFinish,
  onStartQueue,
  onClearQueue,
  onRemoveItem,
  isConnected,
}) => {
  const pendingItems = queue.filter((i) => i.status === 'pending');
  const pendingCount = pendingItems.length;

  // Estimate total time: ~8 seconds per 4K image, ~55 seconds per video
  const estimatedSeconds = pendingItems.reduce((acc, item) => {
    const isImg = item.config.taskMode === 'image_gen' || item.config.mode === 't2i' || item.config.mode === 'i2i';
    return acc + (isImg ? 8 : 55);
  }, 0);

  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logContent, setLogContent] = useState<string>('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const fetchErrorLogs = async () => {
    setIsLoadingLogs(true);
    setShowLogsModal(true);
    try {
      const res = await fetch('/api/log-error');
      const data = await res.json();
      setLogContent(data.logs || 'ยังไม่มีประวัติข้อผิดพลาด ระบบทำงานปกติครับ!');
    } catch (e: any) {
      setLogContent(`Failed to read log file: ${e.message}`);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  return (
    <div className="bg-studio-900 border border-studio-800 rounded-2xl p-4 shadow-sm space-y-3.5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-studio-800 pb-3">
        <div className="flex items-center space-x-2">
          <ListOrdered className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">คิวงานที่รอประมวลผล (Batch Queue)</h3>
          <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-xs font-mono">
            {queue.length} รายการ
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={fetchErrorLogs}
            className="text-xs px-2.5 py-1 rounded-lg bg-studio-950 hover:bg-studio-800 text-gray-400 hover:text-amber-300 transition flex items-center space-x-1 border border-studio-800"
            title="ดูประวัติข้อผิดพลาด"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span>Error Logs</span>
          </button>

          {queue.length > 0 && !isProcessing && (
            <button
              onClick={onClearQueue}
              className="text-xs px-2.5 py-1 rounded-lg bg-studio-950 hover:bg-studio-800 text-gray-400 hover:text-rose-400 transition flex items-center space-x-1 border border-studio-800"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>ล้างคิว</span>
            </button>
          )}
        </div>
      </div>

      {/* Auto-Shutdown Protection Banner */}
      <label
        htmlFor="autoShutdown"
        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
          autoShutdownOnFinish
            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
            : 'bg-studio-950 border-studio-800 text-gray-300'
        }`}
      >
        <div className="flex items-center space-x-2.5">
          <Power className={`w-4 h-4 ${autoShutdownOnFinish ? 'text-emerald-400' : 'text-gray-500'}`} />
          <div>
            <div className="text-xs font-semibold">ตัดการเชื่อมต่อ Colab อัตโนมัติเมื่อทำคิวเสร็จ</div>
            <div className="text-[11px] text-gray-400">ป้องกันการลืมปิด GPU หลังเรนเดอร์เสร็จครบทุกชิ้น</div>
          </div>
        </div>
        <input
          type="checkbox"
          id="autoShutdown"
          checked={autoShutdownOnFinish}
          onChange={(e) => setAutoShutdownOnFinish(e.target.checked)}
          className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
        />
      </label>

      {/* Start Batch Button */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="text-xs text-gray-400">
          {pendingCount > 0 ? (
            <span>
              รอคิว <strong className="text-white">{pendingCount}</strong> งาน (ใช้เวลารวม ~
              {estimatedSeconds < 60 ? `${estimatedSeconds} วินาที` : `${(estimatedSeconds / 60).toFixed(1)} นาที`})
            </span>
          ) : (
            <span>ไม่มีงานค้างในคิว</span>
          )}
        </div>

        <button
          onClick={onStartQueue}
          disabled={isProcessing || pendingCount === 0 || !isConnected}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs shadow-md shadow-emerald-900/20 transition"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>กำลังเรนเดอร์คิว...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>เริ่มรันคิวทั้งหมด ({pendingCount})</span>
            </>
          )}
        </button>
      </div>

      {/* Queue Items List */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {queue.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-xs border border-dashed border-studio-800 rounded-xl">
            ยังไม่มีรายการในคิว คุณสามารถกด <strong>"🚀 สร้างทันที"</strong> หรือกด <strong>"+ เก็บเข้าคิว"</strong> จากขั้นที่ 2 ได้เลยครับ
          </div>
        ) : (
          queue.map((item, index) => {
            const isRendering = item.status === 'rendering';
            const isCompleted = item.status === 'completed';
            const isImageJob =
              item.config.taskMode === 'image_gen' ||
              item.config.mode === 't2i' ||
              item.config.mode === 'i2i';

            return (
              <div
                key={item.id}
                className={`p-3 rounded-xl border text-xs transition flex items-center justify-between gap-2.5 ${
                  isRendering
                    ? 'bg-indigo-950/40 border-indigo-500/50 shadow-sm'
                    : isCompleted
                    ? 'bg-emerald-950/15 border-emerald-500/30'
                    : 'bg-studio-950 border-studio-800'
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <span className="text-gray-500 font-mono text-[11px] w-4 text-right">
                    #{index + 1}
                  </span>

                  <div
                    className={`p-1.5 rounded-lg border shrink-0 ${
                      isImageJob
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                    }`}
                  >
                    {isImageJob ? (
                      <ImageIcon className="w-3.5 h-3.5" />
                    ) : (
                      <Video className="w-3.5 h-3.5" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-gray-200 font-medium truncate max-w-[230px]">
                      {item.config.originalThaiPrompt || item.config.positivePrompt}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-gray-400 mt-0.5">
                      <span
                        className={`px-1.5 py-0.2 rounded font-semibold ${
                          isImageJob
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : item.config.taskMode === 'tiktok'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : item.config.taskMode === 'nsfw_motion'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        }`}
                      >
                        {isImageJob
                          ? '🖼️ รูปภาพ 4K'
                          : item.config.taskMode === 'tiktok'
                          ? '📱 TikTok Ad'
                          : item.config.taskMode === 'nsfw_motion'
                          ? '💃 Motion Mimic'
                          : '🎵 Music Video'}
                      </span>
                      <span>•</span>
                      <span>
                        {item.config.width}×{item.config.height}
                      </span>
                      <span>•</span>
                      <span>{item.config.steps} Steps</span>
                    </div>

                    {item.status === 'failed' && item.error && (
                      <div className="mt-2 p-2 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-200 text-[10px] font-mono select-all break-words">
                        <div className="flex items-center justify-between font-sans font-bold text-rose-400 mb-1">
                          <span>ข้อผิดพลาด:</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(item.error || '');
                              alert('คัดลอกข้อความ Error เรียบร้อยแล้ว!');
                            }}
                            className="underline hover:text-white"
                          >
                            Copy
                          </button>
                        </div>
                        <div className="max-h-28 overflow-y-auto whitespace-pre-wrap">{item.error}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center space-x-2 shrink-0">
                  {item.status === 'pending' && (
                    <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px]">
                      รอคิว
                    </span>
                  )}
                  {item.status === 'uploading' && (
                    <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px]">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>กำลังอัปโหลด...</span>
                    </span>
                  )}
                  {item.status === 'rendering' && (
                    <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 text-[10px] animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>{isImageJob ? 'กำลังเจนรูป (~6s)' : 'กำลังเจนคลิป (~50s)'}</span>
                    </span>
                  )}
                  {item.status === 'completed' && (
                    <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>เสร็จ ({item.durationSeconds ? `${item.durationSeconds}s` : 'Done'})</span>
                    </span>
                  )}
                  {item.status === 'failed' && (
                    <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px]">
                      <AlertCircle className="w-3 h-3" />
                      <span>ผิดพลาด</span>
                    </span>
                  )}

                  {!isRendering && item.status !== 'completed' && (
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      className="text-gray-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Error Logs Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-studio-900 border border-studio-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-4 border-b border-studio-800 bg-studio-950/60">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Generation Error Logs</h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(logContent);
                    alert('คัดลอกประวัติ Error Log ทั้งหมดแล้ว!');
                  }}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-studio-800 hover:bg-studio-700 text-xs text-gray-200 transition"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy All</span>
                </button>
                <button
                  onClick={() => setShowLogsModal(false)}
                  className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-studio-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed bg-black/60 text-gray-200 select-all whitespace-pre-wrap">
              {isLoadingLogs ? 'กำลังโหลด...' : logContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
