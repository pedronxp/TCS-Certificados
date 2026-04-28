import { TemplateEditor } from "@/components/templates/template-editor";
import { requireAdmin } from "@/lib/auth";

export default async function NewTemplatePage() {
  await requireAdmin();
  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold">Novo modelo</h1>
      <TemplateEditor />
    </div>
  );
}
