// This file handles all communication with your FastAPI backend.

export const getDistricts = async () => {
  const res = await fetch('/api/districts');
  if (!res.ok) throw new Error('Failed to fetch districts');
  return res.json();
};

export const getReports = async (districtId?: number) => {
  const url = districtId ? `/api/reports?district_id=${districtId}` : '/api/reports';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch reports');
  return res.json();
};

export const getOfficialAlerts = async (districtId?: number) => {
  const url = districtId ? `/api/official-alerts?district_id=${districtId}` : '/api/official-alerts';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch alerts');
  return res.json();
};

export const createReport = async (data: any) => {
  const res = await fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to create report');
  return res.json();
};