import axios from "axios";
import React, { useRef } from "react";

export const BlankCard = ({ datetime, replace }) => {

    let today = false;
    const imageRef = useRef(null);

    let onClickWrite = () => {
        console.log('Write button clicked');
        window.location.href = '/write'; // TODO Use router and history
    }

    let onChangeLink = (e) => {
        console.log('Link changed', e.target.value);

        axios.post('http://localhost:8000/api/insert/entries', {
            entry_type: 'link',
            entry_data: {
                link: e.target.value
            },
            functional_datetime: datetime // TODO dont include if Today
        }, { 
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('innerly-token')
            }
        }).then((response) => {
            console.log(response);
            console.log(replace);
            if (response.status === 201) {
                replace(response.data.data);
            }
        }).catch((error) => {
            console.log(error);
            // TODO logout on 401
        });
    };

    let onClickImage = () => {
        console.log('Image button clicked');
        if (imageRef.current) {
            imageRef.current.click();
        }
    }

    let onChangeImage = (e) => {
        console.log('Image changed');
        let formData = new FormData();
        formData.append('file', e.target.files[0]);
        formData.append('entry_type', 'file');
        formData.append('functional_datetime', datetime.toISOString()); // TODO dont include if Today

        axios.post('http://localhost:8000/api/insert/entries', formData, {
            headers: {
                'Content-Type': 'form-data',
                'Authorization': 'Bearer ' + localStorage.getItem('innerly-token')
            }
        }).then((response) => {
            console.log(response);
            console.log(replace);
            if (response.status === 201) {
                replace(response.data.data);
            }
        }).catch((error) => {
            console.log(error);
            // TODO logout on 401
        });
    }

    return (
        <div className={`col-xs-4 blank_unit itemactive`}>
            <div className={`well swell ${today ? 'todayblank' : ''}`} id="unit">
                <p className="swellLabel" >+</p>
                <button className={`btn btn-lg btn-info pretty-btn writeButton`} onClick={onClickWrite}><span className={`hidden-sm hidden-xs`}>Write an Entry</span><span className={`hidden-xl hidden-lg hidden-md`}>Write</span></button>
                <input type="text" name="uploadLink" className="uploadLink" onChange={onChangeLink} placeholder="+Link (Spotify, YouTube, SoundCloud)" />
                <div className={`inputBtn btn btn-lg btn-info pretty-btn`} onClick={onClickImage} ><span className={`hidden-sm hidden-xs`}>Add an Image</span><span className={`hidden-xl hidden-lg hidden-md`}>+ Image</span></div>
                <input type="file" name="file" accept="image/*" ref={imageRef} onChange={onChangeImage} />
                <input className={`upButton btn btn-lg btn-info pretty-btn deactivated`} type="button" value="Add Other" />
            </div>
        </div>
    );
}