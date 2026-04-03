import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { TimeEntry } from "@/types/timesheet";

interface AddEntryFormProps {
  weekDates: Date[];
  onAdd: (entry: Omit<TimeEntry, "id" | "status">) => void;
}

export function AddEntryForm({ weekDates, onAdd }: AddEntryFormProps) {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [projectNumber, setProjectNumber] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectNumber.trim() || !hours || Number(hours) <= 0) return;

    onAdd({
      date,
      projectNumber: projectNumber.trim(),
      description: description.trim(),
      hours: Number(hours),
    });

    setProjectNumber("");
    setDescription("");
    setHours("");
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr_auto_auto] gap-3 items-end">
      <div className="space-y-1.5">
        <Label htmlFor="date" className="text-xs text-muted-foreground font-medium">Dag</Label>
        <Select value={date} onValueChange={setDate}>
          <SelectTrigger id="date">
            <SelectValue />
          </SelectTrigger>
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
        <Label htmlFor="project" className="text-xs text-muted-foreground font-medium">Projectnummer</Label>
        <Input
          id="project"
          placeholder="bijv. PRJ-001"
          value={projectNumber}
          onChange={(e) => setProjectNumber(e.target.value)}
          maxLength={20}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="desc" className="text-xs text-muted-foreground font-medium">Omschrijving</Label>
        <Input
          id="desc"
          placeholder="Wat heb je gedaan?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hours" className="text-xs text-muted-foreground font-medium">Uren</Label>
        <Input
          id="hours"
          type="number"
          step="0.25"
          min="0.25"
          max="24"
          placeholder="0"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-20"
        />
      </div>

      <Button type="submit" size="default" className="gap-1.5">
        <Plus className="h-4 w-4" />
        Toevoegen
      </Button>
    </form>
  );
}
