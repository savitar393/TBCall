// Public aggregate facts, attributed to Dinas Kesehatan Provinsi Jawa Tengah.
// CKAN datastore resource 06c06108-cdb0-48fa-94d1-40e6424e2c86; all 35 rows.
// Only jumlah_penemuan_kasus is used. success_rate/estimasi_kasus are intentionally excluded.
export const tbPublicSource = {
  version: "jateng-2024-v1", year: 2024, verifiedOn: "2026-10-11", updatedOn: "2025-10-23",
  geography: "Provinsi Jawa Tengah", publisher: "Dinas Kesehatan Provinsi Jawa Tengah",
  title: "Jumlah Penemuan dan Pengobatan Kasus TBC", license: "Creative Commons Attribution",
  url: "https://data.jatengprov.go.id/id/dataset/c20-jumlah-penemuan-dan-pengobatan-kasus-tbc",
  resourceUrl: "https://data.jatengprov.go.id/id/dataset/c20-jumlah-penemuan-dan-pengobatan-kasus-tbc/resource/06c06108-cdb0-48fa-94d1-40e6424e2c86",
} as const;
export const tbDistricts = [
  {
    "code": "33.01",
    "name": "Kabupaten Cilacap",
    "count": 4692
  },
  {
    "code": "33.02",
    "name": "Kabupaten Banyumas",
    "count": 6992
  },
  {
    "code": "33.03",
    "name": "Kabupaten Purbalingga",
    "count": 2788
  },
  {
    "code": "33.04",
    "name": "Kabupaten Banjarnegara",
    "count": 1550
  },
  {
    "code": "33.05",
    "name": "Kabupaten Kebumen",
    "count": 2765
  },
  {
    "code": "33.06",
    "name": "Kabupaten Purworejo",
    "count": 1138
  },
  {
    "code": "33.07",
    "name": "Kabupaten Wonosobo",
    "count": 1796
  },
  {
    "code": "33.08",
    "name": "Kabupaten Magelang",
    "count": 1157
  },
  {
    "code": "33.09",
    "name": "Kabupaten Boyolali",
    "count": 1548
  },
  {
    "code": "33.1",
    "name": "Kabupaten Klaten",
    "count": 662
  },
  {
    "code": "33.11",
    "name": "Kabupaten Sukoharjo",
    "count": 1866
  },
  {
    "code": "33.12",
    "name": "Kabupaten Wonogiri",
    "count": 1415
  },
  {
    "code": "33.13",
    "name": "Kabupaten Karanganyar",
    "count": 1122
  },
  {
    "code": "33.14",
    "name": "Kabupaten Sragen",
    "count": 1593
  },
  {
    "code": "33.15",
    "name": "Kabupaten Grobogan",
    "count": 2450
  },
  {
    "code": "33.16",
    "name": "Kabupaten Blora",
    "count": 1454
  },
  {
    "code": "33.17",
    "name": "Kabupaten Rembang",
    "count": 1466
  },
  {
    "code": "33.18",
    "name": "Kabupaten Pati",
    "count": 2479
  },
  {
    "code": "33.19",
    "name": "Kabupaten Kudus",
    "count": 2927
  },
  {
    "code": "33.2",
    "name": "Kabupaten Jepara",
    "count": 2171
  },
  {
    "code": "33.21",
    "name": "Kabupaten Demak",
    "count": 2218
  },
  {
    "code": "33.22",
    "name": "Kabupaten Semarang",
    "count": 918
  },
  {
    "code": "33.23",
    "name": "Kabupaten Temanggung",
    "count": 852
  },
  {
    "code": "33.24",
    "name": "Kabupaten Kendal",
    "count": 2288
  },
  {
    "code": "33.25",
    "name": "Kabupaten Batang",
    "count": 1387
  },
  {
    "code": "33.26",
    "name": "Kabupaten Pekalongan",
    "count": 2305
  },
  {
    "code": "33.27",
    "name": "Kabupaten Pemalang",
    "count": 4087
  },
  {
    "code": "33.28",
    "name": "Kabupaten Tegal",
    "count": 5819
  },
  {
    "code": "33.29",
    "name": "Kabupaten Brebes",
    "count": 6912
  },
  {
    "code": "33.71",
    "name": "Kota Magelang",
    "count": 1088
  },
  {
    "code": "33.72",
    "name": "Kota Surakarta",
    "count": 2479
  },
  {
    "code": "33.73",
    "name": "Kota Salatiga",
    "count": 1142
  },
  {
    "code": "33.74",
    "name": "Kota Semarang",
    "count": 6726
  },
  {
    "code": "33.75",
    "name": "Kota Pekalongan",
    "count": 1362
  },
  {
    "code": "33.76",
    "name": "Kota Tegal",
    "count": 3129
  }
] as const;
export const tbPublicTotal = tbDistricts.reduce((sum, district) => sum + district.count, 0);
