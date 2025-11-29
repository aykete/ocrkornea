'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, FileText, Edit3 } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl min-h-screen flex flex-col">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">Kornea OCR</h1>
          <p className="text-muted-foreground">
            Lutfen bir mod secin
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

      {/* Selection Cards */}
      <div className="flex-1 flex items-center justify-center">
        <div className="grid gap-6 md:grid-cols-2 w-full max-w-2xl">
          {/* V1 Card */}
          <Card
            className="cursor-pointer hover:border-primary hover:shadow-lg transition-all"
            onClick={() => router.push('/v1')}
          >
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 bg-primary/10 rounded-full w-fit">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">v1</CardTitle>
              <CardDescription className="text-base">
                Kornea Topografi
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center">
                Otomatik veri cikarma - K degerleri, AC Depth, Pupil Dia ve daha fazlasi
              </p>
            </CardContent>
          </Card>

          {/* V2 Card */}
          <Card
            className="cursor-pointer hover:border-primary hover:shadow-lg transition-all"
            onClick={() => router.push('/v2')}
          >
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 bg-primary/10 rounded-full w-fit">
                <Edit3 className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">v2</CardTitle>
              <CardDescription className="text-base">
                Editor OCR
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center">
                Alan secimi ile serbest OCR - istediginiz alanlari secerek veri cikarin
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
