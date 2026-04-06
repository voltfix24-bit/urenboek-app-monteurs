// ─── PROFIELEN ───────────────────────
export interface Profiel {
  id: string;
  user_id: string;
  full_name: string;
  telefoon: string | null;
  adres: string | null;
  rijbewijs: boolean;
  vaste_vrije_dagen: number[];
  uurtarief: number | null;
  account_status: string;
  invited_at: string | null;
  activated_at: string | null;
  noodcontact_naam: string | null;
  noodcontact_tel: string | null;
  contract_einddatum: string | null;
  kvk_nummer: string | null;
  btw_nummer: string | null;
  iban: string | null;
  bedrijfsnaam: string | null;
}

export interface ProfielPubliek {
  id: string;
  user_id: string;
  full_name: string;
  telefoon: string | null;
}

// ─── PROJECTEN ────────────────────────
export type ProjectStatus =
  | 'nieuw'
  | 'gepland'
  | 'in_uitvoering'
  | 'opgeleverd'
  | 'gefactureerd'
  | 'gesloten';

export interface Project {
  id: string;
  nummer: string;
  naam: string;
  active: boolean;
  status: ProjectStatus;
  opdrachtgever_id: string | null;
  stationsnaam: string | null;
  adres: string | null;
  straat: string | null;
  postcode: string | null;
  stad: string | null;
  case_type: string | null;
  contactpersoon_naam: string | null;
  contactpersoon_tel: string | null;
  contactpersoon_email: string | null;
  intake_gedaan: boolean;
  rmu_merk: string | null;
  rmu_configuratie_id: string | null;
  status_gewijzigd_op: string | null;
  status_gewijzigd_door: string | null;
}

export interface Opdrachtgever {
  id: string;
  naam: string;
  contactpersoon: string | null;
  telefoon: string | null;
  email: string | null;
}

// ─── PLANNING ─────────────────────────
export interface PlanningEntry {
  id: string;
  medewerker_id: string;
  project_id: string;
  datum: string;
  starttijd: string;
  eindtijd: string;
  notitie: string | null;
  activiteit: string | null;
  activiteit_kleur: string | null;
  collega_ids: string[] | null;
  week_opmerking: string | null;
  created_by: string;
}

// ─── UREN ─────────────────────────────
export type UrenStatus =
  | 'concept'
  | 'ingediend'
  | 'goedgekeurd'
  | 'afgekeurd';

export interface UrenBoeking {
  id: string;
  medewerker_id: string;
  project_id: string;
  datum: string;
  uren: number;
  beschrijving: string;
  type: string | null;
  status: UrenStatus;
  afkeur_reden: string | null;
  approved_by: string | null;
  created_at: string;
}

// ─── BESCHIKBAARHEID ──────────────────
export interface Beschikbaarheid {
  id: string;
  medewerker_id: string;
  type: string;
  datum_van: string;
  datum_tot: string;
  reden: string | null;
  status: string;
  behandeld_door: string | null;
}

// ─── CERTIFICATEN ─────────────────────
export interface Certificaat {
  id: string;
  medewerker_id: string;
  type: string;
  subtype: string | null;
  naam: string;
  vervaldatum: string | null;
  bestand_url: string | null;
  ggi_gebieden: string[] | null;
}

// ─── MEDEDELINGEN ─────────────────────
export interface Mededeling {
  id: string;
  titel: string;
  inhoud: string;
  verzonden_door: string;
  ontvanger_type: string;
  ontvanger_id: string | null;
  urgentie: string;
  created_at: string;
}

// ─── OVERUREN ─────────────────────────
export type OverurenType =
  | 'dag_overschrijding'
  | 'week_overschrijding'
  | 'meer_dan_ingepland';

export interface OverurenMelding {
  id: string;
  medewerker_id: string;
  datum: string;
  type: OverurenType;
  geboekte_uren: number;
  limiet_uren: number;
  ingeplande_uren: number | null;
  toelichting: string | null;
  status: string;
  behandeld_door: string | null;
  behandeld_op: string | null;
}

// ─── FORECAST ─────────────────────────
export interface ForecastRegel {
  id?: string;
  forecast_id?: string;
  type: string;
  spec_code: string | null;
  spec_omschrijving: string | null;
  tarief: number | null;
  eigen_kosten: number | null;
  aantal: number;
  medewerker_id: string | null;
  geplande_uren: number | null;
  uurtarief_snap: number | null;
  werkelijk_aantal: number | null;
}

// ─── INKOOPORDERS ─────────────────────
export type InkooporderStatus =
  | 'concept'
  | 'verzonden'
  | 'factuur_ontvangen'
  | 'betaald';

export interface Inkooporder {
  id: string;
  order_nummer: string;
  medewerker_id: string;
  periode_van: string;
  periode_tot: string;
  status: InkooporderStatus;
  totaal_uren: number;
  totaal_excl_btw: number;
  btw_bedrag: number;
  totaal_incl_btw: number;
  aangemaakt_door: string;
  aangemaakt_op: string;
  verzonden_op: string | null;
  factuur_datum: string | null;
  factuur_nummer: string | null;
  betaald_op: string | null;
  notitie: string | null;
}

// ─── HELPER TYPES ─────────────────────
export interface ProfielMetRol extends Profiel {
  role: string;
}

export interface ProjectMetOg extends Project {
  opdrachtgever_naam: string | null;
}

export interface UrenBoekingWeergave extends UrenBoeking {
  full_name: string;
  project_naam: string;
  project_nummer: string;
}
