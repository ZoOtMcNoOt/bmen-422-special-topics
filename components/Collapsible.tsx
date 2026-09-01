'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  title: string;
  /** Heading level for the title, so the document outline stays sensible. */
  as?: 'h2' | 'h3';
  /** Always show the content at the `lg` breakpoint and hide the toggle. */
  alwaysOpenOnDesktop?: boolean;
  children: ReactNode;
};

/** A disclosure driven by state, so it can't get stuck closed when the viewport widens. */
export function Collapsible({ title, as: Heading = 'h2', alwaysOpenOnDesktop = false, children }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <Heading className="text-sm font-semibold text-foreground">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className={cn('flex w-full items-center justify-between px-4 py-3 text-left', alwaysOpenOnDesktop && 'lg:hidden')}
        >
          {title}
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
        {alwaysOpenOnDesktop && <span className="hidden px-4 pt-3 lg:block">{title}</span>}
      </Heading>
      <div id={id} className={cn('px-4 pb-4', open ? 'block' : 'hidden', alwaysOpenOnDesktop && 'lg:block')}>
        {children}
      </div>
    </div>
  );
}
