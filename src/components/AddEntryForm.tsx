import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { useProjects } from "@/hooks/useProjects";

interface AddEntryFormProps {
  weekDates: Date[];
  onAdd: (entry: { date: string; projectId: string; description: string; hours: number }) => void;
  onAddMultiple?: (entries: { date: string; projectId: string; description: string; hours: number }[]) => void;
}

export function AddEntryForm({ weekDates, onAdd, onAddMultiple }: AddEntryFormProps) {
  const { projects } = useProjects();
  const [mode, setMode] = useState<"week" | "dag">("dag");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");

  const handleDaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !hours || Number(hours) <= 0) return;
    onAdd({ date, projectId, description: description.trim(), hours: Number(hours) });
    setProjectId("");
    setDescription("");
    setHours("");
  };

  return (
    <form onSubmit={handleDaySubmit} className="space-y-3">
      <div className="space-y-2">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Dag</Label>
        <Select value={date} onValueChange={setDate}>
          <SelectTrigger className="h-10 rounded-lg"><SelectValue /></SelectTrigger>
          <SelectContent>
            {weekDates.map((d) => (
              <SelectItem key={format(d, "yyyy-MM-dd")} value={format(d, "yyyy-MM-dd")}>
                {format(d, "EEEE d MMM", { locale: nl })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Project</Label>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="h-10 rounded-lg"><SelectValue placeholder="Kies project" /></SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.nummer} – {p.naam}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Uren</Label>
        <Input type="number" step="0.25" min="0.25" max="24" placeholder="0" value={hours} onChange={(e) => setHours(e.target.value)} className="h-10 rounded-lg font-semibold" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Omschrijving</Label>
        <Input placeholder="Wat heb je gedaan?" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} className="h-10 rounded-lg" />
      </div>
      <Button type="submit" size="default" className="w-full gap-1.5 rounded-lg gradient-primary text-primary-foreground hover:opacity-90 font-medium h-10">
        <Plus className="h-4 w-4" /> Toevoegen
      </Button>
    </form>
  );
}
