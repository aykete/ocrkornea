'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Loader2, LogOut, ArrowLeft } from 'lucide-react';

interface OCRResult {
  fileName: string;
  fullText: string;
  extractedData: Record<string, string>;
}

export default function Home() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<OCRResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [fieldNames, setFieldNames] = useState<string>('k, ac, pupil');
  const [imageType, setImageType] = useState<'full' | 'cropped'>('full');

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
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async () => {
    if (files.length === 0) {
      alert('Lütfen en az bir fotoğraf seçin');
      return;
    }

    setLoading(true);
    setResults([]);

    try {
      // Convert all files to base64 for batch processing
      const batchImages = await Promise.all(
        files.map(async (file, index) => ({
          id: `${index}-${file.name}`,
          imageBase64: await fileToBase64(file),
          imageType: imageType,
        }))
      );

      // Send batch request
      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: batchImages }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Bilinmeyen hata' }));
        throw new Error(`Batch OCR başarısız: ${errorData.error || errorData.details || 'Detay yok'}`);
      }

      const data = await response.json();
      console.log('Batch OCR completed:', data.totalProcessed, 'images processed');

      // Process results
      const processedResults: OCRResult[] = data.results.map((result: any, index: number) => {
        const fileName = files[index].name;

        if (!result.success) {
          console.warn(`OCR failed for ${fileName}:`, result.error);
          return {
            fileName,
            fullText: '',
            extractedData: {},
          };
        }

        // Debug log
        if (result.debug) {
          console.log(`OCR Debug for ${fileName}:`, result.debug);
        }

        // Parse cornea data
        const extractedData = parseCorneaData(result.fullText, fieldNames);

        return {
          fileName,
          fullText: result.fullText,
          extractedData,
        };
      });

      setResults(processedResults);
    } catch (error) {
      console.error('Error:', error);
      alert('OCR işlemi sırasında hata oluştu: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
    } finally {
      setLoading(false);
    }
  };

  const parseCorneaData = (text: string, fields: string): Record<string, string> => {
    const data: Record<string, string> = {};

    // Metni satırlara böl
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    // Cornea Front ve Back bölümlerini bul (daha esnek arama)
    const frontIndex = lines.findIndex(line =>
      /Cornea\s*Front|^Front$/i.test(line)
    );
    const backIndex = lines.findIndex(line =>
      /Cornea\s*Back|^Back$/i.test(line)
    );

    // Debug için
    console.log('Parse Debug:', {
      totalLines: lines.length,
      frontIndex,
      backIndex,
      frontLine: frontIndex >= 0 ? lines[frontIndex] : 'NOT FOUND',
      backLine: backIndex >= 0 ? lines[backIndex] : 'NOT FOUND',
      firstFewLines: lines.slice(0, 20),
    });

    // Front ve Back metinlerini ayır
    let frontText = '';
    let backText = '';

    if (frontIndex !== -1 && backIndex !== -1 && backIndex > frontIndex) {
      // Her iki başlık da bulundu
      frontText = lines.slice(frontIndex, backIndex).join(' ');
      backText = lines.slice(backIndex).join(' ');
    } else if (frontIndex !== -1 || backIndex !== -1) {
      // Sadece biri bulundu - metni yarıya böl
      const midpoint = Math.floor(lines.length / 2);
      frontText = lines.slice(0, midpoint).join(' ');
      backText = lines.slice(midpoint).join(' ');
    } else {
      // Hiçbiri bulunamadı - tüm metni kullan
      frontText = text;
      backText = text;
    }

    // Kullanıcı hangi alanları istemiş kontrol et
    const requestedFields = fields ? fields.split(',').map(f => f.trim().toLowerCase()) : [];
    const extractAll = requestedFields.length === 0 || requestedFields.includes('tümü') || requestedFields.includes('all');

    // Front verilerini çıkart
    const extractValue = (text: string, pattern: RegExp, groupIndex: number = 1): string => {
      const match = text.match(pattern);
      if (!match) return '-';
      const value = match[groupIndex];
      return value ? value.trim() : '-';
    };

    // Front - Radius değerleri
    if (extractAll || requestedFields.some(f => f.includes('rh') || f.includes('radius'))) {
      data['Front_Rh'] = extractValue(frontText, /Rh[:\s]+([0-9.]+)/i);
      data['Front_Rv'] = extractValue(frontText, /Rv[:\s]+([0-9.]+)/i);
      data['Front_Rm'] = extractValue(frontText, /Rm[:\s]+([0-9.]+)/i);
    }

    // Front - Keratometry
    if (extractAll || requestedFields.some(f => f.includes('k') || f.includes('keratometry'))) {
      data['Front_K1'] = extractValue(frontText, /K1[:\s]+([0-9.]+)/i);
      data['Front_K2'] = extractValue(frontText, /K2[:\s]+([0-9.]+)/i);
      data['Front_Km'] = extractValue(frontText, /Km[:\s]+([0-9.]+)/i);
    }

    // Front - Axis ve Astig
    if (extractAll || requestedFields.some(f => f.includes('axis') || f.includes('astig'))) {
      // Axis için iki farklı pattern dene
      const axisMatch = frontText.match(/Axis[^\d]*(flat)?[:\s]*([0-9.]+)/i) ||
                        frontText.match(/([0-9.]+)\s*°/);
      data['Front_Axis'] = axisMatch ? (axisMatch[2] || axisMatch[1] || '-') : '-';
      data['Front_Astig'] = extractValue(frontText, /Astig[:\s]+([0-9.]+)/i);
    }

    // Front - Q-val
    if (extractAll || requestedFields.some(f => f.includes('q'))) {
      data['Front_Q-val'] = extractValue(frontText, /Q-val[^-\d]*([-0-9.]+)/i);
    }

    // Front - Rper, Rmin
    if (extractAll || requestedFields.some(f => f.includes('rper') || f.includes('rmin'))) {
      data['Front_Rper'] = extractValue(frontText, /Rper[:\s]+([0-9.]+)/i);
      data['Front_Rmin'] = extractValue(frontText, /Rmin[:\s]+([0-9.]+)/i);
    }

    // Back verilerini çıkart (negative değerleri handle et)
    const extractValueWithNegative = (text: string, pattern: RegExp, groupIndex: number = 1): string => {
      const match = text.match(pattern);
      if (!match) return '-';
      const value = match[groupIndex];
      return value ? value.trim() : '-';
    };

    // Back - Radius değerleri
    if (extractAll || requestedFields.some(f => f.includes('rh') || f.includes('radius'))) {
      data['Back_Rh'] = extractValueWithNegative(backText, /Rh[:\s]+([0-9.]+)/i);
      data['Back_Rv'] = extractValueWithNegative(backText, /Rv[:\s]+([0-9.]+)/i);
      data['Back_Rm'] = extractValueWithNegative(backText, /Rm[:\s]+([0-9.]+)/i);
    }

    // Back - Keratometry (negative olabilir)
    if (extractAll || requestedFields.some(f => f.includes('k') || f.includes('keratometry'))) {
      data['Back_K1'] = extractValueWithNegative(backText, /K1[:\s]+([-0-9.]+)/i);
      data['Back_K2'] = extractValueWithNegative(backText, /K2[:\s]+([-0-9.]+)/i);
      data['Back_Km'] = extractValueWithNegative(backText, /Km[:\s]+([-0-9.]+)/i);
    }

    // Back - Axis ve Astig
    if (extractAll || requestedFields.some(f => f.includes('axis') || f.includes('astig'))) {
      // Axis için iki farklı pattern dene
      const backAxisMatch = backText.match(/Axis[^\d]*(flat)?[:\s]*([0-9.]+)/i) ||
                            backText.match(/([0-9.]+)\s*°/);
      data['Back_Axis'] = backAxisMatch ? (backAxisMatch[2] || backAxisMatch[1] || '-') : '-';
      data['Back_Astig'] = extractValueWithNegative(backText, /Astig[:\s]+([0-9.]+)/i);
    }

    // Back - Q-val
    if (extractAll || requestedFields.some(f => f.includes('q'))) {
      data['Back_Q-val'] = extractValueWithNegative(backText, /Q-val[^-\d]*([-0-9.]+)/i);
    }

    // Back - Rper, Rmin
    if (extractAll || requestedFields.some(f => f.includes('rper') || f.includes('rmin'))) {
      data['Back_Rper'] = extractValueWithNegative(backText, /Rper[:\s]+([0-9.]+)/i);
      data['Back_Rmin'] = extractValueWithNegative(backText, /Rmin[:\s]+([0-9.]+)/i);
    }

    // Pachymetry değerleri (genel bölümden)
    if (extractAll || requestedFields.some(f => f.includes('pachy'))) {
      data['Pachy_Center'] = extractValue(text, /Pupil Center[:\s]+[+]?([0-9.]+)/i);
      data['Pachy_Apex'] = extractValue(text, /Pachy Apex[:\s]+([0-9.]+)/i);
      data['Pachy_Thinnest'] = extractValue(text, /Thinnest Local[:\s]+[◇]?\s*([0-9.]+)/i);
    }

    // A.C. Depth ve Pupil Dia (alt bölümden)
    if (extractAll || requestedFields.some(f => f.includes('ac') || f.includes('depth') || f.includes('pupil'))) {
      // A. C. Depth - "Depth" kelimesinden sonra ":" bul, sonra sayıyı al
      // Format: "A.\nC.\nDepth\n(\nInt\n.\n)\n:\n3.22\nmm"
      let acDepthValue = '-';
      const depthIndex = text.search(/Depth/i);
      if (depthIndex !== -1) {
        // "Depth" kelimesinden sonraki 150 karakteri al
        const afterDepth = text.substring(depthIndex, depthIndex + 150);
        // ":" karakterinden sonraki ilk sayıyı bul
        const colonIndex = afterDepth.indexOf(':');
        if (colonIndex !== -1) {
          const afterColon = afterDepth.substring(colonIndex + 1);
          // İlk ondalıklı veya tam sayıyı bul
          const numberMatch = afterColon.match(/([0-9]+\.[0-9]+)/);
          if (numberMatch) {
            acDepthValue = numberMatch[1];
          }
        }
      }

      data['AC_Depth'] = acDepthValue;

      console.log('AC Depth parsing:', {
        found: acDepthValue !== '-',
        value: acDepthValue,
        searchResult: depthIndex !== -1 ? 'Depth keyword found' : 'NOT FOUND'
      });

      // Pupil Dia için de esnek pattern
      // Format: "Pupil Dia : 2.92 mm"
      const pupilDiaMatch =
        text.match(/Pupil\s+Dia[:\s.]+([0-9.]+)/i) ||
        text.match(/Pupil\s*Diameter[:\s]+([0-9.]+)/i);

      data['Pupil_Dia'] = pupilDiaMatch ? pupilDiaMatch[1] : '-';

      console.log('Pupil Dia parsing:', {
        found: !!pupilDiaMatch,
        value: pupilDiaMatch ? pupilDiaMatch[1] : 'NOT FOUND',
        matchedPattern: pupilDiaMatch ? pupilDiaMatch[0] : 'NONE'
      });
    }

    return data;
  };

  const exportToCSV = () => {
    if (results.length === 0) {
      alert('Export edilecek veri yok');
      return;
    }

    // CSV header oluştur
    const firstResult = results[0];
    const headers = ['Dosya Adı', ...Object.keys(firstResult.extractedData)];

    // CSV rows oluştur
    const rows = results.map(result => {
      const values = Object.values(result.extractedData);
      return [result.fileName, ...values].map(v => `"${v}"`).join(',');
    });

    // CSV içeriği
    const csvContent = [
      headers.join(','),
      ...rows
    ].join('\n');

    // Dosya indirme
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cornea-data-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/')}
            className="flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Geri
          </Button>
          <div>
            <h1 className="text-4xl font-bold mb-2">Kornea Topografi OCR</h1>
            <p className="text-muted-foreground">
              Kornea topografi goruntlerinden veri cikarin ve CSV olarak kaydedin
            </p>
          </div>
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

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Fotoğraf Yükle</CardTitle>
            <CardDescription>
              Birden fazla kornea topografi görüntüsü seçebilirsiniz
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Fotoğraf Tipi</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={imageType === 'full' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setImageType('full')}
                    className="flex-1"
                  >
                    Tam Görüntü
                  </Button>
                  <Button
                    type="button"
                    variant={imageType === 'cropped' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setImageType('cropped')}
                    className="flex-1"
                  >
                    Kırpılmış
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {imageType === 'full'
                    ? '• Haritalar + veriler içeren tam fotoğraf (sol %33 filtrelenir)'
                    : '• Sadece sol taraftaki veri tablosu (filtreleme yapılmaz)'}
                </p>
              </div>
              <div>
                <Label htmlFor="file-upload">Fotoğrafları Seç</Label>
                <Input
                  id="file-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="mt-2"
                />
              </div>
              {files.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {files.length} dosya seçildi
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Veri Alanları</CardTitle>
            <CardDescription>
              Çıkartmak istediğiniz verileri belirtin
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Hızlı Seçim</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFieldNames('k, ac, pupil')}
                  >
                    K Değerleri + AC Depth + Pupil Dia
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFieldNames('')}
                  >
                    Tümü
                  </Button>
                </div>
              </div>
              <div>
                <Label htmlFor="field-names">Özel Alan İsimleri (opsiyonel)</Label>
                <Input
                  id="field-names"
                  placeholder="Örn: k, axis, astig, pachy, radius"
                  value={fieldNames}
                  onChange={(e) => setFieldNames(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• <strong>Önerilen:</strong> "K Değerleri + AC Depth + Pupil Dia" butonuna tıklayın</p>
                <p>• Boş bırakırsanız tüm veriler otomatik çıkartılır</p>
                <p>• Kullanılabilir alanlar: k, ac, pupil, radius, axis, astig, q, rper, rmin, pachy</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4 mb-6">
        <Button
          onClick={processFiles}
          disabled={loading || files.length === 0}
          className="flex-1"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              İşleniyor...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              OCR İşlemini Başlat
            </>
          )}
        </Button>

        <Button
          onClick={exportToCSV}
          disabled={results.length === 0}
          variant="outline"
        >
          <Download className="mr-2 h-4 w-4" />
          CSV İndir
        </Button>
      </div>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sonuçlar</CardTitle>
            <CardDescription>
              {results.length} fotoğraftan veri çıkarıldı - Tabloda yatay kaydırma yapabilirsiniz
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">
                      Dosya Adı
                    </TableHead>
                    {results[0] && Object.keys(results[0].extractedData).map((key) => {
                      // Sütun başlıklarını renklendir (Front = mavi, Back = yeşil, Pachy = turuncu, AC/Pupil = mor)
                      const isFront = key.startsWith('Front_');
                      const isBack = key.startsWith('Back_');
                      const isPachy = key.startsWith('Pachy_');
                      const isACPupil = key.startsWith('AC_') || key.startsWith('Pupil_');

                      return (
                        <TableHead
                          key={key}
                          className={`min-w-[100px] ${
                            isFront ? 'text-blue-600 dark:text-blue-400' :
                            isBack ? 'text-green-600 dark:text-green-400' :
                            isPachy ? 'text-orange-600 dark:text-orange-400' :
                            isACPupil ? 'text-purple-600 dark:text-purple-400' : ''
                          }`}
                        >
                          {key.replace(/_/g, ' ')}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium sticky left-0 bg-background z-10">
                        {result.fileName}
                      </TableCell>
                      {Object.values(result.extractedData).map((value, vIdx) => (
                        <TableCell key={vIdx} className="font-mono text-sm">
                          {value}
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
