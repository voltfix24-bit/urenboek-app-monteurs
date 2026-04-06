import { z } from 'zod';

// ─── HERBRUIKBARE VELDEN ──────────────

const nlPostcode = z
  .string()
  .regex(/^\d{4}\s?[A-Za-z]{2}$/, 'Vul een geldige postcode in (bijv. 1234 AB)')
  .or(z.literal(''));

const nlTelefoon = z
  .string()
  .regex(/^(\+31|0)[0-9\s-]{9,12}$/, 'Vul een geldig telefoonnummer in')
  .or(z.literal(''));

const email = z.string().email('Vul een geldig e-mailadres in');

const kvkNummer = z
  .string()
  .regex(/^\d{8}$/, 'KVK-nummer bestaat uit 8 cijfers')
  .or(z.literal(''));

const btwNummer = z
  .string()
  .regex(/^NL\d{9}B\d{2}$/, 'BTW-nummer format: NL123456789B01')
  .or(z.literal(''));

const iban = z
  .string()
  .regex(/^NL\d{2}[A-Z]{4}\d{10}$/, 'IBAN format: NL02ABNA0123456789')
  .or(z.literal(''));

// ─── PROJECT SCHEMA ───────────────────
export const projectSchema = z.object({
  nummer: z.string().min(1, 'Casenummer is verplicht'),
  naam: z.string().min(2, 'Naam moet minimaal 2 tekens zijn').max(100, 'Naam mag maximaal 100 tekens zijn'),
  stationsnaam: z.string().optional(),
  straat: z.string().min(1, 'Straat is verplicht'),
  postcode: nlPostcode.refine(v => v.length > 0, 'Postcode is verplicht'),
  stad: z.string().min(1, 'Stad is verplicht'),
  case_type: z.string().optional(),
  opdrachtgever_id: z.string().nullable().optional(),
  contactpersoon_naam: z.string().optional(),
  contactpersoon_tel: nlTelefoon.optional(),
  contactpersoon_email: z.string().email('Ongeldig e-mailadres').or(z.literal('')).optional(),
});

export type ProjectFormData = z.infer<typeof projectSchema>;

// ─── MEDEWERKER SCHEMA ────────────────
export const nieuweMedewerkerSchema = z.object({
  voornaam: z.string().min(2, 'Voornaam is verplicht'),
  achternaam: z.string().min(2, 'Achternaam is verplicht'),
  email: email,
  role: z.enum(['monteur', 'schakelmonteur', 'uitvoerder', 'wv', 'manager'], {
    errorMap: () => ({ message: 'Kies een rol' }),
  }),
  uurtarief: z.string().optional(),
  telefoon: nlTelefoon.optional(),
});

export type NieuweMedewerkerFormData = z.infer<typeof nieuweMedewerkerSchema>;

// ─── ZZP GEGEVENS SCHEMA ─────────────
export const zzpSchema = z.object({
  bedrijfsnaam: z.string().optional(),
  kvk_nummer: kvkNummer,
  btw_nummer: btwNummer,
  iban: iban,
  factuuradres: z.string().optional(),
});

export type ZzpFormData = z.infer<typeof zzpSchema>;

// ─── PROFIEL SCHEMA ───────────────────
export const profielSchema = z.object({
  full_name: z.string().min(2, 'Naam is verplicht'),
  telefoon: nlTelefoon,
  adres: z.string().optional(),
});

export type ProfielFormData = z.infer<typeof profielSchema>;

// ─── UREN BOEKING SCHEMA ──────────────
export const urenBoekingSchema = z.object({
  projectId: z.string().min(1, 'Kies een project'),
  werkzaamheden: z.string().min(1, 'Kies soort werkzaamheden'),
  uren: z.number().min(0.5, 'Minimaal 0,5 uur').max(24, 'Maximaal 24 uur per dag'),
});

// ─── MEDEDELING SCHEMA ────────────────
export const mededelingSchema = z.object({
  titel: z.string().min(3, 'Titel is verplicht').max(100),
  inhoud: z.string().min(10, 'Inhoud is te kort').max(2000),
  urgentie: z.enum(['normaal', 'urgent', 'info']),
  ontvanger_type: z.enum(['iedereen', 'monteurs', 'persoon']),
  ontvanger_id: z.string().nullable().optional(),
});

// ─── VALIDATIE HELPER ─────────────────
export function valideer<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  result.error.errors.forEach(err => {
    const path = err.path.join('.');
    if (!errors[path]) {
      errors[path] = err.message;
    }
  });

  return { success: false, errors };
}
