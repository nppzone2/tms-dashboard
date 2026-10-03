/* =========================================================
   TMS DASHBOARD V2.0
   Frontend Application
   Engine V2.0 = Single Source of Truth
   ========================================================= */


/* =========================================================
   SESSION
   ========================================================= */

const sess = JSON.parse(
    sessionStorage.getItem("tmsUser") || "null"
);


/* =========================================================
   AUTH CHECK
   ========================================================= */

if (!sess) {
    window.location.href = "login.html";
}


/* =========================================================
   USER DISPLAY
   ========================================================= */

const userElement = document.getElementById("user");

if (userElement) {

    userElement.innerHTML = `
        <span>
            NPP: ${sess?.tenant || "-"}
        </span>

        <button
            type="button"
            class="signout-btn"
            onclick="signOut()"
        >
            Sign Out
        </button>
    `;
}


/* =========================================================
   SIGN OUT
   ========================================================= */

function signOut() {

    sessionStorage.removeItem("tmsUser");

    window.location.href = "login.html";
}


/* =========================================================
   DATA VARIABLES
   ========================================================= */

let rows = [];
let errors = [];
let plans = [];
let audit = [];
let quality = {};
let summary = [];


/* =========================================================
   INITIALIZE DASHBOARD
   ========================================================= */

async function initDashboard() {

    try {

        /* -----------------------------------------------
           Load Engine JSON
           ----------------------------------------------- */

        const data = await loadDashboardData();


        /* -----------------------------------------------
           Assign data
           ----------------------------------------------- */

        summary =
            data.nppSummary || [];

        rows =
            data.orderDetail || [];

        errors =
            data.errorDetail || [];

        plans =
            data.planDetail || [];

        audit =
            data.calculationAudit || [];

        quality =
            data.dataQuality || {};


        /* =================================================
           IMPORTANT
           =================================================

           Engine V2.0 is the Single Source of Truth.

           Frontend does NOT recalculate KPI.

           Frontend only:
           - loads JSON
           - filters by TenantName
           - displays results
           ================================================= */


        /* -----------------------------------------------
           Filter NPP data
           ----------------------------------------------- */

        rows = rows.filter(
            x => x.TenantName === sess.tenant
        );

        errors = errors.filter(
            x => x.TenantName === sess.tenant
        );

        plans = plans.filter(
            x => x.TenantName === sess.tenant
        );

        audit = audit.filter(
            x => x.TenantName === sess.tenant
        );

        summary = summary.filter(
            x => x.TenantName === sess.tenant
        );


        /* -----------------------------------------------
           Console debug
           ----------------------------------------------- */

        console.log(
            "TMS Dashboard data loaded successfully"
        );

        console.log(
            "Username:",
            sess.username
        );

        console.log(
            "Tenant:",
            sess.tenant
        );

        console.log(
            "Role:",
            sess.role
        );

        console.log(
            "Orders:",
            rows.length
        );

        console.log(
            "Errors:",
            errors.length
        );

        console.log(
            "Plans:",
            plans.length
        );

        console.log(
            "Summary:",
            summary
        );


        /* -----------------------------------------------
           Default page
           ----------------------------------------------- */

        render("overview");


    } catch (error) {

        console.error(
            "Failed to initialize dashboard:",
            error
        );


        const app =
            document.getElementById("app");


        if (app) {

            app.innerHTML = `

                <div class="card">

                    <h2>
                        Unable to load dashboard data
                    </h2>

                    <p>
                        Please refresh the page
                        or contact administrator.
                    </p>

                </div>

            `;
        }
    }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

document
    .querySelectorAll("nav button")
    .forEach(button => {

        button.onclick = () => {

            document
                .querySelectorAll("nav button")
                .forEach(x =>
                    x.classList.remove("active")
                );

            button.classList.add("active");

            render(
                button.dataset.page
            );
        };

    });


/* =========================================================
   TABLE RENDER
   ========================================================= */

function tbl(data) {

    if (!data || !data.length) {

        return `
            <div class="card">
                No data
            </div>
        `;
    }


    const columns =
        Object.keys(data[0]);


    return `

        <div class="section table">

            <table>

                <thead>

                    <tr>

                        ${columns
                            .map(
                                x =>
                                    `<th>${x}</th>`
                            )
                            .join("")
                        }

                    </tr>

                </thead>


                <tbody>

                    ${data
                        .map(row => `

                            <tr>

                                ${columns
                                    .map(
                                        column => `
                                            <td>
                                                ${
                                                    row[column] ??
                                                    ""
                                                }
                                            </td>
                                        `
                                    )
                                    .join("")
                                }

                            </tr>

                        `)
                        .join("")
                    }

                </tbody>

            </table>

        </div>

    `;
}


/* =========================================================
   RENDER
   ========================================================= */

function render(page) {

    const el =
        document.getElementById("app");


    if (!el) {
        return;
    }


    /* =====================================================
       OVERVIEW
       ===================================================== */

    if (page === "overview") {

        const s =
            summary[0] || {};


        const orders =
            s.Orders ??
            s.TotalOrders ??
            s.Total_Orders ??
            rows.length;


        /* -----------------------------------------------
           KPI Summary
           ----------------------------------------------- */

        const compliance24 =
            s["24H Compliance"] ??
            s["24H_Compliance"] ??
            s.Compliance24H ??
            s["24H"] ??
            "N/A";


        const geo =
            s["Geo Compliance"] ??
            s.Geo_Compliance ??
            s.GEO ??
            "N/A";


        const payload =
            s["Payload Compliance"] ??
            s.Payload_Compliance ??
            s.Payload ??
            "N/A";


        el.innerHTML = `

            <h1>
                Overview
            </h1>


            <div class="grid">


                <!-- ORDERS -->

                <div class="card">

                    <div class="label">
                        Orders
                    </div>

                    <div class="value">
                        ${orders}
                    </div>

                </div>


                <!-- 24H -->

                <div class="card">

                    <div class="label">
                        24H
                    </div>

                    <div class="value">
                        ${formatPercent(compliance24)}
                    </div>

                </div>


                <!-- GEO -->

                <div class="card">

                    <div class="label">
                        GEO
                    </div>

                    <div class="value">
                        ${formatPercent(geo)}
                    </div>

                </div>


                <!-- PAYLOAD -->

                <div class="card">

                    <div class="label">
                        Payload
                    </div>

                    <div class="value">
                        ${formatPercent(payload)}
                    </div>

                </div>


            </div>


            <!-- ORDER DETAIL -->

            <div class="section toolbar">

                <h2>
                    Order Detail
                </h2>


                <div>

                    <button
                        type="button"
                        onclick="
                            exportCSV(
                                rows,
                                'TMS_Order_Detail.csv'
                            )
                        "
                    >
                        ↓ Export Current View
                    </button>


                    <button
                        type="button"
                        onclick="
                            exportCSV(
                                errors,
                                'TMS_Error_Detail.csv'
                            )
                        "
                    >
                        ↓ Export Errors
                    </button>

                </div>

            </div>


            ${tbl(rows)}

        `;


        return;
    }


    /* =====================================================
       KPI
       ===================================================== */

    if (page === "kpi") {

        el.innerHTML = `

            <h1>
                KPI
            </h1>


            ${tbl(

                rows.map(x => ({

                    OrderNumber:
                        x.OrderNumber,

                    "24H":
                        x["24H"] ??
                        x["24H_Result"] ??
                        "",

                    GEO:
                        x.GEO ??
                        x["Geo_Result"] ??
                        "",

                    Payload:
                        x.Payload ??
                        x["Payload_Result"] ??
                        "",

                    Duration:
                        x.Duration ??
                        x["24H_Duration_Hours"] ??
                        ""

                }))

            )}

        `;


        return;
    }


    /* =====================================================
       ERROR ORDERS
       ===================================================== */

    if (page === "errors") {

        el.innerHTML = `

            <h1>
                Error Orders
            </h1>


            ${tbl(

                errors.map(x => ({

                    OrderNumber:
                        x.OrderNumber,

                    PlanNumber:
                        x.PlanNumber,

                    Reason:
                        x.Reason ??
                        x.ErrorReason ??
                        x.reasons ??
                        ""

                }))

            )}

        `;


        return;
    }


    /* =====================================================
       PLAN DETAIL
       ===================================================== */

    if (page === "plan") {

        el.innerHTML = `

            <h1>
                Plan Detail
            </h1>


            ${tbl(plans)}

        `;


        return;
    }


    /* =====================================================
       CALCULATION AUDIT
       ===================================================== */

    if (page === "audit") {

        el.innerHTML = `

            <h1>
                Calculation Audit
            </h1>


            ${tbl(audit)}

        `;


        return;
    }


    /* =====================================================
       DATA QUALITY
       ===================================================== */

    if (page === "quality") {

        const q =
            quality || {};


        el.innerHTML = `

            <h1>
                Data Quality
            </h1>


            <div class="grid">


                <!-- LOADED ORDERS -->

                <div class="card">

                    <div class="label">
                        Loaded Orders
                    </div>

                    <div class="value">

                        ${
                            q.TMS_Orders ??
                            q.TotalOrders ??
                            rows.length
                        }

                    </div>

                </div>


                <!-- BUSINESS LOGIC -->

                <div class="card">

                    <div class="label">
                        Logic
                    </div>

                    <div class="value">

                        ${
                            q.BusinessLogicVersion ??
                            q.Logic ??
                            "V2.0"
                        }

                    </div>

                </div>


                <!-- GEO -->

                <div class="card">

                    <div class="label">
                        Geo Radius
                    </div>

                    <div class="value">
                        50m
                    </div>

                </div>


                <!-- PLAN ERROR -->

                <div class="card">

                    <div class="label">
                        Plan Error
                    </div>

                    <div class="value">
                        30%
                    </div>

                </div>


            </div>

        `;


        return;
    }

}


/* =========================================================
   FORMAT PERCENT
   ========================================================= */

function formatPercent(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return "N/A";
    }


    if (typeof value === "number") {

        if (value <= 1) {

            return (
                Math.round(
                    value * 1000
                ) / 10
            ) + "%";
        }


        return (
            Math.round(
                value * 10
            ) / 10
        ) + "%";
    }


    return value;
}


/* =========================================================
   START DASHBOARD
   ========================================================= */

initDashboard();
