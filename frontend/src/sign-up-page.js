import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export const SignUpPage = () => {

    const [searchParams, _setSearchParams] = useSearchParams();
    const [valid, setValid] = useState(true);

    useEffect(() => {
        const share = searchParams.get('share');
        if (!share) {
            setValid(false);
        }
    }, [searchParams]);

    return (
        <>
            <a href="/">
                <img src="/images/innerly_wordmark_200616_02.png" class="img-responsive center-block md-margin-bottom" width="178" height="176" title="Innerly" alt="Innerly" />
            </a>
            <main class="container">
                {valid ? null : 
                <div id="flash-messages" class="row sm-margin-top">
                    <div class="alert alert-error alert-dismissible md-margin-top" role="alert">
                        Invalid login link. Contact admin. A valid sign-up link with look like /signup?share=xxx.
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
                                <button type="submit" class="btn btn-info btn-block">
                                    Register
                                </button>
                            </div>
                            <div class="col-md-6">
                                <div class="visible-xs visible-sm sm-margin-top"></div>
                                <a href="/login" class="btn btn-default btn-block">
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