const USERS = [
    { username: "10260142", password: "User@123", tenant: "P444", role: "NPP" },
    { username: "10260145", password: "User@123", tenant: "P461", role: "NPP" },
    { username: "10349819", password: "User@123", tenant: "P467", role: "NPP" },
    { username: "10260143", password: "User@123", tenant: "P449", role: "NPP" },
    { username: "10419898", password: "User@123", tenant: "P468", role: "NPP" },
    { username: "10260126", password: "User@123", tenant: "P450", role: "NPP" },
    { username: "10260129", password: "User@123", tenant: "P69", role: "NPP" },
    { username: "10446954", password: "User@123", tenant: "HM12", role: "NPP" },
    { username: "10260147", password: "User@123", tenant: "HM", role: "NPP" }
];

function doLogin() {

    const username = document.getElementById("u").value.trim();
    const password = document.getElementById("p").value.trim();
    const message = document.getElementById("msg");

    if (!username || !password) {
        message.textContent = "Please enter Username and Password.";
        return;
    }

    const user = USERS.find(function (item) {
        return item.username === username &&
               item.password === password;
    });

    if (!user) {
        message.textContent = "Invalid username or password.";
        return;
    }

    sessionStorage.setItem(
        "tmsUser",
        JSON.stringify({
            username: user.username,
            tenant: user.tenant,
            role: user.role
        })
    );

    message.textContent = "Login successful...";

    window.location.href = "./index.html";
}


// Attach LOGIN button
document.getElementById("go").onclick = doLogin;


// Press ENTER
document.getElementById("u").onkeydown = function(event) {
    if (event.key === "Enter") {
        doLogin();
    }
};

document.getElementById("p").onkeydown = function(event) {
    if (event.key === "Enter") {
        doLogin();
    }
};

console.log("TMS AUTH READY");
