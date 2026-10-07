import Link from "next/link";
import { useSession } from "@/lib/auth/session";
import { canClinical } from "../permissions";
export function DisplayFields({ values }: { values: [string, string | number | boolean | null | undefined][] }) {
  return <dl className="grid gap-x-6 gap-y-3 rounded-xl border bg-white p-5 text-sm sm:grid-cols-[minmax(10rem,1fr)_2fr]">{values.map(([label, value]) => <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="break-words whitespace-pre-wrap font-medium">{value == null || value === "" ? "Belum diisi" : typeof value === "boolean" ? value ? "Ya" : "Tidak" : value}</dd></div>)}</dl>;
}
export function PatientHeading({ patientId, name }: { patientId: string; name: string }) {
  const { user } = useSession();
  return <p className="text-sm">Pasien: {canClinical(user, "PATIENT_READ") ? <Link className="text-primary underline" href={`/patients/${patientId}`}>{name}</Link> : name}</p>;
}
export function WorklistLink() { const { user } = useSession(); return canClinical(user, "PATIENT_READ") ? <Link className="inline-block text-sm text-primary underline" href="/patients">Kembali ke daftar pasien</Link> : <Link className="text-primary underline" href="/">Kembali ke beranda</Link>; }
