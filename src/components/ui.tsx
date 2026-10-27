// Small UI kit for the admin. Dark only, Gusto gold for primary actions.
import {
  createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/format';
import logo from '@/assets/logo.svg?raw';
import mark from '@/assets/mark.svg?raw';

// --- brand ----------------------------------------------------------------------
export const Logo = ({ className }: { className?: string }) => (
  <span className={cn('block text-gold [&>svg]:h-auto [&>svg]:w-full', className)} dangerouslySetInnerHTML={{ __html: logo }} />
);
export const Mark = ({ className }: { className?: string }) => (
  <span className={cn('block text-gold [&>svg]:h-full [&>svg]:w-auto', className)} dangerouslySetInnerHTML={{ __html: mark }} />
);

// --- buttons --------------------------------------------------------------------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-gold text-purple-deep hover:bg-gold-soft active:bg-gold-deep',
  secondary: 'bg-white/[0.07] text-white hover:bg-white/[0.11] border border-line',
  ghost: 'text-white/80 hover:bg-white/[0.06] hover:text-white',
  danger: 'bg-bad/15 text-bad hover:bg-bad/25 border border-bad/25',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-[background-color,color,transform] active:scale-[.98] disabled:pointer-events-none disabled:opacity-45',
        size === 'sm' && 'h-9 px-3 text-[13px]',
        size === 'md' && 'h-11 px-4',
        size === 'lg' && 'h-12 px-5 text-[15px]',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, className, variant = 'ghost', children, ...rest },
  ref,
) {
  return (
    <Button ref={ref} variant={variant} aria-label={label} title={label} className={cn('size-10 shrink-0 p-0', className)} {...rest}>
      {children}
    </Button>
  );
});

// --- form controls --------------------------------------------------------------
export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-white/85">{label}</label>
      {children(id)}
      {error ? <p className="text-[12px] text-bad">{error}</p> : hint && <p className="text-[12px] text-mute">{hint}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn('field', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn('field h-auto min-h-24 py-3', className)} {...rest} />;
});

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-start justify-between gap-4 py-1', disabled && 'cursor-not-allowed opacity-50')}>
      <span className="grid gap-0.5">
        <span className="font-medium">{label}</span>
        {description && <span className="text-[12.5px] text-mute">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-6 w-10 shrink-0 rounded-full p-0 transition-colors', checked ? 'bg-gold' : 'bg-white/15')}
      >
        <span className={cn('absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-xl border border-line bg-ink-850 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 whitespace-nowrap rounded-lg px-3 font-medium transition-colors',
            size === 'sm' ? 'h-7 text-[12.5px]' : 'h-9',
            value === o.value ? 'bg-white text-ink-950' : 'text-white/65 hover:text-white',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// --- display --------------------------------------------------------------------
type Tone = 'neutral' | 'gold' | 'ok' | 'warn' | 'bad';
const tones: Record<Tone, string> = {
  neutral: 'bg-white/[0.07] text-white/75',
  gold: 'bg-gold/15 text-gold',
  ok: 'bg-ok/12 text-ok',
  warn: 'bg-warn/12 text-warn',
  bad: 'bg-bad/12 text-bad',
};
export const Badge = ({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) => (
  <span className={cn('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-semibold', tones[tone], className)}>
    {dot && <span className="size-1.5 rounded-full bg-current" />}
    {children}
  </span>
);

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cn('size-5 animate-spin text-white/60', className)} />;
export const FullScreenSpinner = () => (
  <div className="grid min-h-dvh place-items-center bg-ink-950"><Mark className="h-10 animate-pulse" /></div>
);

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel grid place-items-center gap-3 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-white/[0.06] text-white/70 [&>svg]:size-6">{icon}</span>
      <div className="grid gap-1">
        <h3 className="text-[17px]">{title}</h3>
        {body && <p className="mx-auto max-w-sm text-mute">{body}</p>}
      </div>
      {action}
    </div>
  );
}

// --- dialog / bottom sheet ------------------------------------------------------
export function Dialog({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])')?.focus());
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-[fade-up_.2s_ease_both] bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-ink-850 shadow-pop animate-sheet-up sm:animate-fade-up sm:rounded-2xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="flex items-center justify-between gap-4 px-5 pb-2 pt-4">
          <h2 className="text-[19px]">{title}</h2>
          <IconButton label="Close" data-close onClick={onClose} className="-mr-2"><X className="size-5" /></IconButton>
        </div>
        <div className="scroll-thin overflow-y-auto px-5 pb-5 pt-2">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// --- toasts ---------------------------------------------------------------------
type Toast = { id: number; tone: 'ok' | 'bad'; text: string };
const ToastContext = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 6000 : 3000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
          {toasts.map((t) => (
            <div key={t.id} className="pointer-events-auto flex max-w-md animate-fade-up items-center gap-2.5 rounded-xl border border-line bg-ink-700 px-4 py-3 shadow-pop">
              {t.tone === 'ok' ? <CheckCircle2 className="size-4 shrink-0 text-ok" /> : <AlertTriangle className="size-4 shrink-0 text-bad" />}
              <span>{t.text}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

/** Confirm-before-destroy dialog. */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; body: ReactNode; action: string; resolve: (ok: boolean) => void } | null>(null);
  const confirm = useCallback(
    (title: string, body: ReactNode, action = 'Delete') => new Promise<boolean>((resolve) => setState({ title, body, action, resolve })),
    [],
  );
  const close = (ok: boolean) => { state?.resolve(ok); setState(null); };
  const dialog = (
    <Dialog
      open={!!state}
      onClose={() => close(false)}
      title={state?.title ?? ''}
      footer={<><Button variant="ghost" onClick={() => close(false)}>Cancel</Button><Button variant="danger" onClick={() => close(true)}>{state?.action}</Button></>}
    >
      <div className="text-white/80">{state?.body}</div>
    </Dialog>
  );
  return { confirm, dialog };
}
