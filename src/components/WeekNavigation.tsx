import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface WeekNavigationProps {
  weekStart: Date;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function WeekNavigation({
  weekStart,
  onPrevious,
  onNext,
  onToday,
}: WeekNavigationProps) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onPrevious}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="text-center px-2">
        <p className="text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap tracking-tight">
          {format(weekStart, "d MMM", { locale: nl })} – {format(weekEnd, "d MMM", { locale: nl })}
        </p>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-[11px] rounded-lg ml-1 font-medium" onClick={onToday}>
        <Calendar className="h-3 w-3 mr-1" />
        Vandaag
      </Button>
    </div>
  );
}
