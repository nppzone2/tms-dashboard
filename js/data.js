const DATA_PATH = "./data/";

let dashboardData = {
    nppSummary: [],
    orderDetail: [],
    errorDetail: [],
    planDetail: [],
    calculationAudit: [],
    dataQuality: {}
};

async function loadJSON(fileName) {
    const response = await fetch(`${DATA_PATH}${fileName}`);

    if (!response.ok) {
        throw new Error(`Cannot load ${fileName}: ${response.status}`);
    }

    return await response.json();
}

async function loadDashboardData() {
    try {
        const [
            nppSummary,
            orderDetail,
            errorDetail,
            planDetail,
            calculationAudit,
            dataQuality
        ] = await Promise.all([
            loadJSON("npp_summary.json"),
            loadJSON("order_detail.json"),
            loadJSON("error_detail.json"),
            loadJSON("plan_detail.json"),
            loadJSON("calculation_audit.json"),
            loadJSON("data_quality.json")
        ]);

        dashboardData = {
            nppSummary,
            orderDetail,
            errorDetail,
            planDetail,
            calculationAudit,
            dataQuality
        };

        console.log("TMS Dashboard data loaded successfully");
        console.log("NPP Summary:", nppSummary);
        console.log("Orders:", orderDetail.length);
        console.log("Errors:", errorDetail.length);
        console.log("Plans:", planDetail.length);

        return dashboardData;

    } catch (error) {
        console.error("Failed to load dashboard data:", error);
        throw error;
    }
}
