"use client";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";
import { problemMessage } from "@/lib/api/problem";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";

/* ============================================================
   Lapisan integrasi TB Call Center — kontrak backend Spring Boot
   via proxy same-origin /api/tbcall/v1/*
   ============================================================ */

/* ---------- tipe respons (mirror DTO backend) ---------- */

export type Label = { code: string; name: string };
export type FacilityDisplay = { id: string; name: string };
export type Page<T> = { content: T[]; page: number; size: number; totalElements: number };

export type RegistrationSummary = { id: string; version: number; status: string; registrationDate: string; facility: FacilityDisplay };
export type CaseListSummary = { id: string; version: number; status: string; caseCategory: Label | null; currentFacility: FacilityDisplay };
export type PatientListItem = {
  patientId: string; version: number; fullName: string; sex: Label | null; birthDate: string | null; birthDateUnknown: boolean;
  nik: string | null; bpjsNumber: string | null; registrations: RegistrationSummary[]; cases: CaseListSummary[];
};
export type PatientPage = Page<PatientListItem>;
export type Demographics = {
  fullName: string; citizenship: string; nik: string | null; otherIdentityNumber: string | null; bpjsNumber: string | null;
  birthPlace: string | null; birthDate: string | null; birthDateUnknown: boolean; sex: Label | null; phone: string | null;
  address: string | null; provinceCode: string | null; regencyCode: string | null; districtCode: string | null; villageCode: string | null;
};
export type PatientSummary = { patientId: string; version: number; fullName: string; sex: Label | null; birthDate: string | null; birthDateUnknown: boolean };
export type RegistrationView = {
  id: string; version: number; status: string; patient: PatientSummary; facility: FacilityDisplay; registrationDate: string;
  facilityRegistrationNumber: string | null; medicalRecordNumber: string | null; specimenIdentityNumber: string | null;
  suspectTypeCode: string | null; previousTreatmentCategoryCode: string | null; referredByType: string | null;
  referredByReference: string | null; referralNotes: string | null; initialWeightKg: number | null; hivStatusCode: string | null; dmStatusCode: string | null;
};
export type DiagnosisSummaryT = { id: string; version: number; diagnosisDate: string; anatomicalSite: Label; diagnosisType: Label };
export type CaseSummaryT = { id: string; version: number; status: string; caseCategory: Label | null; currentFacility: FacilityDisplay; diagnosis: DiagnosisSummaryT | null };
export type PatientCaseSummaryT = { summary: CaseSummaryT; hivStatusCode: string | null; dmStatusCode: string | null };
export type PatientDetail = { patientId: string; version: number; demographics: Demographics; registrations: RegistrationView[]; cases: PatientCaseSummaryT[] };
export type IdentityConfirmation = { patientId: string; fullName: string; citizenship: string; nik: string | null; otherIdentityNumber: string | null };
export type DiagnosisView = {
  id: string; version: number; registrationId: string; registrationVersion: number; diagnosisDate: string;
  anatomicalSite: Label; diagnosisType: Label; diagnosisResult: string; chestXrayResult: string | null; chestXrayDate: string | null;
  chestXraySerial: string | null; chestXrayImpression: string | null; icd10Code: string | null; treatmentDisposition: string | null;
  referredToFacility: FacilityDisplay | null; notes: string | null;
};
export type CaseView = {
  id: string; version: number; status: string; currentFacility: FacilityDisplay; patient: PatientSummary;
  registration: RegistrationSummary; confirmingDiagnosis: DiagnosisSummaryT | null; caseCategoryCode: string | null;
  drugResistancePatternCode: string | null; healthWorker: boolean | null; pregnancyStatusCode: string | null;
  heightCm: number | null; weightKg: number | null; bcgStatusCode: string | null; previousTreatmentCategoryCode: string | null;
  hivStatusCode: string | null; dmStatusCode: string | null; icd10Code: string | null; confirmedAt: string | null;
};

export type Completeness = { totalTests: number; completedTests: number; totalSpecimens: number; receivedSpecimens: number; usableSpecimens: number; needsNewSpecimen: boolean };
export type TestSummaryT = { id: string; version: number; testType: Label; status: string };
export type ResultViewT = { id: string; version: number; testId: string; specimenId: string | null; sequenceNo: number; status: string; testedAt: string; resultCode: string | null; resultValue: string | null; resultText: string | null };
export type TestDetailT = { id: string; version: number; testType: Label; status: string; latestResults: ResultViewT[] };
export type SpecimenView = {
  id: string; version: number; requestId: string; requestVersion: number; specimenCode: string | null; specimenType: string;
  collectedAt: string | null; sentAt: string | null; receivedAt: string | null; conditionOnReceipt: string | null;
  examinationPossible: boolean | null; rejectionReason: string | null; notes: string | null;
};
export type RequestSummaryT = {
  id: string; version: number; owner: { type: string; id: string }; patient: { patientId: string; fullName: string; sex: Label | null; birthDate: string | null; birthDateUnknown: boolean };
  requestingFacility: FacilityDisplay; testingFacility: FacilityDisplay; requestReason: Label; referralType: string | null;
  requestedAt: string; status: string; tests: TestSummaryT[]; completeness: Completeness;
};
export type RequestDetailT = Omit<RequestSummaryT, "tests"> & { sampleShippingMethod: string | null; courierName: string | null; notes: string | null; specimens: SpecimenView[]; tests: TestDetailT[] };

export type DrugView = { id: string; drugCode: string; drugName: string | null; treatmentPhase: string | null; doseValue: number | null; doseUnit: string | null; frequencyPerWeek: number | null; startDate: string; endDate: string | null; batchNumber: string | null; drugSource: string | null; notes: string | null };
export type DoseView = { id: string; scheduledDate: string; recordedAt: string | null; status: string; administrationMode: string | null; source: string; notes: string | null };
export type FollowUpViewT = { id: string; version: number; treatmentId: string; followUpType: string; scheduledAt: string; completedAt: string | null; facility: FacilityDisplay | null; status: string; weightKg: number | null; symptomSummary: string | null; adherenceAssessment: string | null; notes: string | null };
export type AdverseView = { id: string; version: number; treatmentId: string; reportedAt: string; eventType: string; severity: string | null; serious: boolean; startedAt: string | null; endedAt: string | null; description: string | null; actionTaken: string | null; outcome: string | null };
export type OutcomeView = { id: string; outcomeCode: string; outcomeName: string; outcomeDate: string; notes: string | null };
export type TreatmentDetail = {
  id: string; version: number; caseId: string; patient: { id: string; displayName: string }; facility: FacilityView | null; regimen: Label;
  status: string; startDate: string; plannedEndDate: string | null; actualEndDate: string | null; initialWeightKg: number | null;
  oatForm: string | null; drugSource: string | null; intensiveStartDate: string | null; intensiveEndDate: string | null;
  continuationStartDate: string | null; continuationEndDate: string | null; regimenDescription: string | null; notes: string | null;
  drugs: DrugView[]; adherenceSummary: { totalReports: number; reportsByStatus: Record<string, number> } | null;
  recentDoseEvents: DoseView[]; followUps: FollowUpViewT[]; adverseEvents: AdverseView[]; outcome: OutcomeView | null;
};
export type FacilityView = { id: string; name: string };
export type SafeDose = { id: string; scheduledDate: string; recordedAt: string | null; status: string; administrationMode: string | null; source: string };
export type SafeFollowUp = { id: string; treatmentId: string; followUpType: string; scheduledAt: string; completedAt: string | null; facility: FacilityView | null; status: string };
export type SafeAdverse = { eventType: string; severity: string | null; serious: boolean; reportedAt: string; startedAt: string | null; endedAt: string | null };
export type SafeOutcome = { outcomeCode: string; outcomeName: string; outcomeDate: string };
export type SafeDrug = { drugName: string | null; treatmentPhase: string | null; doseValue: number | null; doseUnit: string | null; frequencyPerWeek: number | null; startDate: string; endDate: string | null };
export type PatientTreatment = {
  id: string; status: string; regimen: Label; startDate: string; plannedEndDate: string | null; actualEndDate: string | null;
  drugs: SafeDrug[]; recentDoseEvents: SafeDose[]; outcome: SafeOutcome | null; adverseEvents: SafeAdverse[];
};
export type SelfPatient = {
  patientId: string; fullName: string; sex: Label | null; birthPlace: string | null; birthDate: string | null; birthDateUnknown: boolean;
  phone: string | null; address: string | null; registrations: RegistrationSummary[]; cases: CaseSummaryT[];
};

export type ReferralDetail = {
  id: string; version: number; referralType: string; status: string; sentAt: string; receivedAt: string | null;
  patientReportedAt: string | null; cancelledAt: string | null; sourceFacility: FacilityDisplay; destinationFacility: FacilityDisplay;
  patient: { id: string; fullName: string }; tbCase: { id: string; categoryCode: string; status: string };
  treatment: { id: string; status: string; startDate: string; plannedEndDate: string | null; regimenCode: string; regimenName: string } | null;
  notes: string | null; cancelReason: string | null; returnReason: string | null;
};

export type InvestigationSummaryT = { id: string; version: number; workflowType: string; status: string; requestedAt: string };
export type TptSummaryT = { id: string; version: number; status: string; startDate: string; facility: FacilityDisplay };
export type ContactDetail = {
  id: string; version: number; fullName: string; birthDate: string | null; sexCode: string | null; phone: string | null; address: string | null;
  relationshipToIndexCase: string | null; householdContact: boolean | null; linkedPatient: boolean;
  investigations: InvestigationSummaryT[]; tpt: TptSummaryT[];
};
export type InvestigationDetail = {
  id: string; version: number; workflowType: string; status: string; requestedAt: string; receivedAt: string | null;
  investigatedAt: string | null; eligibilityAssessedAt: string | null; sourceFacility: FacilityDisplay; destinationFacility: FacilityDisplay | null;
  contact: { id: string; fullName: string; birthDate: string | null; sexCode: string | null; phone: string | null };
  indexCase: { id: string; categoryCode: string }; resultCode: string | null; activeTbExcluded: boolean | null; tptEligible: boolean | null;
  notes: string | null; returnReason: string | null;
};
export type TptDetail = {
  id: string; version: number; contactId: string; indexCaseId: string; facility: FacilityDisplay; status: string;
  regimenCode: string | null; regimenName: string | null; regimenDescription: string | null; startDate: string;
  plannedEndDate: string | null; actualEndDate: string | null; durationValue: number | null; durationUnit: string | null;
  weightKg: number | null; drugSource: string | null; notes: string | null; closureReason: string | null;
};
export type SafeTpt = { status: string; regimenDisplay: string | null; regimenDescription: string | null; startDate: string; plannedEndDate: string | null; actualEndDate: string | null; durationValue: number | null; durationUnit: string | null; facility: FacilityView | null };

export type PlanDetail = { id: string; version: number; targetType: string; targetId: string; status: string; startDate: string; endDate: string | null; rulesVersion: string | null; notes: string | null; eventCounts: Record<string, number>; createdAt: string; updatedAt: string };
export type AlertDetail = {
  id: string; version: number; alertType: string; severity: string; status: string; triggeredAt: string; dueAt: string | null;
  acknowledgedAt: string | null; resolvedAt: string | null; monitoringEventId: string | null; eventType: string | null;
  scheduledAt: string | null; targetType: string | null; targetId: string | null; message: string;
};
export type SafeAlert = { id: string; version: number; alertType: string; severity: string; status: string; triggeredAt: string; dueAt: string | null; eventType: string | null; message: string; acknowledged: boolean };
export type NotificationDetail = { id: string; version: number; alertId: string | null; channel: string; status: string; scheduledAt: string; deliveredAt: string | null; readAt: string | null; alertType: string | null; severity: string | null };

export type UserLookupResponse = {
  userId: string; version: number; email: string | null; phone: string | null; status: string; emailVerified: boolean; phoneVerified: boolean;
  roles: { code: string; name: string }[]; activeFacilities: { id: string; name: string; primary: boolean }[]; hasOtherFacilityAssignments: boolean;
};
export type FacilityResponse = { id: string; version: number; name: string; facilityTypeCode: string | null; address: string | null; active: boolean };
export type IntegrationSummary = { code: string; name: string; active: boolean; configurationStatus: string; description: string | null; identifierCount: number; activeAuthorityCount: number; latestSyncRun: { id: string; direction: string; status: string; startedAt: string; finishedAt: string | null } | null };
export type IdentifierSummary = { id: string; entityType: string; entityId: string; externalId: string; externalVersion: string | null; firstSeenAt: string; lastSeenAt: string };
export type AuthoritySummary = { entityType: string; entityId: string; authorityScope: string; externalId: string | null; sourceVersion: string | null; effectiveAt: string; releasedAt: string | null };
export type RunSummary = { id: string; direction: string; status: string; startedAt: string; finishedAt: string | null; recordsReceived: number; recordsCreated: number; recordsUpdated: number; recordsFailed: number; cursorValue: string | null; errorSummary: string | null };
export type ConflictSummary = Record<string, unknown>;

/* ---------- katalog referensi (sumber: migrasi V2/V3/V5/V14 backend) ---------- */

export const CATALOG = {
  sex: [{ code: "LAKI_LAKI", name: "Laki-laki" }, { code: "PEREMPUAN", name: "Perempuan" }],
  suspect: [{ code: "TB_SO", name: "Terduga TB sensitif obat" }, { code: "TB_RO", name: "Terduga TB resistan obat" }],
  prevTreatment: [
    { code: "BARU", name: "Baru" }, { code: "KAMBUH", name: "Kambuh" },
    { code: "SETELAH_GAGAL_KAT_1", name: "Setelah gagal kat. 1" }, { code: "SETELAH_GAGAL_KAT_2", name: "Setelah gagal kat. 2" },
    { code: "SETELAH_PUTUS_BEROBAT", name: "Setelah putus berobat" },
    { code: "RIWAYAT_PENGOBATAN_SEBELUMNYA", name: "Riwayat pengobatan sebelumnya" },
    { code: "HASIL_SEBELUMNYA_TIDAK_DIKETAHUI", name: "Hasil sebelumnya tidak diketahui" },
    { code: "SETELAH_GAGAL_LINI_2", name: "Setelah gagal lini 2" }, { code: "TIDAK_DIKETAHUI", name: "Tidak diketahui" }, { code: "LAIN_LAIN", name: "Lain-lain" },
  ],
  anatomy: [{ code: "PARU", name: "TBC paru" }, { code: "EKSTRAPARU", name: "TBC ekstraparu" }],
  diagnosisType: [{ code: "BAKTERIOLOGIS", name: "Terkonfirmasi bakteriologis" }, { code: "KLINIS", name: "Terdiagnosis klinis" }],
  disposition: [
    { code: "TREAT_HERE", name: "Berobat di fasilitas ini" }, { code: "REFERRED", name: "Dirujuk" },
    { code: "NOT_TREATED", name: "Tidak diobati" }, { code: "UNKNOWN", name: "Tidak diketahui" },
  ],
  caseCategory: [{ code: "TB_SO", name: "Sensitif obat" }, { code: "TB_RO", name: "Resistan obat" }],
  resistance: [{ code: "TB_HR", name: "Hr (resistan INH)" }, { code: "TB_RR", name: "RR (resistan rifampisin)" }, { code: "TB_MDR", name: "MDR" }, { code: "TB_PRE_XDR", name: "Pre-XDR" }, { code: "TB_XDR", name: "XDR" }],
  regimens: [
    { code: "SO_6M_2HRZE_4HR", name: "SO 6 bulan (2HRZE/4HR)", category: "TB_SO" },
    { code: "SO_4M_2HPMZ_2HPM", name: "SO 4 bulan (2HPMZ/2HPM)", category: "TB_SO" },
    { code: "SO_CHILD_6M_2RHZ_4RH", name: "Anak 2RHZ/4RH", category: "TB_SO" },
    { code: "SO_CHILD_6M_2RHZE_4RH", name: "Anak/remaja 2RHZE/4RH", category: "TB_SO" },
    { code: "SO_CHILD_12M_2RHZE_10RH", name: "Anak 2RHZE/10RH", category: "TB_SO" },
    { code: "SO_CHILD_4M_2RHZ_2RH", name: "Anak 2RHZ/2RH", category: "TB_SO" },
    { code: "RO_HR_6RZE_LFX", name: "TBC Hr 6 RZE-Lfx", category: "TB_RO" },
    { code: "RO_BPALM", name: "BPaLM", category: "TB_RO" },
    { code: "RO_BPAL", name: "BPaL", category: "TB_RO" },
    { code: "RO_9M_ETO", name: "RO 9 bulan (etionamid)", category: "TB_RO" },
    { code: "RO_9M_LZD", name: "RO 9 bulan (linezolid)", category: "TB_RO" },
    { code: "RO_LONG_INDIVIDUAL", name: "RO jangka panjang/individual", category: "TB_RO" },
  ] as { code: string; name: string; category: string }[],
  drugs: [
    { code: "H", name: "Isoniazid" }, { code: "R", name: "Rifampisin" }, { code: "Z", name: "Pirazinamid" }, { code: "E", name: "Etambutol" },
    { code: "P", name: "Rifapentine" }, { code: "MFX", name: "Moksifloksasin" }, { code: "LFX", name: "Levofloksasin" },
    { code: "BDQ", name: "Bedaquiline" }, { code: "PA", name: "Pretomanid" }, { code: "LZD", name: "Linezolid" },
    { code: "CFZ", name: "Clofazimine" }, { code: "CS", name: "Sikloserin" }, { code: "TRD", name: "Terizidone" },
    { code: "DLM", name: "Delamanid" }, { code: "ETO", name: "Etionamid" }, { code: "PTO", name: "Protionamid" },
    { code: "PAS", name: "Asam para-aminosalisilat" }, { code: "IPM_CLN", name: "Imipenem-silastatin" },
    { code: "MPM", name: "Meropenem" }, { code: "AMK", name: "Amikasin" }, { code: "S", name: "Streptomisin" },
  ] as { code: string; name: string }[],
  labTests: [
    { code: "MIKROSKOPIS_BTA", name: "Mikroskopis BTA" }, { code: "TCM", name: "Tes cepat molekuler (TCM)" },
    { code: "BIAKAN", name: "Biakan" }, { code: "UJI_KEPEKAAN", name: "Uji kepekaan" }, { code: "LPA_LINI_DUA", name: "LPA lini dua" },
  ],
  labReasons: [{ code: "DIAGNOSIS", name: "Diagnosis" }, { code: "FOLLOW_UP", name: "Follow up" }],
  doseStatus: [{ code: "TAKEN", name: "Diminum (TAKEN)" }, { code: "MISSED", name: "Terlewat (MISSED)" }],
  outcomes: [
    { code: "SEMBUH", name: "Sembuh" }, { code: "PENGOBATAN_LENGKAP", name: "Pengobatan Lengkap" },
    { code: "GAGAL", name: "Gagal" }, { code: "MENINGGAL", name: "Meninggal" },
    { code: "PUTUS_BEROBAT", name: "Putus berobat" }, { code: "TIDAK_DAPAT_DIEVALUASI", name: "Tidak dapat dievaluasi" },
  ],
  referralType: [{ code: "PRE_TREATMENT_REFERRAL", name: "Rujukan pra-pengobatan" }, { code: "TREATMENT_TRANSFER", name: "Transfer pengobatan" }],
  investigationWorkflow: [{ code: "INTERNAL", name: "Internal (fasilitas sama)" }, { code: "OUTGOING_REFERRAL", name: "Dikirim ke fasilitas lain" }],
  monitoringEvents: [
    { code: "CLINICAL_REVIEW", name: "Tinjauan klinis" }, { code: "WEIGHT_REVIEW", name: "Tinjauan berat badan" },
    { code: "ADHERENCE_REVIEW", name: "Tinjauan kepatuhan" }, { code: "ADVERSE_EVENT_REVIEW", name: "Tinjauan efek samping" },
    { code: "BACTERIOLOGY_FOLLOW_UP", name: "Tindak lanjut bakteriologi" }, { code: "SAFETY_MONITORING", name: "Pemantauan keamanan" },
    { code: "MEDICATION_PICKUP", name: "Pengambilan obat" },
  ],
  roles: [
    { code: "PATIENT", name: "Pasien" }, { code: "TREATMENT_SUPPORTER", name: "Pendamping PMO" },
    { code: "TB_OFFICER", name: "Petugas TBC" }, { code: "LAB_STAFF", name: "Petugas Laboratorium" },
    { code: "FACILITY_ADMIN", name: "Admin Faskes" }, { code: "PROGRAM_MONITOR", name: "Pemantau Program" }, { code: "SYSTEM_ADMIN", name: "Admin Sistem" },
  ],
} as const;

/* ---------- helper ---------- */

export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function errText(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError) return problemMessage(error);
  return { title: "Permintaan tidak dapat diproses", detail: "Terjadi kesalahan tak terduga. Coba lagi." };
}

export function today(): string {
  const now = new Date();
  const jakarta = new Date(now.getTime() + 7 * 3600 * 1000);
  return jakarta.toISOString().slice(0, 10);
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}

/* ---------- hooks ---------- */

export function useLive<T>(key: readonly unknown[], path: string | null): UseQueryResult<T, ApiError> {
  const session = useSession();
  return useQuery<T, ApiError>({
    queryKey: key,
    queryFn: ({ signal }) => apiRequest<T>(path!, { signal }).then((r) => r.data),
    enabled: !!path && session.status === "authenticated",
    retry: false,
    staleTime: 15_000,
  });
}

export function useLiveMutation<TIn, TOut>(
  mut: (input: TIn) => Promise<{ data: TOut; etag?: string }>,
  invalidate: readonly unknown[][] = [],
) {
  const session = useSession();
  const qc = useQueryClient();
  const [localError, setLocalError] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);
  const m = useMutation({
    mutationFn: async (input: TIn) => {
      setLocalError(null); setDone(false);
      try {
        const result = await mut(input);
        for (const k of invalidate) await qc.invalidateQueries({ queryKey: k });
        setDone(true);
        return result;
      } catch (error) {
        if (error instanceof ApiError) { setLocalError(error); void session.handleFailure(error, true); }
        throw error;
      }
    },
  });
  return { ...m, localError, setLocalError, done, reset: () => { m.reset(); setLocalError(null); setDone(false); } };
}

/* ---------- gerbang sesi + izin ---------- */

export function RequireSession({ children, anyPermission }: { children: (ctx: { user: import("@/lib/auth/types").Me }) => ReactNode; anyPermission?: readonly string[] }) {
  const session = useSession();
  const router = useRouter();
  useEffect(() => { if (session.status === "anonymous") router.replace("/login"); }, [session.status, router]);
  if (session.status === "unavailable") {
    return <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 p-6">
      <h1 className="text-2xl font-bold text-[#123524]">Layanan belum tersedia</h1>
      <p className="text-sm text-[#5b6478]">{errText(session.error).detail}</p>
      <Button onClick={() => void session.refresh().catch(() => {})} className="w-fit">Coba kembali</Button>
    </main>;
  }
  if (session.status !== "authenticated") {
    return <main className="flex min-h-dvh items-center justify-center bg-[#F3F4FB]"><p role="status" className="text-sm text-[#5b6478]">Memeriksa sesi Anda…</p></main>;
  }
  const user = session.user;
  if (!user) return null;
  if (anyPermission && !anyPermission.some((p) => user.permissions.includes(p))) {
    return <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold text-[#123524]">Akses tidak diizinkan</h1>
      <p className="text-sm text-[#5b6478]">Akun Anda ({user.roles.map((r) => r.name).join(", ") || "tanpa peran"}) tidak memiliki izin untuk halaman ini.</p>
      <Button variant="outline" onClick={() => router.replace("/")} className="w-fit">Kembali ke beranda</Button>
    </main>;
  }
  return <>{children({ user })}</>;
}

export function usePermissions() {
  const session = useSession();
  const user = session.user;
  const permissions = new Set(user?.permissions ?? []);
  const roles = new Set(user?.roles.map((r) => r.code) ?? []);
  return {
    can: (p: string) => permissions.has(p),
    is: (r: string) => roles.has(r),
    facilities: user?.activeFacilities ?? [],
  };
}
