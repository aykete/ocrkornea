'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Loader2, LogOut, Trash2, Eye, EyeOff } from 'lucide-react';

interface Rectangle {
  id: string;
  label: string;
  // Normalized coordinates (0-1 range) for scaling across different image sizes
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OCRResult {
  fileName: string;
  data: Record<string, string>;
}

export default function EditorPage() {
  const router = useRouter();

  // Image state
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [templateSrc, setTemplateSrc] = useState<string>('');
  const [templateSize, setTemplateSize] = useState<{ width: number; height: number } | null>(null);

  // Rectangle drawing state
  const [rectangles, setRectangles] = useState<Rectangle[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Processing state
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<OCRResult[]>([]);

  // UI state
  const [showRectangles, setShowRectangles] = useState(true);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setImageFiles(files);
      setResults([]);

      // Load first image as template
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setTemplateSrc(event.target.result as string);
        }
      };
      reader.readAsDataURL(files[0]);
    }
  };

  const handleImageLoad = () => {
    if (imageRef.current && canvasRef.current && containerRef.current) {
      const img = imageRef.current;
      const canvas = canvasRef.current;

      // Set canvas size to match displayed image size
      canvas.width = img.clientWidth;
      canvas.height = img.clientHeight;

      setTemplateSize({
        width: img.clientWidth,
        height: img.clientHeight
      });

      redrawCanvas();
    }
  };

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !templateSize) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw existing rectangles (only if visible)
    if (!showRectangles) return;

    rectangles.forEach((rect, index) => {
      const x = rect.x * templateSize.width;
      const y = rect.y * templateSize.height;
      const width = rect.width * templateSize.width;
      const height = rect.height * templateSize.height;

      // Rectangle border
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);

      // Semi-transparent fill
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.fillRect(x, y, width, height);

      // Number label (inside rectangle, top-left corner)
      const numberLabel = String(index + 1);
      ctx.fillStyle = '#3b82f6';
      ctx.font = '10px sans-serif';
      const labelWidth = ctx.measureText(numberLabel).width + 6;
      ctx.fillRect(x, y, labelWidth, 14
      );

      // Number text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(numberLabel, x + 3, y + 10);
    });

    // Draw current rectangle being drawn
    if (currentRect && templateSize) {
      const x = currentRect.x * templateSize.width;
      const y = currentRect.y * templateSize.height;
      const width = currentRect.width * templateSize.width;
      const height = currentRect.height * templateSize.height;

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x, y, width, height);
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
      ctx.fillRect(x, y, width, height);
    }
  }, [rectangles, currentRect, templateSize, showRectangles]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !templateSize) return null;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / templateSize.width;
    const y = (e.clientY - rect.top) / templateSize.height;

    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    setIsDrawing(true);
    setDrawStart(coords);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawStart) return;

    const coords = getCanvasCoords(e);
    if (!coords) return;

    setCurrentRect({
      x: Math.min(drawStart.x, coords.x),
      y: Math.min(drawStart.y, coords.y),
      width: Math.abs(coords.x - drawStart.x),
      height: Math.abs(coords.y - drawStart.y),
    });
  };

  const handleMouseUp = () => {
    if (currentRect && templateSize) {
      // Check minimum size (at least 10x10 pixels in displayed size)
      const minSize = 10 / Math.min(templateSize.width, templateSize.height);

      if (currentRect.width > minSize && currentRect.height > minSize) {
        const newRect: Rectangle = {
          id: crypto.randomUUID(),
          label: `Alan ${rectangles.length + 1}`,
          ...currentRect,
        };
        setRectangles([...rectangles, newRect]);
      }
    }

    setIsDrawing(false);
    setDrawStart(null);
    setCurrentRect(null);
  };

  const handleLabelChange = (id: string, newLabel: string) => {
    setRectangles(rectangles.map(rect =>
      rect.id === id ? { ...rect, label: newLabel } : rect
    ));
  };

  const handleDeleteRectangle = (id: string) => {
    setRectangles(rectangles.filter(rect => rect.id !== id));
  };

  const cropRegion = async (file: File, rect: Rectangle): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Calculate actual pixel coordinates based on original image size
        const x = rect.x * img.naturalWidth;
        const y = rect.y * img.naturalHeight;
        const width = rect.width * img.naturalWidth;
        const height = rect.height * img.naturalHeight;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(
          img,
          x, y, width, height,
          0, 0, width, height
        );

        canvas.toBlob(blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Could not create blob'));
          }
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('Could not load image'));

      // Load image from file
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          img.src = e.target.result as string;
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const processOCR = async () => {
    if (rectangles.length === 0) {
      alert('Lutfen en az bir alan secin');
      return;
    }

    if (imageFiles.length === 0) {
      alert('Lutfen en az bir goruntu yukleyin');
      return;
    }

    setLoading(true);
    setResults([]);
    setProgress({ current: 0, total: imageFiles.length });

    try {
      const allResults: OCRResult[] = [];

      // Process each image's rectangles as a batch
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        setProgress({ current: i + 1, total: imageFiles.length });

        // Crop all rectangles for this image and prepare batch
        const batchImages = await Promise.all(
          rectangles.map(async (rect) => {
            const croppedBlob = await cropRegion(file, rect);
            const base64 = await blobToBase64(croppedBlob);
            return {
              id: rect.id,
              imageBase64: base64,
              imageType: 'cropped',
            };
          })
        );

        // Send batch request for all rectangles of this image
        const response = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: batchImages }),
        });

        const resultData: Record<string, string> = {};

        if (!response.ok) {
          console.error(`Batch OCR failed for ${file.name}`);
          rectangles.forEach(rect => { resultData[rect.label] = '-'; });
        } else {
          const data = await response.json();

          // Map results back to rectangle labels
          data.results.forEach((result: any) => {
            const rect = rectangles.find(r => r.id === result.id);
            if (rect) {
              const cleanText = (result.fullText || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
              resultData[rect.label] = cleanText || '-';
            }
          });
        }

        allResults.push({
          fileName: file.name,
          data: resultData,
        });
      }

      setResults(allResults);
    } catch (error) {
      console.error('OCR Error:', error);
      alert('OCR islemi sirasinda hata olustu');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const exportToCSV = () => {
    if (results.length === 0) {
      alert('Export edilecek veri yok');
      return;
    }

    // Get labels from rectangles to maintain order
    const labels = rectangles.map(r => r.label);
    const headers = ['Dosya Adi', ...labels];

    const rows = results.map(result => {
      const values = labels.map(label => {
        const value = result.data[label] || '-';
        // Escape quotes and handle special characters
        return `"${value.replace(/"/g, '""')}"`;
      });
      return [`"${result.fileName}"`, ...values].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `editor-ocr-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">Goruntu Editorlu OCR</h1>
          <p className="text-muted-foreground">
            Birden fazla goruntu yukleyin, alanlari secin ve toplu OCR yapin
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="flex items-center gap-2"
        >
          <LogOut className="h-4 w-4" />
          Cikis
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 mb-6">
        {/* Image Upload Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>1. Goruntuleri Yukle</CardTitle>
            <CardDescription>
              Birden fazla goruntu secebilirsiniz. Ilk goruntu sablon olarak kullanilir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="file-upload">Goruntuler</Label>
                <Input
                  id="file-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="mt-2"
                />
              </div>

              {imageFiles.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {imageFiles.length} goruntu yuklendi
                </p>
              )}

              {/* Template Image with Canvas Overlay */}
              {templateSrc && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label>2. Alanlari Secin (Sablon)</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRectangles(!showRectangles)}
                      className="flex items-center gap-1"
                    >
                      {showRectangles ? (
                        <>
                          <EyeOff className="h-4 w-4" />
                          Gizle
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" />
                          Goster
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Fareyi surukleyerek dikdortgen cizin. Sectiginiz alanlar tum goruntuler icin uygulanacak.
                  </p>
                  <div
                    ref={containerRef}
                    className="relative inline-block border rounded-lg overflow-hidden"
                    style={{ maxWidth: '100%' }}
                  >
                    <img
                      ref={imageRef}
                      src={templateSrc}
                      alt="Template"
                      onLoad={handleImageLoad}
                      className="max-w-full h-auto"
                      style={{ display: 'block' }}
                    />
                    <canvas
                      ref={canvasRef}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      className="absolute top-0 left-0 cursor-crosshair"
                      style={{ touchAction: 'none' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Rectangles List Card */}
        <Card>
          <CardHeader>
            <CardTitle>Secili Alanlar</CardTitle>
            <CardDescription>
              {rectangles.length === 0
                ? 'Henuz alan secilmedi'
                : `${rectangles.length} alan secildi`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rectangles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sablon goruntu uzerinde dikdortgen cizerek alan secin.
              </p>
            ) : (
              <div className="space-y-3">
                {rectangles.map((rect, index) => (
                  <div key={rect.id} className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: '#3b82f6' }}
                    />
                    <Input
                      value={rect.label}
                      onChange={(e) => handleLabelChange(rect.id, e.target.value)}
                      placeholder="Alan ismi"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteRectangle(rect.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mb-6">
        <Button
          onClick={processOCR}
          disabled={loading || imageFiles.length === 0 || rectangles.length === 0}
          className="flex-1"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Isleniyor... {progress && `(${progress.current}/${progress.total})`}
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              OCR Islemini Baslat
            </>
          )}
        </Button>

        <Button
          onClick={exportToCSV}
          disabled={results.length === 0}
          variant="outline"
        >
          <Download className="mr-2 h-4 w-4" />
          CSV Indir
        </Button>
      </div>

      {/* Results Table */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sonuclar</CardTitle>
            <CardDescription>
              {results.length} goruntuden veri cikarildi
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">
                      Dosya Adi
                    </TableHead>
                    {rectangles.map((rect) => (
                      <TableHead key={rect.id} className="min-w-[150px]">
                        {rect.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium sticky left-0 bg-background z-10">
                        {result.fileName}
                      </TableCell>
                      {rectangles.map((rect) => (
                        <TableCell key={rect.id} className="font-mono text-sm">
                          {result.data[rect.label] || '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
