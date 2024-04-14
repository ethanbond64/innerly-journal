import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BasePage } from "./base-page.js";
import { getUserData, setUserData, clearLocalStorage } from "./utils.js";
import { loginRoute } from "./constants.js";
import { PageLoader } from "./page-loader.js";
import { Notification } from "./notification.js";
import { updatePassword, updateUser } from "./requests.js";

export const SettingsPage = () => {

    const navigate = useNavigate();
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [userData, setUserDataComponent] = useState(null);
    const [editingPassword, setEditingPassword] = useState(false);
    const initialTheme = localStorage.getItem("color-theme") === "dark";

    const onChangeTheme = (e) => {
        if (e.target.checked) {
            localStorage.setItem("color-theme", "dark");
            document.documentElement.setAttribute("data-theme","dark");
        } else {
            localStorage.setItem("color-theme", "light");
            document.documentElement.setAttribute("data-theme","light");
        }
    };

    const onClickUpdatePassword = () => {
        let oldPassword = document.getElementById('oldPassword').value;
        let newPassword = document.getElementById('newPassword').value;
        let newPasswordConfirm = document.getElementById('newPasswordConfirm').value;
        
        if (!oldPassword || !newPassword || !newPasswordConfirm) {
            setError("Please fill out all fields to update password.");
            return;
        }
        if (newPassword !== newPasswordConfirm) {
            setError("New passwords do not match.");
            return;
        }
        
        updatePassword(oldPassword, newPassword, () => {
            setSuccess("Password updated successfully.");
            setEditingPassword(false);
        }, (e) => {
            setError(e);
        });
    };

    const onSelectSensitivity = (e) => {
        let newSensitivity = e.target.value;
        updateUser(userData.id, { settings: { sensitivity: newSensitivity } }, (data) => {
            setUserData(data);
            setUserDataComponent(data);
        });
    };

    useEffect(() => {
        let localUserData = getUserData();
        if (localUserData) {
            setUserDataComponent(localUserData);
        } else {
            clearLocalStorage();
            navigate(loginRoute);
        }
    }, []);


    if (!userData) {
        return <PageLoader />;
    }

    let sensitivity = userData && userData.settings && userData.settings.sensitivity ? userData.settings.sensitivity : "default";

    return (
        <BasePage>
            <div class="md-margin-top"></div>
            <Notification message={error} clear={() => setError(null)} type="error" />
            <Notification message={success} clear={() => setSuccess(null)} type="success" />
            <div class="row">
                <div class="col-md-4"></div>
                <div class="col-md-4 md-margin-top">
                    <h2>Settings</h2>
                    <h4 class="text-muted margin-bottom">{userData.email}</h4>
                    <div class="well" style={{ height: '65px' }}>
                        <h4 style={{ display: 'inline-block', float: 'left', marginTop: '0px'}}>Dark Mode</h4>
                        <div class="toggle-container" style={{ display: 'inline-block', float: 'right'}}>
                            <input type="checkbox" id="switch" name="theme" onChange={onChangeTheme} defaultChecked={initialTheme}/>
                            <label id="swtichlabel" for="switch">Toggle</label>
                        </div>
                    </div>
                    <div class="list-group well">
                        <h4>Credentials</h4>
                        { editingPassword ?
                        <>
                            <div class="form-group sm-margin-bottom">
                                <label for="password"><strong>Current Password</strong>
                                </label>
                                <input class="form-control" id="oldPassword" maxlength="128" minlength="8" name="oldPassword" required="" type="password" placeholder="" />
                            </div>
                            <div class="form-group sm-margin-bottom">
                                <label for="password"><strong>New Password</strong>
                                </label>
                                <input class="form-control" id="newPassword" maxlength="128" minlength="8" name="newPassword" required="" type="password" placeholder="" />
                            </div>
                            <div class="form-group sm-margin-bottom">
                                <label for="newPasswordConfirm">
                                    <strong>Confirm New Password</strong>
                                </label>
                                <input class="form-control" id="newPasswordConfirm" maxlength="128" minlength="8" name="newPasswordConfirm" type="password" placeholder="" />
                                <button onClick={onClickUpdatePassword} class="btn btn-md btn-info" type="button" style={{ marginTop: '10px'}}>Update</button>
                            </div>
                        </> : 
                        <span onClick={() => setEditingPassword(true)} class="list-group-item" style={{ cursor: 'pointer' }}>
                            Click here to update password
                        </span>}
                    </div>
                    <div class="well">
                        <h4>Text Sensitivity</h4>
                        <label for="default" className="radioLabel">Default - Show titles, Show thumbnails</label>
                        <input type="radio" id="default" name="sensitivity" value="default" className="radioInline" onChange={onSelectSensitivity} defaultChecked={sensitivity === "default"}/>
                        <label for="blur" className="radioLabel">Blur - Show titles, Blur thumbnails</label>
                        <input type="radio" id="blur" name="sensitivity" value="blur" className="radioInline" onChange={onSelectSensitivity} defaultChecked={sensitivity === "blur"} />
                        <label for="both" className="radioLabel">Both - Hide titles, Blur thumbnails</label>
                        <input type="radio" id="both" name="sensitivity" value="both" className="radioInline" onChange={onSelectSensitivity} defaultChecked={sensitivity === "both"} />
                    </div>
                </div>
                <div class="col-md-4"></div>
            </div>
        </BasePage>
    );
};