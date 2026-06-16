export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_setup: {
        Row: {
          created_at: string
          id: string
          setup_done: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          setup_done?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          setup_done?: boolean
        }
        Relationships: []
      }
      bedrijfsgegevens: {
        Row: {
          bedrijfsnaam: string
          betalingstermijn: number
          btw_nummer: string | null
          email: string | null
          iban: string | null
          iban_naam: string | null
          id: string
          kvk_nummer: string | null
          land: string
          postcode: string | null
          rechtsvorm: string | null
          stad: string | null
          straat: string | null
          telefoon: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          bedrijfsnaam: string
          betalingstermijn?: number
          btw_nummer?: string | null
          email?: string | null
          iban?: string | null
          iban_naam?: string | null
          id?: string
          kvk_nummer?: string | null
          land?: string
          postcode?: string | null
          rechtsvorm?: string | null
          stad?: string | null
          straat?: string | null
          telefoon?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          bedrijfsnaam?: string
          betalingstermijn?: number
          btw_nummer?: string | null
          email?: string | null
          iban?: string | null
          iban_naam?: string | null
          id?: string
          kvk_nummer?: string | null
          land?: string
          postcode?: string | null
          rechtsvorm?: string | null
          stad?: string | null
          straat?: string | null
          telefoon?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bedrijfsgegevens_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bedrijfsgegevens_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bedrijfsgegevens_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      beschikbaarheid: {
        Row: {
          behandeld_door: string | null
          created_at: string
          datum_tot: string
          datum_van: string
          id: string
          medewerker_id: string
          reden: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          behandeld_door?: string | null
          created_at?: string
          datum_tot: string
          datum_van: string
          id?: string
          medewerker_id: string
          reden?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          behandeld_door?: string | null
          created_at?: string
          datum_tot?: string
          datum_van?: string
          id?: string
          medewerker_id?: string
          reden?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beschikbaarheid_behandeld_door_fkey"
            columns: ["behandeld_door"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beschikbaarheid_behandeld_door_fkey"
            columns: ["behandeld_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beschikbaarheid_behandeld_door_fkey"
            columns: ["behandeld_door"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beschikbaarheid_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beschikbaarheid_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beschikbaarheid_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      certificaten: {
        Row: {
          bestand_url: string | null
          created_at: string
          ggi_gebieden: string[] | null
          id: string
          medewerker_id: string
          naam: string
          subtype: string | null
          type: string
          updated_at: string
          vervaldatum: string
        }
        Insert: {
          bestand_url?: string | null
          created_at?: string
          ggi_gebieden?: string[] | null
          id?: string
          medewerker_id: string
          naam: string
          subtype?: string | null
          type?: string
          updated_at?: string
          vervaldatum: string
        }
        Update: {
          bestand_url?: string | null
          created_at?: string
          ggi_gebieden?: string[] | null
          id?: string
          medewerker_id?: string
          naam?: string
          subtype?: string | null
          type?: string
          updated_at?: string
          vervaldatum?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificaten_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificaten_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificaten_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_berichten: {
        Row: {
          afzender_id: string
          created_at: string
          gelezen_op: string | null
          gesprek_id: string
          id: string
          inhoud: string
        }
        Insert: {
          afzender_id: string
          created_at?: string
          gelezen_op?: string | null
          gesprek_id: string
          id?: string
          inhoud: string
        }
        Update: {
          afzender_id?: string
          created_at?: string
          gelezen_op?: string | null
          gesprek_id?: string
          id?: string
          inhoud?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_berichten_afzender_id_fkey"
            columns: ["afzender_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_berichten_afzender_id_fkey"
            columns: ["afzender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_berichten_afzender_id_fkey"
            columns: ["afzender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_berichten_gesprek_id_fkey"
            columns: ["gesprek_id"]
            isOneToOne: false
            referencedRelation: "gesprekken"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_berichten: {
        Row: {
          aangemaakt_op: string
          bericht_type: string
          contract_id: string
          gelezen_op: string | null
          id: string
          richting: string
          toelichting: string | null
          wat_klopt_niet: string[] | null
        }
        Insert: {
          aangemaakt_op?: string
          bericht_type: string
          contract_id: string
          gelezen_op?: string | null
          id?: string
          richting: string
          toelichting?: string | null
          wat_klopt_niet?: string[] | null
        }
        Update: {
          aangemaakt_op?: string
          bericht_type?: string
          contract_id?: string
          gelezen_op?: string | null
          id?: string
          richting?: string
          toelichting?: string | null
          wat_klopt_niet?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_berichten_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracten"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_tokens: {
        Row: {
          contract_id: string
          gebruikt: boolean
          gebruikt_op: string | null
          geldig_tot: string
          id: string
          token: string
        }
        Insert: {
          contract_id: string
          gebruikt?: boolean
          gebruikt_op?: string | null
          geldig_tot: string
          id?: string
          token: string
        }
        Update: {
          contract_id?: string
          gebruikt?: boolean
          gebruikt_op?: string | null
          geldig_tot?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_tokens_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracten"
            referencedColumns: ["id"]
          },
        ]
      }
      contracten: {
        Row: {
          aangemaakt_door: string
          aangemaakt_op: string
          contract_data: Json
          contract_nummer: string
          einddatum: string | null
          herinnering_verstuurd: boolean
          id: string
          kandidaat_id: string | null
          og_handtekening: string | null
          og_ip: string | null
          og_naam: string | null
          og_profiel_id: string | null
          og_timestamp: string | null
          og_user_agent: string | null
          ot_handtekening: string | null
          ot_ip: string | null
          ot_naam: string | null
          ot_timestamp: string | null
          ot_user_agent: string | null
          pdf_hash: string | null
          pdf_path: string | null
          profiel_id: string | null
          startdatum: string | null
          status: string
          updated_at: string
        }
        Insert: {
          aangemaakt_door: string
          aangemaakt_op?: string
          contract_data?: Json
          contract_nummer: string
          einddatum?: string | null
          herinnering_verstuurd?: boolean
          id?: string
          kandidaat_id?: string | null
          og_handtekening?: string | null
          og_ip?: string | null
          og_naam?: string | null
          og_profiel_id?: string | null
          og_timestamp?: string | null
          og_user_agent?: string | null
          ot_handtekening?: string | null
          ot_ip?: string | null
          ot_naam?: string | null
          ot_timestamp?: string | null
          ot_user_agent?: string | null
          pdf_hash?: string | null
          pdf_path?: string | null
          profiel_id?: string | null
          startdatum?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          aangemaakt_door?: string
          aangemaakt_op?: string
          contract_data?: Json
          contract_nummer?: string
          einddatum?: string | null
          herinnering_verstuurd?: boolean
          id?: string
          kandidaat_id?: string | null
          og_handtekening?: string | null
          og_ip?: string | null
          og_naam?: string | null
          og_profiel_id?: string | null
          og_timestamp?: string | null
          og_user_agent?: string | null
          ot_handtekening?: string | null
          ot_ip?: string | null
          ot_naam?: string | null
          ot_timestamp?: string | null
          ot_user_agent?: string | null
          pdf_hash?: string | null
          pdf_path?: string | null
          profiel_id?: string | null
          startdatum?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracten_aangemaakt_door_fkey"
            columns: ["aangemaakt_door"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracten_aangemaakt_door_fkey"
            columns: ["aangemaakt_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracten_aangemaakt_door_fkey"
            columns: ["aangemaakt_door"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracten_kandidaat_id_fkey"
            columns: ["kandidaat_id"]
            isOneToOne: false
            referencedRelation: "kandidaten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracten_og_profiel_id_fkey"
            columns: ["og_profiel_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracten_og_profiel_id_fkey"
            columns: ["og_profiel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracten_og_profiel_id_fkey"
            columns: ["og_profiel_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracten_profiel_id_fkey"
            columns: ["profiel_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracten_profiel_id_fkey"
            columns: ["profiel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracten_profiel_id_fkey"
            columns: ["profiel_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_regels: {
        Row: {
          aantal: number | null
          created_at: string
          eigen_kosten: number | null
          forecast_id: string
          geplande_uren: number | null
          id: string
          medewerker_id: string | null
          spec_code: string | null
          spec_omschrijving: string | null
          tarief: number | null
          type: string
          updated_at: string
          uurtarief_snap: number | null
          werkelijk_aantal: number | null
        }
        Insert: {
          aantal?: number | null
          created_at?: string
          eigen_kosten?: number | null
          forecast_id: string
          geplande_uren?: number | null
          id?: string
          medewerker_id?: string | null
          spec_code?: string | null
          spec_omschrijving?: string | null
          tarief?: number | null
          type: string
          updated_at?: string
          uurtarief_snap?: number | null
          werkelijk_aantal?: number | null
        }
        Update: {
          aantal?: number | null
          created_at?: string
          eigen_kosten?: number | null
          forecast_id?: string
          geplande_uren?: number | null
          id?: string
          medewerker_id?: string | null
          spec_code?: string | null
          spec_omschrijving?: string | null
          tarief?: number | null
          type?: string
          updated_at?: string
          uurtarief_snap?: number | null
          werkelijk_aantal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "forecast_regels_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "project_forecast"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_regels_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_regels_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_regels_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      gesprekken: {
        Row: {
          created_at: string
          id: string
          laatste_bericht_op: string
          laatste_bericht_preview: string
          medewerker_id: string
          onderwerp: string
        }
        Insert: {
          created_at?: string
          id?: string
          laatste_bericht_op?: string
          laatste_bericht_preview?: string
          medewerker_id: string
          onderwerp?: string
        }
        Update: {
          created_at?: string
          id?: string
          laatste_bericht_op?: string
          laatste_bericht_preview?: string
          medewerker_id?: string
          onderwerp?: string
        }
        Relationships: [
          {
            foreignKeyName: "gesprekken_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gesprekken_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gesprekken_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      inkooporder_regels: {
        Row: {
          activiteit: string | null
          afstand_bron: string | null
          bedrag: number
          datum: string
          id: string
          inkooporder_id: string
          kilometers: number | null
          km_tarief: number | null
          medewerker_id: string | null
          medewerker_naam: string | null
          project_adres: string | null
          project_id: string | null
          project_naam: string | null
          regel_type: string
          retour_km: number | null
          startlocatie: string | null
          uren: number
          uren_boeking_id: string | null
          uurtarief: number
          vrije_km: number | null
        }
        Insert: {
          activiteit?: string | null
          afstand_bron?: string | null
          bedrag: number
          datum: string
          id?: string
          inkooporder_id: string
          kilometers?: number | null
          km_tarief?: number | null
          medewerker_id?: string | null
          medewerker_naam?: string | null
          project_adres?: string | null
          project_id?: string | null
          project_naam?: string | null
          regel_type?: string
          retour_km?: number | null
          startlocatie?: string | null
          uren: number
          uren_boeking_id?: string | null
          uurtarief: number
          vrije_km?: number | null
        }
        Update: {
          activiteit?: string | null
          afstand_bron?: string | null
          bedrag?: number
          datum?: string
          id?: string
          inkooporder_id?: string
          kilometers?: number | null
          km_tarief?: number | null
          medewerker_id?: string | null
          medewerker_naam?: string | null
          project_adres?: string | null
          project_id?: string | null
          project_naam?: string | null
          regel_type?: string
          retour_km?: number | null
          startlocatie?: string | null
          uren?: number
          uren_boeking_id?: string | null
          uurtarief?: number
          vrije_km?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inkooporder_regels_inkooporder_id_fkey"
            columns: ["inkooporder_id"]
            isOneToOne: false
            referencedRelation: "inkooporders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkooporder_regels_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkooporder_regels_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkooporder_regels_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkooporder_regels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkooporder_regels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_monteur"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkooporder_regels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkooporder_regels_uren_boeking_id_fkey"
            columns: ["uren_boeking_id"]
            isOneToOne: false
            referencedRelation: "uren_boekingen"
            referencedColumns: ["id"]
          },
        ]
      }
      inkooporders: {
        Row: {
          aangemaakt_door: string | null
          aangemaakt_op: string
          betaald_op: string | null
          btw_bedrag: number | null
          factuur_datum: string | null
          factuur_nummer: string | null
          id: string
          leverancier_snapshot: Json | null
          medewerker_id: string
          notitie: string | null
          order_nummer: string
          order_type: string
          periode_tot: string
          periode_van: string
          status: string
          totaal_excl_btw: number | null
          totaal_incl_btw: number | null
          totaal_uren: number | null
          verzonden_op: string | null
          week_jaar: number | null
          week_nummer: number | null
        }
        Insert: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          betaald_op?: string | null
          btw_bedrag?: number | null
          factuur_datum?: string | null
          factuur_nummer?: string | null
          id?: string
          leverancier_snapshot?: Json | null
          medewerker_id: string
          notitie?: string | null
          order_nummer: string
          order_type?: string
          periode_tot: string
          periode_van: string
          status?: string
          totaal_excl_btw?: number | null
          totaal_incl_btw?: number | null
          totaal_uren?: number | null
          verzonden_op?: string | null
          week_jaar?: number | null
          week_nummer?: number | null
        }
        Update: {
          aangemaakt_door?: string | null
          aangemaakt_op?: string
          betaald_op?: string | null
          btw_bedrag?: number | null
          factuur_datum?: string | null
          factuur_nummer?: string | null
          id?: string
          leverancier_snapshot?: Json | null
          medewerker_id?: string
          notitie?: string | null
          order_nummer?: string
          order_type?: string
          periode_tot?: string
          periode_van?: string
          status?: string
          totaal_excl_btw?: number | null
          totaal_incl_btw?: number | null
          totaal_uren?: number | null
          verzonden_op?: string | null
          week_jaar?: number | null
          week_nummer?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inkooporders_aangemaakt_door_fkey"
            columns: ["aangemaakt_door"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkooporders_aangemaakt_door_fkey"
            columns: ["aangemaakt_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkooporders_aangemaakt_door_fkey"
            columns: ["aangemaakt_door"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkooporders_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkooporders_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inkooporders_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_regels: {
        Row: {
          aanpasbaar: boolean
          actief: boolean
          created_at: string
          hint: string | null
          id: string
          label: string
          max_aantal: number
          min_aantal: number
          sluit_uit_code: string | null
          sluit_uit_reden: string | null
          spec_code: string
          standaard_aantal: number
          trigger_type: string
          trigger_veld: string | null
          trigger_waarde: string | null
          updated_at: string
          vereist_code: string | null
          volgorde: number
          waarschuwing: string | null
        }
        Insert: {
          aanpasbaar?: boolean
          actief?: boolean
          created_at?: string
          hint?: string | null
          id?: string
          label: string
          max_aantal?: number
          min_aantal?: number
          sluit_uit_code?: string | null
          sluit_uit_reden?: string | null
          spec_code: string
          standaard_aantal?: number
          trigger_type: string
          trigger_veld?: string | null
          trigger_waarde?: string | null
          updated_at?: string
          vereist_code?: string | null
          volgorde?: number
          waarschuwing?: string | null
        }
        Update: {
          aanpasbaar?: boolean
          actief?: boolean
          created_at?: string
          hint?: string | null
          id?: string
          label?: string
          max_aantal?: number
          min_aantal?: number
          sluit_uit_code?: string | null
          sluit_uit_reden?: string | null
          spec_code?: string
          standaard_aantal?: number
          trigger_type?: string
          trigger_veld?: string | null
          trigger_waarde?: string | null
          updated_at?: string
          vereist_code?: string | null
          volgorde?: number
          waarschuwing?: string | null
        }
        Relationships: []
      }
      kandidaten: {
        Row: {
          aangemaakt_door: string
          aangemaakt_op: string
          achternaam: string
          afgesproken_tarief: number | null
          email: string
          id: string
          notities: string | null
          profiel_id: string | null
          status: string
          telefoon: string | null
          voornaam: string
        }
        Insert: {
          aangemaakt_door: string
          aangemaakt_op?: string
          achternaam: string
          afgesproken_tarief?: number | null
          email: string
          id?: string
          notities?: string | null
          profiel_id?: string | null
          status?: string
          telefoon?: string | null
          voornaam: string
        }
        Update: {
          aangemaakt_door?: string
          aangemaakt_op?: string
          achternaam?: string
          afgesproken_tarief?: number | null
          email?: string
          id?: string
          notities?: string | null
          profiel_id?: string | null
          status?: string
          telefoon?: string | null
          voornaam?: string
        }
        Relationships: [
          {
            foreignKeyName: "kandidaten_aangemaakt_door_fkey"
            columns: ["aangemaakt_door"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kandidaten_aangemaakt_door_fkey"
            columns: ["aangemaakt_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kandidaten_aangemaakt_door_fkey"
            columns: ["aangemaakt_door"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kandidaten_profiel_id_fkey"
            columns: ["profiel_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kandidaten_profiel_id_fkey"
            columns: ["profiel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kandidaten_profiel_id_fkey"
            columns: ["profiel_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_handtekeningen: {
        Row: {
          aangemaakt_op: string
          handtekening: string
          id: string
          profiel_id: string
          updated_op: string | null
        }
        Insert: {
          aangemaakt_op?: string
          handtekening: string
          id?: string
          profiel_id: string
          updated_op?: string | null
        }
        Update: {
          aangemaakt_op?: string
          handtekening?: string
          id?: string
          profiel_id?: string
          updated_op?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manager_handtekeningen_profiel_id_fkey"
            columns: ["profiel_id"]
            isOneToOne: true
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_handtekeningen_profiel_id_fkey"
            columns: ["profiel_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_handtekeningen_profiel_id_fkey"
            columns: ["profiel_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      mededeling_leesstatus: {
        Row: {
          gelezen_op: string | null
          id: string
          mededeling_id: string
          medewerker_id: string
        }
        Insert: {
          gelezen_op?: string | null
          id?: string
          mededeling_id: string
          medewerker_id: string
        }
        Update: {
          gelezen_op?: string | null
          id?: string
          mededeling_id?: string
          medewerker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mededeling_leesstatus_mededeling_id_fkey"
            columns: ["mededeling_id"]
            isOneToOne: false
            referencedRelation: "mededelingen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mededeling_leesstatus_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mededeling_leesstatus_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mededeling_leesstatus_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      mededelingen: {
        Row: {
          created_at: string
          id: string
          inhoud: string
          ontvanger_id: string | null
          ontvanger_type: string
          titel: string
          urgentie: string
          verzonden_door: string
        }
        Insert: {
          created_at?: string
          id?: string
          inhoud?: string
          ontvanger_id?: string | null
          ontvanger_type?: string
          titel: string
          urgentie?: string
          verzonden_door: string
        }
        Update: {
          created_at?: string
          id?: string
          inhoud?: string
          ontvanger_id?: string | null
          ontvanger_type?: string
          titel?: string
          urgentie?: string
          verzonden_door?: string
        }
        Relationships: [
          {
            foreignKeyName: "mededelingen_ontvanger_id_fkey"
            columns: ["ontvanger_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mededelingen_ontvanger_id_fkey"
            columns: ["ontvanger_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mededelingen_ontvanger_id_fkey"
            columns: ["ontvanger_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      onderaannemer_koppeling_audit: {
        Row: {
          created_at: string
          id: string
          monteur_id: string
          nieuwe_onderaannemer_id: string | null
          oude_onderaannemer_id: string | null
          reden: string | null
          uitgevoerd_door: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          monteur_id: string
          nieuwe_onderaannemer_id?: string | null
          oude_onderaannemer_id?: string | null
          reden?: string | null
          uitgevoerd_door?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          monteur_id?: string
          nieuwe_onderaannemer_id?: string | null
          oude_onderaannemer_id?: string | null
          reden?: string | null
          uitgevoerd_door?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onderaannemer_koppeling_audit_monteur_id_fkey"
            columns: ["monteur_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onderaannemer_koppeling_audit_monteur_id_fkey"
            columns: ["monteur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onderaannemer_koppeling_audit_monteur_id_fkey"
            columns: ["monteur_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onderaannemer_koppeling_audit_nieuwe_onderaannemer_id_fkey"
            columns: ["nieuwe_onderaannemer_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onderaannemer_koppeling_audit_nieuwe_onderaannemer_id_fkey"
            columns: ["nieuwe_onderaannemer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onderaannemer_koppeling_audit_nieuwe_onderaannemer_id_fkey"
            columns: ["nieuwe_onderaannemer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onderaannemer_koppeling_audit_oude_onderaannemer_id_fkey"
            columns: ["oude_onderaannemer_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onderaannemer_koppeling_audit_oude_onderaannemer_id_fkey"
            columns: ["oude_onderaannemer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onderaannemer_koppeling_audit_oude_onderaannemer_id_fkey"
            columns: ["oude_onderaannemer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onderaannemer_koppeling_audit_uitgevoerd_door_fkey"
            columns: ["uitgevoerd_door"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onderaannemer_koppeling_audit_uitgevoerd_door_fkey"
            columns: ["uitgevoerd_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onderaannemer_koppeling_audit_uitgevoerd_door_fkey"
            columns: ["uitgevoerd_door"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      opdrachtgevers: {
        Row: {
          contactpersoon: string
          created_at: string
          email: string
          id: string
          naam: string
          telefoon: string
          updated_at: string
        }
        Insert: {
          contactpersoon?: string
          created_at?: string
          email?: string
          id?: string
          naam: string
          telefoon?: string
          updated_at?: string
        }
        Update: {
          contactpersoon?: string
          created_at?: string
          email?: string
          id?: string
          naam?: string
          telefoon?: string
          updated_at?: string
        }
        Relationships: []
      }
      overuren_meldingen: {
        Row: {
          behandeld_door: string | null
          behandeld_op: string | null
          created_at: string
          datum: string
          geboekte_uren: number
          id: string
          ingeplande_uren: number | null
          limiet_uren: number
          medewerker_id: string
          status: string
          toelichting: string | null
          type: string
        }
        Insert: {
          behandeld_door?: string | null
          behandeld_op?: string | null
          created_at?: string
          datum: string
          geboekte_uren: number
          id?: string
          ingeplande_uren?: number | null
          limiet_uren: number
          medewerker_id: string
          status?: string
          toelichting?: string | null
          type: string
        }
        Update: {
          behandeld_door?: string | null
          behandeld_op?: string | null
          created_at?: string
          datum?: string
          geboekte_uren?: number
          id?: string
          ingeplande_uren?: number | null
          limiet_uren?: number
          medewerker_id?: string
          status?: string
          toelichting?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "overuren_meldingen_behandeld_door_fkey"
            columns: ["behandeld_door"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overuren_meldingen_behandeld_door_fkey"
            columns: ["behandeld_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overuren_meldingen_behandeld_door_fkey"
            columns: ["behandeld_door"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overuren_meldingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overuren_meldingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overuren_meldingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_match_audit: {
        Row: {
          created_at: string
          fout_reden: string | null
          id: string
          kind: string
          manager_user_id: string
          planner_id: string
          status: string
          uitkomst: string
          urenapp_id: string
        }
        Insert: {
          created_at?: string
          fout_reden?: string | null
          id?: string
          kind: string
          manager_user_id: string
          planner_id: string
          status: string
          uitkomst: string
          urenapp_id: string
        }
        Update: {
          created_at?: string
          fout_reden?: string | null
          id?: string
          kind?: string
          manager_user_id?: string
          planner_id?: string
          status?: string
          uitkomst?: string
          urenapp_id?: string
        }
        Relationships: []
      }
      planner_planning_sync_audit: {
        Row: {
          created_at: string
          datum: string
          external_id: string
          fout_reden: string | null
          id: string
          manager_user_id: string
          planning_id: string | null
          uitkomst: string
        }
        Insert: {
          created_at?: string
          datum: string
          external_id: string
          fout_reden?: string | null
          id?: string
          manager_user_id: string
          planning_id?: string | null
          uitkomst: string
        }
        Update: {
          created_at?: string
          datum?: string
          external_id?: string
          fout_reden?: string | null
          id?: string
          manager_user_id?: string
          planning_id?: string | null
          uitkomst?: string
        }
        Relationships: []
      }
      planning: {
        Row: {
          activiteit: string | null
          activiteit_kleur: string | null
          collega_ids: string[] | null
          created_at: string
          created_by: string
          datum: string
          eindtijd: string
          external_id: string | null
          external_source: string | null
          external_updated_at: string | null
          id: string
          medewerker_id: string
          notitie: string
          planning_group_id: string | null
          project_id: string
          starttijd: string
          sync_locked: boolean
          updated_at: string
          week_opmerking: string | null
        }
        Insert: {
          activiteit?: string | null
          activiteit_kleur?: string | null
          collega_ids?: string[] | null
          created_at?: string
          created_by: string
          datum: string
          eindtijd?: string
          external_id?: string | null
          external_source?: string | null
          external_updated_at?: string | null
          id?: string
          medewerker_id: string
          notitie?: string
          planning_group_id?: string | null
          project_id: string
          starttijd?: string
          sync_locked?: boolean
          updated_at?: string
          week_opmerking?: string | null
        }
        Update: {
          activiteit?: string | null
          activiteit_kleur?: string | null
          collega_ids?: string[] | null
          created_at?: string
          created_by?: string
          datum?: string
          eindtijd?: string
          external_id?: string | null
          external_source?: string | null
          external_updated_at?: string | null
          id?: string
          medewerker_id?: string
          notitie?: string
          planning_group_id?: string | null
          project_id?: string
          starttijd?: string
          sync_locked?: boolean
          updated_at?: string
          week_opmerking?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planning_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_monteur"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_public"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_templates: {
        Row: {
          activiteiten: string[]
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          naam: string
          omschrijving: string | null
          updated_at: string
          volgorde: number
        }
        Insert: {
          activiteiten: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          naam: string
          omschrijving?: string | null
          updated_at?: string
          volgorde?: number
        }
        Update: {
          activiteiten?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          naam?: string
          omschrijving?: string | null
          updated_at?: string
          volgorde?: number
        }
        Relationships: [
          {
            foreignKeyName: "planning_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: string
          activated_at: string | null
          adres: string
          avatar_url: string | null
          bedrijfsgegevens_updated_at: string | null
          bedrijfsgegevens_updated_by: string | null
          bedrijfsnaam: string | null
          betalingstermijn: number
          btw_nummer: string | null
          contactpersoon: string | null
          contract_einddatum: string | null
          created_at: string
          email: string | null
          factuuradres: string | null
          full_name: string
          geboortedatum: string | null
          geverifieerd_door: string | null
          geverifieerd_op: string | null
          iban: string | null
          id: string
          invited_at: string | null
          is_onderaannemer: boolean
          kvk_nummer: string | null
          noodcontact_naam: string | null
          noodcontact_tel: string | null
          onboarding_voltooid: boolean
          onboarding_voltooid_op: string | null
          onderaannemer_id: string | null
          onderaannemer_km_tarief: number
          onderaannemer_reiskosten_per_ploeg: boolean
          onderaannemer_startlocatie: string | null
          onderaannemer_vrije_km_per_dag: number
          planner_monteur_id: string | null
          planning_partner_ids: string[]
          rijbewijs: boolean
          telefoon: string
          updated_at: string
          user_id: string
          uurtarief: number | null
          vaste_vrije_dagen: number[]
        }
        Insert: {
          account_status?: string
          activated_at?: string | null
          adres?: string
          avatar_url?: string | null
          bedrijfsgegevens_updated_at?: string | null
          bedrijfsgegevens_updated_by?: string | null
          bedrijfsnaam?: string | null
          betalingstermijn?: number
          btw_nummer?: string | null
          contactpersoon?: string | null
          contract_einddatum?: string | null
          created_at?: string
          email?: string | null
          factuuradres?: string | null
          full_name: string
          geboortedatum?: string | null
          geverifieerd_door?: string | null
          geverifieerd_op?: string | null
          iban?: string | null
          id?: string
          invited_at?: string | null
          is_onderaannemer?: boolean
          kvk_nummer?: string | null
          noodcontact_naam?: string | null
          noodcontact_tel?: string | null
          onboarding_voltooid?: boolean
          onboarding_voltooid_op?: string | null
          onderaannemer_id?: string | null
          onderaannemer_km_tarief?: number
          onderaannemer_reiskosten_per_ploeg?: boolean
          onderaannemer_startlocatie?: string | null
          onderaannemer_vrije_km_per_dag?: number
          planner_monteur_id?: string | null
          planning_partner_ids?: string[]
          rijbewijs?: boolean
          telefoon?: string
          updated_at?: string
          user_id: string
          uurtarief?: number | null
          vaste_vrije_dagen?: number[]
        }
        Update: {
          account_status?: string
          activated_at?: string | null
          adres?: string
          avatar_url?: string | null
          bedrijfsgegevens_updated_at?: string | null
          bedrijfsgegevens_updated_by?: string | null
          bedrijfsnaam?: string | null
          betalingstermijn?: number
          btw_nummer?: string | null
          contactpersoon?: string | null
          contract_einddatum?: string | null
          created_at?: string
          email?: string | null
          factuuradres?: string | null
          full_name?: string
          geboortedatum?: string | null
          geverifieerd_door?: string | null
          geverifieerd_op?: string | null
          iban?: string | null
          id?: string
          invited_at?: string | null
          is_onderaannemer?: boolean
          kvk_nummer?: string | null
          noodcontact_naam?: string | null
          noodcontact_tel?: string | null
          onboarding_voltooid?: boolean
          onboarding_voltooid_op?: string | null
          onderaannemer_id?: string | null
          onderaannemer_km_tarief?: number
          onderaannemer_reiskosten_per_ploeg?: boolean
          onderaannemer_startlocatie?: string | null
          onderaannemer_vrije_km_per_dag?: number
          planner_monteur_id?: string | null
          planning_partner_ids?: string[]
          rijbewijs?: boolean
          telefoon?: string
          updated_at?: string
          user_id?: string
          uurtarief?: number | null
          vaste_vrije_dagen?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_bedrijfsgegevens_updated_by_fkey"
            columns: ["bedrijfsgegevens_updated_by"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_bedrijfsgegevens_updated_by_fkey"
            columns: ["bedrijfsgegevens_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_bedrijfsgegevens_updated_by_fkey"
            columns: ["bedrijfsgegevens_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_geverifieerd_door_fkey"
            columns: ["geverifieerd_door"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_geverifieerd_door_fkey"
            columns: ["geverifieerd_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_geverifieerd_door_fkey"
            columns: ["geverifieerd_door"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_onderaannemer_id_fkey"
            columns: ["onderaannemer_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_onderaannemer_id_fkey"
            columns: ["onderaannemer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_onderaannemer_id_fkey"
            columns: ["onderaannemer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      project_forecast: {
        Row: {
          created_at: string
          id: string
          methode: string
          project_id: string
          updated_at: string
          verwachte_omzet: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          methode: string
          project_id: string
          updated_at?: string
          verwachte_omzet?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          methode?: string
          project_id?: string
          updated_at?: string
          verwachte_omzet?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_forecast_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_forecast_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects_monteur"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_forecast_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects_public"
            referencedColumns: ["id"]
          },
        ]
      }
      project_planning_matrix: {
        Row: {
          id: string
          project_id: string
          state_json: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          project_id: string
          state_json?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          state_json?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_planning_matrix_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_planning_matrix_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects_monteur"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_planning_matrix_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_planning_matrix_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_planning_matrix_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_planning_matrix_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      project_planning_status: {
        Row: {
          definitief_door: string | null
          definitief_op: string | null
          id: string
          is_definitief: boolean
          project_id: string
        }
        Insert: {
          definitief_door?: string | null
          definitief_op?: string | null
          id?: string
          is_definitief?: boolean
          project_id: string
        }
        Update: {
          definitief_door?: string | null
          definitief_op?: string | null
          id?: string
          is_definitief?: boolean
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_planning_status_definitief_door_fkey"
            columns: ["definitief_door"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_planning_status_definitief_door_fkey"
            columns: ["definitief_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_planning_status_definitief_door_fkey"
            columns: ["definitief_door"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_planning_status_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_planning_status_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects_monteur"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_planning_status_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects_public"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          active: boolean
          adres: string | null
          case_type: string | null
          contactpersoon_email: string | null
          contactpersoon_naam: string | null
          contactpersoon_tel: string | null
          created_at: string
          id: string
          intake_gedaan: boolean
          naam: string
          nummer: string
          opdrachtgever_id: string | null
          planner_project_id: string | null
          planner_sync_enabled: boolean
          planner_sync_exclusion_reason: string | null
          postcode: string | null
          projectjaar: number | null
          rmu_configuratie_id: string | null
          rmu_merk: string | null
          stad: string | null
          stationsnaam: string | null
          status: string
          status_gewijzigd_door: string | null
          status_gewijzigd_op: string | null
          straat: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          adres?: string | null
          case_type?: string | null
          contactpersoon_email?: string | null
          contactpersoon_naam?: string | null
          contactpersoon_tel?: string | null
          created_at?: string
          id?: string
          intake_gedaan?: boolean
          naam: string
          nummer: string
          opdrachtgever_id?: string | null
          planner_project_id?: string | null
          planner_sync_enabled?: boolean
          planner_sync_exclusion_reason?: string | null
          postcode?: string | null
          projectjaar?: number | null
          rmu_configuratie_id?: string | null
          rmu_merk?: string | null
          stad?: string | null
          stationsnaam?: string | null
          status?: string
          status_gewijzigd_door?: string | null
          status_gewijzigd_op?: string | null
          straat?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          adres?: string | null
          case_type?: string | null
          contactpersoon_email?: string | null
          contactpersoon_naam?: string | null
          contactpersoon_tel?: string | null
          created_at?: string
          id?: string
          intake_gedaan?: boolean
          naam?: string
          nummer?: string
          opdrachtgever_id?: string | null
          planner_project_id?: string | null
          planner_sync_enabled?: boolean
          planner_sync_exclusion_reason?: string | null
          postcode?: string | null
          projectjaar?: number | null
          rmu_configuratie_id?: string | null
          rmu_merk?: string | null
          stad?: string | null
          stationsnaam?: string | null
          status?: string
          status_gewijzigd_door?: string | null
          status_gewijzigd_op?: string | null
          straat?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_opdrachtgever_id_fkey"
            columns: ["opdrachtgever_id"]
            isOneToOne: false
            referencedRelation: "opdrachtgevers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_rmu_configuratie_id_fkey"
            columns: ["rmu_configuratie_id"]
            isOneToOne: false
            referencedRelation: "rmu_configuraties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_status_gewijzigd_door_fkey"
            columns: ["status_gewijzigd_door"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_status_gewijzigd_door_fkey"
            columns: ["status_gewijzigd_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_status_gewijzigd_door_fkey"
            columns: ["status_gewijzigd_door"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_log: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      rmu_configuraties: {
        Row: {
          actief: boolean
          code: string
          created_at: string
          id: string
          label: string
          merk: string
          velden: number
          volgorde: number
        }
        Insert: {
          actief?: boolean
          code: string
          created_at?: string
          id?: string
          label: string
          merk: string
          velden?: number
          volgorde?: number
        }
        Update: {
          actief?: boolean
          code?: string
          created_at?: string
          id?: string
          label?: string
          merk?: string
          velden?: number
          volgorde?: number
        }
        Relationships: []
      }
      spec_code_tarieven: {
        Row: {
          actief: boolean
          code: string
          eenheid: string
          eigen_kosten: number
          groep: string | null
          id: string
          omschrijving: string
          tarief: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actief?: boolean
          code: string
          eenheid: string
          eigen_kosten?: number
          groep?: string | null
          id?: string
          omschrijving: string
          tarief: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actief?: boolean
          code?: string
          eenheid?: string
          eigen_kosten?: number
          groep?: string | null
          id?: string
          omschrijving?: string
          tarief?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spec_code_tarieven_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spec_code_tarieven_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spec_code_tarieven_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          approved_by: string | null
          created_at: string
          date: string
          description: string
          hours: number
          id: string
          project_number: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          date: string
          description?: string
          hours: number
          id?: string
          project_number: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          date?: string
          description?: string
          hours?: number
          id?: string
          project_number?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      uren_boekingen: {
        Row: {
          afkeur_reden: string | null
          approved_by: string | null
          beschrijving: string
          created_at: string
          datum: string
          id: string
          medewerker_id: string
          project_id: string
          status: string
          type: string
          updated_at: string
          uren: number
        }
        Insert: {
          afkeur_reden?: string | null
          approved_by?: string | null
          beschrijving?: string
          created_at?: string
          datum: string
          id?: string
          medewerker_id: string
          project_id: string
          status?: string
          type?: string
          updated_at?: string
          uren: number
        }
        Update: {
          afkeur_reden?: string | null
          approved_by?: string | null
          beschrijving?: string
          created_at?: string
          datum?: string
          id?: string
          medewerker_id?: string
          project_id?: string
          status?: string
          type?: string
          updated_at?: string
          uren?: number
        }
        Relationships: [
          {
            foreignKeyName: "uren_boekingen_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_boekingen_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_boekingen_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_boekingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_boekingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_boekingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_boekingen_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_boekingen_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_monteur"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uren_boekingen_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      monteurs_voor_onderaannemer: {
        Row: {
          account_status: string | null
          full_name: string | null
          id: string | null
          is_onderaannemer: boolean | null
          onderaannemer_id: string | null
        }
        Insert: {
          account_status?: string | null
          full_name?: string | null
          id?: string | null
          is_onderaannemer?: boolean | null
          onderaannemer_id?: string | null
        }
        Update: {
          account_status?: string | null
          full_name?: string | null
          id?: string | null
          is_onderaannemer?: boolean | null
          onderaannemer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_onderaannemer_id_fkey"
            columns: ["onderaannemer_id"]
            isOneToOne: false
            referencedRelation: "monteurs_voor_onderaannemer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_onderaannemer_id_fkey"
            columns: ["onderaannemer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_onderaannemer_id_fkey"
            columns: ["onderaannemer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_public: {
        Row: {
          full_name: string | null
          id: string | null
          telefoon: string | null
          user_id: string | null
        }
        Insert: {
          full_name?: string | null
          id?: string | null
          telefoon?: string | null
          user_id?: string | null
        }
        Update: {
          full_name?: string | null
          id?: string | null
          telefoon?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      projects_monteur: {
        Row: {
          active: boolean | null
          adres: string | null
          case_type: string | null
          created_at: string | null
          id: string | null
          naam: string | null
          nummer: string | null
          opdrachtgever_id: string | null
          postcode: string | null
          stad: string | null
          stationsnaam: string | null
          straat: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          adres?: string | null
          case_type?: string | null
          created_at?: string | null
          id?: string | null
          naam?: string | null
          nummer?: string | null
          opdrachtgever_id?: string | null
          postcode?: string | null
          stad?: string | null
          stationsnaam?: string | null
          straat?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          adres?: string | null
          case_type?: string | null
          created_at?: string | null
          id?: string | null
          naam?: string | null
          nummer?: string | null
          opdrachtgever_id?: string | null
          postcode?: string | null
          stad?: string | null
          stationsnaam?: string | null
          straat?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_opdrachtgever_id_fkey"
            columns: ["opdrachtgever_id"]
            isOneToOne: false
            referencedRelation: "opdrachtgevers"
            referencedColumns: ["id"]
          },
        ]
      }
      projects_public: {
        Row: {
          active: boolean | null
          adres: string | null
          case_type: string | null
          created_at: string | null
          id: string | null
          naam: string | null
          nummer: string | null
          opdrachtgever_id: string | null
          stationsnaam: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          adres?: string | null
          case_type?: string | null
          created_at?: string | null
          id?: string | null
          naam?: string | null
          nummer?: string | null
          opdrachtgever_id?: string | null
          stationsnaam?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          adres?: string | null
          case_type?: string | null
          created_at?: string | null
          id?: string | null
          naam?: string | null
          nummer?: string | null
          opdrachtgever_id?: string | null
          stationsnaam?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_opdrachtgever_id_fkey"
            columns: ["opdrachtgever_id"]
            isOneToOne: false
            referencedRelation: "opdrachtgevers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adopt_planner_planning_item_v1: {
        Args: {
          _activiteit: string
          _datum: string
          _external_id: string
          _kleur: string
          _manager_profile_id: string
          _medewerker_id: string
          _notitie: string
          _project_id: string
        }
        Returns: Json
      }
      check_rate_limit: {
        Args: {
          _endpoint: string
          _key: string
          _limit?: number
          _window_seconds?: number
        }
        Returns: boolean
      }
      cleanup_rate_limit_log: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_onderaannemer_van: {
        Args: { _profile_id: string; _user_id: string }
        Returns: boolean
      }
      koppel_monteur_aan_onderaannemer: {
        Args: {
          _monteur_id: string
          _nieuwe_onderaannemer_id: string
          _reden?: string
        }
        Returns: Json
      }
      next_contract_nummer: { Args: never; Returns: string }
      next_inkooporder_nummer: { Args: never; Returns: string }
      sync_planner_planning_item_v1: {
        Args: {
          _activiteit: string
          _datum: string
          _external_id: string
          _kleur: string
          _manager_profile_id: string
          _medewerker_id: string
          _notitie: string
          _project_id: string
        }
        Returns: Json
      }
      sync_planner_planning_update_v1: {
        Args: {
          _activiteit: string
          _datum: string
          _eindtijd: string
          _external_id: string
          _kleur: string
          _manager_profile_id: string
          _medewerker_id: string
          _notitie: string
          _project_id: string
          _starttijd: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "monteur" | "schakelmonteur" | "uitvoerder" | "wv" | "manager"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["monteur", "schakelmonteur", "uitvoerder", "wv", "manager"],
    },
  },
} as const
