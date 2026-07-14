import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Placeholder home screen for the admin scaffold. Proves: (a) the app boots,
 * (b) ported brand tokens render (cream bg / ink text / Fredoka display font /
 * comic hard shadow / brand radius), (c) stock shadcn primitives (Button, Card)
 * render on-brand via the semantic-slot mapping — no inline color overrides.
 *
 * Kept as a standalone presentational component (not inlined in the route file)
 * so the Vitest test can render it directly without the router/SSR shell.
 */
export function AdminHome() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-8 text-foreground">
      <h1 className="font-display text-display font-bold text-primary [text-shadow:var(--shadow-offset-sm)]">
        Jojo Potato Admin
      </h1>

      <Card className="w-full max-w-md rounded-3xl border-2 border-foreground shadow-[var(--shadow-offset-md)]">
        <CardHeader>
          <CardTitle className="font-display text-h3">Scaffold ready</CardTitle>
          <CardDescription>
            TanStack Start + Tailwind v4 + shadcn/ui, styled with the Jojo Potato
            brand tokens.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button className="border-2 border-foreground shadow-[var(--shadow-offset-sm)]">
            Primary action
          </Button>
          <Button
            variant="secondary"
            className="border-2 border-foreground shadow-[var(--shadow-offset-sm)]"
          >
            Secondary
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
