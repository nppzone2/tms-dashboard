/* TMS DATA ACCURACY DASHBOARD V2.0 */

const sess = JSON.parse(sessionStorage.getItem("tmsUser") || "null");

if (!sess) window.location.href = "login.html";

const userEl = document.getElementById("user");
if (userEl) {
    userEl.innerHTML = `
        <span>NPP: ${sess?.tenant || "-"}</span>
        <button type="button" onclick="signOut()">Sign Out</button>
    `;
}

function signOut() {
    sessionStorage.removeItem("tmsUser");
    window.location.href = "login.html";
}

/* DATA */
let rows = [], errors = [], plans = [], audit = [], summary = [], quality = {};

/* INIT */
async function initDashboard() {
    try {
        const data = await loadDashboardData();

        rows = data.orderDetail || [];
        errors = data.errorDetail || [];
        plans = data.planDetail || [];
        audit = data.calculationAudit || [];
        summary = data.nppSummary || [];
        quality = data.dataQuality || {};

        const tenant = String(sess.tenant || "").trim().toUpperCase();

        const filterTenant = x =>
            String(x.TenantName || "").trim().toUpperCase() === tenant;

        rows = rows.filter(filterTenant);
        errors = errors.filter(filterTenant);
        plans = plans.filter(filterTenant);
        audit = audit.filter(filterTenant);
        summary = summary.filter(filterTenant);

        console.log("TMS Dashboard loaded");
        console.log("Tenant:", sess.tenant);
        console.log("Orders:", rows.length);
        console.log("Errors:", errors.length);
        console.log("Plans:", plans.length);
        console.log("Summary:", summary[0]);

        render("overview");
        setActiveNav("overview");

    } catch (error) {
        console.error("Dashboard error:", error);
        document.getElementById("app").innerHTML = `
            <div class="card">
                <h2>Unable to load dashboard data</h2>
                <p>Please refresh the page or contact administrator.</p>
            </div>
        `;
    }
}

/* NAVIGATION */
document.querySelectorAll("nav button").forEach(button => {
    button.addEventListener("click", () => {
        const page = button.dataset.page;
        setActiveNav(page);
        render(page);
    });
});

function setActiveNav(page) {
    document.querySelectorAll("nav button").forEach(button => {
        button.classList.toggle("active", button.dataset.page === page);
    });
}

/* TABLE */
function tbl(data) {
    if (!data || !data.length) {
        return `<div class="card">No data</div>`;
    }

    const cols = Object.keys(data[0]);

    return `
        <div class="section table">
            <table>
                <thead>
                    <tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr>
                            ${cols.map(c => `<td>${row[c] ?? ""}</td>`).join("")}
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

/* RENDER */
function render(page) {
    const el = document.getElementById("app");

    /* OVERVIEW */
    if (page === "overview") {
        const s = summary[0] || {};

        const orders = s.Total_Orders ?? rows.length;
        const compliance24 = s["24H Compliance"] ?? "N/A";
        const geo = s["Geo Compliance"] ?? "N/A";
        const payload = s["Payload Compliance"] ?? "N/A";

        console.log("OVERVIEW:", s);

        el.innerHTML = `
            <h1>Overview</h1>

            <div class="grid">
                <div class="card">
                    <div class="label">Orders</div>
                    <div class="value">${orders}</div>
                </div>

                <div class="card">
                    <div class="label">24H</div>
                    <div class="value">${formatPercent(compliance24)}</div>
                </div>

                <div class="card">
                    <div class="label">GEO</div>
                    <div class="value">${formatPercent(geo)}</div>
                </div>

                <div class="card">
                    <div class="label">Payload</div>
                    <div class="value">${formatPercent(payload)}</div>
                </div>
            </div>

            <div class="section toolbar">
                <h2>Order Detail</h2>
                <div>
                    <button type="button"
                        onclick="exportCSV(rows,'TMS_Order_Detail.csv')">
                        ↓ Export Current View
                    </button>
                    <button type="button"
                        onclick="exportCSV(errors,'TMS_Error_Detail.csv')">
                        ↓ Export Errors
                    </button>
                </div>
            </div>

            ${tbl(rows)}
        `;

        return;
    }

    /* KPI */
    if (page === "kpi") {
        const data = rows.map(x => ({
            OrderNumber: x.OrderNumber,
            "24H": x["24H"] ?? x["24H_Result"] ?? "",
            GEO: x.GEO ?? x["Geo_Result"] ?? "",
            Payload: x.Payload ?? x["Payload_Result"] ?? "",
            Duration: x.Duration ?? x["24H_Duration_Hours"] ?? ""
        }));

        el.innerHTML = `<h1>KPI</h1>${tbl(data)}`;
        return;
    }

    /* ERROR ORDERS */
    if (page === "errors") {
        const data = errors.map(x => ({
            OrderNumber: x.OrderNumber,
            PlanNumber: x.PlanNumber,
            Reason: x.Reason ?? x.ErrorReason ?? x.reasons ?? ""
        }));

        el.innerHTML = `<h1>Error Orders</h1>${tbl(data)}`;
        return;
    }

    /* PLAN */
    if (page === "plan") {
        el.innerHTML = `<h1>Plan Detail</h1>${tbl(plans)}`;
        return;
    }

    /* AUDIT */
    if (page === "audit") {
        el.innerHTML = `<h1>Calculation Audit</h1>${tbl(audit)}`;
        return;
    }

    /* DATA QUALITY */
    if (page === "quality") {
        const q = quality || {};

        el.innerHTML = `
            <h1>Data Quality</h1>

            <div class="grid">
                <div class="card">
                    <div class="label">Loaded Orders</div>
                    <div class="value">${q.TMS_Orders ?? rows.length}</div>
                </div>

                <div class="card">
                    <div class="label">Logic</div>
                    <div class="value">${q.BusinessLogicVersion ?? "V2.0"}</div>
                </div>

                <div class="card">
                    <div class="label">Geo Radius</div>
                    <div class="value">50m</div>
                </div>

                <div class="card">
                    <div class="label">Plan Error</div>
                    <div class="value">30%</div>
                </div>
            </div>
        `;

        return;
    }
}

/* FORMAT PERCENT */
function formatPercent(value) {
    if (value === null || value === undefined || value === "") return "N/A";

    if (typeof value === "number") {
        return ((value <= 1 ? value * 100 : value).toFixed(1)) + "%";
    }

    return value;
}

/* START */
initDashboard();
