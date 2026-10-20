import React from "react";
import { Navigate } from "./router.jsx";
import { loginRoute } from "./constants.js";
import { Navbar } from "./navbar.jsx";
import { getUserData } from "./utils.jsx";


export const BasePage = ({ setSearch=null, allowGuest=false, children }) => {
    
    let user = getUserData();

    if (!user && !allowGuest) {
        return <Navigate to={loginRoute} />;
    }
    
    return (
        <>
            <Navbar setSearch={setSearch} user={user} />
            <main className={`container sm-margin-top`}>
                {children}
            </main>
        </>
    );
};