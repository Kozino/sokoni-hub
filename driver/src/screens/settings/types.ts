export type DriverProfile = {
  id: string;
  status: 'pending' | 'approved' | 'suspended';
  vehicle_type: 'Motorcycle' | 'Car' | 'Van';
  license_plate: string;
  is_online: boolean;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_iban: string | null;
  documents: Record<string, string> | null;
};

export const DOCUMENT_KEYS = [
  { key: 'licence', label: 'Driving licence' },
  { key: 'id_card', label: 'Qatar ID' },
  { key: 'vehicle_registration', label: 'Vehicle registration' },
] as const;
