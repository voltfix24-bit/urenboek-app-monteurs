import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const PROFILE_FIELDS = [
  "id", "user_id", "full_name", "email", "telefoon", "adres",
  "account_status", "is_onderaannemer", "onderaannemer_id",
  "kvk_nummer", "btw_nummer", "iban", "bedrijfsnaam", "uurtarief",
  "vaste_vrije_dagen", "planning_partner_ids", "noodcontact_naam", "noodcontact_tel",
  "planbaar", "planbaar_reden", "planbaar_tot", "uit_dienst_op", "uit_dienst_reden",
  "avb_polis_tot", "g_rekening", "verklaring_betalingsgedrag_op", "kvk_uittreksel_op",
  "ploeg", "contract_einddatum", "rijbewijs", "created_at",
].join(", ");

export interface DesktopProfiel {
  id: string; user_id: string; full_name: string; email: string | null;
  telefoon: string; adres: string; account_status: string; is_onderaannemer: boolean;
  onderaannemer_id: string | null; kvk_nummer: string | null; btw_nummer: string | null;
  iban: string | null; bedrijfsnaam: string | null; uurtarief: number | null;
  vaste_vrije_dagen: number[]; planning_partner_ids: string[]; noodcontact_naam: string | null;
  noodcontact_tel: string | null; planbaar: boolean; planbaar_reden: string | null;
  planbaar_tot: string | null; uit_dienst_op: string | null; uit_dienst_reden: string | null;
  avb_polis_tot: string | null; g_rekening: string | null; verklaring_betalingsgedrag_op: string | null;
  kvk_uittreksel_op: string | null; ploeg: string | null; contract_einddatum: string | null;
  rijbewijs: boolean; role: string;
}

export function useMedewerkersDesktop() {
  const [profielen, setProfielen] = useState<DesktopProfiel[]>([]);
  const [certificaten, setCertificaten] = useState<any[]>([]);
  const [aanwijzingen, setAanwijzingen] = useState<any[]>([]);
  const [partijen, setPartijen] = useState<any[]>([]);
  const [dbaChecks, setDbaChecks] = useState<any[]>([]);
  const [contracten, setContracten] = useState<any[]>([]);
  const [tarieven, setTarieven] = useState<any[]>([]);
  const [planning, setPlanning] = useState<any[]>([]);
  const [bedrijf, setBedrijf] = useState<{ dba_signaal_weken: number }>({ dba_signaal_weken: 12 });
  const [detacheringen, setDetacheringen] = useState<any[]>([]);
  const [opdrachtgevers, setOpdrachtgevers] = useState<any[]>([]);
  const [kostentarieven, setKostentarieven] = useState<any[]>([]);
  const [verkooptarieven, setVerkooptarieven] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const vanaf = new Date(); vanaf.setDate(vanaf.getDate() - 7 * 20);
    const [
      { data: profData }, { data: rolData }, { data: certData }, { data: aanwData },
      { data: partijData }, { data: dbaData }, { data: contrData }, { data: tarData },
      { data: planData }, { data: bedrijfData }, { data: detData }, { data: ogData },
      { data: kostData }, { data: verkoopData },
    ] = await Promise.all([
      supabase.from("profiles").select(PROFILE_FIELDS).order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("certificaten").select("*"),
      supabase.from("aanwijzingen").select("*"),
      supabase.from("aanwijs_partijen").select("*").order("naam"),
      supabase.from("dba_checks").select("*").order("vastgelegd_op", { ascending: false }),
      supabase.from("contracten").select("*"),
      supabase.from("tarieven").select("*").order("jaar", { ascending: false }),
      supabase.from("planning").select("medewerker_id, datum, starttijd").gte("datum", vanaf.toISOString().slice(0, 10)),
      supabase.from("bedrijfsgegevens").select("dba_signaal_weken").maybeSingle(),
      supabase.from("detacheringen").select("*").order("van"),
      supabase.from("opdrachtgevers").select("id, naam").order("naam"),
      supabase.from("kostentarieven").select("*").order("geldig_vanaf"),
      supabase.from("verkooptarieven").select("*").order("geldig_vanaf"),
    ]);

    const rolMap = new Map((rolData ?? []).map((r: any) => [r.user_id, r.role]));
    setProfielen(((profData ?? []) as any[]).map((p) => ({ ...p, role: rolMap.get(p.user_id) || "monteur" })));
    setCertificaten(certData ?? []);
    setAanwijzingen(aanwData ?? []);
    setPartijen(partijData ?? []);
    setDbaChecks(dbaData ?? []);
    setContracten(contrData ?? []);
    setTarieven(tarData ?? []);
    setPlanning(planData ?? []);
    setDetacheringen(detData ?? []);
    setOpdrachtgevers(ogData ?? []);
    setKostentarieven(kostData ?? []);
    setVerkooptarieven(verkoopData ?? []);
    if (bedrijfData) setBedrijf({ dba_signaal_weken: bedrijfData.dba_signaal_weken ?? 12 });
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return {
    profielen, certificaten, aanwijzingen, partijen, dbaChecks, contracten, tarieven,
    planning, bedrijf, detacheringen, opdrachtgevers, kostentarieven, verkooptarieven,
    loading, refetch: fetchAll,
  };
}
