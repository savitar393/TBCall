// Opt-in companion to runExtended(h). No top-level browser import/start, provisioning,
// filesystem output, Docker operation or automatic execution on import.
import { definition, validatePlan, verifyActor, requireThat, uuid, databaseAssertions, sameDrugSnapshots } from './contract.mjs';
export const mvpDefinitions = [[definition.id, definition.objective, 'pre-provisioned officer A / lab B / foreign officer',
  'Fresh approved isolated stack, reviewed synthetic clinical inputs, source/TLS/sandbox/isolation admission',
  'Same patient/registration/case/treatment; all 13 rendered steps; terminal state, denials and DB/audit reconciliation']];
const origin = 'https://app.tbcall.test:3443', api = '/api/tbcall/v1';
const labelPattern = text => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: \\*)?$`);
const field = (page, label) => page.getByLabel(labelPattern(label));
const button = (page, name) => page.getByRole('button', { name, exact: true });
const heading = (page, name) => page.getByRole('heading', { name, exact: true }).waitFor({ state: 'visible' });
const localUtc = v => new Date(v).toISOString().slice(0, 23);
const headers = etag => ({ headers: { 'If-Match': etag } });
const officerPermissions = ['PATIENT_READ','PATIENT_CREATE','REGISTRATION_READ','REGISTRATION_WRITE','DIAGNOSIS_READ',
  'DIAGNOSIS_WRITE','CASE_READ','CASE_WRITE','LAB_REQUEST_READ','LAB_REQUEST_WRITE','LAB_RESULT_READ',
  'TREATMENT_READ','TREATMENT_WRITE','ADHERENCE_READ','ADHERENCE_RECORD','FOLLOW_UP_READ','FOLLOW_UP_WRITE','OUTCOME_READ','OUTCOME_WRITE'];

export async function runMvpJourney(h) {
  // Reuses the existing scenario, client, request, observe and DB-assertion helper contract.
  // The host, NOT this module, owns fresh-stack creation/admission and DB execution.
  requireThat(h && ['scenario','client','request','observe','db'].every(k => typeof h[k] === 'function'), 'MVP_HARNESS_CONTRACT_MISSING');
  requireThat(h.plan?.clinicalReview?.status === 'APPROVED_SYNTHETIC_ONLY', 'MVP_CLINICAL_OWNER_APPROVAL_PENDING');
  const f = h.fixture, a = h.actors, p = h.plan;
  uuid(f.facilityA); uuid(f.facilityB);
  requireThat(f.facilityA !== f.facilityB && typeof f.facilityBName === 'string' && f.facilityBName.length >= 2, 'MVP_FACILITY_FIXTURE_INVALID');
  for (const k of ['officer','lab','crossOfficer']) {
    requireThat(a[k] && /^[^\s@]+@example\.invalid$/.test(a[k].email) && typeof a[k].password === 'string' && a[k].password.length >= 12, 'MVP_SYNTHETIC_ACTOR_REQUIRED');
  }
  const clients = [], watches = [], chain = {}, completed = [];
  return h.scenario('MVP01', async () => {
    const observe = (code, value) => { h.observe(code, Boolean(value)); requireThat(value, code); };
    const step = code => { completed.push(code); h.observe(`MVP_UI_${code}`, true); };
    const read = (c, path, expected = 200) => h.request(c, 'GET', path, undefined, expected);
    async function session(account) {
      const c = await h.client(); clients.push(c);
      c.page.setDefaultTimeout(25000);
      await c.page.goto(origin + '/login');
      await field(c.page, 'Email atau nomor telepon').fill(account.email);
      await field(c.page, 'Kata sandi').fill(account.password);
      await submit(c.page, 'Masuk', 'POST', '/auth/login', 200);
      await button(c.page, 'Keluar').waitFor({ state: 'visible' });
      observe('MVP_BROWSER_UTC', await c.page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone) === 'UTC');
      c.me = (await read(c, '/me')).data;
      return c;
    }
    async function submit(page, name, method, path, expected, etag) {
      const watch = { page, method, path, count: 0 };
      watch.handler = r => { if (new URL(r.url()).origin === origin && new URL(r.url()).pathname === api + path && r.method() === method) watch.count++; };
      page.on('request', watch.handler); watches.push(watch);
      // Register before clicking; inspect actual browser response, never fulfill/mock it.
      const waiting = page.waitForResponse(r => r.url() === origin + api + path && r.request().method() === method);
      const [response] = await Promise.all([waiting, button(page, name).click()]);
      observe('MVP_UI_HTTP_STATUS', response.status() === expected);
      const sent = await response.request().allHeaders();
      observe('MVP_UI_CSRF_PRESENT', Boolean(sent['x-xsrf-token']));
      if (etag !== undefined) observe('MVP_UI_AUTHORITATIVE_ETAG', sent['if-match'] === etag);
      return { data: await response.json(), etag: response.headers().etag };
    }
    async function saved(page) { await page.getByText('Perubahan tersimpan. Data pengobatan dimuat ulang.', { exact: true }).waitFor({ state: 'visible' }); }
    try {
      const o = await session(a.officer), l = await session(a.lab), foreign = await session(a.crossOfficer);
      verifyActor(o.me, 'TB_OFFICER', officerPermissions, f.facilityA);
      verifyActor(l.me, 'LAB_STAFF', ['LAB_REQUEST_READ','LAB_RESULT_READ','LAB_RESULT_WRITE'], f.facilityB);
      verifyActor(foreign.me, 'TB_OFFICER', ['CASE_READ','TREATMENT_READ'], f.facilityB);
      observe('MVP_DISTINCT_ACTORS', new Set([o.me.id,l.me.id,foreign.me.id]).size === 3);
      observe('MVP_NO_FOREIGN_ASSIGNMENT', !o.me.activeFacilities.some(v => v.id === f.facilityB)
        && !l.me.activeFacilities.some(v => v.id === f.facilityA) && !foreign.me.activeFacilities.some(v => v.id === f.facilityA));
      chain.labUser = l.me.id;
      const refs = { clinical: (await read(o, '/clinical-reference-data')).data,
        lab: (await read(o, '/laboratory-reference-data')).data, treatment: (await read(o, '/treatment-reference-data')).data };
      validatePlan(p, refs); step('LOGIN');
      const page = o.page;
      await page.goto(origin + '/patients'); await heading(page, 'Daftar pasien');
      await page.getByRole('link', { name: 'Registrasi baru', exact: true }).click(); await heading(page, 'Registrasi baru');
      await field(page, 'Fasilitas registrasi').selectOption(f.facilityA);
      await button(page, 'Lanjut ke pasien').click();
      await field(page, 'Kewarganegaraan').selectOption('WNA');
      await field(page, 'Nama lengkap').fill(p.patient.fullName);
      await field(page, 'Nomor identitas lain').fill(p.patient.otherIdentityNumber);
      await field(page, 'Tanggal lahir').fill(p.patient.birthDate); await field(page, 'Jenis kelamin').selectOption(p.patient.sexCode);
      await button(page, 'Lanjut ke registrasi').click();
      await field(page, 'Tanggal registrasi').fill(p.registration.registrationDate);
      await field(page, 'Jenis terduga').selectOption(p.registration.suspectTypeCode);
      await field(page, 'Kategori pengobatan sebelumnya').selectOption(p.registration.previousTreatmentCategoryCode);
      const reg = await submit(page, 'Simpan registrasi', 'POST', '/registrations', 201);
      chain.registration = uuid(reg.data.id); chain.patient = uuid(reg.data.patient.patientId);
      await heading(page, 'Detail registrasi');
      observe('MVP_REGISTRATION_OPEN', reg.data.status === 'OPEN' && reg.data.facility.id === f.facilityA); step('INTAKE');
      await page.getByRole('link', { name: 'Buat permintaan laboratorium', exact: true }).click();
      await heading(page, 'Permintaan laboratorium baru');
      await field(page, 'Cari fasilitas pemeriksa').fill(f.facilityBName);
      await button(page, `Pilih ${f.facilityBName}`).click();
      await field(page, 'Fasilitas pemeriksa').selectOption(f.facilityB);
      await page.getByLabel(refs.lab.testTypes.find(t => t.code === p.lab.testTypeCode).name, { exact: true }).check();
      const request = await submit(page, 'Simpan permintaan', 'POST', '/lab-requests', 201);
      chain.request = uuid(request.data.id); chain.test = uuid(request.data.tests[0].id);
      observe('MVP_DIAGNOSTIC_OWNER', request.data.owner.type === 'REGISTRATION' && request.data.owner.id === chain.registration
        && request.data.requestReason.code === 'DIAGNOSIS' && request.data.testingFacility.id === f.facilityB
        && request.data.requestingFacility.id === f.facilityA && request.data.tests.length === 1); step('DIAGNOSTIC_REQUEST');
      await heading(page, 'Permintaan laboratorium');
      await button(page, 'Catat spesimen').click(); await field(page, 'Jenis spesimen').fill(p.lab.specimenType);
      const collectedAt = new Date().toISOString();
      await field(page, 'Waktu pengumpulan').fill(localUtc(collectedAt)); await field(page, 'Waktu pengiriman').fill(localUtc(collectedAt));
      const requestState = await read(o, `/lab-requests/${chain.request}`);
      const specimen = await submit(page, 'Simpan spesimen', 'POST', `/lab-requests/${chain.request}/specimens`, 201, requestState.etag);
      chain.specimen = uuid(specimen.data.id); step('SPECIMEN');
      // Use the actual testing-facility queue to discover the assigned request.
      await l.page.goto(origin + '/laboratory'); await heading(l.page, 'Antrean laboratorium');
      await l.page.locator(`a[href="/laboratory/requests/${chain.request}"]`).click(); await heading(l.page, 'Permintaan laboratorium');
      observe('MVP_LAB_HAS_NO_SOURCE_ACTION', await button(l.page, 'Catat spesimen').count() === 0);
      await l.page.getByRole('button', { name: /^Terima spesimen / }).click();
      const beforeReceive = await read(l, `/lab-requests/${chain.request}`);
      const receivedAt = new Date().toISOString();
      observe('MVP_RECEIPT_CLOCK_BOUNDARY', Date.parse(receivedAt) >= Date.parse(beforeReceive.data.requestedAt)
        && Date.parse(receivedAt) >= Date.parse(collectedAt));
      await field(l.page, 'Waktu penerimaan').fill(localUtc(receivedAt)); await field(l.page, 'Dapat diperiksa').selectOption('true');
      const sVersion = beforeReceive.data.specimens.find(s => s.id === chain.specimen).version;
      const received = await submit(l.page, 'Simpan penerimaan', 'POST', `/lab-specimens/${chain.specimen}/receive`, 200, `"${sVersion}"`);
      observe('MVP_RECEIVED_SPECIMEN', received.data.id === chain.specimen && received.data.examinationPossible === true); step('RECEIPT');
      await l.page.getByRole('button', { name: `Catat hasil ${refs.lab.testTypes.find(t => t.code === p.lab.testTypeCode).name}`, exact: true }).click();
      await field(l.page, 'Spesimen hasil').selectOption(chain.specimen);
      const testedAt = new Date().toISOString();
      observe('MVP_LAB_RESULT_CLOCK', Date.parse(testedAt) >= Date.parse(receivedAt) && testedAt.slice(0, 10) === p.diagnosis.diagnosisDate);
      await field(l.page, 'Waktu pemeriksaan').fill(localUtc(testedAt)); await field(l.page, 'Narasi hasil').fill(p.lab.resultText);
      const beforeResult = await read(l, `/lab-requests/${chain.request}`);
      const result = await submit(l.page, 'Simpan hasil', 'POST', `/lab-request-tests/${chain.test}/results`, 201, `"${beforeResult.data.tests[0].version}"`);
      chain.result = uuid(result.data.id);
      observe('MVP_RESULT_LINEAGE', result.data.testId === chain.test && result.data.specimenId === chain.specimen && result.data.sequenceNo === 1 && result.data.status === 'FINAL'); step('RESULT');
      observe('MVP_RESULT_INPUT_PRESERVED', result.data.resultText === p.lab.resultText);
      await page.reload(); await heading(page, 'Permintaan laboratorium');
      await page.getByText(p.lab.resultText, { exact: true }).waitFor({ state: 'visible' });
      observe('MVP_SOURCE_OFFICER_NO_RESULT_WRITE', await page.getByRole('button', { name: /^Catat hasil / }).count() === 0);
      await page.getByRole('link', { name: 'Buka registrasi', exact: true }).click(); await heading(page, 'Detail registrasi');
      await button(page, 'Tambah diagnosis').click();
      await field(page, 'Tanggal diagnosis').fill(p.diagnosis.diagnosisDate); await field(page, 'Lokasi anatomi').selectOption(p.diagnosis.anatomicalSiteCode);
      await field(page, 'Jenis diagnosis').selectOption(p.diagnosis.diagnosisTypeCode); await field(page, 'Hasil diagnosis').fill(p.diagnosis.diagnosisResult);
      await field(page, 'Disposisi pengobatan').selectOption('TREAT_HERE');
      const diagnosis = await submit(page, 'Simpan diagnosis', 'POST', `/registrations/${chain.registration}/diagnoses`, 201, (await read(o, `/registrations/${chain.registration}`)).etag);
      chain.diagnosis = uuid(diagnosis.data.id);
      observe('MVP_DIAGNOSIS_LINEAGE', diagnosis.data.registrationId === chain.registration); step('DIAGNOSIS');
      await button(page, 'Konfirmasi kasus').click(); await field(page, 'Diagnosis untuk konfirmasi').selectOption(chain.diagnosis);
      await field(page, 'Kategori kasus').selectOption('TB_SO'); await field(page, 'Kategori pengobatan sebelumnya').selectOption(p.registration.previousTreatmentCategoryCode);
      const confirmed = await submit(page, 'Simpan konfirmasi kasus', 'POST', `/registrations/${chain.registration}/cases`, 201, (await read(o, `/registrations/${chain.registration}`)).etag);
      chain.case = uuid(confirmed.data.id); await heading(page, 'Detail kasus');
      observe('MVP_CASE_CHAIN', confirmed.data.registration.id === chain.registration && confirmed.data.patient.patientId === chain.patient
        && confirmed.data.confirmingDiagnosis.id === chain.diagnosis && confirmed.data.status === 'ACTIVE'); step('CASE');
      await page.getByRole('link', { name: 'Pengobatan', exact: true }).click(); await heading(page, 'Episode pengobatan');
      await button(page, 'Mulai pengobatan').click(); await field(page, 'Paduan pengobatan').selectOption(p.treatment.regimenCode);
      await field(page, 'Tanggal mulai pengobatan').fill(p.treatment.startDate);
      for (let i = 0; i < p.treatment.drugs.length; i++) {
        if (i > 0) await button(page, 'Tambah obat').click(); const d = p.treatment.drugs[i], n = i + 1;
        await field(page, `Obat ${n}`).selectOption(d.drugCode); await field(page, `Tanggal awal obat ${n}`).fill(d.startDate);
        for (const [key, label] of [['treatmentPhase','Fase obat'],['doseValue','Dosis obat'],['doseUnit','Satuan dosis'],['frequencyPerWeek','Frekuensi per minggu']])
          if (d[key] !== undefined) await field(page, `${label} ${n}`).fill(String(d[key]));
      }
      const started = await submit(page, 'Simpan pengobatan', 'POST', `/cases/${chain.case}/treatments`, 201);
      chain.treatment = uuid(started.data.id); await heading(page, 'Detail pengobatan');
      observe('MVP_TREATMENT_CHAIN', started.data.caseId === chain.case && started.data.patient.id === chain.patient
        && started.data.status === 'ACTIVE' && started.data.drugs.length === p.treatment.drugs.length); step('TREATMENT');
      observe('MVP_DRUG_INPUT_SNAPSHOTS', sameDrugSnapshots(started.data.drugs, p.treatment.drugs, refs.treatment.drugs));
      const initialTreatment = await read(o, `/treatments/${chain.treatment}`);
      await button(page, 'Catat bukti dosis').click(); await field(page, 'Tanggal bukti dosis').fill(p.dose.scheduledDate);
      await field(page, 'Status bukti').selectOption(p.dose.status); await field(page, 'Cara pemberian').selectOption(p.dose.administrationMode);
      const dose = await submit(page, 'Simpan bukti dosis', 'POST', `/treatments/${chain.treatment}/dose-events`, 201);
      chain.dose = uuid(dose.data.id); await saved(page);
      observe('MVP_DOSE_ACTOR', dose.data.source === 'HEALTH_WORKER' && dose.data.recordedByUserId === o.me.id); step('DOSE');
      observe('MVP_DOSE_INPUT_PRESERVED', dose.data.status === p.dose.status && dose.data.scheduledDate === p.dose.scheduledDate);
      await button(page, 'Jadwalkan tindak lanjut').click(); await field(page, 'Jenis tindak lanjut').fill(p.followUp.followUpType);
      await field(page, 'Waktu jadwal').fill(localUtc(p.followUp.scheduledAt));
      const follow = await submit(page, 'Simpan jadwal', 'POST', `/treatments/${chain.treatment}/follow-ups`, 201, (await read(o, `/treatments/${chain.treatment}`)).etag);
      chain.followUp = uuid(follow.data.id); await saved(page); step('FOLLOW_UP_SCHEDULE');
      await button(page, 'Selesaikan tindak lanjut 1').click();
      await field(page, 'Waktu selesai').fill(localUtc(p.followUp.completedAt)); await field(page, 'Berat (kg)').fill(String(p.followUp.weightKg));
      await field(page, 'Ringkasan gejala').fill(p.followUp.symptomSummary); await field(page, 'Penilaian kepatuhan').fill(p.followUp.adherenceAssessment);
      const followState = (await read(o, `/treatments/${chain.treatment}`)).data.followUps.find(v => v.id === chain.followUp);
      const complete = await submit(page, 'Simpan penyelesaian', 'POST', `/follow-ups/${chain.followUp}/complete`, 200, `"${followState.version}"`);
      observe('MVP_FOLLOW_UP_CHAIN', complete.data.id === chain.followUp && complete.data.treatmentId === chain.treatment && complete.data.status === 'COMPLETED'); await saved(page); step('FOLLOW_UP_COMPLETE');
      observe('MVP_FOLLOW_UP_INPUT_PRESERVED', complete.data.weightKg === p.followUp.weightKg
        && complete.data.symptomSummary === p.followUp.symptomSummary && complete.data.adherenceAssessment === p.followUp.adherenceAssessment);
      // Explicitly labelled API denial controls; never substitute for a presented UI step.
      const beforeDenial = await read(o, `/treatments/${chain.treatment}`);
      observe('MVP_STALE_VERSION_EXISTS', initialTreatment.etag !== beforeDenial.etag);
      const stale = await h.request(o, 'PATCH', `/treatments/${chain.treatment}`, { notes: 'MVP rejected stale control' }, 409, headers(initialTreatment.etag));
      observe('MVP_STALE_ERROR_CONTRACT', stale.data.code === 'OPTIMISTIC_LOCK_CONFLICT');
      await read(foreign, `/cases/${chain.case}`, 404); await read(foreign, `/treatments/${chain.treatment}`, 404);
      await read(l, `/cases/${chain.case}`, 403);
      await h.request(l, 'PATCH', `/treatments/${chain.treatment}`, { notes: 'MVP rejected role control' }, 403, headers(beforeDenial.etag));
      await h.request(foreign, 'PATCH', `/treatments/${chain.treatment}`, { notes: 'MVP rejected facility control' }, 404, headers(beforeDenial.etag));
      const afterDenial = await read(o, `/treatments/${chain.treatment}`);
      observe('MVP_DENIED_WRITES_UNCHANGED', afterDenial.etag === beforeDenial.etag && afterDenial.data.notes === beforeDenial.data.notes);
      await button(page, 'Catat hasil akhir').click(); await field(page, 'Kode hasil akhir').selectOption(p.outcome.outcomeCode);
      await field(page, 'Tanggal hasil akhir').fill(p.outcome.outcomeDate);
      await page.getByLabel('Saya mengonfirmasi penutupan episode pengobatan dan kasus ini', { exact: true }).check();
      const outcome = await submit(page, 'Simpan hasil akhir', 'POST', `/treatments/${chain.treatment}/outcome`, 201, afterDenial.etag);
      chain.outcome = uuid(outcome.data.id); await saved(page); step('OUTCOME');
      const terminal = await read(o, `/treatments/${chain.treatment}`), closedCase = await read(o, `/cases/${chain.case}`);
      observe('MVP_TERMINAL_STATE', terminal.data.status === 'COMPLETED' && closedCase.data.status === 'COMPLETED'
        && terminal.data.caseId === chain.case && terminal.data.patient.id === chain.patient
        && terminal.data.outcome.id === chain.outcome && terminal.data.outcome.outcomeCode === p.outcome.outcomeCode);
      await page.getByRole('region', { name: 'Hasil akhir', exact: true }).getByText(terminal.data.outcome.outcomeName, { exact: true }).waitFor({ state: 'visible' });
      observe('MVP_TERMINAL_ACTIONS_HIDDEN', await button(page, 'Catat hasil akhir').count() === 0 && await button(page, 'Catat bukti dosis').count() === 0);
      // Retain authorized detail URLs, WITHOUT pretending an active worklist discovers a closed episode.
      await page.reload(); await heading(page, 'Detail pengobatan');
      await page.getByRole('link', { name: 'Buka kasus', exact: true }).click(); await heading(page, 'Detail kasus');
      const versions = { treatmentVersion: terminal.data.version, caseVersion: closedCase.data.version };
      observe('MVP_SAME_PATIENT_FINAL', closedCase.data.patient.patientId === chain.patient && closedCase.data.registration.id === chain.registration);
      observe('MVP_ALL_RENDERED_STEPS', completed.join('|') === definition.steps.join('|'));
      observe('MVP_NO_MUTATION_REPLAY', watches.every(w => w.count === 1));
      for (const row of databaseAssertions(chain, p, o.me.id, versions)) h.db(row.key, row.sql, row.expected);
      // Caller must run every queued DB assertion read-only before declaring acceptance PASS.
    } finally {
      for (const w of watches) w.page.off('request', w.handler);
      for (const c of clients) await c.context.close();
    }
  });
}
