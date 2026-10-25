'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Password field with a show/hide toggle. The toggle is named "Show"/"Hide" (not "Show password")
 * so `getByLabel('Password')` resolves to the input alone.
 */
export function PasswordInput({
  autoComplete,
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'> & { autoComplete: 'current-password' | 'new-password'; id: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} autoComplete={autoComplete} className={cn('h-12 pr-12 text-base', className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide' : 'Show'}
        aria-pressed={visible}
        aria-controls={props.id}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg outline-none focus-visible:ring-3"
      >
        {visible ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
      </button>
    </div>
  );
}
