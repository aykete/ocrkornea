import { NextRequest, NextResponse } from 'next/server';
import vision from '@google-cloud/vision';
import type { ImageAnnotatorClient } from '@google-cloud/vision';

// Google Cloud Vision client (lazy initialization)
let client: ImageAnnotatorClient | null = null;

function getClient(): ImageAnnotatorClient {
  if (client) return client;

  if (process.env.GOOGLE_CREDENTIALS_BASE64) {
    try {
      const credentials = JSON.parse(
        Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString()
      );
      client = new vision.ImageAnnotatorClient({ credentials });
      console.log('Google Cloud Vision initialized with base64 credentials');
      return client;
    } catch (error) {
      console.error('Failed to parse base64 credentials:', error);
      throw new Error('Invalid GOOGLE_CREDENTIALS_BASE64 environment variable');
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    client = new vision.ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
    console.log('Google Cloud Vision initialized with file path');
    return client;
  } else {
    throw new Error('Google Cloud credentials not configured');
  }
}

function processDetections(detections: any[], imageType: string) {
  if (!detections || detections.length === 0) {
    return { fullText: '', textBlocks: [], debug: null };
  }

  // Get image width from bounding box
  const firstBBox = detections[0]?.boundingPoly?.vertices;
  const imageWidth = firstBBox
    ? Math.max(...firstBBox.map((v: any) => v.x || 0))
    : 1000;

  const leftThreshold = imageWidth * 0.33;
  const extendedThreshold = imageWidth * 0.50;

  let filteredTextBlocks = detections.slice(1);
  let processedText = detections[0]?.description || '';

  if (imageType === 'full') {
    // Main data: left 33%
    const mainDataBlocks = detections.slice(1).filter((text: any) => {
      const vertices = text.boundingPoly?.vertices;
      if (!vertices || vertices.length === 0) return false;
      const avgX = vertices.reduce((sum: number, v: any) => sum + (v.x || 0), 0) / vertices.length;
      return avgX < leftThreshold;
    });

    // Extended data: left 50% for specific keywords
    const extendedDataBlocks = detections.slice(1).filter((text: any) => {
      const vertices = text.boundingPoly?.vertices;
      if (!vertices || vertices.length === 0) return false;
      const avgX = vertices.reduce((sum: number, v: any) => sum + (v.x || 0), 0) / vertices.length;
      const desc = text.description?.toLowerCase() || '';
      const isRelevant = desc.includes('depth') || desc.includes('pupil') ||
                        desc.includes('chamber') || desc.includes('iop') ||
                        desc.includes('pachy') || desc.includes('lens') ||
                        desc.includes('dia');
      return avgX < extendedThreshold && isRelevant;
    });

    // Combine blocks
    const combinedBlocks = [...mainDataBlocks];
    extendedDataBlocks.forEach((block: any) => {
      if (!mainDataBlocks.includes(block)) {
        combinedBlocks.push(block);
      }
    });

    filteredTextBlocks = combinedBlocks;
    processedText = filteredTextBlocks
      .map((block: any) => block.description)
      .join('\n') || processedText;
  }

  return {
    fullText: processedText,
    textBlocks: filteredTextBlocks.map((text: any) => ({
      description: text.description,
      boundingBox: text.boundingPoly?.vertices,
    })),
    debug: {
      imageType,
      totalBlocks: detections.length - 1,
      filteredBlocks: filteredTextBlocks.length,
      imageWidth,
      leftThreshold,
      extendedThreshold: imageType === 'full' ? extendedThreshold : 'N/A',
    }
  };
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Check if it's a batch JSON request or single FormData request
    if (contentType.includes('application/json')) {
      // BATCH REQUEST
      const body = await request.json();
      const images: { id: string; imageBase64: string; imageType: string }[] = body.images;

      if (!images || images.length === 0) {
        return NextResponse.json({ error: 'No images provided' }, { status: 400 });
      }

      const visionClient = getClient();
      const BATCH_SIZE = 16; // Google Vision limit
      const allResults: any[] = [];

      // Process in batches of 16
      for (let i = 0; i < images.length; i += BATCH_SIZE) {
        const batch = images.slice(i, i + BATCH_SIZE);

        const requests = batch.map((img) => ({
          image: { content: img.imageBase64 },
          features: [{ type: 'TEXT_DETECTION' as const }],
        }));

        const [response] = await visionClient.batchAnnotateImages({ requests });

        batch.forEach((img, idx) => {
          const result = response.responses?.[idx];
          const detections = result?.textAnnotations;

          if (!detections || detections.length === 0) {
            allResults.push({
              id: img.id,
              success: false,
              error: 'No text found',
              fullText: '',
              textBlocks: [],
            });
            return;
          }

          const processed = processDetections(detections, img.imageType);
          allResults.push({
            id: img.id,
            success: true,
            ...processed,
          });
        });
      }

      return NextResponse.json({
        success: true,
        batch: true,
        results: allResults,
        totalProcessed: images.length,
      });

    } else {
      // SINGLE FILE REQUEST (FormData) - backward compatible
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const imageType = (formData.get('imageType') as string) || 'full';

      if (!file) {
        return NextResponse.json({ error: 'Dosya bulunamadi' }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const visionClient = getClient();
      const [result] = await visionClient.textDetection(buffer);
      const detections = result.textAnnotations;

      if (!detections || detections.length === 0) {
        return NextResponse.json({ error: 'Goruntude metin bulunamadi' }, { status: 404 });
      }

      const processed = processDetections(detections, imageType);

      return NextResponse.json({
        success: true,
        batch: false,
        fileName: file.name,
        ...processed,
      });
    }
  } catch (error) {
    console.error('OCR Error:', error);
    return NextResponse.json(
      {
        error: 'OCR islemi basarisiz',
        details: error instanceof Error ? error.message : 'Bilinmeyen hata'
      },
      { status: 500 }
    );
  }
}
