import api from "./client";

export const authApi = {
  login: (email, password) => {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    return api.post("/auth/login", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },
  register: (data) => api.post("/auth/register", data),
  me: () => api.get("/auth/me"),
  changePassword: (data) => api.put("/auth/change-password", data),
  forgot: (email) => api.post("/auth/forgot-password", { email }),
  reset: (token, new_password) => api.post("/auth/reset-password", { token, new_password }),
};

export const usersApi = {
  list: (params) => api.get("/users", { params }),
  get: (id) => api.get(`/users/${id}`),
  create: (data) => api.post("/users", data),
  update: (id, data) => api.put(`/users/${id}`, data),
  remove: (id) => api.delete(`/users/${id}`),
  activate: (id) => api.patch(`/users/${id}/activate`),
  deactivate: (id) => api.patch(`/users/${id}/deactivate`),
};

export const projectsApi = {
  list: (params) => api.get("/projects", { params }),
  get: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post("/projects", data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  remove: (id) => api.delete(`/projects/${id}`),
  setStatus: (id, status) => api.patch(`/projects/${id}/status`, { status }),
  summary: (id) => api.get(`/projects/${id}/summary`),
  timeline: (id) => api.get(`/projects/${id}/timeline`),
  stages: (id) => api.get(`/projects/${id}/stages`),
};

export const stagesApi = {
  list: () => api.get("/stages"),
  create: (data) => api.post("/stages", data),
  update: (id, data) => api.put(`/stages/${id}`, data),
  remove: (id) => api.delete(`/stages/${id}`),
};

export const imagesApi = {
  upload: (projectId, formData) =>
    api.post(`/projects/${projectId}/images/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  list: (projectId, params) => api.get(`/projects/${projectId}/images`, { params }),
  get: (id) => api.get(`/images/${id}`),
  remove: (id) => api.delete(`/images/${id}`),
};

export const aiApi = {
  modelInfo: () => api.get("/ai/model-info"),
  analyzeImage: (formData) =>
    api.post("/ai/analyze-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  predictStage: (formData) =>
    api.post("/ai/predict-stage", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  analysisHistory: (projectId) => api.get(`/ai/projects/${projectId}/analysis-history`),
};

export const budgetApi = {
  summary: (projectId) => api.get(`/projects/${projectId}/budget/summary`),
  breakdown: (projectId) => api.get(`/projects/${projectId}/budget/breakdown`),
  expenses: (projectId, params) => api.get(`/projects/${projectId}/expenses`, { params }),
  addExpense: (projectId, data) => api.post(`/projects/${projectId}/budget/expense`, data),
  updateExpense: (id, data) => api.put(`/expenses/${id}`, data),
  deleteExpense: (id) => api.delete(`/expenses/${id}`),
};

export const costApi = {
  estimate: (projectId) => api.post(`/projects/${projectId}/estimate-cost`),
  comparison: (projectId) => api.get(`/projects/${projectId}/cost-comparison`),
  forecast: (projectId) => api.get(`/projects/${projectId}/cost-forecast`),
  variance: (projectId) => api.get(`/projects/${projectId}/variance-analysis`),
};

export const dashboardApi = {
  overview: () => api.get("/dashboard/overview"),
  active: () => api.get("/dashboard/active-projects"),
  budget: () => api.get("/dashboard/budget-stats"),
  recent: () => api.get("/dashboard/recent-activities"),
  progressTrend: (params) => api.get("/dashboard/charts/progress-trend", { params }),
  costTrend: (params) => api.get("/dashboard/charts/cost-trend", { params }),
  stageDistribution: () => api.get("/dashboard/charts/stage-distribution"),
};

export const alertsApi = {
  list: (params) => api.get("/alerts", { params }),
  read: (id) => api.patch(`/alerts/${id}/read`),
  resolve: (id) => api.patch(`/alerts/${id}/resolve`),
  remove: (id) => api.delete(`/alerts/${id}`),
};

export const notificationsApi = {
  list: (params) => api.get("/notifications", { params }),
  read: (id) => api.patch(`/notifications/${id}/read`),
};

export const reportsApi = {
  list: (params) => api.get("/reports", { params }),
  generate: (data) => api.post("/reports/generate", data),
  download: (id) => api.get(`/reports/${id}/download`, { responseType: "blob" }),
  /**
   * Internal: pull a report file via the authenticated axios client and
   * return { blob, filename, contentType } so callers can save it to disk
   * or open it in a browser tab without re-implementing auth handling.
   */
  _fetchBlob: async (report) => {
    const r = await api.get(`/reports/${report.id}/download`, { responseType: "blob" });
    const blob = r.data instanceof Blob ? r.data : new Blob([r.data]);
    const ct = r.headers?.["content-type"] || blob.type || "application/octet-stream";
    const cd = r.headers?.["content-disposition"] || "";
    const cdMatch = /filename="?([^"]+)"?/i.exec(cd);
    const inferredExt = ct.includes("spreadsheet") ? "xlsx" : "pdf";
    const filename =
      cdMatch?.[1] || `ukwi-${report.report_type || "report"}-${report.id}.${inferredExt}`;
    // Re-wrap so the browser inlines instead of downloading when we open
    // the URL in a new tab (some servers send application/octet-stream).
    const typed = blob.type === ct ? blob : new Blob([blob], { type: ct });
    return { blob: typed, filename, contentType: ct };
  },

  /**
   * Download a report and trigger a "Save as" in the browser. Uses the
   * authenticated axios client so the JWT goes along — a plain <a href>
   * to /api/reports/{id}/download fails with 401 because the browser
   * doesn't include localStorage tokens automatically.
   */
  saveToDisk: async (report) => {
    const { blob, filename } = await reportsApi._fetchBlob(report);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /**
   * Open a report in a new tab. PDFs render inline in modern browsers;
   * Excel files will download (no built-in viewer). If a popup blocker
   * intercepts window.open, we fall back to triggering a save instead so
   * the user always gets *something*.
   */
  viewInBrowser: async (report) => {
    const { blob, contentType } = await reportsApi._fetchBlob(report);
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      // Popup blocked — fall back to a save so the file isn't lost.
      const a = document.createElement("a");
      a.href = url;
      a.download = `ukwi-${report.report_type || "report"}-${report.id}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    // Hold the URL alive long enough for the new tab to fetch it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { contentType };
  },
};

export const systemApi = {
  health: () => api.get("/system/health"),
  stats: () => api.get("/system/stats"),
  audit: (params) => api.get("/audit-logs", { params }),
};
