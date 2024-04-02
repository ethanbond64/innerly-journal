import React from "react";
import { BasePage } from "./base-page.js";

export const SettingsPage = () => {

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

    return (
        <BasePage>
            <div class="md-margin-top"></div>
            <div class="row">
                <div class="col-md-4"></div>
                <div class="col-md-4 md-margin-top">
                    <h2>Settings</h2>
                    <h4 class="text-muted margin-bottom">ethanbond39@gmail.com</h4>

                    <div class="list-group well">
                        <a href="/settings/update_credentials" class="list-group-item">
                            Click here to update email or password
                        </a>
                    </div>
                    <div class="well">
                        <h4>Dark Mode</h4>
                        <div class="toggle-container">
                            <input type="checkbox" id="switch" name="theme" onChange={onChangeTheme} defaultChecked={initialTheme}/>
                            <label id="swtichlabel" for="switch">Toggle</label>
                        </div>
                    </div>
                    <div class="well">
                        <h4>Text Sensitivity</h4>
                        <input type="radio" id="default" name="sensitivity" value="default" />
                        <label for="default">Default - Show titles, Show thumbnails</label>
                        <input type="radio" id="blur" name="sensitivity" value="blur" checked="" />
                        <label for="blur">Blur - Show titles, Blur thumbnails</label>
                        <input type="radio" id="both" name="sensitivity" value="both" />
                        <label for="both">Both - Hide titles, Blur thumbnails</label>
                        <hr style={{ fontSize: '1px', background: '#111111', height: '1px', opacity: '0.5'}} />
                        <h4>Locking Entries</h4>
                        <p>Locked entries will be encrypted with a passcode. The passcode must be made of
                            6 unique numbers. Set and reset here:</p>
                        <div style={{ marginTop: '10px', textAlign: 'center'}}>
                            <button class="btn btn-md btn-info" type="button" data-toggle="modal" data-target="#resetModal">Reset
                                Passcode</button>
                        </div>
                    </div>
                </div>
                <div class="col-md-4"></div>
            </div>
        </BasePage>
    );
};