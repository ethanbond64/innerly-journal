import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearLocalStorage, ClickOutsideTracker } from "./utils.js";
import { adminRoute, homeRoute, loginRoute, settingsRoute } from "./constants.js";

export const Navbar = ({ setSearch, user }) => {

    const navigate = useNavigate();
    const [searchLocal, setSearchLocal] = useState('')
    const [menuOpen, setMenuOpen] = useState(false);

    const searchChange = (e) => {
        setSearchLocal(e.target.value)
    }

    const submit = () => {
        if (setSearch) {
            setSearch(searchLocal);
        }
    }

    const keyDown = (e) => {
        if (e.charCode === 13 || e.keyCode === 13) {
            submit();
        }
    }

    const logOut = (e) => {
        e.preventDefault();
        clearLocalStorage();
        navigate(loginRoute);
    };

    let initial = user.email.charAt(0).toUpperCase();

    return (
        <nav className={`navbar navbar-default navbar-fixed-top`} style={{zIndex:1000}}>
            <div className={``} style={{float:'left'}}>
                <a href={homeRoute} className={`hidden-sm hidden-xs`} >
                    <img src="./images/innerly_wordmark_200616_02.png" style={{ marginTop: '0px', marginLeft: '30px' }}
                            className={`img-responsive sm-margin-top`} width="150" height="73" title="Innerly" alt="Innerly" />
                </a>
                <a href={homeRoute} className={`hidden-xl hidden-lg hidden-md`} >
                        <img src="./images/apple-touch-icon128.png"
                            className={`img-responsive sm-margin-top`} width="40" height="40" title="Innerly" alt="Innerly"
                            style={{ marginTop: '20px', marginLeft: '15px', borderRadius: '5px' }} />
                </a>
            </div>
            <div className={``} style={{ float: 'right' }}>
                <button type="button" onClick={() => setMenuOpen(true)} className={`custom-letter-box dropdown-toggle`} data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" style={{ marginTop: '25px', borderColor: 'transparent', backgroundColor: 'transparent' }}>
                    <div className={`avatar-circle`}>
                        <span className={`initials`}>{initial}</span>
                    </div>
                </button>
                { menuOpen ?
                    <ClickOutsideTracker callback={() => setMenuOpen(false)}>
                        <ul className={`dropdown-menu pull-right show`} style={{ float: 'right' }}>
                            {
                                user.admin ? 
                                <>
                                    <li>
                                        <a href={adminRoute}>Admin</a>
                                    </li>
                                    <li role="separator" className="divider"></li>
                                </> : null}
                            <li>
                                <a href={settingsRoute}>Settings</a>
                            </li>
                            <li role="separator" className={`divider`}></li>
                            <li>
                                <a href="/login" onClick={logOut}>Log out</a>
                            </li>
                        </ul>
                    </ClickOutsideTracker> : null
                }   
            </div>
            <div className="container" style={{textAlign:'center', maxWidth:'84%'}}>
                { setSearch ?
                    <div className={`well owell`} style={{ marginBottom: '3px' }}>
                        <div className={`input-group sm-margin-bottom`} style={{ margin: '7px', paddingLeft: '15px', paddingRight: '5px', maxWidth: '1154px', marginTop: '10px' }}>
                            <input type="text" className="form-control form-control-inner" id="cardSearch" name="cardSearch" onChange={searchChange} onKeyDown={keyDown}
                                placeholder="Press enter to search" style={{ color: 'var(--dm-text)' }} />
                            <span className="input-group-addon" style={{ backgroundColor: 'var(--well-grey)', borderLeft: '1px solid rgb(181, 181, 181)' }}>
                                <button type="submit" id="cardSearchButton" onClick={submit}
                                    style={{ backgroundColor: 'Transparent', backgroundRepeat: 'no-repeat', outline: 'none', border: 'none', color: 'var(--dm-text)' }}>
                                        <i style={{fontFamily: 'FontAwesome !important'}} className={`fa fa-fw fa-search`}></i></button>
                            </span>
                        </div>
                    </div> : null}
            </div>
        </nav>
    );
};



