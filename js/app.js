const sess = JSON.parse(sessionStorage.tmsUser || 'null');

if (!sess) {
    location = 'login.html';
}

document.getElementById('user').textContent =
    'NPP: ' + (sess?.tenant || '-');

let rows = [];
let errors = [];
let plans = [];
let audit = [];
let quality = {};
let summary = [];

async function initDashboard() {

    try {

        const data = await loadDashboardData();

        summary = data.nppSummary || [];
        rows = data.orderDetail || [];
        errors = data.errorDetail || [];
        plans = data.planDetail || [];
        audit = data.calculationAudit || [];
        quality = data.dataQuality || {};

        /*
         * IMPORTANT:
         * Engine V2.0 is the Single Source of Truth.
         * No KPI recalculation is performed here.
         */

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

        console.log(
            'TMS Dashboard data loaded successfully'
        );

        console.log(
        'NPP:',
        sess.tenant
        );

        console.log(
            'Orders:',
            rows.length
        );

        console.log(
            'Errors:',
            errors.length
        );

        console.log(
            'Plans:',
            plans.length
        );

        console.log(
            'Summary:',
            summary
        );

        render('overview');

    } catch (error) {

        console.error(
            'Failed to initialize dashboard:',
            error
        );

        document.getElementById('app').innerHTML = `
            <div class="card">
                <h2>Unable to load dashboard data</h2>
                <p>Please refresh the page or contact administrator.</p>
            </div>
        `;
    }
}


document
    .querySelectorAll('nav button')
    .forEach(button => {

        button.onclick = () => {

            document
                .querySelectorAll('nav button')
                .forEach(x =>
                    x.classList.remove('active')
                );

            button.classList.add('active');

            render(button.dataset.page);
        };

    });


function tbl(data) {

    if (!data || !data.length) {
        return '<div class="card">No data</div>';
    }

    const columns = Object.keys(data[0]);

    return `
        <div class="section table">
            <table>
                <tr>
                    ${columns
                        .map(x => `<th>${x}</th>`)
                        .join('')}
                </tr>

                ${data
                    .map(row => `
                        <tr>
                            ${columns
                                .map(column =>
                                    `<td>${row[column] ?? ''}</td>`
                                )
                                .join('')}
                        </tr>
                    `)
                    .join('')}
            </table>
        </div>
    `;
}


function render(page) {

    const el = document.getElementById('app');


    /* =========================
       OVERVIEW
       ========================= */

    if (page === 'overview') {

        const s = summary[0] || {};

        const orders =
            s.Orders ??
            s.TotalOrders ??
            rows.length;

        const compliance24 =
            s['24H_Compliance'] ??
            s.Compliance24H ??
            s['24H'] ??
            'N/A';

        const geo =
            s.Geo_Compliance ??
            s.GEO ??
            'N/A';

        const payload =
            s.Payload_Compliance ??
            s.Payload ??
            'N/A';

        el.innerHTML = `

            <h1>Overview</h1>

            <div class="grid">

                <div class="card">
                    <div class="label">
                        Orders
                    </div>

                    <div class="value">
                        ${orders}
                    </div>
                </div>


                <div class="card">
                    <div class="label">
                        24H
                    </div>

                    <div class="value">
                        ${formatPercent(compliance24)}
                    </div>
                </div>


                <div class="card">
                    <div class="label">
                        GEO
                    </div>

                    <div class="value">
                        ${formatPercent(geo)}
                    </div>
                </div>


                <div class="card">
                    <div class="label">
                        Payload
                    </div>

                    <div class="value">
                        ${formatPercent(payload)}
                    </div>
                </div>

            </div>


            <div class="section toolbar">

                <h2>
                    Order Detail
                </h2>

                <div>

                    <button
                        onclick="exportCSV(
                            rows,
                            'TMS_Order_Detail.csv'
                        )"
                    >
                        ↓ Export Current View
                    </button>


                    <button
                        onclick="exportCSV(
                            errors,
                            'TMS_Error_Detail.csv'
                        )"
                    >
                        ↓ Export Errors
                    </button>

                </div>

            </div>

            ${tbl(rows)}

        `;

        return;
    }


    /* =========================
       KPI
       ========================= */

    if (page === 'kpi') {

        el.innerHTML = `

            <h1>KPI</h1>

            ${tbl(
                rows.map(x => ({
                    OrderNumber:
                        x.OrderNumber,

                    '24H':
                        x['24H'] ??
                        x.r24 ??
                        '',

                    GEO:
                        x.GEO ??
                        x.geo ??
                        '',

                    Payload:
                        x.Payload ??
                        x.payload ??
                        '',

                    Duration:
                        x.Duration ??
                        x.duration ??
                        ''
                }))
            )}

        `;

        return;
    }


    /* =========================
       ERROR ORDERS
       ========================= */

    if (page === 'errors') {

        el.innerHTML = `

            <h1>Error Orders</h1>

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
                        ''
                }))
            )}

        `;

        return;
    }


    /* =========================
       PLAN DETAIL
       ========================= */

    if (page === 'plan') {

        el.innerHTML = `

            <h1>Plan Detail</h1>

            ${tbl(
                plans
            )}

        `;

        return;
    }


    /* =========================
       CALCULATION AUDIT
       ========================= */

    if (page === 'audit') {

        el.innerHTML = `

            <h1>Calculation Audit</h1>

            ${tbl(
                audit
            )}

        `;

        return;
    }


    /* =========================
       DATA QUALITY
       ========================= */

    if (page === 'quality') {

        const q = quality || {};

        el.innerHTML = `

            <h1>Data Quality</h1>

            <div class="grid">

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


                <div class="card">

                    <div class="label">
                        Logic
                    </div>

                    <div class="value">
                        ${
                            q.BusinessLogicVersion ??
                            q.Logic ??
                            'V2.0'
                        }
                    </div>

                </div>


                <div class="card">

                    <div class="label">
                        Geo Radius
                    </div>

                    <div class="value">
                        50m
                    </div>

                </div>


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


/* =========================
   FORMAT PERCENT
   ========================= */

function formatPercent(value) {

    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return 'N/A';
    }

    if (typeof value === 'number') {

        if (value <= 1) {
            return (
                Math.round(value * 1000) / 10
            ) + '%';
        }

        return (
            Math.round(value * 10) / 10
        ) + '%';
    }

    return value;
}


/* =========================
   START
   ========================= */

initDashboard();
