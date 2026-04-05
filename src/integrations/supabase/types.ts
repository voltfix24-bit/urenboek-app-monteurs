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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beschikbaarheid_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_regels: {
        Row: {
          aantal: number | null
          created_at: string
          forecast_id: string
          geplande_uren: number | null
          id: string
          medewerker_id: string | null
          spec_code: string | null
          spec_omschrijving: string | null
          tarief_inkoop: number | null
          tarief_terrevolt: number | null
          type: string
          updated_at: string
          uurtarief_snap: number | null
        }
        Insert: {
          aantal?: number | null
          created_at?: string
          forecast_id: string
          geplande_uren?: number | null
          id?: string
          medewerker_id?: string | null
          spec_code?: string | null
          spec_omschrijving?: string | null
          tarief_inkoop?: number | null
          tarief_terrevolt?: number | null
          type: string
          updated_at?: string
          uurtarief_snap?: number | null
        }
        Update: {
          aantal?: number | null
          created_at?: string
          forecast_id?: string
          geplande_uren?: number | null
          id?: string
          medewerker_id?: string | null
          spec_code?: string | null
          spec_omschrijving?: string | null
          tarief_inkoop?: number | null
          tarief_terrevolt?: number | null
          type?: string
          updated_at?: string
          uurtarief_snap?: number | null
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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overuren_meldingen_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planning: {
        Row: {
          created_at: string
          created_by: string
          datum: string
          eindtijd: string
          id: string
          medewerker_id: string
          notitie: string
          project_id: string
          starttijd: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          datum: string
          eindtijd?: string
          id?: string
          medewerker_id: string
          notitie?: string
          project_id: string
          starttijd?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          datum?: string
          eindtijd?: string
          id?: string
          medewerker_id?: string
          notitie?: string
          project_id?: string
          starttijd?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_medewerker_id_fkey"
            columns: ["medewerker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "projects_public"
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
          contract_einddatum: string | null
          created_at: string
          full_name: string
          id: string
          invited_at: string | null
          noodcontact_naam: string | null
          noodcontact_tel: string | null
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
          contract_einddatum?: string | null
          created_at?: string
          full_name: string
          id?: string
          invited_at?: string | null
          noodcontact_naam?: string | null
          noodcontact_tel?: string | null
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
          contract_einddatum?: string | null
          created_at?: string
          full_name?: string
          id?: string
          invited_at?: string | null
          noodcontact_naam?: string | null
          noodcontact_tel?: string | null
          rijbewijs?: boolean
          telefoon?: string
          updated_at?: string
          user_id?: string
          uurtarief?: number | null
          vaste_vrije_dagen?: number[]
        }
        Relationships: []
      }
      project_forecast: {
        Row: {
          created_at: string
          id: string
          methode: string
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          methode: string
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          methode?: string
          project_id?: string
          updated_at?: string
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
            referencedRelation: "projects_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_planning_matrix_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
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
          naam: string
          nummer: string
          opdrachtgever_id: string | null
          postcode: string | null
          stad: string | null
          stationsnaam: string | null
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
          naam: string
          nummer: string
          opdrachtgever_id?: string | null
          postcode?: string | null
          stad?: string | null
          stationsnaam?: string | null
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
          naam?: string
          nummer?: string
          opdrachtgever_id?: string | null
          postcode?: string | null
          stad?: string | null
          stationsnaam?: string | null
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
            referencedRelation: "profiles"
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
