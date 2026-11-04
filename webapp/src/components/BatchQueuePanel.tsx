'use client';

import React, { useState } from 'react';
import { 
  ListOrdered, Play, CheckCircle2, Clock, AlertCircle, 
  Trash2, Power, Loader2, Sparkles, Video, Image as ImageIcon,
  FileText, X, Copy
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
  const pendingCount = queue.filter((i) => i.status === 'pending').length;
  const completedCount = queue.filter((i) => i.status === 'completed').length;
  const currentRunning = queue.find((i) => i.status === 'rendering' || i.status === 'uploading');

  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logContent, setLogContent] = useState<string>('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const fetchErrorLogs = async () => {
    setIsLoadingLogs(true);
    setShowLogsModal(true);
    try {
      const res = await fetch('/api/log-error');
      const data = await res.json();
      setLogContent(data.logs || 'No error logs recorded yet. Everything is clean!');
    } catch (e: any) {
      setLogContent(`Failed to read log file: ${e.message}`);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  return (
    <div className="bg-studio-900 border border-studio-800 rounded-xl p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-800 pb-3">
        <div className="flex items-center space-x-2">
          <ListOrdered className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">Batch Queue Manager</h3>
          <span className="px-2 py-0.5 rounded-full bg-studio-800 text-gray-300 text-xs font-mono">
            {queue.length} items
          </span>
        </div>

        {/* Auto-Shutdown Toggle */}
        <div className="flex items-center space-x-2 bg-studio-950 px-3 py-1.5 rounded-lg border border-studio-800">
          <Power className={`w-3.5 h-3.5 ${autoShutdownOnFinish ? 'text-emerald-400' : 'text-gray-500'}`} />
          <label htmlFor="autoShutdown" className="text-xs text-gray-300 cursor-pointer select-none">
            Auto-Disconnect A100 when finished
          </label>
          <input
            type="checkbox"
            id="autoShutdown"
            checked={autoShutdownOnFinish}
            onChange={(e) => setAutoShutdownOnFinish(e.target.checked)}
            className="rounded accent-emerald-500 cursor-pointer ml-1"
          />
        </div>
      </div>

      {/* Control Actions */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">
          {pendingCount > 0 ? (
            <span>
              <strong className="text-white">{pendingCount}</strong> pending{' '}
              (~{pendingCount * 1.2} min on A100)
            </span>
          ) : (
            <span>All tasks completed or queue is empty</span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={fetchErrorLogs}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-studio-850 hover:bg-studio-800 text-gray-400 hover:text-amber-300 transition flex items-center space-x-1 border border-studio-700/50"
            title="ดูประวัติข้อผิดพลาดทั้งหมดที่ระบบบันทึกไว้ใน outputs/generation_errors.log"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span>Error Logs</span>
          </button>

          {queue.length > 0 && !isProcessing && (
            <button
              onClick={onClearQueue}
              className="text-xs px-3 py-1.5 rounded-lg bg-studio-850 hover:bg-studio-800 text-gray-400 hover:text-rose-400 transition flex items-center space-x-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}

          <button
            onClick={onStartQueue}
            disabled={isProcessing || pendingCount === 0 || !isConnected}
            className="flex items-center space-x-2 px-5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white font-semibold text-xs shadow transition"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing Queue...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Batch ({pendingCount})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Queue Items List */}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {queue.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-xs border border-dashed border-studio-800 rounded-xl">
            No items in queue. You can compose and add prompts above even while Colab is offline.
          </div>
        ) : (
          queue.map((item, index) => {
            const isRendering = item.status === 'rendering';
            const isCompleted = item.status === 'completed';
            const isFailed = item.status === 'failed';

            return (
              <div
                key={item.id}
                className={`p-3 rounded-lg border text-xs transition flex items-center justify-between gap-3 ${
                  isRendering
                    ? 'bg-indigo-950/40 border-indigo-500/50 shadow-sm shadow-indigo-500/10'
                    : isCompleted
                    ? 'bg-studio-950/80 border-studio-800/80'
                    : 'bg-studio-950 border-studio-800'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <span className="text-gray-500 font-mono text-[11px] w-4 text-right">
                    #{index + 1}
                  </span>

                  <div className="p-1.5 rounded bg-studio-900 border border-studio-800 text-indigo-400 shrink-0">
                    {item.config.mode === 'i2v' ? (
                      <ImageIcon className="w-3.5 h-3.5" />
                    ) : (
                      <Video className="w-3.5 h-3.5" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-gray-200 font-medium truncate max-w-md">
                      {item.config.positivePrompt}
                    </p>
                    {item.config.originalThaiPrompt && (
                      <p className="text-[11px] text-amber-300/80 truncate max-w-md mt-0.5 flex items-center space-x-1.5">
                        <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded font-mono">TH</span>
                        <span>{item.config.originalThaiPrompt}</span>
                      </p>
                    )}
                    <div className="flex items-center space-x-2 text-[10px] text-gray-400 mt-0.5">
                      <span className={`px-1.5 py-0.2 rounded font-semibold text-[9px] ${
                        item.config.taskMode === 'tiktok'
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : item.config.taskMode === 'nsfw_motion'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      }`}>
                        {item.config.taskMode === 'tiktok'
                          ? '📱 TikTok Ad'
                          : item.config.taskMode === 'nsfw_motion'
                          ? '🔞 NSFW Motion'
                          : '🎬 Music Video'}
                      </span>
                      <span>•</span>
                      <span>{item.config.mode.toUpperCase()}</span>
                      <span>•</span>
                      <span>{item.config.steps} Steps</span>
                      <span>•</span>
                      <span>{item.config.width}x{item.config.height}</span>
                      {item.config.audioPrompt && (
                        <>
                          <span>•</span>
                          <span className="text-indigo-400">Audio Sync</span>
                        </>
                      )}
                      {item.config.generationStyle === 'single_pass_take' && (
                        <>
                          <span>•</span>
                          <span className="text-amber-300 bg-amber-500/20 px-1.5 py-0.2 rounded border border-amber-500/30 text-[9px] font-mono">
                            ⚡ Single-Take {item.config.totalDurationSeconds}s ({item.config.frames}f)
                          </span>
                        </>
                      )}
                      {item.config.storyGroupId && (
                        <>
                          <span>•</span>
                          <span className="text-purple-300 bg-purple-500/20 px-1.5 py-0.2 rounded border border-purple-500/30 text-[9px] font-mono">
                            ช็อต {item.config.currentSegmentIndex}/{item.config.segmentCount} ({item.config.totalDurationSeconds}s)
                          </span>
                        </>
                      )}
                    </div>

                    {/* Persistent Error Card (ไม่หายไป สามารถก็อปปี้ได้ตลอดเวลา) */}
                    {item.status === 'failed' && item.error && (
                      <div className="mt-2 p-2.5 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-200 text-[11px] font-mono select-all break-words max-w-xl">
                        <div className="flex items-center justify-between text-[10px] font-sans font-bold text-rose-400 mb-1">
                          <span className="flex items-center space-x-1">
                            <AlertCircle className="w-3 h-3 text-rose-400" />
                            <span>ข้อผิดพลาด (บันทึกใน Log แล้ว):</span>
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(item.error || '');
                              alert('คัดลอกข้อความ Error เรียบร้อยแล้ว!');
                            }}
                            className="flex items-center space-x-1 underline hover:text-white"
                          >
                            <Copy className="w-2.5 h-2.5" />
                            <span>Copy Error</span>
                          </button>
                        </div>
                        <div className="leading-relaxed bg-black/40 p-2 rounded border border-rose-900/50 whitespace-pre-wrap max-h-48 overflow-y-auto font-mono text-[10px]">
                          {item.error}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status Indicator & Controls */}
                <div className="flex items-center space-x-3 shrink-0">
                  {item.status === 'pending' && (
                    <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px]">
                      Pending
                    </span>
                  )}
                  {item.status === 'uploading' && (
                    <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px]">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Uploading Image</span>
                    </span>
                  )}
                  {item.status === 'rendering' && (
                    <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-[10px] animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Rendering on A100 (~60s)</span>
                    </span>
                  )}
                  {item.status === 'completed' && (
                    <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Ready ({item.durationSeconds ? `${item.durationSeconds}s` : 'Done'})</span>
                    </span>
                  )}
                  {item.status === 'failed' && (
                    <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px]">
                      <AlertCircle className="w-3 h-3" />
                      <span>Failed</span>
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
          <div className="bg-studio-900 border border-studio-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-studio-800 bg-studio-950/60">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Generation Error Logs</h3>
                <span className="text-[10px] text-gray-400 font-mono">
                  outputs/generation_errors.log
                </span>
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
              {isLoadingLogs ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span>Loading log file...</span>
                </div>
              ) : (
                logContent
              )}
            </div>

            <div className="p-3 border-t border-studio-800 bg-studio-950 flex items-center justify-between text-[11px] text-gray-400">
              <span>ไฟล์จะถูกบันทึกอัตโนมัติทุกครั้งที่เกิด Error ไม่สูญหายแม้ปิดแท็บ</span>
              <button
                onClick={() => setShowLogsModal(false)}
                className="px-4 py-1.5 rounded-lg bg-studio-800 hover:bg-studio-700 text-white text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
