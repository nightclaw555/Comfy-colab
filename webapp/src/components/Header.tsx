'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Activity, ShieldCheck, Power, RefreshCw, Cpu, CheckCircle2, AlertCircle, ExternalLink, Lock } from 'lucide-react';
import { ConnectionConfig, GpuStats } from '../types';

interface HeaderProps {
  connection: ConnectionConfig;
  onUpdateConnection: (comfyUrl: string, sidecarUrl: string) => void;
  onRefreshStats: () => void;
  onTriggerKillSwitch: () => void;
  isConnecting: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  connection,
  onUpdateConnection,
  onRefreshStats,
  onTriggerKillSwitch,
  isConnecting,
}) => {
  const isLocal = connection.comfyUrl?.includes('127.0.0.1') || connection.comfyUrl?.includes('localhost');
  const [showSettings, setShowSettings] = useState(false);
  const [comfyInput, setComfyInput] = useState(connection.comfyUrl || 'https://comfy-api.ayaigaldie.site');
  const [sidecarInput, setSidecarInput] = useState(connection.sidecarUrl || 'https://sidecar.ayaigaldie.site');

  useEffect(() => {
    if (connection.comfyUrl) setComfyInput(connection.comfyUrl);
    if (connection.sidecarUrl) setSidecarInput(connection.sidecarUrl);
  }, [connection.comfyUrl, connection.sidecarUrl]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConnection(comfyInput.trim(), sidecarInput.trim());
    setShowSettings(false);
  };

  return (
    <header className="border-b border-studio-800 bg-studio-900/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold tracking-tight text-white">
                MiniMax-H3 <span className="text-indigo-400">Turbo Studio</span>
              </h1>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${isLocal ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>
                {isLocal ? 'Local PC Mode' : 'A100 Pro'}
              </span>
            </div>
            <p className="text-xs text-gray-400">Uncensored Audio-Video Studio Pipeline</p>
          </div>
        </div>

        {/* Live GPU & Connection Status */}
        <div className="flex items-center space-x-3 text-sm">
          {connection.isConnected ? (
            <div className="flex items-center space-x-3 bg-studio-850 px-3 py-1.5 rounded-lg border border-studio-700">
              <div className="flex items-center space-x-1.5 text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-medium">{isLocal ? 'Local ComfyUI Connected' : 'A100 Connected'}</span>
              </div>

              {connection.gpuStats && connection.gpuStats.memory_total_mb > 0 && (
                <div className="hidden md:flex items-center space-x-2 text-xs text-gray-300 border-l border-studio-700 pl-3">
                  <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    VRAM: {(connection.gpuStats.memory_used_mb / 1024).toFixed(1)} /{' '}
                    {(connection.gpuStats.memory_total_mb / 1024).toFixed(0)} GB
                  </span>
                  <span className="text-gray-500">({connection.gpuStats.temperature_c}°C)</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded-lg text-xs">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{isLocal ? 'Local ComfyUI Offline' : 'A100 Disconnected (Credits Safe)'}</span>
            </div>
          )}

          {/* Reconnect / Refresh Button */}
          <button
            onClick={onRefreshStats}
            disabled={isConnecting}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white transition border border-indigo-500/30 text-xs font-medium"
            title="Reconnect & Refresh Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin text-indigo-400' : ''}`} />
            <span>{isConnecting ? 'Checking...' : 'Reconnect'}</span>
          </button>

          {/* Quick Open Colab Link (only if in Colab mode) */}
          {!isLocal && (
            <a
              href="https://colab.research.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-studio-800 hover:bg-studio-700 text-gray-200 border border-studio-700 transition"
              title="Open Google Colab to run A100 cells"
            >
              <span>Open Colab</span>
              <ExternalLink className="w-3 h-3 text-gray-400" />
            </a>
          )}

          {/* Setup / Tunnel Settings Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-studio-850 hover:bg-studio-800 text-gray-300 border border-studio-700 transition"
          >
            Settings
          </button>

          {/* Lock Studio Button */}
          <button
            onClick={async () => {
              if (window.confirm('คุณต้องการล็อกหน้าต่าง Studio หรือไม่?')) {
                await fetch('/api/auth', { method: 'DELETE' });
                window.location.href = '/login';
              }
            }}
            className="p-1.5 text-xs font-medium rounded-lg bg-studio-850 hover:bg-studio-800 text-gray-400 hover:text-rose-400 border border-studio-700 transition"
            title="Lock Studio (Logout)"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>

          {/* Emergency Kill Switch Button (Colab mode only) */}
          {connection.isConnected && !isLocal && (
            <button
              onClick={onTriggerKillSwitch}
              disabled={!connection.isSidecarConnected}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600/90 hover:bg-rose-600 text-white shadow-sm transition disabled:opacity-40"
              title="Unassign Colab Runtime immediately to save credit units"
            >
              <Power className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kill Switch (A100)</span>
            </button>
          )}
        </div>
      </div>

      {/* Slide-down Settings modal */}
      {showSettings && (
        <div className="border-t border-studio-800 bg-studio-900 px-4 sm:px-6 py-4 animate-in fade-in duration-200">
          <form onSubmit={handleSave} className="max-w-4xl mx-auto space-y-4">
            {/* Quick Switch Buttons */}
            <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-studio-800">
              <span className="text-xs text-gray-400 mr-1">โหมดการเชื่อมต่อด่วน:</span>
              <button
                type="button"
                onClick={() => {
                  setComfyInput('http://127.0.0.1:8188');
                  setSidecarInput('http://127.0.0.1:8189');
                }}
                className="px-2.5 py-1 text-xs font-medium rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition flex items-center space-x-1"
              >
                <span>🏠 โหมดเครื่องตัวเอง (Local PC - 127.0.0.1)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setComfyInput('https://comfy-api.ayaigaldie.site');
                  setSidecarInput('https://sidecar.ayaigaldie.site');
                }}
                className="px-2.5 py-1 text-xs font-medium rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 transition flex items-center space-x-1"
              >
                <span>☁️ โหมด Google Colab (Cloudflare)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  1. ComfyUI Endpoint URL (Port 8188)
                </label>
                <input
                  type="text"
                  required
                  placeholder="http://127.0.0.1:8188"
                  value={comfyInput}
                  onChange={(e) => setComfyInput(e.target.value)}
                  className="w-full px-3 py-2 bg-studio-950 border border-studio-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Local: <code className="text-emerald-400">http://127.0.0.1:8188</code> | Colab: <code className="text-indigo-400">https://comfy-api.ayaigaldie.site</code>
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  2. Sidecar Agent URL (Port 8189)
                </label>
                <input
                  type="text"
                  placeholder="http://127.0.0.1:8189"
                  value={sidecarInput}
                  onChange={(e) => setSidecarInput(e.target.value)}
                  className="w-full px-3 py-2 bg-studio-950 border border-studio-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Local: <code className="text-emerald-400">http://127.0.0.1:8189</code> | Colab: <code className="text-emerald-400">https://sidecar.ayaigaldie.site</code>
                </span>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="px-4 py-1.5 text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition"
              >
                Save & Connect
              </button>
            </div>
          </form>
        </div>
      )}
    </header>
  );
};
