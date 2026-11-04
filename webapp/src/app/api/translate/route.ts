import { NextRequest, NextResponse } from 'next/server';

const THAI_REGEX = /[\u0E00-\u0E7F]/;

function containsThai(text?: string | null): boolean {
  if (!text) return false;
  return THAI_REGEX.test(text);
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

async function translateChunkMyMemory(text: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=th|en`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ComfyUI-Video-Studio-Web/1.0',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`MyMemory API error: ${res.statusText}`);
  }
  const data = await res.json();
  if (data?.responseData?.translatedText) {
    return decodeHtmlEntities(data.responseData.translatedText);
  }
  return text;
}

// Translate text with automatic chunking for long prompts
async function translateText(text: string): Promise<string> {
  if (!text || !containsThai(text)) return text;

  // If short enough, translate in one shot
  if (text.length <= 400) {
    return await translateChunkMyMemory(text);
  }

  // Split by line breaks or commas
  const parts = text.split(/(\n+|, )/);
  let currentBatch = '';
  let translatedFull = '';

  for (const part of parts) {
    if ((currentBatch + part).length > 350) {
      if (currentBatch) {
        if (containsThai(currentBatch)) {
          translatedFull += await translateChunkMyMemory(currentBatch);
        } else {
          translatedFull += currentBatch;
        }
        currentBatch = '';
      }
    }
    currentBatch += part;
  }

  if (currentBatch) {
    if (containsThai(currentBatch)) {
      translatedFull += await translateChunkMyMemory(currentBatch);
    } else {
      translatedFull += currentBatch;
    }
  }

  return translatedFull || text;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, visualPrompt, audioPrompt } = body;

    let translatedText = '';
    let translatedVisual = '';
    let translatedAudio = '';
    let hasThai = false;

    if (typeof text === 'string') {
      if (containsThai(text)) hasThai = true;
      translatedText = await translateText(text);
    }

    if (typeof visualPrompt === 'string') {
      if (containsThai(visualPrompt)) hasThai = true;
      translatedVisual = await translateText(visualPrompt);
    }

    if (typeof audioPrompt === 'string') {
      if (containsThai(audioPrompt)) hasThai = true;
      translatedAudio = await translateText(audioPrompt);
    }

    return NextResponse.json({
      success: true,
      hasThai,
      translatedText,
      translatedVisual,
      translatedAudio,
    });
  } catch (error: any) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Translation failed' },
      { status: 500 }
    );
  }
}
