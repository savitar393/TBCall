import { AuthFrame } from "@/features/onboarding/auth-frame";
import { VerificationForm } from "@/features/onboarding/forms";
export default function Page(){return <AuthFrame title="Verifikasi kontak" description="Salin kode dari instruksi verifikasi. Kode hanya berlaku satu kali dan memiliki batas waktu."><VerificationForm/></AuthFrame>;}
