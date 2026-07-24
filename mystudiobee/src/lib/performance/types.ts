export type PointReason = {
  id: string;
  label: string;
  points: number;
  active: boolean;
};

export type PointEvent = {
  id: string;
  employee_id: string;
  reason_id: string;
  points: number;
  note: string;
  logged_by: string | null;
  created_at: string;
  reason_label: string;
};

export type EmployeeScore = {
  id: string;
  display_name: string;
  email: string;
  manager_id: string | null;
  score: number;
};
