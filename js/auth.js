/* =========================================================
   TMS DASHBOARD V2.0
   AUTHENTICATION
   ========================================================= */


/* =========================================================
   USERS
   ========================================================= */

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


/* =========================================================
   LOGIN FUNCTION
   ========================================================= */

function login(username, password) {

    username = String(username || "").trim();
    password = String(password || "").trim();


    /* -----------------------------------------------
       Find user
       ----------------------------------------------- */

    const user = USERS.find(
        u =>
            u.username === username &&
            u.password === password
    );


    /* -----------------------------------------------
       Invalid login
       ----------------------------------------------- */

    if (!user) {

        return false;
    }


    /* -----------------------------------------------
       Clear previous session
       ----------------------------------------------- */

    sessionStorage.removeItem("tmsUser");


    /* -----------------------------------------------
       Save current session
       ----------------------------------------------- */

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


/* =========================================================
   LOGIN FORM
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {


        /* -----------------------------------------------
           Find login form
           ----------------------------------------------- */

        const form =
            document.getElementById("loginForm");


        if (!form) {

            console.error(
                "Login form not found: #loginForm"
            );

            return;
        }


        /* -----------------------------------------------
           Submit event
           
           Works for:
           - Login button
           - Enter key
           ----------------------------------------------- */

        form.addEventListener(
            "submit",
            function (event) {

                event.preventDefault();


                /* ---------------------------------------
                   Get username
                   --------------------------------------- */

                const usernameElement =
                    document.getElementById("username");


                /* ---------------------------------------
                   Get password
                   --------------------------------------- */

                const passwordElement =
                    document.getElementById("password");


                if (
                    !usernameElement ||
                    !passwordElement
                ) {

                    console.error(
                        "Username or password field not found."
                    );

                    return;
                }


                const username =
                    usernameElement.value.trim();


                const password =
                    passwordElement.value;


                /* ---------------------------------------
                   Validate empty fields
                   --------------------------------------- */

                if (!username) {

                    alert(
                        "Please enter username."
                    );

                    usernameElement.focus();

                    return;
                }


                if (!password) {

                    alert(
                        "Please enter password."
                    );

                    passwordElement.focus();

                    return;
                }


                /* ---------------------------------------
                   Authenticate
                   --------------------------------------- */

                const success =
                    login(
                        username,
                        password
                    );


                /* ---------------------------------------
                   Invalid username/password
                   --------------------------------------- */

                if (!success) {

                    alert(
                        "Invalid username or password."
                    );

                    passwordElement.focus();

                    return;
                }


                /* ---------------------------------------
                   Login successful
                   --------------------------------------- */

                const session =
                    JSON.parse(
                        sessionStorage.getItem(
                            "tmsUser"
                        )
                    );


                console.log(
                    "Login successful"
                );

                console.log(
                    "Username:",
                    session.username
                );

                console.log(
                    "Tenant:",
                    session.tenant
                );

                console.log(
                    "Role:",
                    session.role
                );


                /* ---------------------------------------
                   Go to dashboard
                   --------------------------------------- */

                window.location.href =
                    "index.html";

            }
        );

    }
);
