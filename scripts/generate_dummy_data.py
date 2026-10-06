#!/usr/bin/env python3
"""
TBCall Dummy Data Generator
Generates SQL INSERT statements for 1000 records per table
Usage: python generate_dummy_data.py > dummy_data.sql
"""

import random
import uuid
from datetime import datetime, timedelta
from typing import List

# Configuration
RECORDS_PER_TABLE = 1000
START_DATE = datetime(2020, 1, 1)
END_DATE = datetime.now()

def random_date(start=START_DATE, end=END_DATE):
    """Generate random date between start and end"""
    delta = end - start
    random_days = random.randint(0, delta.days)
    return (start + timedelta(days=random_days)).strftime('%Y-%m-%d')

def random_timestamp(start=START_DATE, end=END_DATE):
    """Generate random timestamp"""
    delta = end - start
    random_seconds = random.randint(0, int(delta.total_seconds()))
    return (start + timedelta(seconds=random_seconds)).strftime('%Y-%m-%d %H:%M:%S')

def random_nik():
    """Generate random Indonesian NIK"""
    if random.random() < 0.85:
        province = random.choice(['31', '32', '33', '34', '35', '36'])
        date_part = f"{random.randint(1,12):02d}{random.randint(1,31):02d}"
        sequence = f"{random.randint(0,9999):04d}"
        return f"3{province[1]}{date_part}{random.randint(0,999999):06d}"
    return None

def random_phone():
    """Generate random Indonesian phone number"""
    if random.random() < 0.80:
        return f"08{random.randint(0,9999999999):010d}"
    return None

def random_name():
    """Generate random Indonesian name"""
    first_names = ['Ahmad', 'Budi', 'Candra', 'Dedi', 'Eko', 'Fajar', 'Gunawan', 'Hadi', 
                   'Siti', 'Ratna', 'Putri', 'Nurul', 'Maya', 'Lina', 'Kartika', 'Indah']
    last_names = ['Santoso', 'Wijaya', 'Susanto', 'Prabowo', 'Setiawan', 'Hidayat',
                  'Pratiwi', 'Wulandari', 'Anggraini', 'Lestari', 'Rahayu', 'Handayani']
    return f"{random.choice(first_names)} {random.choice(last_names)}"

def sql_str(value):
    """Convert Python value to SQL string"""
    if value is None:
        return 'NULL'
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (int, float)):
        return str(value)
    return f"'{str(value).replace(\"'\", \"''\")}'::text"

def generate_facilities(count=RECORDS_PER_TABLE):
    """Generate facility records"""
    print("-- ============================================================")
    print(f"-- Facilities ({count} records)")
    print("-- ============================================================\n")
    
    facility_types = ['PUSKESMAS', 'RUMAH_SAKIT', 'KLINIK', 'BALAI_PENGOBATAN', 
                      'BP4_BBKPM_BKPM', 'LAPAS_RUTAN', 'PRAKTEK_DOKTER_MANDIRI']
    cities = ['Jakarta', 'Bandung', 'Surabaya', 'Medan', 'Makassar', 'Semarang']
    streets = ['Merdeka', 'Sudirman', 'Gatot Subroto', 'Asia Afrika', 'Diponegoro']
    
    values = []
    for i in range(1, count + 1):
        facility_type = random.choice(facility_types)
        name = {
            'PUSKESMAS': f'Puskesmas {i}',
            'RUMAH_SAKIT': f'RSUD {i}',
            'KLINIK': f'Klinik TB {i}',
            'BALAI_PENGOBATAN': f'BP {i}',
            'BP4_BBKPM_BKPM': f'BBKPM {i}',
            'LAPAS_RUTAN': f'Lapas {i}',
            'PRAKTEK_DOKTER_MANDIRI': f'Praktek Dr. {i}'
        }[facility_type]
        
        province = f"3{random.randint(1,6)}"
        regency = f"{province}{random.randint(1,20):02d}"
        district = f"{regency}{random.randint(1,30):02d}"
        village = f"{district}{random.randint(1,50):03d}"
        
        values.append(f"""(
    '{uuid.uuid4()}',
    '{facility_type}',
    NULL,
    '{name}',
    'Jl. {random.choice(streets)} No. {random.randint(1,500)}',
    '{province}',
    '{regency}',
    '{district}',
    '{village}',
    '{random.randint(10000,79999)}',
    {-6.0 + random.random() * 5:.6f},
    {106.0 + random.random() * 20:.6f},
    {random.random() < 0.95},
    '{random_timestamp()}',
    '{random_timestamp()}'
)""")
    
    print("INSERT INTO facilities (id, facility_type_code, parent_facility_id, name, address,")
    print("    province_code, regency_code, district_code, village_code, postal_code,")
    print("    latitude, longitude, active, created_at, updated_at)")
    print("VALUES")
    print(',\n'.join(values))
    print(";\n")

def generate_patients(count=RECORDS_PER_TABLE):
    """Generate patient records"""
    print("-- ============================================================")
    print(f"-- Patients ({count} records)")
    print("-- ============================================================\n")
    
    cities = ['Jakarta', 'Bandung', 'Surabaya', 'Medan', 'Makassar']
    sex_codes = ['LAKI_LAKI', 'PEREMPUAN']
    
    values = []
    for i in range(1, count + 1):
        nik = random_nik()
        bpjs = f"{random.randint(0,9999999999999):013d}" if random.random() < 0.70 else None
        
        province = f"3{random.randint(1,6)}"
        regency = f"{province}{random.randint(1,20):02d}"
        district = f"{regency}{random.randint(1,30):02d}"
        village = f"{district}{random.randint(1,50):03d}"
        
        birth_year = random.randint(1940, 2020)
        birth_month = random.randint(1, 12)
        birth_day = random.randint(1, 28)
        
        values.append(f"""(
    '{uuid.uuid4()}',
    {sql_str(nik)},
    {sql_str(f'PASS{i:08d}' if random.random() < 0.20 else None)},
    {sql_str(bpjs)},
    '{random_name()}',
    'Indonesia',
    '{random.choice(cities)}',
    '{birth_year}-{birth_month:02d}-{birth_day:02d}',
    {random.random() < 0.05},
    '{random.choice(sex_codes)}',
    {sql_str(random_phone())},
    'Jl. Mawar No. {random.randint(1,200)}, RT {random.randint(1,20):03d}/RW {random.randint(1,15):03d}',
    '{province}',
    '{regency}',
    '{district}',
    '{village}',
    '{random_timestamp()}',
    '{random_timestamp()}'
)""")
    
    print("INSERT INTO patients (id, nik, other_identity_number, bpjs_number, full_name,")
    print("    citizenship, birth_place, birth_date, birth_date_unknown, sex_code, phone,")
    print("    address, province_code, regency_code, district_code, village_code,")
    print("    created_at, updated_at)")
    print("VALUES")
    print(',\n'.join(values))
    print(";\n")

def main():
    """Main function"""
    print("-- ============================================================")
    print("-- TBCall Dummy Data")
    print(f"-- Generated: {datetime.now()}")
    print(f"-- Records per table: {RECORDS_PER_TABLE}")
    print("-- WARNING: FOR TESTING/DEVELOPMENT ONLY")
    print("-- ============================================================\n")
    print("BEGIN;\n")
    
    # Generate data for major tables
    generate_facilities(RECORDS_PER_TABLE)
    generate_patients(RECORDS_PER_TABLE)
    
    # Add more generators here for other tables
    print("-- Additional tables can be generated similarly\n")
    print("-- Note: Generate other entities in order respecting foreign keys:\n")
    print("-- 1. Users")
    print("-- 2. User-Facility links")
    print("-- 3. TB Registrations (references patients, facilities)")
    print("-- 4. Diagnoses (references registrations)")
    print("-- 5. TB Cases (references registrations, diagnoses)")
    print("-- 6. Lab Requests, Treatments, etc.\n")
    
    print("COMMIT;")

if __name__ == "__main__":
    main()
