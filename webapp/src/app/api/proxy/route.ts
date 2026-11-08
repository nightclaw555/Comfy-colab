import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    
    // Check if this is a direct multipart upload for images
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const targetUrl = formData.get('targetUrl') as string;
      if (!targetUrl) {
        return NextResponse.json({ error: 'targetUrl is required' }, { status: 400 });
      }

      // Forward image to ComfyUI /upload/image
      formData.delete('targetUrl');
      const response = await fetch(targetUrl, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok && !data.error) {
        data.error = `ComfyUI returned status ${response.status} (${response.statusText || 'Upload failed'})`;
      }
      return NextResponse.json(data, { status: response.status });
    }

    // Standard JSON Proxy
    const body = await req.json();
    const { targetUrl, method = 'GET', data = null } = body;

    if (!targetUrl) {
      return NextResponse.json({ error: 'targetUrl is required' }, { status: 400 });
    }

    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    };

    if (data && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT')) {
      fetchOptions.body = JSON.stringify(data);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const resData = await response.json().catch(() => ({ statusText: response.statusText }));

    if (!response.ok) {
      console.error('ComfyUI/Proxy error response:', targetUrl, response.status, JSON.stringify(resData));
    } else if (targetUrl.includes('/history/')) {
      const str = JSON.stringify(resData);
      if (str.includes('execution_error')) {
        console.error('ComfyUI History Execution Error:', targetUrl, str.slice(0, 1500));
      }
    }

    return NextResponse.json(resData, { status: response.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Proxy request failed' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('targetUrl');

  if (!targetUrl) {
    return NextResponse.json({ error: 'targetUrl is required' }, { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, {
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
      },
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    // If media stream or binary (like video / image), pipe it
    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Content-Length': response.headers.get('content-length') || '',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Proxy GET request failed' },
      { status: 500 }
    );
  }
}
