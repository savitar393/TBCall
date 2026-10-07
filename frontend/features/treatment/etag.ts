/** Child versions only: follow-up completion and adverse-event update. */
export function treatmentChildEtagFromVersion(version:number):string { if(!Number.isSafeInteger(version)||version<0) throw new Error("Versi anak pengobatan tidak valid.");return `"${version}"`; }
