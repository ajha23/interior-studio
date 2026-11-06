/** Shown instead of a blank page when the build is missing its Supabase settings (spec 042, FR-002). */
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <main className="grid min-h-full place-items-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-base font-semibold">Interior Studio is not configured</h1>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p role="alert">{message}</p>
          <p className="text-muted-foreground">
            Add the variables to the environment this build runs in (for local development, <code>.env.local</code>; see{' '}
            <code>.env.example</code>), then rebuild.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
