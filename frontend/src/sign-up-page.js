import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { setToken, setUserData } from './utils';
import { homeRoute, loginRoute } from './constants';

export const SignUpPage = () => {

    // eslint-disable-next-line
    const [searchParams, _] = useSearchParams();
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const share = searchParams.get('share');
        if (!share) {
            setError("Invalid login link. Contact admin. A valid sign-up link with look like /signup?share=abc.");
        }
    }, [searchParams]);

    const onSubmit = (e) => {
        e.preventDefault();
        console.log('submit');
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const share = searchParams.get('share');
         axios.post('http://localhost:8000/api/signup', { email, password, share }).then((response) => {
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
        <>
            <a href={homeRoute}>
                <img src="/images/innerly_wordmark_200616_02.png" class="img-responsive center-block md-margin-bottom" width="178" height="176" title="Innerly" alt="Innerly" />
            </a>
            <main class="container">
                {error == null ? null : 
                <div id="flash-messages" class="row sm-margin-top">
                    <div class="alert alert-error alert-dismissible md-margin-top" role="alert">
                        {error}
                    <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                        <span aria-hidden="true">×</span>
                    </button>
                    </div>  
                </div>
                }
                <div class="row">
                    <div class="col-md-3"></div>
                    <div class="col-md-6 md-margin-top well">
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
                                Confirm Password
                            </label>
                            <input class="form-control" id="password_confirm" maxlength="128" minlength="8" name="password_confirm" type="password" placeholder="" />
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
            <footer class="footer text-center">
                <div class="container">
                    <ul class="list-inline">
                        <li class="text-muted">Innerly © 2024</li>
                    </ul>
                </div>
            </footer>
        </>
    );
};