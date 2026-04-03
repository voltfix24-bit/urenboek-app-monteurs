import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { TimeEntry } from "@/types/timesheet";

interface AddEntryFormProps {
  weekDates: Date[];
  onAdd: (entry: Omit<TimeEntry, "id" | "status">) => void;
  onAddMultiple?: (entries: Omit<TimeEntry, "id" | "status">[]) => void;
}

export function AddEntryForm({ weekDates, onAdd, onAddMultiple }: AddEntryFormProps) {
  const [mode, setMode] = useState<"week" | "dag">("week");

  // Per-day mode
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [projectNumber, setProjectNumber] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");

  // Week mode
  const [weekProject, setWeekProject] = useState("");
  const [weekDescription, setWeekDescription] = useState("");
  const [weekHours, setWeekHours] = useState<string[]>(["", "", "", "", "", "", ""]);

  const workDays = weekDates.slice(0, 5); // ma t/m vr
  const dayLabels = ["Ma", "Di", "Wo", "Do", "Vr"];

  const handleDaySubmit = (e: React.FormEvent) => {
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

  const handleWeekSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!weekProject.trim()) return;

    const entries: Omit<TimeEntry, "id" | "status">[] = [];
    workDays.forEach((d, i) => {
      const h = Number(weekHours[i]);
      if (h > 0) {
        entries.push({
          date: format(d, "yyyy-MM-dd"),
          projectNumber: weekProject.trim(),
          description: weekDescription.trim(),
          hours: h,
        });
      }
    });

    if (entries.length === 0) return;

    if (onAddMultiple) {
      onAddMultiple(entries);
    } else {
      entries.forEach((entry) => onAdd(entry));
    }

    setWeekProject("");
    setWeekDescription("");
    setWeekHours(["", "", "", "", "", "", ""]);
  };

  const weekTotal = weekHours.slice(0, 5).reduce((sum, h) => sum + (Number(h) || 0), 0);

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as "week" | "dag")}>
      <TabsList className="mb-4">
        <TabsTrigger value="week">Hele week</TabsTrigger>
        <TabsTrigger value="dag">Per dag</TabsTrigger>
      </TabsList>

      <TabsContent value="week">
        <form onSubmit={handleWeekSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">Projectnummer</Label>
              <Input
                placeholder="bijv. PRJ-001"
                value={weekProject}
                onChange={(e) => setWeekProject(e.target.value)}
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">Omschrijving</Label>
              <Input
                placeholder="Wat heb je gedaan?"
                value={weekDescription}
                onChange={(e) => setWeekDescription(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">Uren per dag</Label>
            <div className="grid grid-cols-5 gap-2">
              {workDays.map((d, i) => (
                <div key={i} className="space-y-1">
                  <div className="text-center">
                    <span className="text-xs font-medium text-muted-foreground">{dayLabels[i]}</span>
                    <span className="text-[10px] text-muted-foreground block">
                      {format(d, "d/M")}
                    </span>
                  </div>
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    placeholder="0"
                    value={weekHours[i]}
                    onChange={(e) => {
                      const newHours = [...weekHours];
                      newHours[i] = e.target.value;
                      setWeekHours(newHours);
                    }}
                    className="text-center"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Totaal: <span className="font-semibold text-foreground">{weekTotal} uur</span>
            </span>
            <Button type="submit" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Week toevoegen
            </Button>
          </div>
        </form>
      </TabsContent>

      <TabsContent value="dag">
        <form onSubmit={handleDaySubmit} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr_auto_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">Dag</Label>
            <Select value={date} onValueChange={setDate}>
              <SelectTrigger>
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
            <Label className="text-xs text-muted-foreground font-medium">Projectnummer</Label>
            <Input
              placeholder="bijv. PRJ-001"
              value={projectNumber}
              onChange={(e) => setProjectNumber(e.target.value)}
              maxLength={20}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">Omschrijving</Label>
            <Input
              placeholder="Wat heb je gedaan?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">Uren</Label>
            <Input
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
      </TabsContent>
    </Tabs>
  );
}
