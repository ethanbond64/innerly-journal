import React, { useState } from "react";

const Navbar = ({ setSearch, user }) => {

    const [searchLocal, setSearchLocal] = useState('')

    const searchChange = (e) => {
        setSearchLocal(e.target.value)
    }

    const submit = (e) => {
        setSearch(searchLocal);
    }

    const keyDown = (e) => {
        if (e.charCode === 13 || e.keyCode === 13) {
            submit();
        }
    }

    const logOut = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('innerly-token');
        window.location.href = '/login'; // TODO dynamic
    };

    let initial = user.email.charAt(0).toUpperCase();

    return (
        <nav className={`navbar navbar-default navbar-fixed-top`} style={{zIndex:1000}}>
            <div className={``} style={{float:'left'}}>
                <a href={"/"} className={`hidden-sm hidden-xs`} >
                    <img src="/images/innerly_wordmark_200616_02.png" style={{ marginTop: '0px', marginLeft: '30px' }}
                            className={`img-responsive sm-margin-top`} width="150" height="73" title="Innerly" alt="Innerly" />
                </a>
                <a href={"/"} className={`hidden-xl hidden-lg hidden-md`} >
                        <img src="/images/apple-touch-icon128.png"
                            className={`img-responsive sm-margin-top`} width="40" height="40" title="Innerly" alt="Innerly"
                            style={{ marginTop: '20px', marginLeft: '15px', borderRadius: '5px' }} />
                </a>
            </div>
            <div className={``} style={{ float: 'right' }}>
                <button type="button" className={`custom-letter-box dropdown-toggle`} data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" style={{ marginTop: '25px', borderColor: 'transparent', backgroundColor: 'transparent' }}>
                    <div className={`avatar-circle`}>
                        <span className={`initials`}>{initial}</span>
                    </div>
                </button>
                <ul className={`dropdown-menu pull-right`} style={{ float: 'right' }}>
                    {user.admin ? 
                    <>
                        <li><a href={"/TODO"}>Admin</a></li>
                        <li role="separator" className="divider"></li>
                    </> : null}
                    <li>
                        <a href={"TODO"}><i className={`fa fa-cog`} aria-hidden="true"></i>&nbsp;Settings</a>
                    </li>
                    <li role="separator" className={`divider`}></li>
                    <li><span onClick={logOut}><b>Log out</b></span></li>
                </ul>
            </div>
            <div className="container" style={{textAlign:'center', maxWidth:'84%'}}>
                <div className={`well owell`} style={{ marginBottom: '3px', padding:'7px' }}>
                    <div className={`input-group sm-margin-bottom`} style={{ margin: '7px', paddingLeft: '15px', paddingRight: '5px', maxWidth: '1154px', marginTop: '10px' }}>
                        <input type="text" className="form-control" id="cardSearch" name="cardSearch" onChange={searchChange} onKeyDown={keyDown}
                            placeholder="Press enter to search" style={{ color: 'var(--dm-text)' }} />
                        <span className="input-group-addon" style={{ backgroundColor: 'var(--well-grey)', borderLeft: '1px solid rgb(181, 181, 181)' }}>
                            <button type="submit" id="cardSearchButton"
                                style={{ backgroundColor: 'Transparent', backgroundRepeat: 'no-repeat', outline: 'none', border: 'none', color: 'var(--dm-text)' }}><i
                                    className={`fa fa-fw fa-search`} type="submit" onClick={submit}></i></button>
                        </span>
                    </div>
                </div>
            </div>
        </nav>
    );
}

export default Navbar;



