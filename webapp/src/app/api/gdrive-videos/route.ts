import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Primary target: High-Speed Rclone Mounted Google Drive (G:\ComfyUI_Studio\outputs)
// Fallback: Local project's "outputs" directory if G: is not mounted
const FALLBACK_VIDEO_DIR = path.resolve(process.cwd(), '..', 'outputs');

function resolveVideoDir(): string {
  // Check candidate Google Drive paths (Rclone X: or Z:, or Google Drive for Desktop)
  const candidates = [
    'X:\\ComfyUI_Studio\\outputs',
    'Z:\\ComfyUI_Studio\\outputs',
    'G:\\My Drive\\ComfyUI_Studio\\outputs',
    'G:\\MyDrive\\ComfyUI_Studio\\outputs',
    'G:\\ComfyUI_Studio\\outputs',
  ];

  for (const targetDir of candidates) {
    try {
      const parent = path.dirname(targetDir);
      if (fs.existsSync(parent)) {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        return targetDir;
      }
    } catch {
      continue;
    }
  }

  // Fallback to local project's outputs folder
  try {
    if (!fs.existsSync(FALLBACK_VIDEO_DIR)) {
      fs.mkdirSync(FALLBACK_VIDEO_DIR, { recursive: true });
    }
  } catch {}
  return FALLBACK_VIDEO_DIR;
}

function ensureOutputDir(dir: string): boolean {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const VIDEO_DIR = resolveVideoDir();
    const { searchParams } = new URL(req.url);
    const file = searchParams.get('file');

    // If specific file requested, stream the MP4/WebM video directly from G:\ComfyUI_Studio\outputs
    if (file) {
      const safeName = path.basename(file);
      let filePath = path.join(VIDEO_DIR, safeName);
      if (!fs.existsSync(filePath)) {
        const fallbackPath = path.join(FALLBACK_VIDEO_DIR, safeName);
        if (fs.existsSync(fallbackPath)) {
          filePath = fallbackPath;
        } else {
          return new NextResponse('Video not found', { status: 404 });
        }
      }

      const stat = fs.statSync(filePath);
      const fileStream = fs.createReadStream(filePath);
      const ext = path.extname(safeName).toLowerCase();
      const contentType = ext === '.webm' ? 'video/webm' : 'video/mp4';

      return new NextResponse(fileStream as any, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': stat.size.toString(),
          'Accept-Ranges': 'bytes',
          'Content-Disposition': `inline; filename="${safeName}"`,
        },
      });
    }

    // Otherwise, list all videos saved in G:\ComfyUI_Studio\outputs
    if (!ensureOutputDir(VIDEO_DIR) || !fs.existsSync(VIDEO_DIR)) {
      return NextResponse.json({ videos: [], directory: VIDEO_DIR });
    }

    const files = fs
      .readdirSync(VIDEO_DIR)
      .filter((f) => f.toLowerCase().endsWith('.mp4') || f.toLowerCase().endsWith('.webm'))
      .map((filename) => {
        const fullPath = path.join(VIDEO_DIR, filename);
        const stat = fs.statSync(fullPath);
        return {
          filename,
          sizeMb: (stat.size / (1024 * 1024)).toFixed(2),
          createdAt: stat.mtimeMs,
          url: `/api/gdrive-videos?file=${encodeURIComponent(filename)}`,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ videos: files, directory: VIDEO_DIR });
  } catch (e: any) {
    return NextResponse.json({ videos: [], error: e.message }, { status: 200 });
  }
}

/**
 * POST /api/gdrive-videos
 * Saves a rendered video directly into G:\ComfyUI_Studio\outputs (or skips download if Colab Rclone already synced it there).
 */
export async function POST(req: NextRequest) {
  try {
    const VIDEO_DIR = resolveVideoDir();
    const body = await req.json();
    const { remoteUrl, filename } = body;

    if (!remoteUrl) {
      return NextResponse.json({ savedLocally: false, error: 'remoteUrl is required' }, { status: 400 });
    }

    if (!ensureOutputDir(VIDEO_DIR)) {
      // Running in a read-only cloud environment (e.g. Vercel); browser will handle auto-download
      return NextResponse.json({ savedLocally: false, reason: 'read-only-fs' });
    }

    const baseName = path.basename(filename || `studio_video_${Date.now()}.mp4`);
    const targetPath = path.join(VIDEO_DIR, baseName);

    // If Colab Rclone Sync already placed this exact file in G:\ComfyUI_Studio\outputs, no need to download again!
    if (fs.existsSync(targetPath)) {
      const existingStat = fs.statSync(targetPath);
      if (existingStat.size > 10000) {
        return NextResponse.json({
          savedLocally: true,
          alreadySyncedFromColab: true,
          filename: baseName,
          localPath: targetPath,
          localUrl: `/api/gdrive-videos?file=${encodeURIComponent(baseName)}`,
          sizeMb: (existingStat.size / (1024 * 1024)).toFixed(2),
        });
      }
    }

    const response = await fetch(remoteUrl, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json(
        { savedLocally: false, error: `Failed to fetch remote video: ${response.status}` },
        { status: 502 }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    fs.writeFileSync(targetPath, buffer);

    return NextResponse.json({
      savedLocally: true,
      filename: baseName,
      localPath: targetPath,
      localUrl: `/api/gdrive-videos?file=${encodeURIComponent(baseName)}`,
      sizeMb: (buffer.length / (1024 * 1024)).toFixed(2),
    });
  } catch (e: any) {
    return NextResponse.json({ savedLocally: false, error: e.message }, { status: 200 });
  }
}
