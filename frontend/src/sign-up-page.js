import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { setToken, setUserData } from './utils.js';
import { homeRoute, loginRoute } from './constants.js';
import { Notification } from './notification.js';
import { API_BASE_URL, getPublicUrl } from './config.js';

export const SignUpPage = () => {

    // eslint-disable-next-line
    const [searchParams, _] = useSearchParams();
    const [share, setShare] = useState(null);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        let shareLocal = searchParams.get('share');
        setShare(shareLocal);
    }, [searchParams]);

    const onSubmit = (e) => {
        e.preventDefault();
        console.log('submit');
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const password_confirm = document.getElementById('password_confirm').value;

        if (password !== password_confirm) {
            setError("Passwords do not match.");
            return;
        }
        
         axios.post(`${API_BASE_URL}/api/signup`, { email, password, share }).then((response) => {
            if (response.data.token && response.data.user) {
                setToken(response.data.token);
                setUserData(response.data.user);
                navigate(homeRoute);
            } else {
                setError("Unable to sign up.");
            }
         }).catch((error) => {
            if (error.response && error.response.data && error.response.data.message) {
                setError(error.response.data.message);
            } else {
                setError("Unable to sign up.");
            }
         });
    };

    return (
        <main class="container drag">
            <a href={homeRoute}>
                <img src={getPublicUrl('images/innerly_wordmark_200616_02.png')} class="img-responsive center-block md-margin-bottom" width="178" height="176" title="Innerly" alt="Innerly" />
            </a>
            <Notification message={error} clear={() => setError(null)} />
            <div class="row">
                <div class="col-md-3"></div>
                <div class="col-md-6 md-margin-top well nondrag">
                    <legend>Create an account</legend>
                    <div class="form-group sm-margin-bottom">
                        <label for="email"><strong>Email</strong>
                        </label>
                        <input autofocus="autofocus" class="form-control" id="email" name="email" placeholder="Email address" required="" type="text" />
                    </div>
                    <div class="form-group sm-margin-bottom">
                        <label for="password"><strong>Password</strong>
                        </label>
                        <input class="form-control" id="password" maxlength="128" minlength="8" name="password" required="" type="password" placeholder="" />
                    </div>
                    <div class="form-group sm-margin-bottom">
                        <label for="password_confirm">
                            <strong>Confirm Password</strong>
                        </label>
                        <input class="form-control" id="password_confirm" maxlength="128" minlength="8" name="password_confirm" type="password" placeholder="" />
                    </div>
                    <div class="form-group sm-margin-bottom">
                        <label for="password_confirm">
                            <strong>Share token</strong>
                        </label>
                        {
                            share? 
                            <input class="form-control" id="share_token" maxlength="128" minlength="8" name="share_token" type="text" value={share} disabled /> :
                            <input class="form-control" id="share_token" maxlength="128" minlength="8" name="share_token" type="text" placeholder='Share token will look like 123-456-789-000'/>
                        }
                    </div>
                    <div class="row">
                        <div class="col-md-6">
                            <button type="submit" class="btn btn-info btn-block" onClick={onSubmit}>
                                Register
                            </button>
                        </div>
                        <div class="col-md-6">
                            <div class="visible-xs visible-sm sm-margin-top"></div>
                            <a href={loginRoute} class="btn btn-default btn-block">
                                Looking to log in?
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
};