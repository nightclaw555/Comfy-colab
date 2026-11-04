'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  AlertTriangle,
  Search,
  Trash2,
  Radio,
  X,
} from 'lucide-react';
import { ComfyApiClient } from '../lib/comfyApi';

interface ConsoleDrawerProps {
  sidecarUrl: string;
  isSidecarConnected: boolean;
  isRendering?: boolean;
}

export const ConsoleDrawer: React.FC<ConsoleDrawerProps> = ({
  sidecarUrl,
  isSidecarConnected,
  isRendering = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<string>('กำลังเชื่อมต่อเพื่ออ่าน Log จาก Google Colab...');
  const [totalLines, setTotalLines] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [recentErrors, setRecentErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [heightMode, setHeightMode] = useState<'compact' | 'standard' | 'expanded'>('standard');
  const [copied, setCopied] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Fetch logs from sidecar
  const fetchLogs = async () => {
    if (!sidecarUrl || !isSidecarConnected) return;

    setIsLoading(true);
    try {
      const data = await ComfyApiClient.getComfyLogs(sidecarUrl, 160);
      if (data) {
        setLogs(data.logs || 'ไม่มีข้อมูล Log');
        setTotalLines(data.total_lines || 0);
        setHasError(data.has_error || false);
        setRecentErrors(data.recent_errors || []);
      }
    } catch (e) {
      console.warn('Error fetching logs:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Poll logs periodically: faster when rendering (2.5s), standard when open (5s)
  useEffect(() => {
    if (!sidecarUrl || !isSidecarConnected) return;

    // Initial fetch
    fetchLogs();

    if (!autoRefresh) return;

    const intervalMs = isRendering ? 2500 : isOpen ? 4500 : 9000;
    const timer = setInterval(() => {
      fetchLogs();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [sidecarUrl, isSidecarConnected, autoRefresh, isRendering, isOpen]);

  // Scroll to bottom when logs update
  useEffect(() => {
    if (autoScroll && isOpen && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen, autoScroll]);

  // Copy logs
  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter lines
  const displayLines = logs.split('\n').filter((line) => {
    if (!filterText.trim()) return true;
    return line.toLowerCase().includes(filterText.toLowerCase());
  });

  // Calculate drawer height
  const heightClass =
    heightMode === 'compact'
      ? 'h-64'
      : heightMode === 'standard'
      ? 'h-96'
      : 'h-[36rem] max-h-[85vh]';

  return (
    <div className="fixed bottom-0 right-4 z-50 transition-all duration-300">
      {/* 1. Collapsed Dock Button (Pill) */}
      {!isOpen && (
        <button
          onClick={() => {
            setIsOpen(true);
            fetchLogs();
          }}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-t-xl shadow-2xl border transition text-xs font-mono font-medium ${
            hasError
              ? 'bg-rose-950/90 text-rose-200 border-rose-600 hover:bg-rose-900'
              : isRendering
              ? 'bg-indigo-950/90 text-indigo-200 border-indigo-500 hover:bg-indigo-900 animate-pulse'
              : 'bg-studio-900/95 text-gray-300 border-studio-700 hover:bg-studio-800'
          }`}
        >
          <Terminal className="w-4 h-4 text-indigo-400" />
          <span>Colab Console</span>

          {isRendering && (
            <span className="flex items-center space-x-1 text-emerald-400 font-sans text-[10px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
              <Radio className="w-3 h-3 animate-spin text-emerald-400" />
              <span>Rendering Live</span>
            </span>
          )}

          {hasError ? (
            <span className="flex items-center space-x-1 text-rose-300 font-sans text-[10px] bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/30">
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              <span>Error Detected</span>
            </span>
          ) : (
            <span className="text-[10px] text-gray-500 font-mono">
              ({totalLines} lines)
            </span>
          )}

          <ChevronUp className="w-3.5 h-3.5 text-gray-400 ml-1" />
        </button>
      )}

      {/* 2. Expanded Terminal Window */}
      {isOpen && (
        <div
          className={`w-[95vw] sm:w-[650px] lg:w-[820px] ${heightClass} flex flex-col bg-studio-950 border border-studio-700 rounded-t-2xl shadow-2xl overflow-hidden backdrop-blur-xl`}
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-studio-900/90 border-b border-studio-800 text-xs">
            <div className="flex items-center space-x-2.5">
              <div className="w-3 h-3 rounded-full bg-rose-500/80 cursor-pointer" onClick={() => setIsOpen(false)} />
              <div
                className="w-3 h-3 rounded-full bg-amber-500/80 cursor-pointer"
                onClick={() =>
                  setHeightMode(heightMode === 'standard' ? 'compact' : 'standard')
                }
              />
              <div
                className="w-3 h-3 rounded-full bg-emerald-500/80 cursor-pointer"
                onClick={() =>
                  setHeightMode(heightMode === 'expanded' ? 'standard' : 'expanded')
                }
              />

              <div className="flex items-center space-x-2 ml-2 font-mono text-gray-200">
                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-semibold">Colab ComfyUI Console</span>
                <span className="text-[10px] text-gray-500 hidden sm:inline">
                  (Port 8188 • {totalLines} lines)
                </span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center space-x-1.5">
              {/* Search input */}
              <div className="relative hidden sm:block">
                <Search className="w-3 h-3 text-gray-500 absolute left-2 top-1.5" />
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="bg-studio-950 border border-studio-700 rounded-md pl-6 pr-2 py-0.5 text-[11px] text-gray-200 focus:outline-none focus:border-indigo-500 w-32"
                />
              </div>

              {/* Refresh button */}
              <button
                type="button"
                onClick={fetchLogs}
                disabled={isLoading}
                title="Refresh logs now"
                className="p-1 rounded hover:bg-studio-800 text-gray-400 hover:text-white transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
              </button>

              {/* Copy button */}
              <button
                type="button"
                onClick={handleCopyLogs}
                title="Copy all logs"
                className="p-1 rounded hover:bg-studio-800 text-gray-400 hover:text-white transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              {/* Height toggle */}
              <button
                type="button"
                onClick={() =>
                  setHeightMode(heightMode === 'expanded' ? 'standard' : 'expanded')
                }
                title="Toggle height"
                className="p-1 rounded hover:bg-studio-800 text-gray-400 hover:text-white transition hidden sm:inline-block"
              >
                {heightMode === 'expanded' ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Minimize / Close */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Minimize console"
                className="p-1 rounded hover:bg-studio-800 text-gray-400 hover:text-rose-400 transition ml-1"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Alert Banner if recent errors detected */}
          {hasError && recentErrors.length > 0 && (
            <div className="bg-rose-950/80 border-b border-rose-800/80 px-4 py-2 flex items-start space-x-2 text-rose-200 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="font-bold text-rose-300">
                  ตรวจพบข้อผิดพลาดล่าสุดใน Colab (Execution Error):
                </span>
                <p className="font-mono text-[11px] text-rose-200/90 truncate mt-0.5">
                  {recentErrors[recentErrors.length - 1]}
                </p>
              </div>
            </div>
          )}

          {/* Terminal Console View */}
          <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed bg-black/95 text-gray-300 select-text">
            {displayLines.length === 0 ? (
              <p className="text-gray-500 italic">ไม่มีข้อมูลที่ตรงกับคำค้นหา: &quot;{filterText}&quot;</p>
            ) : (
              displayLines.map((line, idx) => {
                const lower = line.toLowerCase();
                let colorClass = 'text-gray-300';

                if (
                  lower.includes('error') ||
                  lower.includes('traceback') ||
                  lower.includes('exception') ||
                  lower.includes('outofmemoryerror') ||
                  lower.includes('failed')
                ) {
                  colorClass = 'text-rose-400 font-semibold bg-rose-950/40 px-1 rounded';
                } else if (lower.includes('warning') || lower.includes('deprecated')) {
                  colorClass = 'text-amber-300';
                } else if (
                  lower.includes('download') ||
                  lower.includes('loading') ||
                  lower.includes('fetch') ||
                  lower.includes('step')
                ) {
                  colorClass = 'text-cyan-300';
                } else if (
                  lower.includes('success') ||
                  lower.includes('complete') ||
                  lower.includes('connected') ||
                  lower.includes('start')
                ) {
                  colorClass = 'text-emerald-300';
                }

                return (
                  <div key={idx} className={`whitespace-pre-wrap break-all ${colorClass}`}>
                    {line}
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>

          {/* Bottom Bar within Drawer */}
          <div className="px-4 py-1.5 bg-studio-900 border-t border-studio-800 flex items-center justify-between text-[11px] text-gray-400 font-mono">
            <div className="flex items-center space-x-3">
              <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded accent-indigo-500 w-3 h-3"
                />
                <span>Auto-Scroll</span>
              </label>

              <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded accent-indigo-500 w-3 h-3"
                />
                <span>Auto-Refresh (Live)</span>
              </label>
            </div>

            <span className="text-gray-500 text-[10px]">
              {isRendering ? '⚡ Generating on A100...' : 'Idle'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
