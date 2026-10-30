// Tasks: things that need doing around the club ("bathroom sinks not working"). Row level
// security decides who sees which task (its audience); photos live in the private
// task-photos bucket under <task id>/.
import { supabase } from './supabase';
import type { Task, TaskComment } from '@/types';

const BUCKET = 'task-photos';

const ok = <T>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export const listTasks = async () =>
  ok(await supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(500)) as Task[];

export const countOpenTasks = async () => {
  const { count, error } = await supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'done');
  return error ? 0 : count ?? 0;
};

export const saveTask = async (t: Partial<Task>) => ok(await supabase.from('tasks').upsert(t).select().single()) as Task;
export const updateTask = async (id: string, patch: Partial<Task>) =>
  ok(await supabase.from('tasks').update(patch).eq('id', id).select().single()) as Task;

export async function deleteTask(t: Task) {
  if (t.photos.length) await supabase.storage.from(BUCKET).remove(t.photos);
  ok(await supabase.from('tasks').delete().eq('id', t.id));
}

export const listComments = async (taskId: string) =>
  ok(await supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at')) as TaskComment[];
export const countComments = async () =>
  ok(await supabase.from('task_comments').select('task_id')) as { task_id: string }[];
export const addComment = async (taskId: string, body: string) =>
  ok(await supabase.from('task_comments').insert({ task_id: taskId, body }).select().single()) as TaskComment;
export const deleteComment = async (id: string) => ok(await supabase.from('task_comments').delete().eq('id', id));

/** Shrinks a phone photo to 1600px JPEG and adds it to the task. */
export async function addTaskPhoto(task: Task, file: File) {
  const blob = await shrink(file);
  const path = `${task.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return updateTask(task.id, { photos: [...task.photos, path] });
}

export async function removeTaskPhoto(task: Task, path: string) {
  await supabase.storage.from(BUCKET).remove([path]);
  return updateTask(task.id, { photos: task.photos.filter((p) => p !== path) });
}

/** Signed links (1 hour) for a task's photos. */
export async function photoLinks(paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as [string, string]] : [])));
}

async function shrink(file: File) {
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!img) return file;
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85));
}
