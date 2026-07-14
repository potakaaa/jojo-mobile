"use client";

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { useFormStatus } from 'react-dom';
import { Loader2, TriangleAlert } from 'lucide-react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border-2 border-border text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  isLoading: externalIsLoading,
  onClick,
  disabled,
  children,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    isLoading?: boolean;
  }) {
  const [internalIsLoading, setInternalIsLoading] = React.useState(false);
  const isLoading = externalIsLoading || internalIsLoading;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!onClick) return;
    
    const result = onClick(e) as unknown;
    if (result instanceof Promise) {
      setInternalIsLoading(true);
      result.finally(() => {
        setInternalIsLoading(false);
      });
      return result;
    }
    return result;
  };

  const Comp = (asChild ? Slot.Root : 'button') as any;

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={onClick ? handleClick : undefined}
      disabled={disabled || isLoading}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {isLoading && <Loader2 className="animate-spin" />}
          {children}
        </>
      )}
    </Comp>
  );
}

function PrimaryButton(props: React.ComponentProps<typeof Button>) {
  return <Button variant="default" {...props} />;
}

function SecondaryButton(props: React.ComponentProps<typeof Button>) {
  return <Button variant="secondary" {...props} />;
}

function GhostButton(props: React.ComponentProps<typeof Button>) {
  return <Button variant="ghost" {...props} />;
}

function DestructiveButton({ 
  requiresConfirm, 
  onClick, 
  onBlur,
  children, 
  ...props 
}: React.ComponentProps<typeof Button> & { requiresConfirm?: boolean }) {
  const [isConfirming, setIsConfirming] = React.useState(false);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (requiresConfirm && !isConfirming) {
      e.preventDefault();
      setIsConfirming(true);
      return;
    }
    
    if (onClick) {
      const result = onClick(e) as unknown;
      if (result instanceof Promise) {
        result.finally(() => setIsConfirming(false));
      } else {
        setIsConfirming(false);
      }
      return result;
    }
    setIsConfirming(false);
  };

  const handleBlur = (e: React.FocusEvent<HTMLButtonElement>) => {
    setIsConfirming(false);
    if (onBlur) onBlur(e);
  };

  return (
    <Button
      variant="destructive"
      onClick={handleClick}
      onBlur={handleBlur}
      {...props}
    >
      <TriangleAlert />
      {isConfirming ? "Click to Confirm" : children}
    </Button>
  );
}

function SubmitButton({ children, className, ...props }: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      isLoading={pending}
      className={cn("hover:ring-2 hover:ring-border hover:ring-offset-0", className)}
      {...props}
    >
      {children}
    </Button>
  );
}

export { 
  Button, 
  PrimaryButton, 
  SecondaryButton, 
  GhostButton, 
  DestructiveButton, 
  SubmitButton, 
  buttonVariants 
};
