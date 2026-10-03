const USERS = [
    {
        username: "10260142",
        password: "User@123",
        tenant: "P444",
        role: "NPP"
    },
    {
        username: "10260145",
        password: "User@123",
        tenant: "P461",
        role: "NPP"
    },
    {
        username: "10349819",
        password: "User@123",
        tenant: "P467",
        role: "NPP"
    },
    {
        username: "10260143",
        password: "User@123",
        tenant: "P449",
        role: "NPP"
    },
    {
        username: "10419898",
        password: "User@123",
        tenant: "P468",
        role: "NPP"
    },
    {
        username: "10260126",
        password: "User@123",
        tenant: "P450",
        role: "NPP"
    },
    {
        username: "10260129",
        password: "User@123",
        tenant: "P69",
        role: "NPP"
    },
    {
        username: "10446954",
        password: "User@123",
        tenant: "HM12",
        role: "NPP"
    },
    {
        username: "10260147",
        password: "User@123",
        tenant: "HM",
        role: "NPP"
    }
];

function login(username, password) {

    const user = USERS.find(
        u =>
            u.username === username &&
            u.password === password
    );

    if (!user) {
        return false;
    }

    sessionStorage.setItem(
        "tmsUser",
        JSON.stringify({
            username: user.username,
            tenant: user.tenant,
            role: user.role
        })
    );

    return true;
}
