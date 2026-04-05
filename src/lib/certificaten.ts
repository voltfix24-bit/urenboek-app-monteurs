export interface CertGebied {
  code: string;
  label: string;
  info: string | null;
}

export interface CertConfig {
  type: string;
  label: string;
  heeftNiveau: boolean;
  niveaus?: string[];
  heeftVervaldatum: boolean;
  heeftGebieden?: boolean;
  gebieden?: CertGebied[];
  kortLabel?: string;
  info?: string | null;
  infoLink?: string;
}

export const CERT_CONFIG: CertConfig[] = [
  {
    type: "BEI_BLS",
    label: "Stipel BEI BLS",
    heeftNiveau: true,
    niveaus: ["VOP", "VP", "AVP", "WV"],
    heeftVervaldatum: true,
    info: null,
  },
  {
    type: "BEI_BHS",
    label: "Stipel BEI BHS",
    heeftNiveau: true,
    niveaus: ["VOP", "VP", "AVP", "WV"],
    heeftVervaldatum: true,
    info: null,
  },
  {
    type: "KBM",
    label: "Kleine Blusmiddelen (KBM)",
    heeftNiveau: false,
    heeftVervaldatum: true,
    info: null,
  },
  {
    type: "LRH",
    label: "Levensreddend Handelen (LRH)",
    heeftNiveau: false,
    heeftVervaldatum: true,
    info: null,
  },
  {
    type: "VCA",
    label: "VCA",
    heeftNiveau: false,
    heeftVervaldatum: true,
    info: null,
  },
  {
    type: "POORT",
    label: "Poortinstructie",
    heeftNiveau: false,
    heeftVervaldatum: false,
    kortLabel: "Poortinstructie TSO/DSO",
    info: `Waar doe ik de poortinstructie?
De poortinstructie volg je via www.poortinstructienetbeheernederland.nl

Volg je de poortinstructies op een telefoon of een tablet? Open hem dan in Chrome en houd je apparaat horizontaal.

Je kiest eerst of je een bezoeker of professional bent. De Professional poortinstructie is 3 jaar geldig. De Bezoeker poortinstructie is 1 jaar geldig.

LET OP: als je een aanwijzing hebt, MOET je de professional-optie kiezen. De bezoekersinstructie wordt voor aanwijzingen niet erkend.`,
    infoLink: "https://www.poortinstructienetbeheernederland.nl",
  },
  {
    type: "GGI",
    label: "Gebiedsgebonden Instructies (GGI)",
    heeftNiveau: false,
    heeftVervaldatum: false,
    heeftGebieden: true,
    gebieden: [
      { code: "Amsterdam", label: "Amsterdam", info: null },
      { code: "NHN", label: "NHN", info: "Noord-Holland Noord" },
      { code: "RBNH", label: "RBNH", info: "Regio Beneden Noord Holland" },
      { code: "Veluwe_Flevoland", label: "Veluwe Flevoland", info: null },
      { code: "Oost_West_Gelderland", label: "Oost West Gelderland", info: null },
      { code: "Gooi_Amstelland", label: "Gooi Amstelland", info: null },
      { code: "FNOP", label: "FNOP", info: "Friesland Noord Oost Polder" },
    ],
  },
  {
    type: "RIJBEWIJS",
    label: "Rijbewijs",
    heeftNiveau: false,
    heeftVervaldatum: true,
    info: null,
  },
];
