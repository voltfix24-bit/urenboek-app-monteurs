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
    <div className="flex items-center gap-3">
      <Button variant="outline" size="icon" onClick={onPrevious}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="text-center min-w-[220px]">
        <p className="text-sm font-semibold text-foreground">
          {format(weekStart, "d MMM", { locale: nl })} –{" "}
          {format(weekEnd, "d MMM yyyy", { locale: nl })}
        </p>
      </div>
      <Button variant="outline" size="icon" onClick={onNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={onToday} className="ml-1">
        <Calendar className="h-4 w-4 mr-1" />
        Vandaag
      </Button>
    </div>
  );
}
