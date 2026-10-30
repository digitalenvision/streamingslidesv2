// Printable week schedule: white A4 landscape, one page per department, to hang up or hand out.
// /schedule/print?week=YYYY-MM-DD&dept=bar   (no dept = every department)
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { arubaToday } from '@/lib/format';
import {
  DAY_LONG, TIME_OFF, askedOff, cellAt, cellText, formatRange, fmtTime, isoWeek, weekStart,
} from '@/lib/schedule';
import { useWeek } from '@/lib/useWeek';
import { MonthPrint } from './MonthSchedule';
import { BlockPrint } from './BlockWeek';

export function SchedulePrint() {
  const [params, setParams] = useSearchParams();
  const start = weekStart(params.get('week') ?? arubaToday(true));
  const only = params.get('dept');
  const { data, dates, byDept } = useWeek(start);

  useEffect(() => {
    document.title = `Gusto schedule · week ${isoWeek(start)}`;
    return () => { document.title = 'Gusto Command'; };
  }, [start]);

  if (!data) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;
  const monthDept = data.departments.find((d) => d.id === only && d.schedule_by === 'month');
  if (monthDept && params.get('month')) return <MonthPrint dept={monthDept} month={params.get('month')!} />;
  const depts = data.departments.filter((d) => (!only || d.id === only) && d.schedule_by !== 'month' && d.schedule_by !== 'none' && (byDept.get(d.id)?.week.employees.length ?? 0) > 0);

  return (
    <div className="min-h-dvh bg-[#e9e7ee] text-black print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-black/10 bg-white/90 px-4 py-3 backdrop-blur print:hidden">
        <Link to={`/schedule?week=${start}${only ? `&dept=${only}` : ''}`} className="mr-auto flex items-center gap-2 text-[13px] font-medium text-black/60 hover:text-black"><ArrowLeft className="size-4" /> Back to schedule</Link>
        <select
          value={only ?? ''}
          onChange={(e) => setParams((p) => { if (e.target.value) p.set('dept', e.target.value); else p.delete('dept'); return p; })}
          className="h-10 rounded-lg border border-black/15 bg-white px-3 text-[14px]"
        >
          <option value="">All departments</option>
          {data.departments.filter((d) => d.schedule_by !== 'none').map((d) => <option key={d.id} value={d.id}>{d.plural}</option>)}
        </select>
        <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>
      </div>

      <div className="mx-auto grid max-w-[1100px] gap-6 p-4 print:block print:max-w-none print:p-0">
        {depts.length === 0 && <p className="py-20 text-center text-black/50">Nobody is scheduled in this department.</p>}
        {depts.map((dept) => {
          const { week, check } = byDept.get(dept.id)!;
          if (dept.schedule_by === 'blocks') return <BlockPrint key={dept.id} dept={dept} data={data} team={week.employees} dates={dates} />;
          const note = data.notes.find((n) => n.department_id === dept.id)?.note;
          const away = week.timeOff.filter((t) => week.employees.some((e) => e.id === t.employee_id) && t.kind !== 'request');
          return (
            <section key={dept.id} className="print-sheet rounded-md bg-white p-8 shadow-sm print:break-after-page print:rounded-none print:p-0 print:shadow-none">
              <header className="flex items-end justify-between border-b-2 border-black pb-3">
                <div>
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-black/50">Gusto Aruba · Week {isoWeek(start)}</div>
                  <h1 className="mt-1 font-display text-[30px] font-bold leading-none">{dept.plural}</h1>
                </div>
                <div className="text-right">
                  <div className="font-display text-[20px] font-bold">{formatRange(dates[0], dates[6])} {dates[6].slice(0, 4)}</div>
                </div>
              </header>

              {note && <p className="mt-3 rounded border-l-4 border-black bg-black/[0.04] px-3 py-2 text-[13px] font-medium">{note}</p>}

              {/* Same layout as the sheet the team already uses: a person per row, the
                  number working each night on top, a note above special nights. */}
              <table className="mt-4 w-full table-fixed border-collapse text-[13px]">
                <thead>
                  {dates.some((d) => data.nightNotes.get(d)) && (
                    <tr>
                      <th className="w-[16%]" />
                      {dates.map((d) => <th key={d} className="pb-1 text-center text-[13px] font-bold text-[#c2410c]">{data.nightNotes.get(d) ?? ''}</th>)}
                    </tr>
                  )}
                  <tr>
                    <th className="border border-black px-2 py-1.5" />
                    {dates.map((d, i) => (
                      <th key={d} className="border border-black px-1 py-1.5 text-center text-[13px] font-bold">{DAY_LONG[i]} {Number(d.slice(8))}</th>
                    ))}
                  </tr>
                  <tr>
                    <th className="border border-black px-2 py-1 text-left text-[11px] font-normal text-black/60">Working</th>
                    {dates.map((d, i) => <th key={d} className="border border-black py-1 text-center text-[15px] font-bold">{check.days[i].working}</th>)}
                  </tr>
                  {week.employees.some((e) => e.can_open) && (
                    <tr>
                      <th className="border border-black px-2 py-1 text-left text-[11px] font-normal text-black/60">Opens</th>
                      {dates.map((d) => <th key={d} className="border border-black py-1 text-center text-[12px] font-bold">{data.employees.find((e) => e.id === data.openers.get(d))?.name ?? ''}</th>)}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {week.employees.map((e) => (
                    <tr key={e.id}>
                      <td className="border border-black/50 px-2 py-1.5 font-bold">{e.name}{!e.counted && <span className="ml-1.5 text-[11px] font-normal text-black/55">{e.job_title?.toLowerCase() || 'not counted'}</span>}</td>
                      {dates.map((d) => {
                        const c = cellAt(week, e.id, d);
                        const asked = askedOff(week.timeOff, e.id, d);
                        return (
                          <td key={d} className={`border border-black/50 px-1 py-1.5 text-center ${c.type === 'work' ? 'font-semibold' : 'text-black/55'}`}>
                            {c.type === 'empty' ? (asked ? <span className="text-[11px]">asked off</span> : '') : cellText(c)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              <footer className="mt-4 flex flex-wrap items-start justify-between gap-4 text-[11px] text-black/70">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {week.shiftTypes.map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-1.5">
                      {t.name} {fmtTime(t.start_time)}{t.end_time ? `–${fmtTime(t.end_time)}` : ''}
                    </span>
                  ))}
                </div>
                {away.length > 0 && (
                  <div className="text-right">
                    <b>Away:</b>{' '}
                    {away.map((t) => `${week.employees.find((e) => e.id === t.employee_id)?.name} (${TIME_OFF[t.kind].label.toLowerCase()} ${formatRange(t.starts_on, t.ends_on)})`).join(' · ')}
                  </div>
                )}
              </footer>
              <div className="mt-6 flex justify-between border-t border-black/15 pt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-black/40">
                <span>Changes go through the manager</span>
                <span>Printed {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </section>
          );
        })}
      </div>
      <style>{'@page { size: A4 landscape; margin: 12mm; } @media print { html, body { background: #fff !important; color: #000; } }'}</style>
    </div>
  );
}
