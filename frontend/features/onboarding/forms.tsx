"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "@/lib/validation";
import { apiRequest } from "@/lib/api/client";
import { ApiError } from "@/lib/api/problem";
import { useSession } from "@/lib/auth/session";
import { ApiFeedback } from "@/components/api-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function validPhone(value:string) { let normalized=value.replace(/[\s()\-]/g, ""); if(normalized.startsWith("08")) normalized="+62"+normalized.slice(1); else if(normalized.startsWith("62"))normalized="+"+normalized; return /^\+[1-9][0-9]{7,14}$/.test(normalized); }
const password = z.string().min(12,"Kata sandi harus berisi 12–128 karakter.").max(128,"Kata sandi harus berisi 12–128 karakter.");
const token = z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/,"Kode tidak valid. Salin kode lengkap dari instruksi yang Anda terima.");
const pair = {password,confirmPassword:z.string().min(1,"Ulangi kata sandi Anda.")};
const matching = (value:{password:string;confirmPassword:string})=>value.password===value.confirmPassword;
export const registrationSchema = z.object({
 email:z.string().trim().max(254,"Email terlalu panjang.").refine(value=>!value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),"Email tidak valid."),
 phone:z.string().trim().max(40,"Nomor telepon terlalu panjang.").refine(value=>!value || validPhone(value),"Gunakan format internasional, misalnya +62, atau awalan 08."),
 ...pair,
}).refine(value=>!!value.email || !!value.phone,{message:"Email atau nomor telepon wajib diisi.",path:["email"]}).refine(matching,{message:"Konfirmasi kata sandi tidak cocok.",path:["confirmPassword"]});
const resetSchema=z.object({token,...pair}).refine(matching,{message:"Konfirmasi kata sandi tidak cocok.",path:["confirmPassword"]});
const verificationSchema=z.object({token});
const identitySchema=z.object({identity:z.string().trim().min(1,"Email atau nomor telepon wajib diisi.").max(254,"Identitas terlalu panjang.")});
const loginLink=<Link className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4" href="/login">Kembali ke login</Link>;

function usePublicCommand() {
 const session=useSession();
 const busy=useRef(false);
 const [pending,setPending]=useState(false);
 const [error,setError]=useState<ApiError|null>(null);
 async function submit<T>(path:string,body:unknown,expectedStatus:number,schema:z.ZodType<T>):Promise<{data:T}|undefined> {
  if(busy.current) return;
  busy.current=true;setPending(true);setError(null);
  try {
   const response=await apiRequest<unknown>(path,{method:"POST",body,expectedStatus});
   const parsed=schema.safeParse(response.data);
   if(!parsed.success)throw new ApiError({status:502,title:"Respons layanan tidak valid",code:"INVALID_RESPONSE"});
   return {data:parsed.data};
  }
  catch(failure) {
   const safe=failure instanceof ApiError?failure:new ApiError({status:0,title:"Layanan belum tersedia",code:"NETWORK_UNAVAILABLE"});
   setError(safe);
   if(safe.kind==="csrf") {try {await session.refresh();} catch {}}
   return undefined;
  } finally {busy.current=false;setPending(false);}
 }
 return {submit,pending,error,disabled:pending || session.status==="loading" || session.status==="unavailable",session};
}
function Readiness({command}:{command:ReturnType<typeof usePublicCommand>}) {
 return <>{command.session.status==="loading" && <p role="status" className="text-sm text-muted-foreground">Memeriksa keamanan sesi…</p>}
 {command.session.status==="unavailable" && <><p role="alert">Layanan belum tersedia. Muat ulang keamanan sesi sebelum mengirim isian.</p><Button type="button" variant="outline" onClick={()=>void command.session.refresh().catch(()=>{})}>Coba kembali</Button></>}
 <ApiFeedback error={command.error}/></>;
}
function FieldError({id,message}:{id:string;message?:string}) {return message?<p id={id} role="alert" className="text-sm text-destructive">{message}</p>:null;}
export function RegistrationForm() {
 const command=usePublicCommand();const [created,setCreated]=useState(false);
 const {register,handleSubmit,resetField,formState:{errors,isSubmitting}}=useForm<z.infer<typeof registrationSchema>>({resolver:zodResolver(registrationSchema),defaultValues:{email:"",phone:"",password:"",confirmPassword:""}});
 const disabled=command.disabled || isSubmitting;
 if(created) return <div className="space-y-4"><h2 className="text-xl font-semibold" role="status">Akun dibuat. Verifikasi kontak Anda.</h2><p className="text-sm leading-relaxed">Ikuti instruksi verifikasi pada email atau SMS yang digunakan. Jika instruksi belum tersedia, hubungi administrator fasilitas. Jangan bagikan kode atau kata sandi kepada orang lain.</p><p className="text-sm text-muted-foreground">Akun belum memberikan akses ke catatan pasien. Petugas kesehatan tetap harus mengonfirmasi identitas dan menghubungkan catatan Anda.</p><Link href="/verify-contact" className="inline-flex min-h-11 items-center text-primary underline">Masukkan kode verifikasi</Link><br/>{loginLink}</div>;
 return <form noValidate className="space-y-5" onSubmit={handleSubmit(async value=>{
  try {const result=await command.submit<{status:string}>("/v1/auth/register",{email:value.email || null,phone:value.phone || null,password:value.password},201,z.object({status:z.literal("PENDING")})); if(result?.data.status==="PENDING")setCreated(true);}
  finally {resetField("password");resetField("confirmPassword");}
 })}>
 <p className="text-sm leading-relaxed">Isi email, nomor telepon, atau keduanya. Gunakan kontak milik Anda. Pendaftaran ini tidak membuat catatan pasien atau akun petugas.</p>
 <div className="space-y-2"><Label htmlFor="registration-email">Email (opsional)</Label><Input id="registration-email" type="email" autoComplete="email" maxLength={254} disabled={disabled} aria-invalid={!!errors.email} aria-describedby="registration-email-error" {...register("email")}/><FieldError id="registration-email-error" message={errors.email?.message}/></div>
 <div className="space-y-2"><Label htmlFor="registration-phone">Nomor telepon (opsional)</Label><Input id="registration-phone" type="tel" autoComplete="tel" maxLength={40} disabled={disabled} aria-invalid={!!errors.phone} aria-describedby="registration-phone-error" {...register("phone")}/><FieldError id="registration-phone-error" message={errors.phone?.message}/></div>
 <div className="space-y-2"><Label htmlFor="registration-password">Kata sandi</Label><Input id="registration-password" type="password" autoComplete="new-password" maxLength={128} disabled={disabled} aria-invalid={!!errors.password} aria-describedby="password-hint registration-password-error" {...register("password")}/><p id="password-hint" className="text-xs text-muted-foreground">12–128 karakter. Gunakan kata sandi unik yang tidak dipakai pada akun lain.</p><FieldError id="registration-password-error" message={errors.password?.message}/></div>
 <div className="space-y-2"><Label htmlFor="registration-confirm">Konfirmasi kata sandi</Label><Input id="registration-confirm" type="password" autoComplete="new-password" maxLength={128} disabled={disabled} aria-invalid={!!errors.confirmPassword} aria-describedby="registration-confirm-error" {...register("confirmPassword")}/><FieldError id="registration-confirm-error" message={errors.confirmPassword?.message}/></div>
 <Readiness command={command}/><Button className="w-full" type="submit" disabled={disabled}>{command.pending?"Memproses…":"Buat akun"}</Button>{loginLink}</form>;
}
export function RecoveryRequestForm({purpose="reset"}:{purpose?:"reset"|"verification"}) {
 const command=usePublicCommand();const [accepted,setAccepted]=useState(false);
 const {register,handleSubmit,formState:{errors,isSubmitting}}=useForm<z.infer<typeof identitySchema>>({resolver:zodResolver(identitySchema),defaultValues:{identity:""}});
 const disabled=command.disabled || isSubmitting;
 return <form noValidate className="space-y-5" onSubmit={handleSubmit(async value=>{
  setAccepted(false);const result=await command.submit<{message:string}>(purpose==="reset"?"/v1/auth/password-reset/request":"/v1/auth/verification/resend",{identity:value.identity},202,z.object({message:z.string().min(1)}));setAccepted(!!result);
 })}>
 <div className="space-y-2"><Label htmlFor={purpose+"-identity"}>Email atau nomor telepon</Label><Input id={purpose+"-identity"} autoComplete="username" maxLength={254} disabled={disabled} aria-invalid={!!errors.identity} aria-describedby={purpose+"-identity-error"} {...register("identity")}/><FieldError id={purpose+"-identity-error"} message={errors.identity?.message}/></div>
 {accepted && <p role="status" className="rounded-xl bg-secondary p-4 text-sm">Jika identitas memenuhi syarat, instruksi akan dikirimkan. Periksa email atau SMS Anda. Respons ini tidak mengonfirmasi keberadaan akun.</p>}
 <Readiness command={command}/><Button className="w-full" type="submit" disabled={disabled}>{command.pending?"Memproses…":purpose==="reset"?"Minta instruksi pemulihan":"Minta kode verifikasi baru"}</Button>
 {purpose==="reset" && <Link className="inline-flex min-h-11 items-center text-primary underline" href="/reset-password">Sudah memiliki kode pemulihan?</Link>}{loginLink}</form>;
}
export function VerificationForm() {
 const command=usePublicCommand();const [verified,setVerified]=useState(false);
 const {register,handleSubmit,resetField,formState:{errors,isSubmitting}}=useForm<z.infer<typeof verificationSchema>>({resolver:zodResolver(verificationSchema),defaultValues:{token:""}});
 if(verified) return <div className="space-y-4"><h2 role="status" className="text-xl font-semibold">Kontak berhasil diverifikasi.</h2><p>Silakan login menggunakan kontak yang sudah diverifikasi. Hubungi fasilitas kesehatan untuk menghubungkan catatan pengobatan Anda.</p>{loginLink}</div>;
 return <div className="space-y-8"><form noValidate className="space-y-5" onSubmit={handleSubmit(async value=>{
  try {const result=await command.submit<{status:string}>("/v1/auth/verify",{token:value.token},200,z.object({status:z.literal("ACTIVE")}));setVerified(result?.data.status==="ACTIVE");} finally {resetField("token");}
 })}><div className="space-y-2"><Label htmlFor="verification-token">Kode verifikasi</Label><Input id="verification-token" type="password" autoComplete="off" maxLength={256} disabled={command.disabled || isSubmitting} aria-invalid={!!errors.token} aria-describedby="verification-token-error" {...register("token")}/><FieldError id="verification-token-error" message={errors.token?.message}/></div><Readiness command={command}/><Button className="w-full" type="submit" disabled={command.disabled || isSubmitting}>{command.pending?"Memproses…":"Verifikasi kontak"}</Button></form>
 <section className="border-t pt-6"><h2 className="mb-4 font-semibold">Belum menerima kode atau kode tidak berlaku?</h2><RecoveryRequestForm purpose="verification"/></section></div>;
}
export function ResetPasswordForm() {
 const command=usePublicCommand();const [completed,setCompleted]=useState(false);
 const {register,handleSubmit,resetField,formState:{errors,isSubmitting}}=useForm<z.infer<typeof resetSchema>>({resolver:zodResolver(resetSchema),defaultValues:{token:"",password:"",confirmPassword:""}});
 if(completed) return <div className="space-y-4"><h2 role="status" className="text-xl font-semibold">Kata sandi diperbarui.</h2><p>Sesi lama telah dicabut. Silakan login kembali dengan kata sandi baru.</p>{loginLink}</div>;
 return <form noValidate className="space-y-5" onSubmit={handleSubmit(async value=>{
  // A 204 body is undefined; do not mistake a failed request for success.
  try {const result=await command.submit<void>("/v1/auth/password-reset/confirm",{token:value.token,newPassword:value.password},204,z.undefined());if(result){ try {await command.session.refresh();}catch {} setCompleted(true);}}
  finally {resetField("token");resetField("password");resetField("confirmPassword");}
 })}>
 <div className="space-y-2"><Label htmlFor="reset-token">Kode pemulihan</Label><Input id="reset-token" type="password" autoComplete="off" maxLength={256} disabled={command.disabled || isSubmitting} aria-invalid={!!errors.token} aria-describedby="reset-token-error" {...register("token")}/><FieldError id="reset-token-error" message={errors.token?.message}/></div>
 <div className="space-y-2"><Label htmlFor="reset-password">Kata sandi baru</Label><Input id="reset-password" type="password" autoComplete="new-password" maxLength={128} disabled={command.disabled || isSubmitting} aria-invalid={!!errors.password} aria-describedby="reset-password-hint reset-password-error" {...register("password")}/><p id="reset-password-hint" className="text-xs text-muted-foreground">12–128 karakter. Gunakan kata sandi unik.</p><FieldError id="reset-password-error" message={errors.password?.message}/></div>
 <div className="space-y-2"><Label htmlFor="reset-confirm">Konfirmasi kata sandi baru</Label><Input id="reset-confirm" type="password" autoComplete="new-password" maxLength={128} disabled={command.disabled || isSubmitting} aria-invalid={!!errors.confirmPassword} aria-describedby="reset-confirm-error" {...register("confirmPassword")}/><FieldError id="reset-confirm-error" message={errors.confirmPassword?.message}/></div>
 <Readiness command={command}/><Button className="w-full" type="submit" disabled={command.disabled || isSubmitting}>{command.pending?"Memproses…":"Simpan kata sandi baru"}</Button><Link className="inline-flex min-h-11 items-center text-primary underline" href="/forgot-password">Minta kode pemulihan baru</Link>{loginLink}</form>;
}
