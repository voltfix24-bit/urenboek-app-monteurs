import {
  Document, Page, Text, View,
  Image, StyleSheet,
} from "@react-pdf/renderer";
import { pdf } from "@react-pdf/renderer";
import { format, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";
import terrevoltLogoPng from "@/assets/terrevolt-logo.png";
import { roundKilometers } from "@/lib/kilometers";

const groen = "#2d4a1e";
const groenMid = "#4a7c2f";
const groenTint = "#eef5e8";
const groenLicht = "#f5f7f0";
const goud = "#c8a84b";
const goudLicht = "#fff8dc";
const rand = "#c8d9b8";
const muted = "#5a7a42";
const faint = "#42493c";

const styles = StyleSheet.create({
  page: {
    backgroundColor: groenLicht,
    paddingTop: 28,
    paddingBottom: 28,
    paddingLeft: 36,
    paddingRight: 36,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#072100",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  logo: {
    width: 100,
    height: 28,
    objectFit: "contain",
  },
  logoSub: {
    fontSize: 6.5,
    color: muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 4,
  },
  headerRechts: {
    alignItems: "flex-end",
  },
  titel: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: groen,
    letterSpacing: -0.5,
  },
  ordernummer: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: groenMid,
    marginTop: 3,
  },
  statusBadge: {
    backgroundColor: groenMid,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    marginTop: 5,
    alignSelf: "flex-end",
  },
  statusBadgeTekst: {
    color: "white",
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
  },
  datumInfo: {
    marginTop: 8,
    alignItems: "flex-end",
  },
  datumLabel: {
    fontSize: 6.5,
    color: faint,
  },
  datumWaarde: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: groen,
    marginBottom: 4,
  },
  partijen: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  partijBox: {
    flex: 1,
    backgroundColor: "white",
    borderWidth: 0.5,
    borderColor: rand,
    borderRadius: 6,
    padding: 8,
  },
  partijLabel: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: groen,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: groen,
    paddingBottom: 4,
  },
  partijNaam: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#072100",
    marginBottom: 4,
  },
  partijDetail: {
    fontSize: 8,
    color: muted,
    lineHeight: 1.6,
  },
  samenvatBalk: {
    flexDirection: "row",
    backgroundColor: groenTint,
    borderWidth: 0.3,
    borderColor: rand,
    borderRadius: 4,
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  samenvatItem: {
    flex: 1,
    paddingHorizontal: 6,
  },
  samenvatLabel: {
    fontSize: 5.5,
    fontFamily: "Helvetica-Bold",
    color: muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  samenvatWaarde: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: groen,
  },
  samenvatSep: {
    width: 0.3,
    backgroundColor: rand,
    marginVertical: 2,
  },
  tabelHeader: {
    flexDirection: "row",
    backgroundColor: groen,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tabelHeaderTekst: {
    color: "white",
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tabelRij: {
    flexDirection: "row",
    borderBottomWidth: 0.3,
    borderBottomColor: rand,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tabelRijEven: {
    backgroundColor: "white",
  },
  tabelRijOneven: {
    backgroundColor: groenTint,
  },
  kolDatum: { width: 50 },
  kolProject: { width: 62 },
  kolWerk: { flex: 1, paddingLeft: 4 },
  kolUren: { width: 20, textAlign: "center" },
  kolTarief: { width: 42, textAlign: "right" },
  kolBedrag: { width: 46, textAlign: "right" },
  tabelTekst: {
    fontSize: 8,
    color: "#072100",
  },
  tabelProject: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: groen,
  },
  tabelNr: {
    fontSize: 7,
    color: muted,
  },
  tabelBedrag: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: groen,
  },
  tabelMuted: {
    fontSize: 8,
    color: faint,
  },
  financieelWrap: {
    alignItems: "flex-end",
    marginTop: 8,
    marginBottom: 10,
  },
  finBlok: { width: 180 },
  finRij: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 0.2,
    borderBottomColor: rand,
  },
  finLabel: { fontSize: 8, color: muted },
  finWaarde: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#072100",
  },
  totaalBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: goudLicht,
    borderLeftWidth: 4,
    borderLeftColor: groenMid,
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  totaalLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: groen,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  totaalBedrag: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: groen,
  },
  footerLijn: {
    borderTopWidth: 0.5,
    borderTopColor: rand,
    marginTop: 10,
    paddingTop: 10,
    flexDirection: "row",
    gap: 20,
  },
  footerBlok: { flex: 1 },
  footerLabel: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    color: muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  footerTekst: {
    fontSize: 8,
    color: faint,
    lineHeight: 1.6,
  },
  footerStrong: {
    fontFamily: "Helvetica-Bold",
    color: groen,
  },
  ordernrChip: {
    backgroundColor: groenTint,
    borderWidth: 0.5,
    borderColor: rand,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  ordernrChipTekst: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: groen,
  },
  geenFactuur: {
    fontSize: 7,
    fontFamily: "Helvetica-Oblique",
    color: muted,
    marginTop: 8,
  },
  docFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    paddingTop: 8,
    borderTopWidth: 0.2,
    borderTopColor: rand,
  },
  docFooterTekst: {
    fontSize: 7,
    color: muted,
  },
});

function formatIban(iban: string): string {
  return (iban || "").replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function fmtDatum(d: string, fmt: string = "d MMM yyyy"): string {
  try {
    return format(new Date(d + "T12:00:00"), fmt, { locale: nl });
  } catch {
    return d;
  }
}

function fmtDatumMetDag(d: string): string {
  try {
    return format(new Date(d + "T12:00:00"), "EEE d MMM", { locale: nl });
  } catch {
    return d;
  }
}

function euro(n: number): string {
  return `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InkooporderDocument({
  order,
  regels,
  prof,
  bedrijf,
  goedkeurderNaam,
  logoPng,
}: {
  order: any;
  regels: any[];
  prof: any;
  bedrijf: any;
  goedkeurderNaam?: string;
  logoPng: string;
}) {
  const bNaam = bedrijf?.bedrijfsnaam || "TerreVolt B.V.";
  const monteurNaam = prof?.bedrijfsnaam || prof?.full_name || order.medewerker_naam || "";
  const termijn = bedrijf?.betalingstermijn || 30;
  const email = bedrijf?.email || "info@terrevolt.nl";
  const periodeStr =
    fmtDatum(order.periode_van, "d MMM") + " – " + fmtDatum(order.periode_tot, "d MMM yyyy");
  const datumStr = fmtDatum(order.aangemaakt_op.split("T")[0]);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Image src={logoPng} style={styles.logo} />
            <Text style={styles.logoSub}>Elektrotechniek &amp; Installatie</Text>
          </View>
          <View style={styles.headerRechts}>
            <Text style={styles.titel}>Werkbevestiging</Text>
            <Text style={styles.ordernummer}>{order.order_nummer}</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeTekst}>GOEDGEKEURD VOOR FACTUUR</Text>
            </View>
            <View style={styles.datumInfo}>
              <Text style={styles.datumLabel}>Datum:</Text>
              <Text style={styles.datumWaarde}>{datumStr}</Text>
              <Text style={styles.datumLabel}>Goedgekeurd door:</Text>
              <Text style={styles.datumWaarde}>{goedkeurderNaam || bNaam}</Text>
              <Text style={styles.datumLabel}>Goedgekeurd op:</Text>
              <Text style={styles.datumWaarde}>{datumStr}</Text>
            </View>
          </View>
        </View>

        {/* PARTIJEN */}
        <View style={styles.partijen}>
          <View style={styles.partijBox}>
            <Text style={styles.partijLabel}>Uitgevoerd door</Text>
            <Text style={styles.partijNaam}>{monteurNaam}</Text>
            {(prof?.factuuradres || prof?.adres) && (
              <Text style={styles.partijDetail}>
                {(prof.factuuradres || prof.adres).split(",").map((s: string) => s.trim()).join("\n")}
              </Text>
            )}
            {prof?.kvk_nummer && <Text style={styles.partijDetail}>KVK: {prof.kvk_nummer}</Text>}
            {prof?.btw_nummer && <Text style={styles.partijDetail}>BTW: {prof.btw_nummer}</Text>}
            {prof?.iban && <Text style={styles.partijDetail}>IBAN: {formatIban(prof.iban)}</Text>}
            {prof?.telefoon && <Text style={styles.partijDetail}>Tel: {prof.telefoon}</Text>}
          </View>
          <View style={styles.partijBox}>
            <Text style={styles.partijLabel}>Opdracht van</Text>
            <Text style={styles.partijNaam}>{bNaam}</Text>
            {bedrijf?.straat && <Text style={styles.partijDetail}>{bedrijf.straat}</Text>}
            {(bedrijf?.postcode || bedrijf?.stad) && (
              <Text style={styles.partijDetail}>
                {[bedrijf.postcode, bedrijf.stad].filter(Boolean).join(" ")}
              </Text>
            )}
            {bedrijf?.kvk_nummer && <Text style={styles.partijDetail}>KVK: {bedrijf.kvk_nummer}</Text>}
            {bedrijf?.btw_nummer && <Text style={styles.partijDetail}>BTW: {bedrijf.btw_nummer}</Text>}
            {bedrijf?.email && <Text style={styles.partijDetail}>{bedrijf.email}</Text>}
          </View>
        </View>

        {/* SAMENVATTINGSBALK */}
        <View style={styles.samenvatBalk}>
          {[
            { label: "WEEK", waarde: `${getISOWeek(new Date(order.periode_van + "T12:00:00"))}` },
            { label: "TOTAAL UREN", waarde: `${order.totaal_uren} uur` },
            { label: "UURTARIEF", waarde: regels.length > 0 ? euro(Number(regels[0].uurtarief)) : "—" },
            { label: "BETAALTERMIJN", waarde: `${termijn} dagen` },
          ].map((item, i) => (
            <View key={i} style={{ flexDirection: "row" as const, flex: 1 }}>
              {i > 0 && <View style={styles.samenvatSep} />}
              <View style={[styles.samenvatItem, { flex: 1 }]}>
                <Text style={styles.samenvatLabel}>{item.label}</Text>
                <Text style={styles.samenvatWaarde}>{item.waarde}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* TABEL HEADER */}
        <View style={styles.tabelHeader}>
          <View style={styles.kolDatum}><Text style={styles.tabelHeaderTekst}>Datum</Text></View>
          <View style={styles.kolProject}><Text style={styles.tabelHeaderTekst}>Project</Text></View>
          <View style={styles.kolWerk}><Text style={styles.tabelHeaderTekst}>Werkzaamheden</Text></View>
          <View style={styles.kolUren}><Text style={[styles.tabelHeaderTekst, { textAlign: "center" }]}>Uren</Text></View>
          <View style={styles.kolTarief}><Text style={[styles.tabelHeaderTekst, { textAlign: "right" }]}>Tarief</Text></View>
          <View style={styles.kolBedrag}><Text style={[styles.tabelHeaderTekst, { textAlign: "right" }]}>Bedrag</Text></View>
        </View>

        {/* TABEL RIJEN */}
        {regels.map((r: any, i: number) => {
          const isReiskosten = (r.regel_type || "uren") === "reiskosten";
          const retourKm = roundKilometers(r.retour_km);
          const vrijKm = roundKilometers(r.vrije_km);
          const vergoedbareKm = roundKilometers(r.kilometers);
          const bronLabel = r.afstand_bron === "google_routes" ? "auto" : "handmatig";
          const omschrijving = isReiskosten
            ? `Reiskosten ploeg · retour ${retourKm} km · vrij ${vrijKm} km · ${bronLabel}`
            : r.activiteit || r.beschrijving || "Elektrotechnische werkzaamheden";
          return (
            <View key={i} style={[styles.tabelRij, i % 2 === 0 ? styles.tabelRijEven : styles.tabelRijOneven]}>
              <View style={styles.kolDatum}><Text style={styles.tabelMuted}>{fmtDatumMetDag(r.datum)}</Text></View>
              <View style={styles.kolProject}><Text style={styles.tabelProject}>{r.project_naam || ""}</Text></View>
              <View style={styles.kolWerk}><Text style={styles.tabelTekst}>{omschrijving}</Text></View>
              <View style={styles.kolUren}><Text style={[styles.tabelTekst, { textAlign: "center", fontFamily: "Helvetica-Bold" }]}>{isReiskosten ? `${vergoedbareKm} km` : r.uren}</Text></View>
              <View style={styles.kolTarief}><Text style={[styles.tabelTekst, { textAlign: "right" }]}>{isReiskosten ? `${euro(Number(r.km_tarief || 0))}/km` : euro(Number(r.uurtarief))}</Text></View>
              <View style={styles.kolBedrag}><Text style={[styles.tabelBedrag, { textAlign: "right" }]}>{euro(Number(r.bedrag))}</Text></View>
            </View>
          );
        })}

        {/* FINANCIEEL */}
        <View style={styles.financieelWrap}>
          <View style={styles.finBlok}>
            <View style={styles.finRij}>
              <Text style={styles.finLabel}>Subtotaal</Text>
              <Text style={styles.finWaarde}>{euro(Number(order.totaal_excl_btw))}</Text>
            </View>
            <View style={styles.finRij}>
              <Text style={styles.finLabel}>BTW</Text>
              <Text style={{
                fontSize: 7,
                fontFamily: "Helvetica-Bold",
                color: "#92400e",
                backgroundColor: "#fffbeb",
                paddingHorizontal: 5,
                paddingVertical: 2,
                borderRadius: 2,
              }}>Verlegd (art. 12 Wet OB)</Text>
            </View>
            <View style={styles.totaalBox}>
              <Text style={styles.totaalLabel}>{"Totaal te\nfactureren"}</Text>
              <Text style={styles.totaalBedrag}>{euro(Number(order.totaal_excl_btw))}</Text>
            </View>
          </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footerLijn}>
          {/* LEFT — Facturatie instructies */}
          <View style={styles.footerBlok}>
            <Text style={styles.footerLabel}>Facturatie-instructies</Text>
            <Text style={styles.footerTekst}>
              {"Stuur je factuur naar "}
              <Text style={styles.footerStrong}>{email}</Text>
              {". Zet op je factuur het ordernummer "}
              <Text style={styles.footerStrong}>{order.order_nummer}</Text>
              {". Wij betalen binnen "}
              <Text style={styles.footerStrong}>{termijn} dagen</Text>
              {" nadat wij je factuur hebben ontvangen."}
            </Text>

            {/* BTW verlegd wettelijke tekst */}
            <View style={{
              backgroundColor: "#fffbeb",
              borderWidth: 0.5,
              borderColor: "#fcd34d",
              borderRadius: 3,
              paddingHorizontal: 8,
              paddingVertical: 6,
              marginTop: 8,
            }}>
              <Text style={{ fontSize: 7, color: "#92400e", lineHeight: 1.6, fontFamily: "Helvetica" }}>
                {"Voor deze opdracht is btw verlegd van toepassing. Zet op je factuur: "}
                <Text style={{ fontFamily: "Helvetica-Bold" }}>"BTW verlegd"</Text>
                {" en vermeld ook je btw-nummer."}
              </Text>
            </View>

            <Text style={styles.geenFactuur}>
              {"Dit document is geen factuur. Gebruik het als basis voor je factuur aan "}
              <Text style={styles.footerStrong}>{bNaam}</Text>
              {"."}
            </Text>
          </View>

          {/* RIGHT — Betaling naar */}
          <View style={styles.footerBlok}>
            <Text style={styles.footerLabel}>Betaling naar</Text>
            <Text style={styles.footerTekst}>
              {"Zet dit op je factuur:\n"}
              <Text style={styles.footerStrong}>
                {"— Ordernummer: "}
                {order.order_nummer}
                {"\n— BTW verlegd\n— Je btw-nummer"}
              </Text>
              {"\n\n"}
              <Text style={styles.footerStrong}>{bNaam}</Text>
              {bedrijf?.iban ? `\nIBAN: ${formatIban(bedrijf.iban)}` : null}
              {bedrijf?.iban_naam ? `\nT.n.v. ${bedrijf.iban_naam}` : null}
            </Text>
          </View>
        </View>

        {/* DOC FOOTER */}
        <View style={styles.docFooter}>
          <Text style={styles.docFooterTekst}>Doc: {order.order_nummer} · Week {periodeStr}</Text>
          <Text style={styles.docFooterTekst}>Goedgekeurd voor factuur · Pagina 1 van 1</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function downloadInkooporderPdf(
  order: any,
  regels: any[],
  prof: any,
  bedrijf: any,
  goedkeurderNaam?: string
) {
  try {
    const logoResponse = await fetch(terrevoltLogoPng);
    const logoBlob = await logoResponse.blob();
    const logoPng = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(logoBlob);
    });

    const blob = await pdf(
      <InkooporderDocument
        order={order}
        regels={regels}
        prof={prof}
        bedrijf={bedrijf}
        goedkeurderNaam={goedkeurderNaam}
        logoPng={logoPng}
      />
    ).toBlob();

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Inkooporder_${order.order_nummer}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error("PDF generation failed:", err);
    throw err;
  }
}
