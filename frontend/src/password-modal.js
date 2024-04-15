import { ClickOutsideTracker } from "./utils";


export const PasswordModal = ({ prompt = "Enter password to...", callback = (p) => {}, cancel = null }) => {

    const callBackWrapper = () => {
        let password = document.getElementById('password').value;
        document.getElementById('password').value = '';
        callback(password);
    };

    const onKeyDown = (e) => {
        if (e.charCode === 13 || e.keyCode === 13) {
            e.preventDefault();
            e.stopPropagation();
            callBackWrapper();
        }
    };
    
    const onCancel = () => {
        if (cancel) {
            document.getElementById('password').value = '';
            cancel();
        }
    };

    return (
            <div className="modal" id="lockModal" style={{ display: 'block', zIndex: '1006', padding: '30px' }}>
                <div className="modal-dialog" role="document" style={{ padding: '30px' }}>
                    <ClickOutsideTracker callback={onCancel}>
                        <div className="modal-content" >
                            {
                                cancel ?
                                <span className={`closemodal`} onClick={onCancel} style={{ color: 'var(--dm-text)' }}>&times;</span>
                                : null
                            }
                            <div className="modal-header" style={{ padding: '8px' }}>
                                <h3 className="modal-title" id="lockModalLabel">{prompt}</h3>
                            </div>
                            <div className="modal-body" style={{ textAlign: "center", margin: "0 auto", padding: '10px'}}>
                                <input type="password" id="password" onKeyDown={onKeyDown} className="form-control" style={{width: "50%", margin: '6px', display: 'inline-block'}} />
                                <button type="button" id="passcodeSave" onClick={callBackWrapper} className="btn btn-info">Go</button>
                            </div>
                        </div>
                    </ClickOutsideTracker>
                </div>
            </div>
    );
}