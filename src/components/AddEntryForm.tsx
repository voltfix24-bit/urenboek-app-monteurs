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

  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [projectNumber, setProjectNumber] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");

  const [weekProjects, setWeekProjects] = useState<string[]>(["", "", "", "", ""]);
  const [weekDescriptions, setWeekDescriptions] = useState<string[]>(["", "", "", "", ""]);
  const [weekHours, setWeekHours] = useState<string[]>(["", "", "", "", "", "", ""]);

  const workDays = weekDates.slice(0, 5);
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

    const entries: Omit<TimeEntry, "id" | "status">[] = [];
    workDays.forEach((d, i) => {
      const h = Number(weekHours[i]);
      const proj = (weekProjects[i] || "").trim();
      if (h > 0 && proj) {
        entries.push({
          date: format(d, "yyyy-MM-dd"),
          projectNumber: proj,
          description: (weekDescriptions[i] || "").trim(),
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

    setWeekProjects(["", "", "", "", ""]);
    setWeekDescriptions(["", "", "", "", ""]);
    setWeekHours(["", "", "", "", "", "", ""]);
  };

  const weekTotal = weekHours.slice(0, 5).reduce((sum, h) => sum + (Number(h) || 0), 0);

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as "week" | "dag")}>
      <TabsList className="mb-4 h-9 rounded-lg bg-secondary/60 p-0.5">
        <TabsTrigger value="week" className="rounded-md text-xs font-medium h-8 data-[state=active]:shadow-sm">Hele week</TabsTrigger>
        <TabsTrigger value="dag" className="rounded-md text-xs font-medium h-8 data-[state=active]:shadow-sm">Per dag</TabsTrigger>
      </TabsList>

      <TabsContent value="week">
        <form onSubmit={handleWeekSubmit} className="space-y-2.5">
          {workDays.map((d, i) => (
            <div key={i} className="rounded-xl border bg-secondary/20 p-3 space-y-2 hover:bg-secondary/30 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  {dayLabels[i]} <span className="font-normal text-muted-foreground">{format(d, "d/M")}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Uren</span>
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
                    className="w-16 h-8 text-center text-sm rounded-lg font-semibold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  placeholder="Projectnummer"
                  value={weekProjects[i]}
                  onChange={(e) => {
                    const newProjects = [...weekProjects];
                    newProjects[i] = e.target.value;
                    setWeekProjects(newProjects);
                  }}
                  maxLength={20}
                  className="h-8 text-sm rounded-lg"
                />
                <Input
                  placeholder="Omschrijving"
                  value={weekDescriptions[i]}
                  onChange={(e) => {
                    const newDescs = [...weekDescriptions];
                    newDescs[i] = e.target.value;
                    setWeekDescriptions(newDescs);
                  }}
                  maxLength={200}
                  className="h-8 text-sm rounded-lg"
                />
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground font-medium">
              Totaal: <span className="font-bold text-foreground text-sm">{weekTotal}u</span>
            </span>
            <Button type="submit" size="sm" className="gap-1.5 rounded-lg gradient-primary text-primary-foreground hover:opacity-90 font-medium">
              <Plus className="h-4 w-4" />
              Toevoegen
            </Button>
          </div>
        </form>
      </TabsContent>

      <TabsContent value="dag">
        <form onSubmit={handleDaySubmit} className="space-y-3">
          <div className="space-y-2">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Dag</Label>
            <Select value={date} onValueChange={setDate}>
              <SelectTrigger className="h-10 rounded-lg">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Projectnummer</Label>
              <Input
                placeholder="bijv. PRJ-001"
                value={projectNumber}
                onChange={(e) => setProjectNumber(e.target.value)}
                maxLength={20}
                className="h-10 rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Uren</Label>
              <Input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                placeholder="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="h-10 rounded-lg font-semibold"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Omschrijving</Label>
            <Input
              placeholder="Wat heb je gedaan?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              className="h-10 rounded-lg"
            />
          </div>

          <Button type="submit" size="default" className="w-full gap-1.5 rounded-lg gradient-primary text-primary-foreground hover:opacity-90 font-medium h-10">
            <Plus className="h-4 w-4" />
            Toevoegen
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}
