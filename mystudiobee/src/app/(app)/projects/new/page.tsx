import { createClient } from "@/lib/supabase/server";
import { NewProjectForm } from "./new-project-form";

export default async function NewProjectPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .is("deleted_at", null)
    .order("name");
  return <NewProjectForm clients={clients ?? []} />;
}
