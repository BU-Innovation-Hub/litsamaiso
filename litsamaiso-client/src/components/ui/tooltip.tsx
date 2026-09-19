import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export const TooltipProvider = (props: React.ComponentProps<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider {...props} />
);

interface HintProps {
  content: React.ReactNode;
  children?: React.ReactNode;
  side?: TooltipPrimitive.TooltipContentProps['side'];
  className?: string;
}

/**
 * Small contextual help tooltip. Wraps `children`, or renders a "?" icon when
 * no trigger is given. Must be inside <TooltipProvider> (mounted in App).
 */
export const Hint: React.FC<HintProps> = ({ content, children, side = 'top', className }) => (
  <TooltipPrimitive.Root delayDuration={150}>
    <TooltipPrimitive.Trigger asChild>
      {children ?? (
        <button
          type="button"
          aria-label="More information"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:text-primary-clr"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      )}
    </TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        side={side}
        sideOffset={6}
        className={cn(
          'z-60 max-w-xs rounded-lg bg-primary-clr px-3 py-2 text-xs leading-relaxed text-white shadow-lg',
          className,
        )}
      >
        {content}
        <TooltipPrimitive.Arrow className="fill-primary-clr" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
);
