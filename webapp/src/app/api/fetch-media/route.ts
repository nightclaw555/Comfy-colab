import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL scheme
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return NextResponse.json({ error: 'Only http and https protocols are supported' }, { status: 400 });
    }

    // Fetch remote media with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000); // 45s timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ComfyUI-Studio/1.0',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to download file from URL (HTTP ${response.status}: ${response.statusText})` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = await response.arrayBuffer();

    // Limit to 100MB for safety
    if (buffer.byteLength > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size exceeds 100MB limit' }, { status: 400 });
    }

    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    // Extract filename from URL pathname or generate a fallback
    const rawFilename = parsedUrl.pathname.split('/').pop()?.split('?')[0];
    let filename = rawFilename && rawFilename.includes('.') ? rawFilename : '';

    if (!filename) {
      if (contentType.includes('image/jpeg')) filename = 'reference.jpg';
      else if (contentType.includes('image/webp')) filename = 'reference.webp';
      else if (contentType.includes('image/png')) filename = 'reference.png';
      else if (contentType.includes('video/webm')) filename = 'reference.webm';
      else if (contentType.includes('video')) filename = 'reference.mp4';
      else filename = 'reference.bin';
    }

    return NextResponse.json({
      success: true,
      dataUrl,
      filename,
      contentType,
      sizeBytes: buffer.byteLength,
    });
  } catch (error: any) {
    console.error('Fetch media error:', error);
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Download timed out after 45 seconds' }, { status: 504 });
    }
    return NextResponse.json({ error: error.message || 'Failed to fetch media' }, { status: 500 });
  }
}
