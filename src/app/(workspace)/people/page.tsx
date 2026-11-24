import { PeopleWorkspace, type EmployeeRow } from "@/components/people-workspace";
import { createClient } from "@/lib/supabase/server";

export default async function PeoplePage() {
  const supabase = await createClient();
  if (!supabase) return <section className="content"><h1>People</h1><p className="muted">Supabase is not configured.</p></section>;
  const [employeesResult, officesResult, casesResult, tasksResult] = await Promise.all([
    supabase.from("employees").select("id,name,designation,office_id,role,manager_id").order("name"),
    supabase.from("offices").select("id,name,location,parent_id").order("name"),
    supabase.from("pension_cases").select("id,owner_id,status"),
    supabase.from("tasks").select("id,assignee_id,status,title"),
  ]);
  const employees = employeesResult.data ?? [];
  const cases = casesResult.data ?? [];
  const tasks = tasksResult.data ?? [];
  const rows: EmployeeRow[] = employees.map((employee) => ({
    ...employee,
    office_name: officesResult.data?.find((office) => office.id === employee.office_id)?.name ?? employee.office_id,
    assigned_cases: cases.filter((record) => record.owner_id === employee.id).length,
    assigned_tasks: tasks.filter((task) => task.assignee_id === employee.id).length,
  }));
  return <section className="content"><PeopleWorkspace employees={rows} offices={officesResult.data ?? []} tasks={tasksResult.data ?? []} error={employeesResult.error?.message}/></section>;
}
