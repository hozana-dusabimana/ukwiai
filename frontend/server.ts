import express, { type Request, type Response as ExpressResponse } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
// Bind address. In production behind CloudPanel's reverse proxy we bind the
// loopback only (HOST=127.0.0.1) so the port is never exposed publicly; dev
// keeps 0.0.0.0 for convenience.
const HOST = process.env.HOST || "0.0.0.0";

app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));
// Capture multipart bodies (file uploads) as a raw Buffer so we can forward
// them to the backend untouched, boundary and all. express has no multipart parser.
app.use(express.raw({ type: "multipart/form-data", limit: "30mb" }));

const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const BACKEND_PUBLIC_URL = (process.env.BACKEND_PUBLIC_URL || "http://localhost:8000").replace(/\/$/, "");

// ----------- helpers -----------

function pickAuth(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (h && typeof h === "string") return h;
  return undefined;
}

async function callBackend(
  req: Request,
  pathSuffix: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined || {}) };
  const auth = pickAuth(req);
  if (auth) headers["Authorization"] = auth;
  return fetch(`${BACKEND_URL}${pathSuffix}`, { ...init, headers });
}

function formatRwf(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n) || n === 0) return "RWF 0";
  if (n >= 1_000_000) return `RWF ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `RWF ${(n / 1_000).toFixed(1)}K`;
  return `RWF ${n.toFixed(0)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  );
}

function pickVarianceStatus(deviation: string | null | undefined, overBudget: boolean): "ON TRACK" | "WARNING" | "CRITICAL" {
  if (overBudget) return "CRITICAL";
  const dev = (deviation || "").toLowerCase();
  if (dev.includes("delay") || dev.includes("over")) return "WARNING";
  if (dev.includes("critical")) return "CRITICAL";
  return "ON TRACK";
}

function imageUrl(imagePath: string | null | undefined): string {
  if (!imagePath) return "";
  if (imagePath.startsWith("http")) return imagePath;
  if (imagePath.startsWith("/api/")) return `${BACKEND_PUBLIC_URL}${imagePath}`;
  return `${BACKEND_PUBLIC_URL}/${imagePath.replace(/^\/+/, "")}`;
}

// ----------- aggregating endpoints (multi-call) -----------

app.get("/api/scans", async (req, res) => {
  try {
    const projRes = await callBackend(req, "/api/projects?limit=50");
    if (!projRes.ok) return res.status(projRes.status).json({ error: await projRes.text() });
    const projects = (await projRes.json()) as Array<any>;

    const enriched = await Promise.all(
      projects.slice(0, 10).map(async (proj) => {
        const [summaryRes, imagesRes] = await Promise.all([
          callBackend(req, `/api/projects/${proj.id}/summary`),
          callBackend(req, `/api/projects/${proj.id}/images?limit=10`),
        ]);
        const summary = summaryRes.ok ? await summaryRes.json() : null;
        const images = imagesRes.ok ? await imagesRes.json() : [];
        return { proj, summary, images };
      })
    );

    const scans = enriched.flatMap(({ proj, summary, images }) => {
      const totalBudget = Number(proj.total_budget) || 0;
      const totalSpent = Number(summary?.total_expenses ?? 0);
      const remaining = Math.max(0, totalBudget - totalSpent);
      const overBudget = totalSpent > totalBudget;
      const status = pickVarianceStatus(summary?.deviation_status, overBudget);
      const variance = overBudget
        ? `+${formatRwf(totalSpent - totalBudget)}`
        : `${formatRwf(remaining)} remaining`;
      const progress = Math.round(summary?.latest_progress ?? 0);
      const confidence = Number(((summary?.latest_confidence ?? 0) * 100).toFixed(1));

      if (!images || images.length === 0) {
        return [{
          id: `proj-${proj.id}`,
          projectId: proj.id,
          title: proj.project_name,
          date: formatDate(proj.start_date),
          progress,
          image: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=800&q=60",
          stageName: summary?.deviation_status || "Awaiting first capture",
          confidence,
          advisory: `No site images uploaded yet for ${proj.project_name}. Use Upload Image from the Projects tab.`,
          budgetConsumed: formatRwf(totalSpent),
          remainingBudget: formatRwf(remaining),
          projectedVariance: variance,
          varianceStatus: status,
        }];
      }
      return images.map((img: any) => ({
        id: `img-${img.id}`,
        projectId: proj.id,
        title: `${proj.project_name} · ${img.original_filename || `Image ${img.id}`}`,
        date: formatDate(img.captured_date || img.created_at),
        progress,
        image: imageUrl(img.image_url || img.image_path),
        stageName: summary?.deviation_status || "Stage tracked",
        confidence,
        advisory:
          img.notes ||
          `Auto-captured site image from ${proj.location || "site"}. Run AI Analysis to refresh insights.`,
        budgetConsumed: formatRwf(totalSpent),
        remainingBudget: formatRwf(remaining),
        projectedVariance: variance,
        varianceStatus: status,
      }));
    });

    res.json(scans);
  } catch (err: any) {
    console.error("[scans] proxy failed:", err.message);
    res.status(502).json({ error: "Backend unreachable", detail: err.message });
  }
});

app.get("/api/overview", async (req, res) => {
  try {
    // When a project is selected the totals are scoped to it; otherwise they
    // aggregate the whole portfolio. The projects list is always full so the
    // header switcher can offer every project regardless of the current scope.
    const projectId = req.query.project_id ? `?project_id=${encodeURIComponent(String(req.query.project_id))}` : "";
    const [dashRes, projectsRes] = await Promise.all([
      callBackend(req, `/api/dashboard/overview${projectId}`),
      callBackend(req, "/api/projects?limit=10"),
    ]);
    const dash = dashRes.ok ? await dashRes.json() : null;
    const projects = projectsRes.ok ? ((await projectsRes.json()) as Array<any>) : [];
    const selectedId = req.query.project_id ? Number(req.query.project_id) : null;
    const active = (selectedId != null && projects.find((p) => p.id === selectedId)) || projects[0] || null;

    res.json({
      activeProject: active
        ? {
            id: active.id,
            name: active.project_name,
            location: active.location || active.project_code,
            code: active.project_code,
            status: active.status,
            totalBudget: formatRwf(active.total_budget),
          }
        : null,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.project_name,
        code: p.project_code,
        location: p.location || "",
        status: p.status,
        totalBudget: formatRwf(p.total_budget),
      })),
      totals: dash
        ? {
            totalProjects: dash.total_projects,
            activeProjects: dash.active_projects,
            completedProjects: dash.completed_projects,
            totalBudget: formatRwf(dash.total_budget),
            totalSpent: formatRwf(dash.total_spent),
            remainingBudget: formatRwf(dash.remaining_budget),
            averageProgress: Number((dash.average_progress || 0).toFixed(1)),
            onTrackCount: dash.on_track_count,
            overBudgetCount: dash.over_budget_count,
          }
        : null,
    });
  } catch (err: any) {
    console.error("[overview] proxy failed:", err.message);
    res.status(502).json({ error: "Backend unreachable", detail: err.message });
  }
});

// Image analysis: forwards multipart to backend. Browser sends JSON {image, name, projectId}.
app.post("/api/analyze", async (req, res) => {
  try {
    const { image, name, projectId } = req.body || {};
    if (!image) return res.status(400).json({ error: "Missing image base64 data" });

    const cleanBase64 = image.includes("base64,") ? image.split("base64,")[1] : image;
    const isPng = String(image).startsWith("data:image/png") || String(image).includes("image/png");
    const mimeType = isPng ? "image/png" : "image/jpeg";
    const ext = isPng ? "png" : "jpg";
    const buffer = Buffer.from(cleanBase64, "base64");

    // Pick a project if caller didn't supply one.
    let chosenProject: number | null = projectId ?? null;
    if (chosenProject == null) {
      const pr = await callBackend(req, "/api/projects?limit=1");
      if (pr.ok) {
        const list = (await pr.json()) as Array<{ id: number }>;
        if (list.length > 0) chosenProject = list[0].id;
      }
    }

    const form = new FormData();
    const filename = `${(name || "scan").replace(/[^a-z0-9-_]/gi, "_")}.${ext}`;
    form.set("file", new Blob([buffer], { type: mimeType }), filename);
    if (chosenProject != null) form.set("project_id", String(chosenProject));

    const ai = await callBackend(req, "/api/ai/analyze-image", { method: "POST", body: form });
    if (!ai.ok) {
      const text = await ai.text();
      // FastAPI sends errors as {"detail": "..."} — surface that friendly message
      // verbatim (e.g. "not a basketball court", "stage already completed") so the
      // UI can show it to the user instead of a raw status dump.
      let message = text;
      try {
        const parsed = JSON.parse(text);
        message = parsed.detail || parsed.error || text;
      } catch {
        /* non-JSON body: fall back to the raw text */
      }
      return res.status(ai.status).json({ error: message });
    }
    const analysis = await ai.json();

    const a = analysis.analysis || {};
    const cost = analysis.cost_estimation || {};
    const progress = Math.round(a.predicted_progress_percentage ?? 0);
    const confidence = Number(((a.confidence_score ?? 0) * 100).toFixed(1));
    const totalBudget = Number(analysis.project_total_budget ?? 0);
    const estimated = Number(cost.estimated_total_cost ?? cost.projected_total_cost ?? 0);
    const overBudget = estimated > totalBudget && totalBudget > 0;
    const remaining = Math.max(0, totalBudget - estimated);

    const scanRecord = {
      id: `scan-${Date.now()}`,
      projectId: chosenProject,
      title: name || a.predicted_stage || "New site scan",
      date: formatDate(a.analysis_date || new Date().toISOString()),
      progress,
      image: image.startsWith("data:") ? image : `data:${mimeType};base64,${cleanBase64}`,
      stageName: a.predicted_stage || "Unknown stage",
      confidence,
      advisory: analysis.advice || analysis.summary || "AI advisory unavailable.",
      budgetConsumed: formatRwf(estimated),
      remainingBudget: formatRwf(remaining),
      projectedVariance: overBudget ? `+${formatRwf(estimated - totalBudget)}` : `${formatRwf(remaining)} remaining`,
      varianceStatus: overBudget ? "CRITICAL" : "ON TRACK",
    };

    res.json({ scan: scanRecord, raw: analysis });
  } catch (err: any) {
    console.error("[analyze] failed:", err.message);
    res.status(502).json({ error: err.message || "AI analysis failed" });
  }
});

// Audit logs reshaped for UI.
app.get("/api/logs", async (req, res) => {
  try {
    const r = await callBackend(req, "/api/audit-logs?limit=100");
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const rows = (await r.json()) as Array<any>;
    const logs = rows.map((row) => ({
      id: String(row.id),
      timestamp: (row.timestamp || "").replace("T", " ").slice(0, 19),
      action: row.action,
      user: row.user_id ? `user_${row.user_id}` : "system",
      entity: [row.entity_type, row.entity_id].filter(Boolean).join("#") || "system",
      status: row.action?.toLowerCase().includes("fail") || row.action?.toLowerCase().includes("error") ? "Alert" : "Success",
      reference: `#TRX-${String(row.id).padStart(4, "0")}`,
    }));
    res.json(logs);
  } catch (err: any) {
    console.error("[logs] proxy failed:", err.message);
    res.status(502).json({ error: "Backend unreachable", detail: err.message });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    const r = await fetch(`${BACKEND_URL}/api/system/health`);
    const data = await r.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ status: "degraded", detail: err.message });
  }
});

// ----------- generic pass-through for everything else under /api/* -----------
// Forwards method, body, query, and Authorization header straight to FastAPI.
// Handles JSON, multipart, and binary responses.

const PROXY_METHODS = ["get", "post", "put", "patch", "delete"] as const;
PROXY_METHODS.forEach((method) => {
  (app as any)[method]("/api/*", async (req: Request, res: ExpressResponse) => {
    const url = req.originalUrl; // includes /api/...
    try {
      const init: RequestInit = { method: method.toUpperCase() };
      const headers: Record<string, string> = {};
      const auth = pickAuth(req);
      if (auth) headers["Authorization"] = auth;

      const contentType = req.headers["content-type"] || "";
      const hasBody = !["GET", "DELETE", "HEAD"].includes(init.method!);

      if (hasBody) {
        if (contentType.includes("multipart/form-data")) {
          // express.raw gave us the body as a Buffer; forward it verbatim with the
          // original Content-Type so the multipart boundary stays intact.
          headers["Content-Type"] = contentType;
          init.body = Buffer.isBuffer(req.body) ? req.body : undefined;
        } else if (contentType.includes("application/json")) {
          headers["Content-Type"] = "application/json";
          init.body = JSON.stringify(req.body || {});
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          headers["Content-Type"] = "application/x-www-form-urlencoded";
          const params = new URLSearchParams();
          Object.entries(req.body || {}).forEach(([k, v]) => params.append(k, String(v)));
          init.body = params.toString();
        } else if (req.body && Object.keys(req.body).length > 0) {
          headers["Content-Type"] = "application/json";
          init.body = JSON.stringify(req.body);
        }
      }

      init.headers = headers;
      const upstream = await fetch(`${BACKEND_URL}${url}`, init);
      const upstreamCt = upstream.headers.get("content-type") || "";
      res.status(upstream.status);
      if (upstreamCt.includes("application/json")) {
        const data = await upstream.text();
        res.type("application/json").send(data);
      } else if (upstreamCt.includes("text/")) {
        const data = await upstream.text();
        res.type(upstreamCt).send(data);
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        upstream.headers.forEach((value, key) => {
          if (["content-type", "content-disposition", "content-length"].includes(key.toLowerCase())) {
            res.setHeader(key, value);
          }
        });
        res.send(buf);
      }
    } catch (err: any) {
      console.error(`[proxy ${method.toUpperCase()} ${url}] failed:`, err.message);
      res.status(502).json({ error: "Backend unreachable", detail: err.message });
    }
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[UKWI Monitor Frontend] listening on http://${HOST}:${PORT}`);
    console.log(`[UKWI Monitor Frontend] proxying API -> ${BACKEND_URL}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal server start failure:", err);
  process.exit(1);
});
