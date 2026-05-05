import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "/api";

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ukwi_access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401) {
      const refresh = localStorage.getItem("ukwi_refresh_token");
      if (refresh && !error.config._retry) {
        error.config._retry = true;
        try {
          const r = await axios.post(`${baseURL}/auth/refresh-token`, { refresh_token: refresh });
          localStorage.setItem("ukwi_access_token", r.data.access_token);
          localStorage.setItem("ukwi_refresh_token", r.data.refresh_token);
          error.config.headers.Authorization = `Bearer ${r.data.access_token}`;
          return axios(error.config);
        } catch {
          localStorage.removeItem("ukwi_access_token");
          localStorage.removeItem("ukwi_refresh_token");
          window.location.assign("/login");
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
