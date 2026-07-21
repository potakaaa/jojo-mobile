import { createFileRoute } from '@tanstack/react-router';
import {
  Button,
  PrimaryButton,
  SecondaryButton,
  GhostButton,
  DestructiveButton,
  SubmitButton,
} from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/(dashboard)/components')({
  component: ComponentsShowcase,
});

function ComponentsShowcase() {
  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Component Showcase</h1>
        <p className="text-muted-foreground mt-2">Reference for Jojo Potato admin UI components.</p>
      </div>

      {/* Buttons Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-ink border-b pb-2">Buttons</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
          <div className="flex flex-col gap-2 items-start">
            <span className="text-sm font-medium text-muted-foreground">Default</span>
            <Button>Button</Button>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <span className="text-sm font-medium text-muted-foreground">Primary</span>
            <PrimaryButton>PrimaryButton</PrimaryButton>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <span className="text-sm font-medium text-muted-foreground">Secondary</span>
            <SecondaryButton>SecondaryButton</SecondaryButton>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <span className="text-sm font-medium text-muted-foreground">Former Outline</span>
            <SecondaryButton>SecondaryButton</SecondaryButton>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <span className="text-sm font-medium text-muted-foreground">Ghost</span>
            <GhostButton>GhostButton</GhostButton>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <span className="text-sm font-medium text-muted-foreground">Destructive</span>
            <DestructiveButton requiresConfirm>DestructiveButton</DestructiveButton>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <span className="text-sm font-medium text-muted-foreground">Submit</span>
            <form action={() => {}} className="inline-block">
              <SubmitButton>SubmitButton</SubmitButton>
            </form>
          </div>
        </div>
      </section>

      {/* Cards Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-ink border-b pb-2">Cards</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Example Card</CardTitle>
              <CardDescription>
                This is a fully composed card using all sub-components.
              </CardDescription>
              <CardAction>
                <PrimaryButton size="sm">Action</PrimaryButton>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                Here is some content inside the card. The card uses the Jojo Potato design language
                with brand radius and 4px hard shadow.
              </p>
            </CardContent>
            <CardFooter>
              <span className="text-sm text-muted-foreground">Footer information here</span>
            </CardFooter>
          </Card>
        </div>
      </section>

      {/* Inputs Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-ink border-b pb-2">Inputs</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink">Standard Input</label>
            <Input placeholder="Enter text..." />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink">Disabled Input</label>
            <Input disabled placeholder="Disabled..." />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink">Error Input</label>
            <Input aria-invalid="true" placeholder="Has error..." defaultValue="Invalid value" />
          </div>
        </div>
      </section>
    </div>
  );
}
