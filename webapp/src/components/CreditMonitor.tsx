'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Zap, AlertTriangle, ShieldCheck, Sparkles, Cpu, Power } from 'lucide-react';

interface CreditMonitorProps {
  isConnected: boolean;
  isSidecarConnected: boolean;
  onEmergencyShutdown: () => void;
  activeJobCount: number;
  isLocal?: boolean;
  gpuName?: string;
  vramTotalMb?: number;
}

export const CreditMonitor: React.FC<CreditMonitorProps> = ({
  isConnected,
  isSidecarConnected,
  onEmergencyShutdown,
  activeJobCount,
  isLocal = false,
  gpuName = '',
  vramTotalMb = 0,
}) => {
  const TOTAL_MONTHLY_CREDITS = 200;
  const isL4 = gpuName.toLowerCase().includes('l4');
  const is80GB = vramTotalMb >= 70000 || gpuName.toLowerCase().includes('80gb');
  const RATE_PER_HOUR = isL4 ? 1.8 : 12.5;

  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [totalConsumedCredits, setTotalConsumedCredits] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isConnected) {
      timer = setInterval(() => {
        setSessionSeconds((prev) => {
          const next = prev + 1;
          const consumed = (next / 3600) * RATE_PER_HOUR;
          setTotalConsumedCredits(consumed);
          return next;
        });
      }, 1000);
    } else {
      setSessionSeconds(0);
      setTotalConsumedCredits(0);
    }
    return () => clearInterval(timer);
  }, [isConnected, RATE_PER_HOUR]);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h > 0 ? `${h}h ` : ''}${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const remainingCredits = Math.max(0, TOTAL_MONTHLY_CREDITS - totalConsumedCredits);
  const isIdle = !isLocal && isConnected && activeJobCount === 0 && sessionSeconds > 300;

  return (
    <div className="bg-studio-900/90 border border-studio-800 rounded-2xl px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
      {/* Left: GPU & Auto-Model Detection Badge */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
          isConnected
            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
            : 'bg-studio-950 text-gray-400 border-studio-800'
        }`}>
          <Cpu className={`w-4 h-4 ${isConnected ? 'text-emerald-400' : 'text-gray-500'}`} />
          <span>
            {isConnected
              ? isLocal
                ? 'Local PC GPU Connected'
                : `${gpuName || 'Colab GPU'} (${vramTotalMb ? `${Math.round(vramTotalMb / 1024)}GB` : 'Online'})`
              : 'GPU Offline (สามารถจัดคิวงานล่วงหน้าได้ฟรี)'}
          </span>
        </div>

        {/* Auto-Selected Image Precision Badge */}
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-xs">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-gray-300">ระบบเลือกโมเดลภาพอัตโนมัติ:</span>
          <span className="font-bold text-indigo-300">
            {is80GB
              ? '💎 Master BF16 (40.2GB สำหรับ A100 80GB)'
              : isConnected
              ? '⚡ High-Speed INT8 (21GB)'
              : '🤖 Auto-Detect ตาม VRAM การ์ดจอ'}
          </span>
        </div>

        {isIdle && (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>ไม่มีคิวรันเกิน 5 นาที แนะนำกดตัด Colab เพื่อประหยัดเครดิต</span>
          </div>
        )}
      </div>

      {/* Right: Compact Metrics & Quick Disconnect */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center space-x-1.5 bg-studio-950 px-3 py-1.5 rounded-xl border border-studio-800">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-gray-400">เวลาออนไลน์:</span>
          <span className="font-mono font-bold text-white">
            {isConnected ? formatTime(sessionSeconds) : '0m 00s'}
          </span>
        </div>

        {!isLocal && (
          <div className="flex items-center space-x-1.5 bg-studio-950 px-3 py-1.5 rounded-xl border border-studio-800">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-gray-400">เครดิตที่ใช้:</span>
            <span className="font-mono font-bold text-amber-300">
              {totalConsumedCredits.toFixed(2)} Units
            </span>
            <span className="text-gray-500 hidden sm:inline">
              (เหลือ ~{remainingCredits.toFixed(0)} U)
            </span>
          </div>
        )}

        <div className="flex items-center space-x-1.5 bg-studio-950 px-3 py-1.5 rounded-xl border border-studio-800">
          <ShieldCheck className={`w-3.5 h-3.5 ${isSidecarConnected ? 'text-emerald-400' : 'text-gray-500'}`} />
          <span className="text-gray-300">
            {isSidecarConnected ? 'Auto-Kill พร้อมทำงาน' : 'Kill-Switch Standby'}
          </span>
        </div>

        {isConnected && isSidecarConnected && !isLocal && (
          <button
            onClick={onEmergencyShutdown}
            className="flex items-center space-x-1.5 py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold transition shadow-sm"
          >
            <Power className="w-3.5 h-3.5" />
            <span>ตัด Colab ทันที</span>
          </button>
        )}
      </div>
    </div>
  );
};
