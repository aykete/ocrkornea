# Kornea Topografi OCR Uygulaması

Google Cloud Vision API kullanarak kornea topografi görüntülerinden veri çıkartan ve CSV formatında kaydeden Next.js uygulaması.

## Özellikler

- 📸 Birden fazla görüntü yükleme desteği
- 🔍 Google Cloud Vision API ile OCR
- 📊 Özelleştirilebilir veri çıkarma (belirli alanları seçebilme)
- 📥 CSV formatında veri export
- ⚡ Modern ve hızlı UI (Next.js 15 + Shadcn/ui)
- 🎨 Responsive tasarım

## Gereksinimler

- Node.js 18.x veya üzeri
- npm veya yarn
- Google Cloud hesabı ve Vision API erişimi

## Kurulum

### 1. Projeyi İndirin ve Bağımlılıkları Kurun

```bash
cd ocr
npm install
```

### 2. Google Cloud Vision API Kurulumu


Kısaca:
1. [Google Cloud Console](https://console.cloud.google.com/) üzerinden yeni bir proje oluşturun
2. Vision API'yi aktifleştirin
3. Service Account oluşturun ve JSON key dosyasını indirin
4. JSON key dosyasını proje dizinine kopyalayın
5. `.env.local` dosyasını yapılandırın

### 3. Environment Variables

`.env.local` dosyası oluşturun:

```bash
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json
```

`.env.example` dosyasını referans olarak kullanabilirsiniz.

## Kullanım

### Development Server'ı Başlatın

```bash
npm run dev
```

Tarayıcıda [http://localhost:3000](http://localhost:3000) adresine gidin.

### Uygulama Kullanımı

1. **Fotoğraf Yükle**: Bir veya birden fazla kornea topografi görüntüsü seçin
2. **Veri Alanları**: Çıkartmak istediğiniz veri alanlarını belirtin (virgülle ayırarak)
   - Örnek: `K1, K2, Sim-K, Axis`
   - Boş bırakırsanız tüm metin gösterilir
3. **OCR İşlemini Başlat**: Görüntüler işlenecek ve sonuçlar tabloda gösterilecek
4. **CSV İndir**: Sonuçları CSV dosyası olarak indirin

### Veri Parse Mantığını Özelleştirme

`app/page.tsx` dosyasındaki `parseCorneaData` fonksiyonunu ihtiyacınıza göre düzenleyebilirsiniz:

```typescript
const parseCorneaData = (text: string, fields: string): Record<string, string> => {
  // Özel parse mantığınızı buraya ekleyin
  // ...
};
```

## Proje Yapısı

```
ocr/
├── app/
│   ├── api/
│   │   └── ocr/
│   │       └── route.ts          # OCR API endpoint
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                   # Ana sayfa
├── components/
│   └── ui/                        # Shadcn/ui componentleri
├── lib/
│   └── utils.ts
├── .env.local                     # Environment variables (git'e eklenmez)
├── .env.example                   # Örnek env dosyası
├── GOOGLE_CLOUD_SETUP.md         # Google Cloud kurulum rehberi
└── package.json
```

## Teknolojiler

- **Framework**: Next.js 15
- **UI Library**: Shadcn/ui + Tailwind CSS
- **OCR**: Google Cloud Vision API
- **Language**: TypeScript
- **Icons**: Lucide React

## Build ve Production

### Production Build

```bash
npm run build
npm start
```

### Deploy

Bu projeyi Vercel, AWS, veya herhangi bir Node.js hosting platformunda deploy edebilirsiniz.

**Önemli**: Environment variables'ları deployment platformunda da ayarlamanız gerekir.

## Güvenlik

- Google Cloud credentials dosyalarını **ASLA** Git'e commit etmeyin
- API key'leri public repository'lerde paylaşmayın
- Production'da environment variables'ları güvenli bir şekilde yönetin

## Fiyatlandırma

Google Cloud Vision API:
- İlk 1,000 istek/ay **ücretsiz**
- Detaylar: [Vision API Pricing](https://cloud.google.com/vision/pricing)

## Sorun Giderme

Yaygın sorunlar ve çözümleri için [GOOGLE_CLOUD_SETUP.md](./GOOGLE_CLOUD_SETUP.md) dosyasındaki "Sorun Giderme" bölümüne bakın.

## Lisans

Bu proje kişisel kullanım için geliştirilmiştir.
