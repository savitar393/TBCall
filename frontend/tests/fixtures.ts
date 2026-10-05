import type { Me } from "@/lib/auth/types";

export const fixtureUser: Me = {
  id: "user-fixture", email: "petugas@example.test", phone: null, status: "ACTIVE",
  roles: [{ code: "TB_OFFICER", name: "Petugas TBC" }],
  permissions: ["PATIENT_READ", "NOTIFICATION_READ_SELF"],
  activeFacilities: [{ id: "facility-fixture", name: "Puskesmas Contoh" }],
  patientLink: null, supporterCaseIds: [],
};
export function authenticationRequired() {
  return Response.json({ title: "Login diperlukan", status: 401, code: "AUTHENTICATION_REQUIRED" }, { status: 401, headers: { "Content-Type": "application/problem+json" } });
}
