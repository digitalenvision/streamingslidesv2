// Tasks around the club: anyone with an account adds them ("bathroom sinks not working",
// with a photo) and chooses who can see them: everyone, owners only, the managers of a
// team, or chosen people. Owners see every task. Open a task to comment, add photos or
// mark it done.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, Check, CheckCircle2, Circle, CircleDot, Eye, ListTodo, MessageSquare, Plus, Send, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Badge, Button, Dialog, Empty, Field, IconButton, Input, Segmented, Spinner, Textarea, useConfirm, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { arubaToday, cn, formatDate, relativeTime } from '@/lib/format';
import { listDepartments, listAdminNames } from '@/lib/staff';
import {
  addComment, addTaskPhoto, countComments, deleteComment, deleteTask, listComments, listTasks, photoLinks, removeTaskPhoto, saveTask, updateTask,
} from '@/lib/tasks';
import { useLoad } from '@/lib/useLoad';
import type { Department, Task, TaskComment, TaskPriority, TaskStatus } from '@/types';

type People = Awaited<ReturnType<typeof listAdminNames>>;
type Ctx = { people: People; departments: Department[]; me: string; owner: boolean };

const STATUS: Record<TaskStatus, { label: string; icon: typeof Circle; tone: string }> = {
  open: { label: 'To do', icon: Circle, tone: 'text-white/60' },
  doing: { label: 'In progress', icon: CircleDot, tone: 'text-gold' },
  done: { label: 'Done', icon: CheckCircle2, tone: 'text-ok' },
};
const PRIORITY: Record<TaskPriority, { label: string; bar: string }> = {
  urgent: { label: 'Urgent', bar: 'bg-bad' },
  normal: { label: 'Normal', bar: 'bg-gold/70' },
  low: { label: 'Low', bar: 'bg-white/20' },
};

export const personName = (people: People, id: string | null | undefined) => {
  const p = people.find((x) => x.user_id === id);
  return p ? p.name ?? p.email?.split('@')[0] ?? 'Someone' : 'Someone';
};

/** "Everyone", "Owners", "Security managers", "Glenn"… */
export function audienceLabel(token: string, ctx: Pick<Ctx, 'people' | 'departments'>) {
  if (token === 'everyone') return 'Everyone';
  if (token === 'owners') return 'Owners';
  if (token.startsWith('team:')) return `${ctx.departments.find((d) => d.id === token.slice(5))?.plural ?? token.slice(5)} managers`;
  if (token.startsWith('user:')) return personName(ctx.people, token.slice(5));
  return token;
}

export function Tasks() {
  const { session, role } = useAuth();
  const toast = useToast();
  const me = session?.user.id ?? '';
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<'todo' | 'done' | 'mine'>('todo');
  const { data, reload, set } = useLoad(async () => {
    const [tasks, people, departments, comments] = await Promise.all([listTasks(), listAdminNames(), listDepartments(), countComments()]);
    const counts = new Map<string, number>();
    for (const c of comments) counts.set(c.task_id, (counts.get(c.task_id) ?? 0) + 1);
    return { tasks, people, departments, counts };
  });
  const [editing, setEditing] = useState<Partial<Task> | null>(params.has('new') ? {} : null);
  const openId = params.get('id');
  const ctx: Ctx | null = data ? { people: data.people, departments: data.departments, me, owner: role === 'owner' } : null;

  const shown = useMemo(() => {
    if (!data) return [];
    const rank = (t: Task) => (t.status === 'doing' ? 0 : 1) * 10 + (t.priority === 'urgent' ? 0 : t.priority === 'normal' ? 1 : 2);
    const list = data.tasks.filter((t) =>
      filter === 'done' ? t.status === 'done'
        : filter === 'mine' ? t.status !== 'done' && (t.created_by === me || t.audience.includes(`user:${me}`))
          : t.status !== 'done');
    return filter === 'done' ? list : list.sort((a, b) => rank(a) - rank(b) || (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || b.created_at.localeCompare(a.created_at));
  }, [data, filter, me]);
  const todo = data?.tasks.filter((t) => t.status !== 'done').length ?? 0;
  const open = data?.tasks.find((t) => t.id === openId) ?? null;

  const replace = (t: Task) => set((d) => d && { ...d, tasks: d.tasks.some((x) => x.id === t.id) ? d.tasks.map((x) => (x.id === t.id ? t : x)) : [t, ...d.tasks] });

  return (
    <>
      <PageHeader
        kicker="Tonight"
        title="Tasks"
        subtitle="Things that need doing around the club. Each task is only shown to the people it’s meant for."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({})}>New task</Button>}
      />
      <Segmented
        value={filter}
        onChange={setFilter}
        className="mb-5"
        options={[
          { value: 'todo', label: <>To do {todo > 0 && <span className="ml-1 opacity-60">{todo}</span>}</> },
          { value: 'mine', label: 'Mine' },
          { value: 'done', label: 'Done' },
        ]}
      />
      {!data || !ctx ? <div className="grid h-48 place-items-center"><Spinner /></div>
        : shown.length === 0 ? <Empty icon={<ListTodo />} title={filter === 'done' ? 'Nothing done yet' : 'Nothing to do'} body={filter === 'done' ? undefined : 'Add a task when something needs fixing or doing, like broken sinks or a delivery to check.'} />
        : (
          <div className="grid gap-2.5">
            {shown.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                ctx={ctx}
                comments={data.counts.get(t.id) ?? 0}
                onOpen={() => setParams({ id: t.id })}
                onStatus={async (status) => { try { replace(await updateTask(t.id, { status })); } catch (e) { toast((e as Error).message, 'bad'); } }}
              />
            ))}
          </div>
        )}

      {ctx && editing && (
        <TaskForm
          initial={editing}
          ctx={ctx}
          onClose={() => { setEditing(null); if (params.has('new')) setParams({}); }}
          onSaved={(t) => { replace(t); setEditing(null); setParams({ id: t.id }); }}
        />
      )}
      {ctx && open && (
        <TaskDetail
          key={open.id}
          task={open}
          ctx={ctx}
          onClose={() => setParams({})}
          onChange={replace}
          onEdit={() => setEditing(open)}
          onDeleted={() => { setParams({}); reload(); }}
          onComments={(n) => set((d) => d && { ...d, counts: new Map(d.counts).set(open.id, n) })}
        />
      )}
    </>
  );
}

function TaskRow({ task: t, ctx, comments, onOpen, onStatus }: { task: Task; ctx: Ctx; comments: number; onOpen: () => void; onStatus: (s: TaskStatus) => void }) {
  const today = arubaToday();
  const overdue = !!t.due_on && t.due_on < today && t.status !== 'done';
  const S = STATUS[t.status];
  return (
    <article className={cn('panel relative flex items-stretch overflow-hidden', t.status === 'done' && 'opacity-60')}>
      <span className={cn('w-1 shrink-0', PRIORITY[t.priority].bar)} aria-hidden />
      <button
        onClick={() => onStatus(t.status === 'done' ? 'open' : 'done')}
        title={t.status === 'done' ? 'Mark as not done' : 'Mark as done'}
        className={cn('grid w-12 shrink-0 place-items-center hover:bg-white/[0.04]', S.tone)}
      >
        <S.icon className="size-5" />
      </button>
      <button onClick={onOpen} className="grid min-w-0 flex-1 gap-1 py-3 pr-4 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('font-semibold', t.status === 'done' && 'line-through decoration-white/40')}>{t.title}</span>
          {t.priority === 'urgent' && t.status !== 'done' && <Badge tone="bad">Urgent</Badge>}
          {t.status === 'doing' && <Badge tone="gold">In progress</Badge>}
          {t.due_on && <span className={cn('text-[12px]', overdue ? 'font-semibold text-bad' : 'text-white/50')}>{overdue ? 'Overdue · ' : 'Due '}{formatDate(t.due_on, { weekday: 'short', month: 'short', day: 'numeric' })}</span>}
        </div>
        {t.details && <p className="line-clamp-2 text-[13px] text-white/70">{t.details}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/45">
          <span className="flex items-center gap-1"><Eye className="size-3.5" />{t.audience.map((a) => audienceLabel(a, ctx)).join(', ')}</span>
          {t.photos.length > 0 && <span className="flex items-center gap-1"><Camera className="size-3.5" />{t.photos.length}</span>}
          {comments > 0 && <span className="flex items-center gap-1"><MessageSquare className="size-3.5" />{comments}</span>}
          <span>{t.status === 'done' && t.done_at ? `Done by ${personName(ctx.people, t.done_by)} ${relativeTime(t.done_at)}` : `${personName(ctx.people, t.created_by)} · ${relativeTime(t.created_at)}`}</span>
        </div>
      </button>
    </article>
  );
}

/** Who can see a task: everyone, or any mix of owners, team managers and people. */
function AudiencePicker({ value, onChange, ctx }: { value: string[]; onChange: (v: string[]) => void; ctx: Ctx }) {
  const everyone = value.includes('everyone');
  const toggle = (token: string) => onChange(value.includes(token) ? value.filter((x) => x !== token) : [...value.filter((x) => x !== 'everyone'), token]);
  const chip = (token: string, label: string) => (
    <button
      key={token}
      type="button"
      onClick={() => toggle(token)}
      className={cn('flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px]', value.includes(token) ? 'border-gold bg-gold/15 text-gold' : 'border-line text-white/70 hover:bg-white/[0.05]')}
    >
      {value.includes(token) && <Check className="size-3.5" />}{label}
    </button>
  );
  const teams = ctx.departments.filter((d) => d.schedule_by !== 'none');
  return (
    <div className="grid gap-3">
      <Segmented<'everyone' | 'some'>
        value={everyone ? 'everyone' : 'some'}
        onChange={(v) => onChange(v === 'everyone' ? ['everyone'] : [])}
        className="w-full"
        options={[{ value: 'everyone', label: 'Everyone in Command' }, { value: 'some', label: 'Only some people' }]}
      />
      {!everyone && (
        <div className="grid gap-2.5">
          <div className="flex flex-wrap gap-1.5">{chip('owners', 'Owners')}{teams.map((d) => chip(`team:${d.id}`, `${d.plural} managers`))}</div>
          <div className="flex flex-wrap gap-1.5">{ctx.people.filter((p) => p.user_id !== ctx.me).map((p) => chip(`user:${p.user_id}`, p.name ?? p.email ?? 'Someone'))}</div>
          <p className="text-[12px] text-mute">You and the owners always see it.{value.length === 0 && ' Pick at least one.'}</p>
        </div>
      )}
    </div>
  );
}

function TaskForm({ initial, ctx, onClose, onSaved }: { initial: Partial<Task>; ctx: Ctx; onClose: () => void; onSaved: (t: Task) => void }) {
  const toast = useToast();
  const [t, setT] = useState<Partial<Task>>({ priority: 'normal', audience: ['everyone'], ...initial });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Task>) => setT((x) => ({ ...x, ...patch }));
  const audience = t.audience ?? ['everyone'];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!t.title?.trim() || !audience.length) return;
    setBusy(true);
    try {
      let saved = await saveTask({
        ...(t.id ? { id: t.id } : {}),
        title: t.title.trim(), details: t.details?.trim() || null, priority: t.priority, due_on: t.due_on || null, audience,
      });
      for (const f of files) saved = await addTaskPhoto(saved, f);
      toast(t.id ? 'Task saved' : 'Task added');
      onSaved(saved);
    } catch (err) { toast((err as Error).message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.id ? 'Edit task' : 'New task'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="task-form" loading={busy} disabled={!t.title?.trim() || !audience.length}>{t.id ? 'Save' : 'Add task'}</Button></>}
    >
      <form id="task-form" onSubmit={submit} className="grid gap-4">
        <Field label="What needs doing?">{(id) => <Input id={id} autoFocus maxLength={140} placeholder="e.g. Bathroom sinks not working" value={t.title ?? ''} onChange={(e) => set({ title: e.target.value })} />}</Field>
        <Field label="Details (optional)">{(id) => <Textarea id={id} rows={3} maxLength={2000} placeholder="Which bathroom, what’s wrong, who to call…" value={t.details ?? ''} onChange={(e) => set({ details: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium text-white/85">Priority</span>
            <Segmented<TaskPriority> value={t.priority ?? 'normal'} onChange={(priority) => set({ priority })} className="w-full" options={[{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'urgent', label: 'Urgent' }]} />
          </div>
          <Field label="Due (optional)">{(id) => <Input id={id} type="date" value={t.due_on ?? ''} onChange={(e) => set({ due_on: e.target.value || null })} />}</Field>
        </div>
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium text-white/85">Who can see it?</span>
          <AudiencePicker value={audience} onChange={(a) => set({ audience: a })} ctx={ctx} />
        </div>
        {!t.id && (
          <div className="grid gap-2">
            <span className="text-[13px] font-medium text-white/85">Photos (optional)</span>
            <div className="flex flex-wrap items-center gap-2">
              {files.map((f, i) => (
                <span key={i} className="relative size-16 overflow-hidden rounded-lg border border-line">
                  <img src={URL.createObjectURL(f)} alt="" className="size-full object-cover" />
                  <button type="button" aria-label="Remove photo" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/70"><X className="size-3" /></button>
                </span>
              ))}
              {files.length < 6 && <Button type="button" size="sm" icon={<Camera className="size-4" />} onClick={() => fileInput.current?.click()}>Add photo</Button>}
            </div>
            <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { setFiles((x) => [...x, ...Array.from(e.target.files ?? [])].slice(0, 6)); e.target.value = ''; }} />
          </div>
        )}
      </form>
    </Dialog>
  );
}

function TaskDetail({ task: t, ctx, onClose, onChange, onEdit, onDeleted, onComments }: {
  task: Task; ctx: Ctx; onClose: () => void; onChange: (t: Task) => void; onEdit: () => void; onDeleted: () => void; onComments: (n: number) => void;
}) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [links, setLinks] = useState<Map<string, string>>(new Map());
  const [zoom, setZoom] = useState<string | null>(null);
  const [text, setText] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const mine = t.created_by === ctx.me || ctx.owner;

  useEffect(() => { listComments(t.id).then(setComments, () => setComments([])); }, [t.id]);
  useEffect(() => { photoLinks(t.photos).then(setLinks); }, [t.photos]);

  const run = async (fn: () => Promise<Task>) => { try { onChange(await fn()); } catch (e) { toast((e as Error).message, 'bad'); } };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const c = await addComment(t.id, text.trim());
      const next = [...(comments ?? []), c];
      setComments(next); onComments(next.length); setText('');
    } catch (err) { toast((err as Error).message, 'bad'); }
  };

  return (
    <Dialog open onClose={onClose} title={t.title} wide>
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<TaskStatus>
            value={t.status}
            onChange={(status) => run(() => updateTask(t.id, { status }))}
            options={(['open', 'doing', 'done'] as const).map((s) => ({ value: s, label: STATUS[s].label }))}
          />
          {t.priority !== 'normal' && <Badge tone={t.priority === 'urgent' ? 'bad' : undefined}>{PRIORITY[t.priority].label}</Badge>}
          {t.due_on && <span className="text-[13px] text-white/60">Due {formatDate(t.due_on, { weekday: 'long', month: 'short', day: 'numeric' })}</span>}
          {mine && (
            <span className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
              <IconButton label="Delete task" className="size-9 hover:text-bad" onClick={async () => {
                if (!(await confirm('Delete this task?', 'It’s gone for everyone, with its photos and comments.', 'Delete'))) return;
                try { await deleteTask(t); onDeleted(); } catch (e) { toast((e as Error).message, 'bad'); }
              }}><Trash2 className="size-4" /></IconButton>
            </span>
          )}
        </div>

        {t.details && <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-white/85">{t.details}</p>}

        <div className="flex flex-wrap items-center gap-2">
          {t.photos.map((p) => (
            <span key={p} className="group relative size-24 overflow-hidden rounded-xl border border-line bg-ink-800">
              {links.get(p) && <button onClick={() => setZoom(links.get(p)!)} className="size-full"><img src={links.get(p)} alt="" className="size-full object-cover" /></button>}
              <button aria-label="Remove photo" onClick={async () => { if (await confirm('Remove this photo?', undefined, 'Remove')) run(() => removeTaskPhoto(t, p)); }} className="absolute right-1 top-1 hidden size-6 place-items-center rounded-full bg-black/70 group-hover:grid"><X className="size-3.5" /></button>
            </span>
          ))}
          {t.photos.length < 6 && (
            <Button size="sm" icon={<Camera className="size-4" />} loading={busy} onClick={() => fileInput.current?.click()}>Add photo</Button>
          )}
          <input ref={fileInput} type="file" accept="image/*" className="sr-only" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            setBusy(true); await run(() => addTaskPhoto(t, f)); setBusy(false);
          }} />
        </div>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-white/50">
          <span className="flex items-center gap-1"><Eye className="size-3.5" /> {t.audience.map((a) => audienceLabel(a, ctx)).join(', ')}</span>
          <span>Added by {personName(ctx.people, t.created_by)} {relativeTime(t.created_at)}</span>
          {t.status === 'done' && t.done_at && <span className="text-ok">Done by {personName(ctx.people, t.done_by)} {relativeTime(t.done_at)}</span>}
        </p>

        <section className="grid gap-3 border-t border-line pt-4">
          <h3 className="text-[13px] font-semibold text-white/70">Updates</h3>
          {!comments ? <Spinner /> : comments.length === 0 ? <p className="text-[13px] text-mute">No updates yet. Add one when something happens, like “Plumber coming Thursday”.</p> : (
            <ul className="grid gap-2.5">
              {comments.map((c) => (
                <li key={c.id} className="group rounded-xl bg-white/[0.04] px-3.5 py-2.5">
                  <div className="flex items-center gap-2 text-[12px] text-white/50">
                    <span className="font-semibold text-white/80">{personName(ctx.people, c.author)}</span>
                    <span>{relativeTime(c.created_at)}</span>
                    {c.author === ctx.me && (
                      <button className="ml-auto hidden text-white/40 hover:text-bad group-hover:block" onClick={async () => {
                        await deleteComment(c.id);
                        const next = comments.filter((x) => x.id !== c.id); setComments(next); onComments(next.length);
                      }}>Delete</button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[14px]">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={send} className="flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Add an update…" aria-label="Add an update" />
            <IconButton label="Send update" variant="primary" type="submit" disabled={!text.trim()}><Send className="size-4" /></IconButton>
          </form>
        </section>
      </div>
      {zoom && (
        <Dialog open onClose={() => setZoom(null)} title="Photo" wide>
          <img src={zoom} alt="" className="mx-auto max-h-[75vh] rounded-lg object-contain" />
        </Dialog>
      )}
      {dialog}
    </Dialog>
  );
}
