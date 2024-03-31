import React from "react";
import { Navigate } from "react-router-dom";
import { loginRoute } from "./constants";
import { Navbar } from "./navbar";
import { getUserData } from "./utils";


export const BasePage = ({ setSearch=null, children }) => {
    
    let user = getUserData();

    if (!user) {
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