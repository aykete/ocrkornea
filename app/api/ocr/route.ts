import { NextRequest, NextResponse } from 'next/server';
import vision from '@google-cloud/vision';

// Google Cloud Vision client'ını oluştur
let client: vision.ImageAnnotatorClient;

if (process.env.GOOGLE_CREDENTIALS_BASE64) {
  // Production (Netlify/Vercel): Base64 encoded JSON
  try {
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString()
    );
    client = new vision.ImageAnnotatorClient({ credentials });
    console.log('Google Cloud Vision initialized with base64 credentials');
  } catch (error) {
    console.error('Failed to parse base64 credentials:', error);
    throw new Error('Invalid GOOGLE_CREDENTIALS_BASE64 environment variable');
  }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // Local: JSON file path
  client = new vision.ImageAnnotatorClient({
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });
  console.log('Google Cloud Vision initialized with file path');
} else {
  throw new Error('Google Cloud credentials not configured. Set either GOOGLE_CREDENTIALS_BASE64 or GOOGLE_APPLICATION_CREDENTIALS');
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const imageType = formData.get('imageType') as string; // 'full' veya 'cropped'

    if (!file) {
      return NextResponse.json(
        { error: 'Dosya bulunamadı' },
        { status: 400 }
      );
    }

    // Dosyayı buffer'a çevir
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Google Cloud Vision API'ye gönder
    const [result] = await client.textDetection(buffer);
    const detections = result.textAnnotations;

    if (!detections || detections.length === 0) {
      return NextResponse.json(
        { error: 'Görüntüde metin bulunamadı' },
        { status: 404 }
      );
    }

    // Görüntü genişliğini bul (ilk detection'ın bounding box'ından)
    const firstBBox = detections[0]?.boundingPoly?.vertices;
    const imageWidth = firstBBox ? Math.max(...firstBBox.map(v => v.x || 0)) : 1000;

    // Sol taraftaki metinleri filtrele (sadece tam görüntü için)
    // Kornea topografi görüntülerinde text veriler genellikle sol %33'te
    // Ama AC Depth, Pupil Dia gibi alt veriler biraz daha sağda olabilir
    const leftThreshold = imageWidth * 0.33;
    const extendedThreshold = imageWidth * 0.50; // AC Depth için genişletilmiş alan

    // Kırpılmış görüntü ise filtreleme yapma
    let filteredTextBlocks = detections.slice(1);
    let processedText = detections[0]?.description || '';

    if (imageType === 'full') {
      // Tam görüntü: İki aşamalı filtreleme
      // 1. Ana veriler için sol %33
      const mainDataBlocks = detections.slice(1).filter((text) => {
        const vertices = text.boundingPoly?.vertices;
        if (!vertices || vertices.length === 0) return false;

        const avgX = vertices.reduce((sum, v) => sum + (v.x || 0), 0) / vertices.length;
        return avgX < leftThreshold;
      });

      // 2. AC Depth, Pupil Dia gibi alt veriler için sol %50 (ama sadece bunları ara)
      const extendedDataBlocks = detections.slice(1).filter((text) => {
        const vertices = text.boundingPoly?.vertices;
        if (!vertices || vertices.length === 0) return false;

        const avgX = vertices.reduce((sum, v) => sum + (v.x || 0), 0) / vertices.length;
        const desc = text.description?.toLowerCase() || '';

        // Sadece AC Depth, Pupil Dia, Chamber, Enter IOP gibi anahtar kelimeleri içerenleri al
        const isRelevant = desc.includes('depth') || desc.includes('pupil') ||
                          desc.includes('chamber') || desc.includes('iop') ||
                          desc.includes('pachy') || desc.includes('lens') ||
                          desc.includes('dia'); // "Dia" kelimesi için ekstra

        const inRange = avgX >= leftThreshold && avgX < extendedThreshold;

        if (inRange && isRelevant) {
          console.log('Extended block found:', desc, 'at x:', avgX);
        }

        return avgX < extendedThreshold && isRelevant;
      });

      console.log('Extended filtering:', {
        mainDataBlocks: mainDataBlocks.length,
        extendedDataBlocks: extendedDataBlocks.length,
        leftThreshold,
        extendedThreshold,
      });

      // İki listeyi birleştir (duplicate'leri önle)
      const combinedBlocks = [...mainDataBlocks];
      extendedDataBlocks.forEach(block => {
        if (!mainDataBlocks.includes(block)) {
          combinedBlocks.push(block);
        }
      });

      filteredTextBlocks = combinedBlocks;

      // Sol taraftaki metinleri birleştir (satır yapısını korumak için \n kullan)
      processedText = filteredTextBlocks
        .map(block => block.description)
        .join('\n') || processedText;
    }

    return NextResponse.json({
      success: true,
      fullText: processedText,
      textBlocks: filteredTextBlocks.map((text) => ({
        description: text.description,
        boundingBox: text.boundingPoly?.vertices,
      })),
      fileName: file.name,
      debug: {
        imageType,
        totalBlocks: detections.length - 1,
        filteredBlocks: filteredTextBlocks.length,
        imageWidth,
        leftThreshold,
        extendedThreshold: imageType === 'full' ? extendedThreshold : 'N/A',
      }
    });
  } catch (error) {
    console.error('OCR Error:', error);
    return NextResponse.json(
      {
        error: 'OCR işlemi başarısız',
        details: error instanceof Error ? error.message : 'Bilinmeyen hata'
      },
      { status: 500 }
    );
  }
}
