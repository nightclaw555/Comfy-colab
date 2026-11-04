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

async function translateChunk(text: string): Promise<string> {
  if (!text.trim() || !containsThai(text)) return text;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=th|en`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ComfyUI-Video-Studio-Web/1.0' },
      cache: 'no-store',
    });
    if (!res.ok) return text;
    const data = await res.json();
    if (data?.responseData?.translatedText) {
      return decodeHtmlEntities(data.responseData.translatedText);
    }
  } catch (e) {
    console.warn('Translation error in split-storyboard:', e);
  }
  return text;
}

const CINEMATIC_PROGRESSIONS = [
  'establishing wide cinematic shot, atmospheric depth, ambient lighting',
  'medium tracking shot following the character smoothly, natural movement',
  'close-up intimate angle highlighting facial expression and subtle emotions',
  'low angle dynamic shot with dramatic depth of field, high contrast',
  'over-the-shoulder perspective focusing on the central interaction',
  'smooth slow motion pan with soft volumetric light and lens bloom',
  'high angle overhead perspective, artistic cinematic composition',
  'side profile elegant tracking motion, golden hour illumination',
  'intimate macro detail shot, hyper-realistic fine textures and physics',
  'dynamic orbital camera sweep around the subject, vibrant atmosphere',
  'wide panoramic continuous movement, breathtaking environmental view',
  'resolving climax hero shot, striking cinematic poise, gorgeous lighting',
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, segmentCount = 2 } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Text prompt is required' }, { status: 400 });
    }

    const cleanText = text.trim();
    let rawSegments: string[] = [];

    // 1. Check for explicit bracket/scene markers: [ฉาก 1], [Shot 1], [1], etc.
    const bracketMatches = cleanText.split(/\[(?:ฉาก|shot|scene|part|ตอนที่)?\s*\d+\]/i).map((s) => s.trim()).filter(Boolean);
    if (bracketMatches.length >= 2) {
      rawSegments = bracketMatches;
    }

    // 2. Check for numbered lines: "1. ... 2. ..."
    if (rawSegments.length < 2) {
      const numberedMatches = cleanText.split(/\n?\s*(?:\d+[\.\)]|\bช็อตที่\s*\d+:?|\bฉากที่\s*\d+:?|\bตอนที่\s*\d+:?)\s*/i).map((s) => s.trim()).filter(Boolean);
      if (numberedMatches.length >= 2) {
        rawSegments = numberedMatches;
      }
    }

    // 3. Check for double newlines or single newlines
    if (rawSegments.length < 2) {
      const lineMatches = cleanText.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
      if (lineMatches.length >= 2) {
        rawSegments = lineMatches;
      }
    }

    // 4. Split by natural narrative transition words (Thai & English)
    if (rawSegments.length < 2) {
      const transitionRegex = /\s*(?:จากนั้น|หลังจากนั้น|แล้ว|ต่อมา|ถัดมา|และแล้ว|และในที่สุด|\bthen\b|\band then\b|\bafter that\b|\bafterwards\b|\bnext\b|\blater\b)\s*/i;
      const parts = cleanText.split(transitionRegex).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        rawSegments = parts;
      }
    }

    // 5. Fallback: Split by punctuation (period, semicolon, or comma)
    if (rawSegments.length < 2) {
      const commaParts = cleanText.split(/(?:;|\. |\,\s*)/).map((s) => s.trim()).filter(Boolean);
      if (commaParts.length >= segmentCount) {
        const chunkSize = Math.ceil(commaParts.length / segmentCount);
        for (let i = 0; i < commaParts.length; i += chunkSize) {
          rawSegments.push(commaParts.slice(i, i + chunkSize).join(', '));
        }
      } else {
        rawSegments = [cleanText];
      }
    }

    // If we have fewer segments than requested segmentCount (e.g. 6, 12, or 24 shots)
    // Expand using progressive cinematic beats and angles
    const baseText = rawSegments[0] || cleanText;
    while (rawSegments.length < segmentCount) {
      const idx = rawSegments.length;
      const prog = CINEMATIC_PROGRESSIONS[idx % CINEMATIC_PROGRESSIONS.length];
      const source = rawSegments[idx - 1] || baseText;
      rawSegments.push(`${source}, ${prog}`);
    }

    rawSegments = rawSegments.slice(0, segmentCount);

    // Translate each segment to English if containing Thai
    const translatedSegments = await Promise.all(
      rawSegments.map(async (seg) => {
        if (containsThai(seg)) {
          return await translateChunk(seg);
        }
        return seg;
      })
    );

    return NextResponse.json({
      success: true,
      segmentCount,
      rawSegments,
      segments: translatedSegments,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to split storyboard' },
      { status: 500 }
    );
  }
}
