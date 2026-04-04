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
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={onPrevious}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="text-center">
        <p className="text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">
          {format(weekStart, "d MMM", { locale: nl })} – {format(weekEnd, "d MMM", { locale: nl })}
        </p>
      </div>
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={onNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onToday}>
        <Calendar className="h-3.5 w-3.5 mr-1" />
        Vandaag
      </Button>
    </div>
  );
}
