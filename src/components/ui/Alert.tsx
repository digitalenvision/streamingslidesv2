import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive' | 'success' | 'warning';
}

export function Alert({ className, variant = 'default', children, ...props }: AlertProps) {
  const Icon = {
    default: Info,
    destructive: XCircle,
    success: CheckCircle,
    warning: AlertCircle,
  }[variant];

  return (
    <div
      className={cn(
        'relative w-full rounded-lg border p-4',
        {
          'bg-background text-foreground': variant === 'default',
          'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive':
            variant === 'destructive',
          'border-green-500/50 text-green-600 dark:border-green-500 [&>svg]:text-green-600':
            variant === 'success',
          'border-yellow-500/50 text-yellow-600 dark:border-yellow-500 [&>svg]:text-yellow-600':
            variant === 'warning',
        },
        className
      )}
      {...props}
    >
      <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

