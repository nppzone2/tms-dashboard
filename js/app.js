/* TMS DATA ACCURACY DASHBOARD V2.0 */

const sess = JSON.parse(sessionStorage.getItem("tmsUser") || "null");
if (!sess) window.location.href = "login.html";

const userEl = document.getElementById("user");
if (userEl) {
    userEl.innerHTML = `<span>NPP: ${sess.tenant}</span>
    <button onclick="signOut()">Sign Out</button>`;
}

function signOut() {
    sessionStorage.removeItem("tmsUser");
    window.location.href = "login.html";
}

let rows=[],errors=[],plans=[],audit=[],summary=[],quality={};

async function initDashboard() {
    try {
        const data = await loadDashboardData();

        const tenant = String(sess.tenant).trim().toUpperCase();

        const allRows = data.orderDetail || [];
        const allErrors = data.errorDetail || [];
        const allPlans = data.planDetail || [];
        const allAudit = data.calculationAudit || [];

        const matchTenant = x =>
            String(x.TenantName || "").trim().toUpperCase() === tenant;

        rows = allRows.filter(matchTenant);
        errors = allErrors.filter(matchTenant);
        summary = (data.nppSummary || []).filter(matchTenant);
        quality = data.dataQuality || {};

        /* PLAN: filter by PlanNumber belonging to this NPP */
        const tenantPlans = new Set(rows.map(x => x.PlanNumber).filter(Boolean));
        plans = allPlans.filter(x => tenantPlans.has(x.PlanNumber));

        /* AUDIT: filter by OrderNumber belonging to this NPP */
        const tenantOrders = new Set(rows.map(x => x.OrderNumber).filter(Boolean));
        audit = allAudit.filter(x =>
            tenantOrders.has(x.OrderNumber)
        );

        console.log("TMS Dashboard loaded");
        console.log("Tenant:", tenant);
        console.log("Orders:", rows.length);
        console.log("Errors:", errors.length);
        console.log("Plans:", plans.length);
        console.log("Audit:", audit.length);
        console.log("Summary:", summary[0]);

        render("overview");
        setActiveNav("overview");

    } catch (e) {
        console.error(e);
        document.getElementById("app").innerHTML =
            `<div class="card"><h2>Unable to load dashboard data</h2>
            <p>Please refresh the page or contact administrator.</p></div>`;
    }
}

document.querySelectorAll("nav button").forEach(btn => {
    btn.onclick = () => {
        setActiveNav(btn.dataset.page);
        render(btn.dataset.page);
    };
});

function setActiveNav(page) {
    document.querySelectorAll("nav button").forEach(btn =>
        btn.classList.toggle("active", btn.dataset.page === page)
    );
}

function tbl(data) {
    if (!data.length) return `<div class="card">No data</div>`;

    const cols = Object.keys(data[0]);

    return `<div class="section table"><table>
        <thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>
        ${data.map(r => `<tr>
            ${cols.map(c => `<td>${r[c] ?? ""}</td>`).join("")}
        </tr>`).join("")}
        </tbody>
    </table></div>`;
}

function render(page) {
    const el = document.getElementById("app");

    /* OVERVIEW */
    if (page === "overview") {
        const s = summary[0] || {};

        el.innerHTML = `
            <h1>Overview</h1>
            <div class="grid">
                <div class="card">
                    <div class="label">Orders</div>
                    <div class="value">${s.Total_Orders ?? rows.length}</div>
                </div>
                <div class="card">
                    <div class="label">24H</div>
                    <div class="value">${formatPercent(s["24H Compliance"])}</div>
                </div>
                <div class="card">
                    <div class="label">GEO</div>
                    <div class="value">${formatPercent(s["Geo Compliance"])}</div>
                </div>
                <div class="card">
                    <div class="label">Payload</div>
                    <div class="value">${formatPercent(s["Payload Compliance"])}</div>
                </div>
            </div>

            <div class="section toolbar">
                <h2>Order Detail</h2>
                <div>
                    <button onclick="exportCSV(rows,'TMS_Order_Detail.csv')">
                        ↓ Export Current View
                    </button>
                    <button onclick="exportCSV(errors,'TMS_Error_Detail.csv')">
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
            "24H": x["24H"] ?? "",
            GEO: x["Geo Check"] ?? "",
            Payload: x["Payload Check"] ?? "",
            Duration: x["Duration_24H"] ?? ""
        }));

        el.innerHTML = `<h1>KPI</h1>${tbl(data)}`;
        return;
    }

    /* ERROR ORDERS */
    if (page === "errors") {
        const data = errors.map(x => ({
            OrderNumber: x.OrderNumber,
            PlanNumber: x.PlanNumber,
            Reason: x["Primary Error"] ?? ""
        }));

        el.innerHTML = `<h1>Error Orders</h1>${tbl(data)}`;
        return;
    }

    /* PLAN */
    if (page === "plan") {
        const data = plans.map(x => ({
            PlanNumber: x.PlanNumber,
            Orders: x.Total_Orders,
            Error_Orders: x.Error_Orders,
            Error_Events: x.Error_Events,
            Payload_Wrong: x.Payload_Wrong,
            DistanceTime_Wrong: x.DistanceTime_Wrong,
            CreatedTime_Wrong: x.CreatedTime_Wrong,
            Geo_Wrong: x.Geo_Wrong,
            UserName_Wrong: x.UserName_Wrong,
            WorkingHour_Wrong: x.WorkingHour_Wrong,
            "Plan Error %": x["Plan Error %"],
            Result: x["Plan Result"]
        }));

        el.innerHTML = `<h1>Plan Detail</h1>${tbl(data)}`;
        return;
    }

    /* AUDIT */
    if (page === "audit") {
        el.innerHTML = `<h1>Calculation Audit</h1>${tbl(audit)}`;
        return;
    }

    /* DATA QUALITY */
    if (page === "quality") {
        el.innerHTML = `
            <h1>Data Quality</h1>
            <div class="grid">
                <div class="card">
                    <div class="label">Loaded Orders</div>
                    <div class="value">${rows.length}</div>
                </div>
                <div class="card">
                    <div class="label">Business Logic</div>
                    <div class="value">${quality.BusinessLogicVersion ?? "V2.0"}</div>
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

function formatPercent(v) {
    if (v === null || v === undefined || v === "") return "N/A";
    if (typeof v === "number")
        return ((v <= 1 ? v * 100 : v).toFixed(1)) + "%";
    return v;
}

initDashboard();
