import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanningDialog } from "@/components/PlanningDialog";
import { TeamPlanningGrid } from "@/components/TeamPlanningGrid";
import { formatUren, formatUrenGetal } from "@/lib/formatting";

const weekDates = [
  new Date("2026-10-05T07:00:00Z"),
  new Date("2026-10-06T07:00:00Z"),
  new Date("2026-10-07T07:00:00Z"),
  new Date("2026-10-08T07:00:00Z"),
  new Date("2026-10-09T07:00:00Z"),
];

const project = { id: "p1", naam: "Voorbeeldklus", nummer: "1234", straat: "Kerkstraat", postcode: "1234 AB", stad: "Twello" };
const medewerker = { id: "m1", full_name: "Mohammed Himmi" };

function renderDialog(starttijd: string, eindtijd: string) {
  return render(
    <PlanningDialog
      open
      editId={null}
      weekNumber={41}
      weekDates={weekDates}
      medewerkerNaam={medewerker.full_name}
      modalStatus={null}
      conflicts={[]}
      form={{ medewerker_id: medewerker.id, project_id: project.id, datum: "2026-10-05", starttijd, eindtijd, notitie: "" }}
      selectedDates={["2026-10-05"]}
      projects={[project]}
      medewerkers={[medewerker]}
      existingDates={[]}
      saving={false}
      extraMedewerkerIds={[]}
      onExtraMedewerkerIdsChange={vi.fn()}
      onOpenChange={vi.fn()}
      onFormChange={vi.fn()}
      onToggleDate={vi.fn()}
      onSave={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

// Zelfde regel als ManagerPlanning.berekenUren: klokuur minus 60 min pauze, halve-uren-precisie.
const berekenUren = (starttijd: string | null, eindtijd: string | null) => {
  const s = starttijd ? Number(starttijd.slice(0, 2)) + Number(starttijd.slice(3)) / 60 : 7;
  const e = eindtijd ? Number(eindtijd.slice(0, 2)) + Number(eindtijd.slice(3)) / 60 : s + 9;
  return Math.round(Math.max(0, e - s - 1) * 2) / 2;
};

describe("urenberekening in de inplanmodal", () => {
  it("toont 8,5u voor 07:00–16:30 in plaats van afgerond 9u", () => {
    renderDialog("07:00", "16:30");
    expect(screen.getByText("8,5u")).toBeInTheDocument();
    expect(screen.getByText(/9,5 uur, min 60 min vaste pauze/)).toBeInTheDocument();
    expect(screen.queryByText("9u")).not.toBeInTheDocument();
  });

  it("toont 8u voor 07:30–16:30 en 8,5u voor 07:30–17:00", () => {
    const { unmount } = renderDialog("07:30", "16:30");
    expect(screen.getByText("8u")).toBeInTheDocument();
    unmount();
    renderDialog("07:30", "17:00");
    expect(screen.getByText("8,5u")).toBeInTheDocument();
    unmount();
    renderDialog("07:00", "16:00");
    expect(screen.getByText("8u")).toBeInTheDocument();
  });
});

describe("urenberekening in het teamplanning-raster", () => {
  it("toont halve uren in cel, rijtotaal en weektotaal", () => {
    render(
      <TeamPlanningGrid
        medewerkers={[medewerker]}
        entries={[{ id: "e1", medewerker_id: medewerker.id, project_id: project.id, datum: "2026-10-05", starttijd: "07:00", eindtijd: "16:30", activiteit_kleur: null }]}
        projects={[project]}
        beschikbaarheid={[]}
        weekDates={weekDates}
        expandedMedewerker={null}
        onToggleExpanded={vi.fn()}
        onOpenCell={vi.fn()}
        berekenUren={berekenUren}
        renderExpanded={() => null}
      />,
    );
    expect(screen.getAllByText("8,5u").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("1 monteur · 8,5u")).toBeInTheDocument();
  });
});

describe("formatUren", () => {
  it("gebruikt Nederlandse decimale komma en halve-uren-precisie", () => {
    expect(formatUren(8)).toBe("8u");
    expect(formatUren(8.5)).toBe("8,5u");
    expect(formatUren(42.5)).toBe("42,5u");
    expect(formatUrenGetal(9.5)).toBe("9,5");
    expect(formatUrenGetal(8)).toBe("8");
  });
});
