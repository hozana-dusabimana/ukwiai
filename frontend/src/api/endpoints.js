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
   * Download a report and trigger a "Save as" in the browser. Uses the
   * authenticated axios client so the JWT goes along — a plain <a href>
   * to /api/reports/{id}/download fails with 401 because the browser
   * doesn't include localStorage tokens automatically.
   */
  saveToDisk: async (report) => {
    const r = await api.get(`/reports/${report.id}/download`, { responseType: "blob" });
    const blob = r.data instanceof Blob ? r.data : new Blob([r.data]);
    const cd = r.headers?.["content-disposition"] || "";
    const cdMatch = /filename="?([^"]+)"?/i.exec(cd);
    // Fallback name: derive from report_type + id when the server doesn't set
    // a Content-Disposition filename.
    const inferredExt = (r.headers?.["content-type"] || "").includes("spreadsheet") ? "xlsx" : "pdf";
    const fname = cdMatch?.[1] || `ukwi-${report.report_type || "report"}-${report.id}.${inferredExt}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

export const systemApi = {
  health: () => api.get("/system/health"),
  stats: () => api.get("/system/stats"),
  audit: (params) => api.get("/audit-logs", { params }),
};
