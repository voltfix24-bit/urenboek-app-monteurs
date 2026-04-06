import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Bedrijfsgegevens {
  id: string;
  bedrijfsnaam: string;
  rechtsvorm: string | null;
  straat: string | null;
  postcode: string | null;
  stad: string | null;
  land: string;
  email: string | null;
  telefoon: string | null;
  kvk_nummer: string | null;
  btw_nummer: string | null;
  iban: string | null;
  iban_naam: string | null;
  website: string | null;
  betalingstermijn: number;
  updated_at?: string;
  updated_by?: string | null;
}

let cachedBedrijf: Bedrijfsgegevens | null = null;

export async function getBedrijfsgegevens(): Promise<Bedrijfsgegevens | null> {
  if (cachedBedrijf) return cachedBedrijf;
  const { data } = await supabase.from("bedrijfsgegevens").select("*").limit(1).single();
  if (data) cachedBedrijf = data as unknown as Bedrijfsgegevens;
  return cachedBedrijf;
}

export function invalidateBedrijfCache() {
  cachedBedrijf = null;
}

export function useBedrijfsgegevens() {
  const [bedrijf, setBedrijf] = useState<Bedrijfsgegevens | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBedrijfsgegevens().then(data => {
      setBedrijf(data);
      setLoading(false);
    });
  }, []);

  return { bedrijf, loading };
}
