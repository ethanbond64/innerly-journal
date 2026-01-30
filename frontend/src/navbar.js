import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearLocalStorage } from "./utils.js";
import { adminRoute, homeRoute, loginRoute, settingsRoute } from "./constants.js";
import { useDarkMode } from "./dark-mode.js";
import { getPublicUrl } from "./config.js";

export const Navbar = ({ setSearch, user }) => {

    const navigate = useNavigate();
    const [searchLocal, setSearchLocal] = useState('')
    const [menuOpen, setMenuOpen] = useState(false);
    const { isDarkMode, setDarkMode } = useDarkMode();
    const dropdownRef = useRef(null);

    // Handle clicks outside of dropdown - Safari-friendly version
    useEffect(() => {
        if (!menuOpen) return;

        // Small delay to let the click that opened the menu to complete
        const timer = setTimeout(() => {
            const handleClickAnywhere = (event) => {
                // If clicking the avatar button, let the toggleMenu handle it
                const avatarButton = event.target.closest('.custom-letter-box');
                if (avatarButton) {
                    return;
                }
                
                // If clicking inside the dropdown, don't close
                if (dropdownRef.current && dropdownRef.current.contains(event.target)) {
                    return;
                }
                
                // Click was outside, close the menu
                setMenuOpen(false);
            };

            document.addEventListener('click', handleClickAnywhere, true);
            
            return () => {
                document.removeEventListener('click', handleClickAnywhere, true);
            };
        }, 10);

        return () => clearTimeout(timer);
    }, [menuOpen]);

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

    const goToSettings = (e) => {
        e.preventDefault();
        navigate(settingsRoute);
    };

    const onChangeTheme = (e) => {
        setDarkMode(e.target.checked);
    };

    const toggleMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen(prev => !prev);
    };

    let initial = user.email.charAt(0).toUpperCase();

    return (
        <nav className={`navbar navbar-default navbar-fixed-top`} style={{zIndex:1000}}>
            <div className={``} style={{float:'left'}}>
                <a href={homeRoute} className={`hidden-sm hidden-xs`} >
                    <img src={getPublicUrl('images/innerly_wordmark_200616_02.png')} style={{ marginTop: '0px', marginLeft: '30px' }}
                            className={`img-responsive sm-margin-top`} width="150" height="73" title="Innerly" alt="Innerly" />
                </a>
                <a href={homeRoute} className={`hidden-xl hidden-lg hidden-md`} >
                        <img src={getPublicUrl('images/apple-touch-icon128.png')}
                            className={`img-responsive sm-margin-top`} width="40" height="40" title="Innerly" alt="Innerly"
                            style={{ marginTop: '20px', marginLeft: '15px', borderRadius: '5px' }} />
                </a>
            </div>
            <div style={{ float: 'right' }}>
                <button type="button" onClick={toggleMenu} className={`custom-letter-box dropdown-toggle`} data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" style={{ marginTop: '25px', borderColor: 'transparent', backgroundColor: 'transparent' }}>
                    <div className={`avatar-circle`}>
                        <span className={`initials`}>{initial}</span>
                    </div>
                </button>
                { menuOpen ?
                    (<ul ref={dropdownRef}  className={`dropdown-menu pull-right show`} style={{ float: 'right' }}>
                        {
                            user.admin ? 
                            <>
                                <li>
                                    <a href={adminRoute}>Admin</a>
                                </li>
                                <li role="separator" className="divider"></li>
                            </> : null}
                        <li style={{ padding: '3px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ marginRight: '10px', fontSize: '14px' }}>Light</span>
                            <div className="toggle-container" style={{ display: 'inline-block', marginTop: '3px' }}>
                                <input type="checkbox" id="switch" name="theme" onChange={onChangeTheme} defaultChecked={isDarkMode}/>
                                <label id="swtichlabel" for="switch">Toggle</label>
                            </div>
                            <span style={{ marginLeft: '10px', fontSize: '14px' }}>Dark</span>
                        </li>
                        <li role="separator" className="divider"></li>
                        <li>
                            <a href="#" onClick={goToSettings} style={{ fontSize: '15px' }}>Settings</a>
                        </li>
                        <li role="separator" className={`divider`}></li>
                        <li>
                            <a href="#" style={{ fontSize: '15px', marginBottom: '6px'}} onClick={logOut}>Log out</a>
                        </li>
                    </ul>)
                    : null
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