package id.tbcall.application.reporting;

import id.tbcall.application.common.ApplicationFailure;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import static id.tbcall.application.reporting.ReportingDtos.*;

@Component
public class ReportingCatalogue {
    public static final String VERSION="KEMENDAGRI_2025_2138_AMENDED_2430";
    public static final String CHECKSUM="479d06184e8cf618b306967974baddd00a3502aee6e11104fc89e07d779fa63b";
    private static final List<Source> SOURCES=List.of(
            new Source("https://peraturan.bpk.go.id/Download/384752/Kepmen%20300.2.2-2138%20Tahun%202025.pdf","f403c4b2159054e4556624d8f3724a27ea2ac2281916d21768d3d776434f2c56"),
            new Source("https://peraturan.bpk.go.id/Download/384753/Lampiran-Kepmen%20300.2.2-2138%20Tahun%202025.pdf","ac13b5a57358fcec0503429bb06b2d6b4e5572f65fd0162979b87a79863b1de6"),
            new Source("https://peraturan.bpk.go.id/Download/384720/Kepmendagri%20Nomor%20300.2.2-2430%20Tahun%202025.pdf","b5ea05544536335ee567a2a7b871a9c4325c1ba437a200d7698b6faff7a2ba1e"));
    private final JdbcTemplate jdbc;
    private final JsonMapper json=JsonMapper.builder().build();
    public ReportingCatalogue(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public void requireVerified() {
        var entries=jdbc.queryForList("select level,code,name,coalesce(parent_code,'') parent from reporting_regions where catalogue_version=? order by level,code",VERSION);
        StringBuilder canonical=new StringBuilder();
        entries.forEach(r -> canonical.append(r.get("level")).append('|').append(r.get("code")).append('|')
                .append(r.get("name")).append('|').append(r.get("parent")).append('\n'));
        var catalogues=jdbc.queryForList("select namespace,entries_checksum,effective_on,checked_on,source_manifest::text sources from reporting_catalogues where version=?",VERSION);
        if(entries.size()!=552 || !CHECKSUM.equals(digest(canonical.toString())) || catalogues.size()!=1
                || !"KEMENDAGRI".equals(catalogues.getFirst().get("namespace"))
                || !CHECKSUM.equals(catalogues.getFirst().get("entries_checksum"))
                || !"2025-06-23".equals(catalogues.getFirst().get("effective_on").toString())
                || !"2026-10-13".equals(catalogues.getFirst().get("checked_on").toString())) throw unavailable();
        var sources=json.readValue((String)catalogues.getFirst().get("sources"),Source[].class);
        if(!Arrays.asList(sources).equals(SOURCES)) throw unavailable();
    }
    public Geography geography(String scope,String code) {
        if("NATIONAL".equals(scope)) {
            if(code!=null) throw ApplicationFailure.invalid("Lingkup nasional tidak menerima kode wilayah.");
            return new Geography(scope,null,"Indonesia — rekaman TBCall teratribusi");
        }
        if(!Set.of("PROVINCE","REGENCY").contains(scope) || code==null || code.length()>20)
            throw ApplicationFailure.invalid("Lingkup geografis tidak valid.");
        var found=jdbc.query("select name from reporting_regions where catalogue_version=? and level=? and code=?",
                (r,i)->new Geography(scope,code,r.getString(1)),VERSION,scope,code);
        if(found.isEmpty()) throw ApplicationFailure.invalid("Kode wilayah tidak ada pada katalog terverifikasi.");
        return found.getFirst();
    }
    public static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch(java.security.NoSuchAlgorithmException failure) { throw new IllegalStateException("SHA-256 unavailable",failure); }
    }
    public static ApplicationFailure unavailable() {
        return new ApplicationFailure(503,"REPORT_CATALOGUE_UNAVAILABLE","Katalog belum tersedia","Publikasi memerlukan katalog geografis yang terverifikasi.");
    }
}
