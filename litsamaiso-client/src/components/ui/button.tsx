import React from 'react';
import { cn } from '../../lib/utils';

type Variant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type Size = 'default' | 'sm' | 'lg' | 'icon';

export default function Button({
  children,
  className,
  variant = 'default',
  size = 'default',
  ...props
}: React.ComponentProps<'button'> & { variant?: Variant; size?: Size; className?: string }) {
  const base = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50';

  const variantMap: Record<Variant, string> = {
    default: 'bg-primary text-white shadow-sm hover:brightness-95',
    destructive: 'bg-red-600 text-white shadow-sm hover:brightness-95',
    outline: 'border bg-white shadow-sm hover:bg-gray-50',
    secondary: 'bg-gray-100 text-gray-900 shadow-sm hover:brightness-95',
    ghost: 'bg-transparent hover:bg-gray-100',
    link: 'text-primary underline-offset-4 hover:underline bg-transparent',
  };

  const sizeMap: Record<Size, string> = {
    default: 'h-9 px-4 py-2',
    sm: 'h-8 rounded-md gap-1.5 px-3',
    lg: 'h-10 rounded-md px-6',
    icon: 'h-9 w-9 p-2',
  };

  const cls = cn(base, variantMap[variant], sizeMap[size], className || '');

  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}
