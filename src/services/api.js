// src/services/api.js
import axios from 'axios';

const BASE = import.meta.env.VITE_API_BASE_URL;

const BASE_URL = `${BASE}/api`;
const AUTH_URL = `${BASE}/auth`;

export async function fetchRecommendations() {
  const response = await axios.get(`${BASE_URL}/recommendations`,
    { withCredentials: true });
  return response.data.data;
}

export async function refreshProduct(competitorUrl, skuId) {
  const response = await axios.post(`${BASE_URL}/refresh-product`,
    { competitorUrl, skuId },
    { withCredentials: true }
  );
  return response.data;
}

export async function checkAuth() {
  try {
    const res = await axios.get(`${AUTH_URL}/me`,
      { withCredentials: true });
    return res.data;
  } catch {
    return { authenticated: false };
  }
}

export async function logout() {
  await axios.post(`${AUTH_URL}/logout`, {},
    { withCredentials: true });
}

export async function fetchCompetitorDetails(skuId) {
  const response = await axios.get(`${BASE_URL}/competitor-details/${encodeURIComponent(skuId)}`,
    { withCredentials: true }
  );
  return response.data.data;
}

export async function fetchPPProducts() {
  const response = await axios.get(`${BASE_URL}/pp-products`,
    { withCredentials: true }
  );
  return response.data.data;
}

export async function updatePP(skuId, newPP) {
  const response = await axios.patch(`${BASE_URL}/update-pp`,
    { skuId, newPP },
    { withCredentials: true }
  );
  return response.data.data;
}

// ── Download blank CSV template ───────────────────────────────
export async function downloadPPTemplate() {
  const response = await axios.get(`${BASE_URL}/pp-template-csv`, {
    withCredentials: true,
    responseType: 'blob',
  });
  const url      = window.URL.createObjectURL(new Blob([response.data]));
  const link     = document.createElement('a');
  link.href      = url;
  link.setAttribute('download', 'pp_update_template.csv');
  document.body.appendChild(link);
  link.click();
  link.parentNode.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// ── Validate SKUs ─────────────────────────────────────────────
export async function validateBulkPP(skus) {
  const response = await axios.post(`${BASE_URL}/validate-skus`,
    { skus },
    { withCredentials: true }
  );
  return response.data;
}

// ── Bulk PP update ────────────────────────────────────────────
export async function bulkUpdatePP(rows, unidentified = [], fileName = '') {
  const response = await axios.post(`${BASE_URL}/bulk-update-pp`,
    { rows, unidentified, fileName },
    { withCredentials: true }
  );
  return response.data.data;
}

// ── Bulk upload history ───────────────────────────────────────
export async function fetchBulkUploadHistory() {
  const response = await axios.get(`${BASE_URL}/bulk-upload-history`,
    { withCredentials: true }
  );
  return response.data.data;
}

// ── Unidentified SKUs for a session ──────────────────────────
export async function fetchSessionUnidentified(sessionId) {
  const response = await axios.get(
    `${BASE_URL}/bulk-upload-session/${sessionId}/unidentified`,
    { withCredentials: true }
  );
  return response.data.data;
}

// ── Export unidentified SKUs as CSV ──────────────────────────
export async function exportSessionUnidentified(sessionId) {
  const response = await axios.get(
    `${BASE_URL}/bulk-upload-session/${sessionId}/export`,
    { withCredentials: true, responseType: 'blob' }
  );
  const url  = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href  = url;
  link.setAttribute('download', `unidentified_skus_${sessionId.slice(0, 8)}.csv`);
  document.body.appendChild(link);
  link.click();
  link.parentNode.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// ── Category settings ─────────────────────────────────────────
export async function fetchCategorySettings() {
  const response = await axios.get(`${BASE_URL}/category-settings`,
    { withCredentials: true }
  );
  return response.data.data;
}

export async function updateCategorySettings(categoryName, payload) {
  const response = await axios.put(
    `${BASE_URL}/category-settings/${encodeURIComponent(categoryName)}`,
    payload,
    { withCredentials: true }
  );
  return response.data.data;
}

// ── User management (admin only) ──────────────────────────────
export async function fetchUsers() {
  const response = await axios.get(`${BASE_URL}/users`, { withCredentials: true });
  return response.data.data;
}

export async function addUser(email, role) {
  const response = await axios.post(
    `${BASE_URL}/users`,
    { email, role },
    { withCredentials: true }
  );
  return response.data.data;
}

export async function removeUser(email) {
  await axios.delete(
    `${BASE_URL}/users/${encodeURIComponent(email)}`,
    { withCredentials: true }
  );
}

// ── Recommendation engine ─────────────────────────────────────
export async function runRecommendationEngine() {
  const response = await axios.post(
    `${BASE_URL}/run-recommendation-engine`, {},
    { withCredentials: true }
  );
  return response.data;
}

export async function getRecommendationJobStatus(jobId) {
  const response = await axios.get(
    `${BASE_URL}/recommendation-job/${jobId}`,
    { withCredentials: true }
  );
  return response.data.data;
}

// ── Scraper ───────────────────────────────────────────────────

export async function getScraperCategories() {
  const response = await axios.get(
    `${BASE_URL}/scraper-categories`,
    { withCredentials: true }
  );
  return response.data.data;
}

export async function runScraper(categoryNames) {
  const response = await axios.post(
    `${BASE_URL}/run-scraper`,
    { categoryNames },
    { withCredentials: true }
  );
  return response.data;
}

export async function getScraperJobStatus(jobId) {
  const response = await axios.get(
    `${BASE_URL}/scraper-job/${jobId}`,
    { withCredentials: true }
  );
  return response.data.data; // { status, cancelRequested, logs, error, ... }
}

export async function cancelScraperJob(jobId) {
  const response = await axios.post(
    `${BASE_URL}/scraper-job/${jobId}/cancel`, {},
    { withCredentials: true }
  );
  return response.data;
}

export async function getScraperJobLogs(jobId, from = 0) {
  const response = await axios.get(
    `${BASE_URL}/scraper-job/${jobId}/logs?from=${from}`,
    { withCredentials: true }
  );
  return response.data.data; // { lines, total, status }
}



// ── Category Mappings ─────────────────────────────────────────

export async function fetchStoreCategories() {
  const response = await axios.get(`${BASE_URL}/store-categories`, {
    withCredentials: true,
  });
  return response.data.data;
}

export async function fetchCategoryMappings() {
  const response = await axios.get(`${BASE_URL}/category-mappings`, {
    withCredentials: true,
  });
  return response.data.data;
}


export async function saveCategoryMapping(internalCategory, storeName, storeSlug) {
  const response = await axios.post(
    `${BASE_URL}/category-mappings`,
    { internalCategory, storeName, storeSlug },
    { withCredentials: true }
  );
  return response.data.data;
}


export async function deleteCategoryMapping(id) {
  await axios.delete(
    `${BASE_URL}/category-mappings/${id}`,
    { withCredentials: true }
  );
}


// ── Internal-only recommendations (no competitor matching) ────
export async function fetchInternalRecommendations() {
  const response = await axios.get(`${BASE_URL}/internal-recommendations`,
    { withCredentials: true }
  );
  return response.data.data;
}