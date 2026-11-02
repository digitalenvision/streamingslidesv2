// Rows of the Gusto media tables (supabase/migrations/*_gusto_media.sql).

export type AlbumStatus = 'draft' | 'published';
export type ScreenMode = 'auto' | 'pinned' | 'hidden';
export type ImageFormat = 'webp' | 'jpg';

export interface Album {
  id: string;
  slug: string;
  title: string;
  event_date: string; // YYYY-MM-DD
  description: string | null;
  fourvenues_code: string | null;
  cover_photo_id: string | null;
  status: AlbumStatus;
  show_on_web: boolean;
  screen_mode: ScreenMode;
  photo_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: string;
  album_id: string;
  position: number;
  width: number;
  height: number;
  format: ImageFormat;
  lqip: string | null;
  original_name: string | null;
  taken_at: string | null;
  hidden_web: boolean;
  hidden_screen: boolean;
  created_at: string;
}

export interface Promo {
  id: string;
  title: string;
  kind: 'image' | 'video';
  path: string;
  width: number | null;
  height: number | null;
  duration_seconds: number;
  every_n: number;
  starts_on: string | null;
  ends_on: string | null;
  active: boolean;
  position: number;
  screen_ids: string[] | null;
  created_at: string;
}

export type Transition = 'fade' | 'slide' | 'zoom' | 'none';

export interface Screen {
  id: string;
  name: string;
  max_albums: number;
  max_days: number;
  photo_seconds: number;
  transition: Transition;
  transition_seconds: number;
  margin_percent: number;
  background_path: string | null;
  shuffle: boolean;
  show_album_titles: boolean;
  legacy_slideshow_id: string | null;
  content_version: number;
  updated_at: string;
}

export interface Visitor {
  id: string;
  email: string;
  marketing_opt_in: boolean;
  first_album_id: string | null;
  downloads: number;
  created_at: string;
  last_seen_at: string;
}

export type RemovalReason = 'me' | 'friend' | 'inappropriate' | 'other';

export interface RemovalRequest {
  id: string;
  photo_id: string | null;
  album_id: string | null;
  visitor_id: string | null;
  email: string;
  reason_type: RemovalReason | null;
  reason: string | null;
  status: 'open' | 'done' | 'rejected';
  created_at: string;
  handled_at: string | null;
  handled_by: string | null;
  decision_note: string | null;
}

/** What `screen_playlist(screen_id)` returns. */
export interface Playlist {
  screen: Omit<Screen, 'updated_at'>;
  albums: { id: string; title: string; event_date: string; photos: { id: string; w: number; h: number; f: ImageFormat }[] }[];
  promos: { id: string; title: string; kind: 'image' | 'video'; path: string; w: number | null; h: number | null; duration_seconds: number; every_n: number }[];
}

// --- Gusto Command: admins and staff schedules (supabase/migrations/*_gusto_command.sql) ---

export type Role = 'owner' | 'manager';

export interface AdminAccount {
  user_id: string;
  email: string | null;
  name: string | null;
  role: Role;
  media: boolean;
  rules: boolean;
  accounting: boolean;
  teams: string[] | null;
  created_at: string;
  last_sign_in_at: string | null;
  invited: boolean;
  mfa: boolean;
}

export interface Department {
  id: string;
  name: string;
  plural: string;
  position: number;
  days_off_per_week: number | null;
  schedule_by: 'week' | 'blocks' | 'month' | 'none';
  usual_start: string;
  usual_end: string | null; // null = until closing
  locations: string[];
}

/** Who stands where on a night (security): "Stair - Entrance, 8:30 PM to 11:00 PM". */
export interface Post {
  id: string;
  department_id: string;
  date: string;
  location: string;
  start_time: string;
  end_time: string | null; // null = until closing
  employee_ids: string[];
}

export interface ShiftType {
  id: string;
  department_id: string;
  name: string;
  code: string;
  start_time: string; // HH:MM:SS
  end_time: string | null;
  weekly_target: number | null;
  daily_minimum: number[] | null; // Monday to Sunday
  color: string;
  position: number;
  archived: boolean;
}

export interface Employee {
  id: string;
  name: string;
  department_id: string;
  job_title: string | null;
  phone: string | null;
  email: string | null;
  default_shift_type_id: string | null;
  vacation_days: number;
  started_on: string | null;
  birthday: string | null;
  guest: boolean;
  counted: boolean;
  can_open: boolean; // has keys: can open the club for the early staff
  logo_path: string | null;
  logo_invert: boolean;
  active: boolean;
  notes: string | null;
  position: number;
  created_at: string;
}

export interface Shift {
  id: string;
  employee_id: string;
  date: string;
  kind: 'work' | 'off';
  shift_type_id: string | null;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
}

export type TimeOffKind = 'vacation' | 'sick' | 'leave' | 'request';

export interface TimeOff {
  id: string;
  employee_id: string;
  kind: TimeOffKind;
  starts_on: string;
  ends_on: string;
  days: number | null;
  certificate: boolean;
  note: string | null;
  created_at: string;
}

export interface WeekNote {
  department_id: string;
  week_start: string;
  note: string | null;
}

/** What the signed-in account may do (my_access()). teams: null = every team. */
export interface Access {
  role: Role;
  media: boolean;
  rules: boolean;
  accounting: boolean;
  teams: string[] | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: string | null;
  actor_email: string | null;
  table_name: string;
  action: 'insert' | 'update' | 'delete' | 'sign_in';
  record_id: string | null;
  record: Record<string, unknown> | null;
  changes: Record<string, [unknown, unknown]> | null;
}

export type TaskPriority = 'low' | 'normal' | 'urgent';
export type TaskStatus = 'open' | 'doing' | 'done';

export interface Task {
  id: string;
  title: string;
  details: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_on: string | null;
  /** 'everyone', 'owners', 'team:<department>', 'user:<user id>' */
  audience: string[];
  photos: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
  done_by: string | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author: string | null;
  body: string;
  created_at: string;
}

// --- Payments (supabase/migrations/*_payments.sql) ---------------------------------
export type Currency = 'AWG' | 'USD' | 'EUR';
export type PayMethod = 'transfer' | 'cash' | 'card' | 'check' | 'online';
export type PaymentStatus = 'open' | 'on_hold' | 'paid' | 'rejected';

export interface BankDetails {
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  iban: string | null;
  swift: string | null;
}

export interface Vendor extends BankDetails {
  id: string;
  name: string;
  category: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  bank_address: string | null;
  currency: Currency;
  method: PayMethod;
  notes: string | null;
  active: boolean;
  created_at: string;
}

/** What everyone may see of a vendor (no bank details). */
export interface VendorChoice { id: string; name: string; category: string | null; currency: Currency; method: PayMethod; has_bank: boolean }

export interface PaymentRequest extends BankDetails {
  id: string;
  vendor_id: string | null;
  payee: string;
  amount: number;
  currency: Currency;
  description: string;
  category: string | null;
  department_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  urgent: boolean;
  method: PayMethod;
  payment_reference: string | null;
  notes: string | null;
  save_vendor: boolean;
  status: PaymentStatus;
  status_note: string | null;
  paid_on: string | null;
  paid_reference: string | null;
  paid_at: string | null;
  paid_by: string | null;
  extracted: Extraction | null;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentFile {
  id: string;
  request_id: string;
  path: string;
  name: string;
  mime: string;
  size: number;
  kind: 'invoice' | 'proof' | 'other';
  uploaded_by: string | null;
  created_at: string;
}

export interface PaymentComment { id: string; request_id: string; author: string | null; body: string; created_at: string }

/** What the invoice reader found (read-invoice function). */
export interface Extraction extends BankDetails {
  is_payable: boolean;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: Currency | null;
  total_amount: number | null;
  description: string | null;
  line_items: { description: string; amount: number | null }[];
  payment_reference: string | null;
  already_paid: boolean;
  notes: string | null;
  confidence: 'high' | 'medium' | 'low';
}
