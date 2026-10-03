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

document.addEventListener("DOMContentLoaded", function () {

    const usernameInput = document.getElementById("u");
    const passwordInput = document.getElementById("p");
    const loginButton = document.getElementById("go");
    const message = document.getElementById("msg");

    if (!usernameInput || !passwordInput || !loginButton) {
        console.error("Login elements not found.");
        return;
    }

    function doLogin() {

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        message.textContent = "";

        if (!username || !password) {
            message.textContent = "Please enter Username and Password.";
            return;
        }

        const user = USERS.find(function (u) {
            return u.username === username &&
                   u.password === password;
        });

        if (!user) {
            message.textContent = "Invalid username or password.";
            return;
        }

        // Save login session
        sessionStorage.setItem("tmsUser", JSON.stringify({
            username: user.username,
            tenant: user.tenant,
            role: user.role
        }));

        console.log("Login successful:", {
            username: user.username,
            tenant: user.tenant,
            role: user.role
        });

        // Go to dashboard
        window.location.href = "index.html";
    }

    // Click LOGIN
    loginButton.addEventListener("click", function (event) {
        event.preventDefault();
        doLogin();
    });

    // Press ENTER
    usernameInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            doLogin();
        }
    });

    passwordInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            doLogin();
        }
    });

});
