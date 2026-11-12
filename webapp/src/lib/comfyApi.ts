import { GpuStats, SidecarHealth } from '../types';

export class ComfyApiClient {
  private static async proxyRequest(targetUrl: string, method: string = 'GET', data?: any) {
    const res = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUrl, method, data }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      let msg = `Request failed with status ${res.status}`;
      
      if (err.node_errors && Object.keys(err.node_errors).length > 0) {
        const details = Object.entries(err.node_errors).map(([nid, info]: [string, any]) => {
          const errList = info.errors?.map((e: any) => e.message || e.details || e.type).join(', ');
          return `Node ${nid} (${info.class_type}): ${errList}`;
        }).join('; ');
        msg = `Validation failed: ${details}`;
      } else if (err.error) {
        if (typeof err.error === 'string') {
          msg = err.error;
        } else if (err.error.message) {
          msg = err.error.message;
          if (err.error.details) msg += ` (${err.error.details})`;
        } else {
          msg = JSON.stringify(err.error);
        }
      }
      throw new Error(msg);
    }
    return res.json();
  }

  static async testComfy(baseUrl: string): Promise<boolean> {
    try {
      const cleanUrl = baseUrl.replace(/\/+$/, '');
      const data = await this.proxyRequest(`${cleanUrl}/system_stats`, 'GET');
      return !!data && (data.system !== undefined || data.devices !== undefined);
    } catch (e) {
      return false;
    }
  }

  static async testSidecar(sidecarUrl: string): Promise<SidecarHealth | null> {
    try {
      const cleanUrl = sidecarUrl.replace(/\/+$/, '');
      const data = await this.proxyRequest(`${cleanUrl}/health`, 'GET');
      if (data && data.status === 'online') {
        return data as SidecarHealth;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  static async submitPrompt(baseUrl: string, promptGraph: Record<string, any>, clientId: string = 'studio_client') {
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    const payload = {
      prompt: promptGraph,
      client_id: clientId,
    };
    const res = await this.proxyRequest(`${cleanUrl}/prompt`, 'POST', payload);
    return res; // returns { prompt_id: "...", number: ... }
  }

  static async getQueue(baseUrl: string) {
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    return this.proxyRequest(`${cleanUrl}/queue`, 'GET');
  }

  static async getHistory(baseUrl: string, promptId: string) {
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    return this.proxyRequest(`${cleanUrl}/history/${promptId}`, 'GET');
  }

  static async triggerShutdown(sidecarUrl: string) {
    const cleanUrl = sidecarUrl.replace(/\/+$/, '');
    return this.proxyRequest(`${cleanUrl}/shutdown`, 'POST', {});
  }

  static async getComfyLogs(sidecarUrl: string, lines: number = 150): Promise<{
    exists: boolean;
    logs: string;
    total_lines: number;
    tail_count: number;
    has_error: boolean;
    recent_errors: string[];
  } | null> {
    try {
      const cleanUrl = sidecarUrl.replace(/\/+$/, '');
      const data = await this.proxyRequest(`${cleanUrl}/logs/comfyui?lines=${lines}`, 'GET');
      return data;
    } catch (e) {
      return null;
    }
  }

  static async mergeVideos(
    sidecarUrl: string,
    video1OrList: string | string[],
    video2?: string,
    outputFilename?: string
  ): Promise<{
    success: boolean;
    filename: string;
    size_mb: number;
    url: string;
    message: string;
  }> {
    const cleanUrl = sidecarUrl.replace(/\/+$/, '');
    const payload: any = {
      output_filename: outputFilename,
    };
    if (Array.isArray(video1OrList)) {
      payload.videos = video1OrList;
    } else {
      payload.video1 = video1OrList;
      payload.video2 = video2;
    }
    return this.proxyRequest(`${cleanUrl}/videos/merge`, 'POST', payload);
  }

  static async extractLastFrame(
    sidecarUrl: string,
    videoFilename: string,
    outputFilename?: string
  ): Promise<{
    success: boolean;
    filename: string;
    input_filename: string;
    url: string;
    message: string;
  }> {
    const cleanUrl = sidecarUrl.replace(/\/+$/, '');
    const payload = {
      video: videoFilename,
      output_filename: outputFilename,
    };
    return this.proxyRequest(`${cleanUrl}/videos/extract_last_frame`, 'POST', payload);
  }

  static getDirectRemoteMediaUrl(baseUrl: string, filename: string, subfolder: string = '', type: string = 'output') {
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    const params = new URLSearchParams({ filename, subfolder, type });
    return `${cleanUrl}/view?${params.toString()}`;
  }

  static getMediaUrl(baseUrl: string, filename: string, subfolder: string = '', type: string = 'output') {
    const remoteUrl = this.getDirectRemoteMediaUrl(baseUrl, filename, subfolder, type);
    return `/api/proxy?targetUrl=${encodeURIComponent(remoteUrl)}`;
  }

  /**
   * Automatically saves the rendered video to:
   * 1. Local project `outputs/` directory (when running locally on PC)
   * 2. Browser's Downloads folder (via Blob download so it works on both Localhost & Vercel before A100 disconnects)
   */
  static async saveVideoToLocalAndBrowser(
    baseUrl: string,
    filename: string,
    subfolder: string = '',
    type: string = 'output',
    metadata?: any
  ): Promise<{ finalVideoUrl: string; savedToDisk: boolean; localPath?: string }> {
    const remoteUrl = this.getDirectRemoteMediaUrl(baseUrl, filename, subfolder, type);
    const proxyMediaUrl = this.getMediaUrl(baseUrl, filename, subfolder, type);
    let finalVideoUrl = proxyMediaUrl;
    let savedToDisk = false;
    let localPath: string | undefined = undefined;

    // 1. Try saving directly to local project `outputs/` folder via Next.js server API
    try {
      const saveRes = await fetch('/api/gdrive-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remoteUrl, filename, metadata }),
      });
      if (saveRes.ok) {
        const saveData = await saveRes.json();
        if (saveData.savedLocally && saveData.localUrl) {
          finalVideoUrl = saveData.localUrl;
          savedToDisk = true;
          localPath = saveData.localPath;
        }
      }
    } catch (e) {
      console.warn('Could not save directly to server disk, falling back to browser download:', e);
    }

    // 2. Only trigger Browser Download (Blob) as a fallback when NOT saved directly to G:\ComfyUI_Studio\outputs
    //    (e.g. when accessing via Vercel from another device) so we don't duplicate downloads on the local PC!
    if (!savedToDisk) {
      try {
        const mediaRes = await fetch(proxyMediaUrl);
        if (mediaRes.ok) {
          const blob = await mediaRes.blob();
          const blobUrl = URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename || `studio_video_${Date.now()}.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          finalVideoUrl = blobUrl;
        }
      } catch (e) {
        console.warn('Browser fallback download failed:', e);
      }
    }

    return { finalVideoUrl, savedToDisk, localPath };
  }

  /**
   * Upload media file (Image or Video) to ComfyUI input directory.
   * Works for both Local ComfyUI (127.0.0.1:8188) and Cloud/Colab (Cloudflare tunnel).
   */
  static async uploadMedia(baseUrl: string, file: File, subfolder: string = ''): Promise<string> {
    const cleanUrl = baseUrl.replace(/\/+$/, '');

    // 1. Try direct upload first (bypasses Vercel 4.5MB payload limit completely if CORS is enabled)
    try {
      const directForm = new FormData();
      directForm.append('image', file);
      directForm.append('overwrite', 'true');
      if (subfolder) directForm.append('subfolder', subfolder);

      const directRes = await fetch(`${cleanUrl}/upload/image`, {
        method: 'POST',
        body: directForm,
      });

      if (directRes.ok) {
        const data = await directRes.json();
        if (data.subfolder && data.subfolder.trim() !== '') {
          return `${data.subfolder}/${data.name}`;
        }
        return data.name || file.name;
      }
    } catch {
      // Direct upload blocked by CORS or network, proceed to proxy fallback below
    }

    // 2. Proxy upload fallback via /api/proxy
    const formData = new FormData();
    formData.append('targetUrl', `${cleanUrl}/upload/image`);
    formData.append('image', file);
    formData.append('overwrite', 'true');
    if (subfolder) {
      formData.append('subfolder', subfolder);
    }

    const res = await fetch('/api/proxy', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      if (res.status === 413) {
        throw new Error(`ไฟล์ (${file.name}) มีขนาดใหญ่เกินไป (> 4.5 MB) ซึ่งติดขีดจำกัดของ Vercel Cloud กรุณาลดขนาดไฟล์ภาพหรือวิดีโอก่อนอัปโหลดครับ`);
      }
      if (res.status === 401) {
        throw new Error('เซสชันความปลอดภัยหมดอายุ กรุณารีเฟรชหน้าเว็บหรือเข้าสู่ระบบใหม่อีกครั้งครับ');
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `ไม่สามารถอัปโหลดไฟล์ (${file.name}) ไปยัง ComfyUI ได้ (HTTP ${res.status})`);
    }
    const data = await res.json();
    if (data.subfolder && data.subfolder.trim() !== '') {
      return `${data.subfolder}/${data.name}`;
    }
    return data.name || file.name;
  }

  static async uploadImage(baseUrl: string, file: File): Promise<string> {
    return this.uploadMedia(baseUrl, file);
  }
}
