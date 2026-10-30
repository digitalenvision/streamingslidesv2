// Everything the schedule and its print-out need for one week, all departments at once
// (so every department tab can show whether its week is in order).
import { useMemo } from 'react';
import { useLoad } from './useLoad';
import { listDepartments, listEmployees, listNightNotes, listOpeners, listPosts, listShifts, listShiftTypes, listTimeOff, listWeekNotes, shiftMap } from './staff';
import { checkWeek, weekDates, type WeekData } from './schedule';

export function useWeek(start: string) {
  const dates = useMemo(() => weekDates(start), [start]);
  const load = useLoad(async () => {
    const end = dates[6];
    const [departments, shiftTypes, employees, shifts, timeOff, notes, nightNotes, posts, openers] = await Promise.all([
      listDepartments(), listShiftTypes(), listEmployees(), listShifts(start, end), listTimeOff(start, end), listWeekNotes(start), listNightNotes(start, end), listPosts(start, end), listOpeners(start, end),
    ]);
    return {
      departments, shiftTypes, employees, shifts: shiftMap(shifts), timeOff, notes, posts,
      nightNotes: new Map(nightNotes.map((n) => [n.date, n.note])),
      openers: new Map(openers.map((o) => [o.date, o.employee_id])),
    };
  }, [start]);

  const byDept = useMemo(() => {
    const d = load.data;
    if (!d) return new Map<string, { week: WeekData; check: ReturnType<typeof checkWeek> }>();
    return new Map(d.departments.map((dept) => {
      const week: WeekData = {
        dates,
        employees: d.employees.filter((e) => e.department_id === dept.id && e.active),
        shiftTypes: d.shiftTypes.filter((t) => t.department_id === dept.id && !t.archived),
        shifts: d.shifts,
        timeOff: d.timeOff,
      };
      return [dept.id, { week, check: checkWeek(dept, week) }];
    }));
  }, [load.data, dates]);

  return { ...load, dates, byDept };
}
