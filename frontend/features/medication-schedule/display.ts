import { formatDate } from "@/lib/date-format";
export const scheduleTimeZones=[{value:"Asia/Jakarta",label:"WIB · Waktu Indonesia Barat"},{value:"Asia/Pontianak",label:"WIB · Kalimantan Barat"},{value:"Asia/Makassar",label:"WITA · Waktu Indonesia Tengah"},{value:"Asia/Jayapura",label:"WIT · Waktu Indonesia Timur"}];
export const scheduleWeekdays=["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"];
export function scheduleTimeZoneLabel(zone:string){return scheduleTimeZones.find(z=>z.value===zone)?.label??zone;}
export function scheduleWeekdaysLabel(days:number[]){return days.length===7?"Setiap hari":[...days].sort((a,b)=>a-b).map(day=>scheduleWeekdays[day-1]).join(", ");}
export const formatScheduleDate=formatDate;
export function formatScheduleInstant(instant:string,zone:string){return new Intl.DateTimeFormat("id-ID",{timeZone:zone,day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(instant))+` · ${scheduleTimeZoneLabel(zone)}`;}
export function scheduleToday(zone:string,now=new Date()){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);return ["year","month","day"].map(key=>parts.find(p=>p.type===key)!.value).join("-");}
