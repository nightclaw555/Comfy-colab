'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Zap, AlertTriangle, ShieldCheck, Film, DollarSign } from 'lucide-react';

interface CreditMonitorProps {
  isConnected: boolean;
  isSidecarConnected: boolean;
  onEmergencyShutdown: () => void;
  activeJobCount: number;
  isLocal?: boolean;
  gpuName?: string;
}

export const CreditMonitor: React.FC<CreditMonitorProps> = ({
  isConnected,
  isSidecarConnected,
  onEmergencyShutdown,
  activeJobCount,
  isLocal = false,
  gpuName = '',
}) => {
  const TOTAL_MONTHLY_CREDITS = 200;
  const isL4 = gpuName.toLowerCase().includes('l4');
  // L4 uses ~1.8 units/hr, A100 uses ~12.5 units/hr
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
  const costPerVideo = isL4 ? 0.04 : 0.28; // L4 is ~7x cheaper per video
  const estimatedVideosLeft = Math.floor(remainingCredits / costPerVideo);
  const isIdle = !isLocal && isConnected && activeJobCount === 0 && sessionSeconds > 300; // Idle for > 5 min

  return (
    <div className="bg-studio-900 border border-studio-800 rounded-xl p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center space-x-2">
          <Zap className={`w-4 h-4 ${isLocal ? 'text-emerald-400' : 'text-amber-400'}`} />
          <h3 className="text-sm font-semibold text-white">
            {isLocal ? 'Local GPU Studio Monitor' : (isL4 ? 'Colab L4 Credit Guard (1.8 Units/hr - ประหยัดเครดิต 7 เท่า!)' : 'Colab Pro GPU Credit Guard')}
          </h3>
          <span className={`text-[11px] px-2 py-0.5 rounded border ${isLocal ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'}`}>
            {isLocal ? 'Unlimited Free Local Compute' : (isL4 ? 'โหมด L4 ประหยัดเครดิตขั้นสุด' : '200 Units/Month Plan')}
          </span>
        </div>

        {isIdle && (
          <div className="flex items-center space-x-2 px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Colab is idle! Auto-kill active or disconnect now to save units.</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Session Time */}
        <div className="bg-studio-950 p-3 rounded-lg border border-studio-800">
          <div className="flex items-center space-x-1.5 text-xs text-gray-400 mb-1">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>Active Session</span>
          </div>
          <div className="text-base font-bold text-white font-mono">
            {isConnected ? formatTime(sessionSeconds) : '0m 00s'}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {isConnected ? (isLocal ? 'Local Hardware' : `${RATE_PER_HOUR} Units / hr rate`) : 'Stopped'}
          </div>
        </div>

        {/* Units Used */}
        <div className="bg-studio-950 p-3 rounded-lg border border-studio-800">
          <div className="flex items-center space-x-1.5 text-xs text-gray-400 mb-1">
            <Zap className={`w-3.5 h-3.5 ${isLocal ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span>{isLocal ? 'Cost / Credits' : 'Session Consumed'}</span>
          </div>
          <div className={`text-base font-bold font-mono ${isLocal ? 'text-emerald-400' : 'text-amber-400'}`}>
            {isLocal ? '0.00' : totalConsumedCredits.toFixed(3)}{' '}
            <span className="text-xs text-gray-400 font-normal">{isLocal ? 'THB (Free)' : 'units'}</span>
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {isLocal ? '100% Free on Local GPU' : (isL4 ? `L4 ~1.8 U/hr (~$${(totalConsumedCredits * 0.1).toFixed(2)})` : `A100 ~12.5 U/hr (~$${(totalConsumedCredits * 0.1).toFixed(2)})`)}
          </div>
        </div>

        {/* Estimated Videos Remaining */}
        <div className="bg-studio-950 p-3 rounded-lg border border-studio-800">
          <div className="flex items-center space-x-1.5 text-xs text-gray-400 mb-1">
            <Film className="w-3.5 h-3.5 text-emerald-400" />
            <span>Generation Quota</span>
          </div>
          <div className="text-base font-bold text-emerald-400 font-mono">
            {isLocal ? '∞ Unlimited' : `~${estimatedVideosLeft} clips`}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            MiniMax Turbo (6-8 steps)
          </div>
        </div>

        {/* Safety Status */}
        <div className="bg-studio-950 p-3 rounded-lg border border-studio-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-1.5 text-xs text-gray-400 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isLocal ? 'Sidecar Status' : 'Zero-Idle Protection'}</span>
            </div>
            <div className="text-xs text-gray-300 font-medium">
              {isSidecarConnected ? (isLocal ? 'Local Sidecar Online' : 'Auto-Disconnect Ready') : 'Sidecar Offline'}
            </div>
          </div>
          {isConnected && isSidecarConnected && !isLocal && (
            <button
              onClick={onEmergencyShutdown}
              className="mt-2 text-[11px] py-1 px-2 rounded bg-rose-600/80 hover:bg-rose-600 text-white font-medium text-center transition"
            >
              Disconnect GPU Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
