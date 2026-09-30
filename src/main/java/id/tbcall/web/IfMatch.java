package id.tbcall.web;

import id.tbcall.application.common.ApplicationFailure;

public final class IfMatch {
    private IfMatch() {}
    public static void require(String header, long current) {
        if (header==null || header.isBlank()) throw new ApplicationFailure(428, "PRECONDITION_REQUIRED",
                "Prasyarat perubahan diperlukan", "Sertakan header If-Match dengan versi data yang terakhir dibuka.");
        if (!header.matches("\"[0-9]+\"")) throw ApplicationFailure.invalid("Header If-Match harus berisi satu versi dalam tanda kutip.");
        try { if (Long.parseLong(header.substring(1, header.length()-1))!=current) throw ApplicationFailure.optimistic(); }
        catch (NumberFormatException invalid) { throw ApplicationFailure.invalid("Versi dalam header If-Match tidak valid."); }
    }
    public static String etag(long version) { return "\"" + version + "\""; }
}
