import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { setToken, setUserData } from './utils';
import { homeRoute } from './constants';

export const LoginPage = () => {

    const navigate = useNavigate();
    const [error, setError] = useState(null);

    const onSubmit = (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
         axios.post('http://localhost:8000/api/login', { email, password }).then((response) => {
            if (response.data.token && response.data.user) {
                setToken(response.data.token);
                setUserData(response.data.user);
                navigate(homeRoute);
            } else {
                setError("Unable to login.");
            }
         }).catch((error) => {
            if (error.response && error.response.data && error.response.data.message) {
                setError(error.response.data.message);
            } else {
                setError("Unable to login.");
            }
         });
    };

    return (
        <>
            <a href={homeRoute}>
                <img src="/images/innerly_wordmark_200616_02.png" className="img-responsive center-block md-margin-bottom" width="178" height="176" title="Innerly" alt="Innerly" />
            </a>
            <main className="container">
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
                <div className="md-margin-top"></div>
                <div className="row">
                    <div className="col-md-4 col-md-offset-4 well">
                        <legend>Log in to existing account</legend>
                        <div className="form-group sm-margin-bottom" style={{}}> 
                            <label for="identity"><strong>Email</strong>
                            </label>
                            <input autofocus="autofocus" className="form-control" id="email" maxlength="254" minlength="3" name="email" required="" type="text" placeholder="" />
                        </div>
                        <div className="form-group sm-margin-bottom">
                            <label for="password"><strong>Password</strong>
                            </label>
                            <input className="form-control bg-white" id="password" maxlength="128" minlength="8" name="password" required="" type="password" placeholder="" />
                        </div>
                        <div className="row">
                            <div className="col-md-12">
                                <button onClick={onSubmit} type="submit" className="btn btn-info btn-block">
                                    Log in
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            <footer className="footer text-center">
                <div className="container">
                    <ul className="list-inline">
                        <li className="text-muted">Innerly © 2024</li>
                    </ul>
                </div>
            </footer>
        </>
    );
};


