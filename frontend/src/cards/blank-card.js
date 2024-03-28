import React from "react";

export const BlankCard = () => {

    let today = false;
    let imageInput = null;

    let onClickWrite = () => {
        console.log('Write button clicked');
    }

    let onChangeLink = (e) => {
        console.log('Link changed');
    }

    let onClickImage = () => {
        console.log('Image button clicked');
    }

    let onChangeImage = (e) => {
        console.log('Image changed');
    }

    return (
        <div className={`col-xs-4 blank_unit itemactive`}>
            <div className={`well swell ${today ? 'todayblank' : ''}`} id="unit">
                <p className="swellLabel" >+</p>
                <button className={`btn btn-lg btn-info pretty-btn writeButton`} onClick={onClickWrite}><span className={`hidden-sm hidden-xs`}>Write an Entry</span><span className={`hidden-xl hidden-lg hidden-md`}>Write</span></button>
                <input type="text" name="uploadLink" className="uploadLink" onChange={onChangeLink} placeholder="+Link (Spotify, YouTube, SoundCloud)" />
                <div className={`inputBtn btn btn-lg btn-info pretty-btn`} onClick={onClickImage} ><span className={`hidden-sm hidden-xs`}>Add an Image</span><span className={`hidden-xl hidden-lg hidden-md`}>+ Image</span></div>
                <input type="file" name="file" accept="image/*" ref={input => imageInput = input} onChange={onChangeImage} />
                <input className={`upButton btn btn-lg btn-info pretty-btn deactivated`} type="button" value="Add Other" />
            </div>
        </div>
    );
}