import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, addDays, format } from "date-fns";

export async function checkOveruren(
  medewerker_id: string,
  datum: string,
  project_id: string,
  uren: number
): Promise<void> {
  const dateObj = new Date(datum + "T12:00:00");

  // TRIGGER 1 — Dag overschrijding (> 8u)
  const { data: dagData } = await supabase
    .from("uren_boekingen")
    .select("uren")
    .eq("medewerker_id", medewerker_id)
    .eq("datum", datum)
    .in("status", ["ingediend", "goedgekeurd"]);

  const dagTotaal = (dagData ?? []).reduce((s, e) => s + Number(e.uren), 0);

  if (dagTotaal > 8) {
    const { data: existing } = await supabase
      .from("overuren_meldingen")
      .select("id")
      .eq("medewerker_id", medewerker_id)
      .eq("datum", datum)
      .eq("type", "dag_overschrijding")
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from("overuren_meldingen").insert({
        medewerker_id,
        datum,
        type: "dag_overschrijding",
        geboekte_uren: dagTotaal,
        limiet_uren: 8,
        status: "open",
      });
    }
  }

  // TRIGGER 2 — Week overschrijding (> 40u)
  const weekMaandag = startOfWeek(dateObj, { weekStartsOn: 1 });
  const weekVrijdag = addDays(weekMaandag, 4);
  const maandagStr = format(weekMaandag, "yyyy-MM-dd");
  const vrijdagStr = format(weekVrijdag, "yyyy-MM-dd");

  const { data: weekData } = await supabase
    .from("uren_boekingen")
    .select("uren")
    .eq("medewerker_id", medewerker_id)
    .gte("datum", maandagStr)
    .lte("datum", vrijdagStr)
    .in("status", ["ingediend", "goedgekeurd"]);

  const weekTotaal = (weekData ?? []).reduce((s, e) => s + Number(e.uren), 0);

  if (weekTotaal > 40) {
    const { data: existing } = await supabase
      .from("overuren_meldingen")
      .select("id")
      .eq("medewerker_id", medewerker_id)
      .eq("datum", maandagStr)
      .eq("type", "week_overschrijding")
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from("overuren_meldingen").insert({
        medewerker_id,
        datum: maandagStr,
        type: "week_overschrijding",
        geboekte_uren: weekTotaal,
        limiet_uren: 40,
        status: "open",
      });
    }
  }

  // TRIGGER 3 — Meer dan ingepland
  const { data: planningData } = await supabase
    .from("planning")
    .select("starttijd, eindtijd")
    .eq("medewerker_id", medewerker_id)
    .eq("datum", datum)
    .eq("project_id", project_id)
    .limit(1);

  if (planningData && planningData.length > 0) {
    const plan = planningData[0];
    const [sh, sm] = (plan.starttijd as string).split(":").map(Number);
    const [eh, em] = (plan.eindtijd as string).split(":").map(Number);
    const ingeplandUren = (eh + em / 60) - (sh + sm / 60);

    if (uren > ingeplandUren + 0.5) {
      const { data: existing } = await supabase
        .from("overuren_meldingen")
        .select("id")
        .eq("medewerker_id", medewerker_id)
        .eq("datum", datum)
        .eq("type", "meer_dan_ingepland")
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("overuren_meldingen").insert({
          medewerker_id,
          datum,
          type: "meer_dan_ingepland",
          geboekte_uren: uren,
          limiet_uren: ingeplandUren,
          ingeplande_uren: ingeplandUren,
          status: "open",
        });
      }
    }
  }
}
