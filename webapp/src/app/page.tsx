'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Header } from '../components/Header';
import { CreditMonitor } from '../components/CreditMonitor';
import { PromptStudio } from '../components/PromptStudio';
import { BatchQueuePanel } from '../components/BatchQueuePanel';
import { VideoGallery } from '../components/VideoGallery';
import { ConsoleDrawer } from '../components/ConsoleDrawer';
import { ComfyApiClient } from '../lib/comfyApi';
import { buildComfyPrompt } from '../lib/workflowBuilder';
import { ConnectionConfig, PromptConfig, QueueItem } from '../types';

export default function StudioDashboard() {
  const [connection, setConnection] = useState<ConnectionConfig>({
    comfyUrl: '',
    sidecarUrl: '',
    isConnected: false,
    isSidecarConnected: false,
  });

  const [isConnecting, setIsConnecting] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  // DEFAULT TO FALSE TO PREVENT PREMATURE TERMINATION
  const [autoShutdownOnFinish, setAutoShutdownOnFinish] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'success' | 'warn' } | null>(null);

  const isProcessingRef = useRef(isProcessing);
  isProcessingRef.current = isProcessing;

  useEffect(() => {
    const savedComfy = localStorage.getItem('comfy_url') || 'https://comfy-api.ayaigaldie.site';
    const savedSidecar = localStorage.getItem('sidecar_url') || 'https://sidecar.ayaigaldie.site';
    if (savedComfy || savedSidecar) {
      setConnection((prev) => ({
        ...prev,
        comfyUrl: savedComfy,
        sidecarUrl: savedSidecar,
      }));
      checkConnections(savedComfy, savedSidecar);
    }
  }, []);

  const showNotification = (message: string, type: 'info' | 'success' | 'warn' = 'info') => {
    setNotification({ message, type });
    // Only auto-dismiss info and success; keep error (warn) visible so user can read/copy
    if (type !== 'warn') {
      setTimeout(() => {
        setNotification((curr) => (curr?.message === message ? null : curr));
      }, 8000);
    }
  };

  const checkConnections = async (comfyUrl: string, sidecarUrl: string) => {
    if (!comfyUrl && !sidecarUrl) return;
    setIsConnecting(true);
    let isComfyOk = false;
    let isSidecarOk = false;
    let gpuStats = undefined;

    if (comfyUrl) {
      isComfyOk = await ComfyApiClient.testComfy(comfyUrl);
    }

    if (sidecarUrl) {
      const sidecarData = await ComfyApiClient.testSidecar(sidecarUrl);
      if (sidecarData) {
        isSidecarOk = true;
        gpuStats = sidecarData.gpu;
      }
    }

    setConnection({
      comfyUrl,
      sidecarUrl,
      isConnected: isComfyOk,
      isSidecarConnected: isSidecarOk,
      gpuStats,
      lastChecked: Date.now(),
    });

    setIsConnecting(false);

    // Always persist URLs to localStorage immediately so they never disappear
    if (comfyUrl) {
      localStorage.setItem('comfy_url', comfyUrl);
    }
    if (sidecarUrl) {
      localStorage.setItem('sidecar_url', sidecarUrl);
    }
  };

  const handleUpdateConnection = (comfyUrl: string, sidecarUrl: string) => {
    checkConnections(comfyUrl, sidecarUrl);
  };

  const handleTriggerKillSwitch = async () => {
    if (!connection.sidecarUrl) {
      alert('Sidecar URL is not configured.');
      return;
    }

    const confirm = window.confirm(
      'Are you sure you want to unassign Google Colab A100 runtime now? This will terminate the instance to stop charging compute units.'
    );
    if (!confirm) return;

    try {
      await ComfyApiClient.triggerShutdown(connection.sidecarUrl);
      showNotification('Google Colab A100 runtime disconnect signal sent. Instance unassigned!', 'success');
      setConnection((prev) => ({
        ...prev,
        isConnected: false,
        isSidecarConnected: false,
      }));
    } catch (err: any) {
      alert(`Failed to trigger shutdown: ${err.message}`);
    }
  };

  const handleAddToQueue = (config: PromptConfig, autoStart: boolean = false) => {
    const newItem: QueueItem = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: Date.now(),
      config,
      status: 'pending',
    };

    setQueue((prev) => [...prev, newItem]);
    showNotification(`Job added to queue! Mode: ${config.mode.toUpperCase()}`, 'info');

    if (autoStart) {
      setTimeout(() => {
        executeBatchQueue([...queue, newItem]);
      }, 100);
    }
  };

  const executeBatchQueue = async (currentQueue: QueueItem[]) => {
    if (isProcessingRef.current) return;
    if (!connection.isConnected) {
      alert('Please connect to ComfyUI (Cloudflare URL) first before running.');
      return;
    }

    setIsProcessing(true);
    let workingQueue = [...currentQueue];
    let anySuccess = false;
    let anyFailed = false;

    for (let i = 0; i < workingQueue.length; i++) {
      const item = workingQueue[i];
      if (item.status !== 'pending') continue;

      const startTime = Date.now();

      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'rendering', error: undefined } : q))
      );

      try {
        let uploadedImageFilename = item.config.inputImageFilename;

        if (item.config.mode === 'i2v' && item.config.inputImageBase64) {
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading' } : q))
          );

          const res = await fetch(item.config.inputImageBase64);
          const blob = await res.blob();
          const file = new File([blob], `input_${item.id}.png`, { type: 'image/png' });
          uploadedImageFilename = await ComfyApiClient.uploadImage(connection.comfyUrl, file);
        }

        const finalConfig = {
          ...item.config,
          inputImageFilename: uploadedImageFilename,
        };

        const promptGraph = buildComfyPrompt(finalConfig);

        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'rendering' } : q))
        );

        // Submit to ComfyUI
        const promptRes = await ComfyApiClient.submitPrompt(connection.comfyUrl, promptGraph);
        
        if (promptRes.error) {
          throw new Error(promptRes.error.message || JSON.stringify(promptRes.error));
        }

        const promptId = promptRes.prompt_id;
        if (!promptId) {
          throw new Error('ComfyUI did not return a valid prompt_id: ' + JSON.stringify(promptRes));
        }

        // Poll history until done (max 10 minutes)
        let isDone = false;
        let pollCount = 0;
        let outputVideoUrl = '';
        let outputFilename = '';
        let outputSubfolder = '';
        let outputType = 'output';

        while (!isDone && pollCount < 150) {
          await new Promise((r) => setTimeout(r, 4000));
          pollCount++;

          let history: any = null;
          try {
            history = await ComfyApiClient.getHistory(connection.comfyUrl, promptId);
          } catch (pollErr) {
            // Ignore transient Cloudflare/timeout errors while GPU is under heavy load
            console.warn('Transient poll error (retrying...):', pollErr);
            continue;
          }

          if (history && history[promptId]) {
            const historyItem = history[promptId];
            if (historyItem.status && historyItem.status.status_str === 'error') {
              const errEntry = historyItem.status.messages?.find((m: any) => m[0] === 'execution_error');
              let detail = errEntry?.[1]
                ? `[Node ${errEntry[1].node_id} (${errEntry[1].node_type})]: ${errEntry[1].exception_message}`
                : JSON.stringify(historyItem.status.messages);

              if (connection.sidecarUrl) {
                try {
                  const logData = await ComfyApiClient.getComfyLogs(connection.sidecarUrl, 60);
                  if (logData?.recent_errors && logData.recent_errors.length > 0) {
                    detail += `\n\n[Colab Console Traceback]:\n` + logData.recent_errors[logData.recent_errors.length - 1];
                  }
                } catch (_) {}
              }
              throw new Error(`ComfyUI Execution Error: ${detail}`);
            }

            const outputs = historyItem.outputs;
            if (outputs) {
              for (const nodeId of Object.keys(outputs)) {
                const nodeOutput = outputs[nodeId];
                if (nodeOutput.videos && nodeOutput.videos.length > 0) {
                  const vid = nodeOutput.videos[0];
                  outputFilename = vid.filename;
                  outputSubfolder = vid.subfolder || '';
                  outputType = vid.type || 'output';
                  outputVideoUrl = ComfyApiClient.getMediaUrl(
                    connection.comfyUrl,
                    vid.filename,
                    vid.subfolder,
                    vid.type
                  );
                  isDone = true;
                  break;
                }
                if (nodeOutput.gifs && nodeOutput.gifs.length > 0) {
                  const gif = nodeOutput.gifs[0];
                  outputFilename = gif.filename;
                  outputSubfolder = gif.subfolder || '';
                  outputType = gif.type || 'output';
                  outputVideoUrl = ComfyApiClient.getMediaUrl(
                    connection.comfyUrl,
                    gif.filename,
                    gif.subfolder,
                    gif.type
                  );
                  isDone = true;
                  break;
                }
                if (nodeOutput.images && nodeOutput.images.length > 0) {
                  const img = nodeOutput.images[0];
                  outputFilename = img.filename;
                  outputSubfolder = img.subfolder || '';
                  outputType = img.type || 'output';
                  outputVideoUrl = ComfyApiClient.getMediaUrl(
                    connection.comfyUrl,
                    img.filename,
                    img.subfolder,
                    img.type
                  );
                  isDone = true;
                  break;
                }
              }
            }
          }
        }

        const durationSeconds = Math.round((Date.now() - startTime) / 1000);

        if (isDone && outputVideoUrl) {
          // ดึงไฟล์วิดีโอมาเซฟลงเครื่อง Local (`outputs/`) และสั่ง Browser Auto-Download ทันที
          // เพื่อให้ไฟล์ปลอดภัยในเครื่อง 100% ก่อนที่ระบบจะสั่งตัด Colab A100!
          showNotification(`กำลังดาวน์โหลดวิดีโอ ${outputFilename} เก็บลงเครื่องอัตโนมัติ...`, 'info');
          const savedResult = await ComfyApiClient.saveVideoToLocalAndBrowser(
            connection.comfyUrl,
            outputFilename,
            outputSubfolder,
            outputType
          );

          anySuccess = true;
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: 'completed',
                    outputVideoUrl: savedResult.finalVideoUrl || outputVideoUrl,
                    outputFilename,
                    durationSeconds,
                  }
                : q
            )
          );

          // จัดการกรณี Multi-Shot Sequential Extension (5s + 5s + 5s...)
          if (item.config.storyGroupId) {
            // 1. ถ้าเป็นกลยุทธ์ Last Frame Chaining: สกัดเฟรมสุดท้ายเพื่อส่งให้ช็อตถัดไป
            if (item.config.extensionStrategy === 'last_frame' && connection.sidecarUrl && outputFilename) {
              try {
                showNotification(`📸 ดึงเฟรมสุดท้ายของช็อต ${item.config.currentSegmentIndex} เพื่อใช้เป็น First Frame ของช็อตถัดไป...`, 'info');
                const frameRes = await ComfyApiClient.extractLastFrame(connection.sidecarUrl, outputFilename);
                if (frameRes && frameRes.input_filename) {
                  const nextIndex = i + 1;
                  if (nextIndex < workingQueue.length && workingQueue[nextIndex].config.storyGroupId === item.config.storyGroupId) {
                    workingQueue[nextIndex].config.inputImageFilename = frameRes.input_filename;
                    workingQueue[nextIndex].config.mode = 'i2v';
                    setQueue((prev) =>
                      prev.map((q) =>
                        q.id === workingQueue[nextIndex].id
                          ? {
                              ...q,
                              config: {
                                ...q.config,
                                inputImageFilename: frameRes.input_filename,
                                mode: 'i2v',
                              },
                            }
                          : q
                      )
                    );
                  }
                }
              } catch (frameErr) {
                console.warn('Could not extract last frame:', frameErr);
              }
            }

            // 2. ถ้าเป็นช็อตสุดท้ายของเรื่อง: รวมคลิปทุกช็อตเข้าด้วยกันอัตโนมัติ
            const isLastInStory = item.config.currentSegmentIndex === item.config.segmentCount;
            if (isLastInStory && connection.sidecarUrl) {
              try {
                showNotification(`🎬 ครบทั้ง ${item.config.segmentCount} ช็อตแล้ว! กำลังรวมเป็นคลิป ${item.config.totalDurationSeconds}s อัตโนมัติ...`, 'info');
                const priorStoryFilenames = workingQueue
                  .filter((q) => q.config.storyGroupId === item.config.storyGroupId && q.id !== item.id)
                  .map((q) => q.outputFilename)
                  .filter(Boolean) as string[];
                const allStoryFilenames = [...priorStoryFilenames, outputFilename];

                if (allStoryFilenames.length >= 2) {
                  const mergeRes = await ComfyApiClient.mergeVideos(
                    connection.sidecarUrl,
                    allStoryFilenames,
                    undefined,
                    `story_${item.config.totalDurationSeconds}s_${Date.now()}.mp4`
                  );
                  if (mergeRes && mergeRes.success) {
                    showNotification(`🎉 ผสานคลิป ${item.config.totalDurationSeconds} วินาทีสมบูรณ์แบบเรียบร้อย!`, 'info');
                    await ComfyApiClient.saveVideoToLocalAndBrowser(
                      connection.comfyUrl,
                      mergeRes.filename,
                      '',
                      'output'
                    );
                  }
                }
              } catch (mergeErr) {
                console.warn('Auto merge story failed:', mergeErr);
              }
            }
          }

          // พัก 3 วินาทีระหว่างคลิป เพื่อให้ PyTorch เคลียร์ Activation Cache คืนแรมการ์ดจออย่างสมบูรณ์
          await new Promise((r) => setTimeout(r, 3000));
        } else {
          throw new Error('Timed out waiting for video render from ComfyUI');
        }
      } catch (err: any) {
        console.error('Queue execution failed for item:', item.id, err);
        anyFailed = true;
        const errMsg = err?.message || 'Unknown error occurred during generation';
        showNotification(errMsg, 'warn');

        // บันทึก Log Error ลงไฟล์ outputs/generation_errors.log และ webapp/generation_errors.log ทุกครั้ง
        try {
          fetch('/api/log-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              timestamp: new Date().toISOString(),
              itemId: item.id,
              modelEngine: item.config.modelEngine,
              mode: item.config.mode,
              error: errMsg,
              details: {
                prompt: item.config.positivePrompt,
                negativePrompt: item.config.negativePrompt,
                steps: item.config.steps,
                width: item.config.width,
                height: item.config.height,
                cfg: item.config.cfg,
                inputImage: item.config.inputImageFilename || null,
                stack: err?.stack || null
              }
            })
          }).catch((logErr) => console.error('Failed to post error log:', logErr));
        } catch (_) {}

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: 'failed', error: errMsg } : q
          )
        );
      }
    }

    setIsProcessing(false);

    // AUTO-SHUTDOWN GUARD:
    // Only shutdown IF user explicitly enabled it AND at least one job finished successfully AND no errors occurred!
    if (autoShutdownOnFinish && anySuccess && !anyFailed && connection.isSidecarConnected && connection.sidecarUrl) {
      showNotification(
        'Queue finished successfully! Auto-Disconnecting A100 to save compute units...',
        'warn'
      );
      try {
        await ComfyApiClient.triggerShutdown(connection.sidecarUrl);
        setConnection((prev) => ({
          ...prev,
          isConnected: false,
          isSidecarConnected: false,
        }));
      } catch (e) {
        console.error('Auto shutdown failed:', e);
      }
    } else if (anySuccess) {
      showNotification('Video generated successfully!', 'success');
    }
  };

  const completedVideos = queue.filter((i) => i.status === 'completed');

  return (
    <div className="min-h-screen bg-studio-950 text-gray-100 flex flex-col">
      <Header
        connection={connection}
        onUpdateConnection={handleUpdateConnection}
        onRefreshStats={() => checkConnections(connection.comfyUrl, connection.sidecarUrl)}
        onTriggerKillSwitch={handleTriggerKillSwitch}
        isConnecting={isConnecting}
      />

      {notification && (
        <div className={`fixed bottom-6 right-6 z-50 max-w-xl bg-studio-900 border p-4 rounded-xl text-xs flex items-start space-x-3 shadow-2xl animate-in slide-in-from-bottom duration-300 ${
          notification.type === 'warn' ? 'border-rose-500/80 bg-rose-950/60 shadow-rose-950/50' : 'border-indigo-500/50'
        }`}>
          <div
            className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${
              notification.type === 'success'
                ? 'bg-emerald-400 shadow-emerald-400/50 shadow'
                : notification.type === 'warn'
                ? 'bg-rose-400 shadow-rose-400/50 shadow'
                : 'bg-indigo-400 shadow-indigo-400/50 shadow'
            }`}
          />
          <div className="flex-1 text-gray-200 break-words leading-relaxed">
            <div className="flex items-center justify-between mb-1">
              <span className={`font-semibold ${notification.type === 'warn' ? 'text-rose-300' : 'text-indigo-300'}`}>
                {notification.type === 'warn' ? '⚠️ Generation Error' : notification.type === 'success' ? '✅ Notification' : 'ℹ️ Status'}
              </span>
              {notification.type === 'warn' && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(notification.message);
                    alert('Copied error to clipboard!');
                  }}
                  className="text-[10px] underline text-gray-400 hover:text-white ml-2"
                >
                  Copy Error
                </button>
              )}
            </div>
            <div className={notification.type === 'warn' ? 'font-mono text-[11px] bg-black/50 p-2 rounded border border-rose-500/30 max-h-48 overflow-y-auto select-all text-rose-100' : ''}>
              {notification.message}
            </div>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/10 shrink-0 ml-1"
            title="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6 flex-1">
        <CreditMonitor
          isConnected={connection.isConnected}
          isSidecarConnected={connection.isSidecarConnected}
          onEmergencyShutdown={handleTriggerKillSwitch}
          activeJobCount={isProcessing ? 1 : 0}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <PromptStudio
              onAddToQueue={handleAddToQueue}
              isConnected={connection.isConnected}
            />

            <VideoGallery
              completedItems={completedVideos}
              sidecarUrl={connection.sidecarUrl}
            />
          </div>

          <div className="lg:col-span-4 space-y-6">
            <BatchQueuePanel
              queue={queue}
              isProcessing={isProcessing}
              autoShutdownOnFinish={autoShutdownOnFinish}
              setAutoShutdownOnFinish={setAutoShutdownOnFinish}
              onStartQueue={() => executeBatchQueue(queue)}
              onClearQueue={() => setQueue([])}
              onRemoveItem={(id) => setQueue((prev) => prev.filter((i) => i.id !== id))}
              isConnected={connection.isConnected}
            />

            <div className="bg-studio-900 border border-studio-800 rounded-xl p-4 text-xs space-y-2 text-gray-400">
              <h5 className="font-semibold text-gray-200">Colab 200 Units Pro Tips</h5>
              <ul className="list-disc list-inside space-y-1 text-gray-400 leading-relaxed">
                <li>
                  <strong className="text-gray-300">Safe Disconnect:</strong> Colab will only auto-disconnect if you check the box and your batch succeeds with 0 errors.
                </li>
                <li>
                  <strong className="text-gray-300">Offline Preparation:</strong> You can add multiple videos to the batch queue while Colab is turned off.
                </li>
                <li>
                  <strong className="text-gray-300">MiniMax Turbo:</strong> Steps set to 6–8 provide studio motion with synchronized sound in ~45-60s on A100.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-studio-850 py-4 text-center text-xs text-gray-500">
        MiniMax-H3 Turbo Studio • High-Performance Colab A100 SSD Pipeline • Zero-Drive Direct Local Save
      </footer>

      {/* Real-time Colab Console Drawer */}
      <ConsoleDrawer
        sidecarUrl={connection.sidecarUrl}
        isSidecarConnected={connection.isSidecarConnected}
        isRendering={isProcessing}
      />
    </div>
  );
}
