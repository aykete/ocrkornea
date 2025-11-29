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
      return client;
    } catch (error) {
      console.error('Failed to parse base64 credentials:', error);
      throw new Error('Invalid GOOGLE_CREDENTIALS_BASE64 environment variable');
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    client = new vision.ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
    return client;
  } else {
    throw new Error('Google Cloud credentials not configured');
  }
}

interface BatchRequest {
  id: string;
  imageBase64: string;
  imageType: 'full' | 'cropped';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const images: BatchRequest[] = body.images;

    if (!images || images.length === 0) {
      return NextResponse.json(
        { error: 'No images provided' },
        { status: 400 }
      );
    }

    // Google Vision batch limit is 16 images per request
    const BATCH_SIZE = 16;
    const visionClient = getClient();
    const allResults: any[] = [];

    // Process in batches of 16
    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      const batch = images.slice(i, i + BATCH_SIZE);

      // Prepare batch requests
      const requests = batch.map((img) => ({
        image: {
          content: img.imageBase64,
        },
        features: [{ type: 'TEXT_DETECTION' as const }],
      }));

      // Execute batch request
      const [response] = await visionClient.batchAnnotateImages({ requests });

      // Process each response
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

        // Get image width from bounding box
        const firstBBox = detections[0]?.boundingPoly?.vertices;
        const imageWidth = firstBBox
          ? Math.max(...firstBBox.map((v: any) => v.x || 0))
          : 1000;

        const leftThreshold = imageWidth * 0.33;
        const extendedThreshold = imageWidth * 0.50;

        let filteredTextBlocks = detections.slice(1);
        let processedText = detections[0]?.description || '';

        if (img.imageType === 'full') {
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

        allResults.push({
          id: img.id,
          success: true,
          fullText: processedText,
          textBlocks: filteredTextBlocks.map((text: any) => ({
            description: text.description,
            boundingBox: text.boundingPoly?.vertices,
          })),
        });
      });
    }

    return NextResponse.json({
      success: true,
      results: allResults,
      totalProcessed: images.length,
    });
  } catch (error) {
    console.error('Batch OCR Error:', error);
    return NextResponse.json(
      {
        error: 'Batch OCR failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
