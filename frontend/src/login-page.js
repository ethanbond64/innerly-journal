import React from 'react';

export const LoginPage = () => {
    return (
        <>
            <a href="/">
                <img src="/images/innerly_wordmark_200616_02.png" class="img-responsive center-block md-margin-bottom" width="178" height="176" title="Innerly" alt="Innerly" />
            </a>
            <main class="container">
                <div class="md-margin-top"></div>
                <div class="row">
                    <div class="col-md-4 col-md-offset-4 well">
                        <form action="/login" method="post" id="" class="" role="form">
                            <legend>Log in to continue</legend>
                            <div class="form-group sm-margin-bottom" style={{}}> 
                                <label for="identity"><strong>Email</strong>
                                </label>
                                <input autofocus="autofocus" class="form-control" id="email" maxlength="254" minlength="3" name="email" required="" type="text" value="" />
                            </div>
                            <div class="form-group sm-margin-bottom">
                                <label for="password"><strong>Password</strong>
                                </label>
                                <input class="form-control bg-white" id="password" maxlength="128" minlength="8" name="password" required="" type="password" value="" />
                            </div>
                            <div class="row">
                                <div class="col-md-12">
                                    <button type="submit" class="btn btn-info btn-block">
                                        Log in
                                    </button>
                                </div>
                            </div>

                        </form>
                        {/* <div class="text-center md-margin-top">
                            <a href="/account/begin_password_reset" class="text-muted">
                                Forgot your password?
                            </a>
                        </div> */}
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
            <script src="/scripts/vendor/bootstrap.min.js">
            </script>
            <script src="/scripts/vendor/moment.min.js">
            </script>
            <script src="/scripts/main.js">
            </script>
        </>
    );
}


