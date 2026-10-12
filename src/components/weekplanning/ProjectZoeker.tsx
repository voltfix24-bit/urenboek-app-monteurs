import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { volledigAdres } from "@/lib/utils";
import type { WpProject } from "@/hooks/useWeekPlanningData";

interface Props { projects: WpProject[]; onSelect: (id: string) => void; className?: string }

export function ProjectZoeker({ projects, onSelect, className }: Props) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(() => [...projects].sort((a, b) => a.nummer.localeCompare(b.nummer, "nl", { numeric: true })), [projects]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={className} aria-expanded={open}>
          <Search size={14} aria-hidden="true" /><span>Zoek op projectnummer of adres</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[380px] p-0">
        <Command filter={(value, search) => (value.toLocaleLowerCase("nl").includes(search.toLocaleLowerCase("nl")) ? 1 : 0)}>
          <CommandInput placeholder="Zoek nummer of adres…" />
          <CommandList>
            <CommandEmpty>Geen project gevonden.</CommandEmpty>
            <CommandGroup>
              {sorted.map((p) => (
                <CommandItem key={p.id} value={`${p.nummer} ${p.naam} ${volledigAdres(p) || ""}`} onSelect={() => { onSelect(p.id); setOpen(false); }}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.naam || p.nummer}</p>
                    <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>{p.nummer}{p.stad ? ` · ${p.stad}` : ""}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
