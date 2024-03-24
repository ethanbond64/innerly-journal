import React, { useState, useEffect } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import innerlyUrls from "../../../utils/InnerlyUrls";


function Imageview(props) {

    const [imgurl, setImgurl] = useState("");

    useEffect(() => {
        if (localStorage.getItem("urlcache") !== null && props.id === localStorage.getItem("cacheimgid")) {
            setImgurl(localStorage.getItem("urlcache"));
        } else if (props.id) {
            const CancelToken = axios.CancelToken;
            let cancel;


            axios.get(`/api/getimg/${props.id}`, {
                cancelToken: new CancelToken((c) => (cancel = c))
            })
                .then((res) => {
                    setImgurl(res.data.url);
                })
                .catch((err) => {
                    if (axios.isCancel(err)) return;
                });

            return () => cancel();
        }
    }, [props.id]);

    if (props.mode !== 'view' || !parseInt(props.id)) {
        return (<></>);
    }

    return (
        <div id="entModal" className={`modal`} style={{ display: 'block', zIndex: '1006' }}>
            <div className={`modal-content`} style={{ backgroundImage: `url(${imgurl})`, padding: '0px', backgroundPosition: 'center', backgroundSize: 'contain' }}>
                {/* <div className={`modal-header`}> */}
                <span className={`closemodal`}><Link to={innerlyUrls.home} style={{ color: 'var(--dm-text)' }} >&times;</Link></span>
                {/* </div> */}
            </div>
        </div>
    );
}

export default Imageview;