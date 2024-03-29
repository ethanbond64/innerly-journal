import React from "react";
import axios from "axios";
import Mediacard from "./Mediacard";

class Blankcard extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            blank: true,
            ent_data: {
                created_on: (new Date()).toISOString(),
                from_memory: true,
                id: null,
                media: {
                    link: "",
                    thumbnail: "",
                    type: "",
                    site: ""
                },
                prompt: null,
                sentiment_idx: null,
                snippet: "",
                time: "",
                title: null,
                topics: []
            }
        };
        this.onClickWrite = this.onClickWrite.bind(this);
        this.onChangeLink = this.onChangeLink.bind(this);
        this.onClickImage = this.onClickImage.bind(this);
        this.onChangeImage = this.onChangeImage.bind(this);

    }

    async onChangeLink(e) {
        // check format
        let link = e.target.value;
        // send if valid

        if (link.indexOf("youtube.com/watch?v=") > -1 || link.indexOf("youtu.be/") > -1 ||
            link.indexOf("spotify.com") > -1 || link.indexOf("soundcloud.com") > -1 ||
            link.indexOf("wikipedia.org") > -1) {
            try {
                const res = await axios.get(
                    // `https://openlibrary.org/search.json?q=${query}&page=${page}`
                    `/api/storemediaobj?media_type=link&link=${link}&memory_date=${this.props.isodate}`
                );
                if (res.data.created === "success") {
                    this.setState(prevState => ({
                        blank: false,
                        ent_data: {
                            ...prevState.ent_data,
                            id: res.data.id,
                            title: res.data.title,
                            media: {
                                link: res.data.link,
                                thumbnail: res.data.img,
                                type: "link",
                                site: res.data.site
                            }
                        }
                    }));
                }
            } catch (e) {
                console.log("Link error");
                console.log(e);
            }
        } else {
            console.log("Invalid link");
        }


    }

    onClickWrite() {
        let today = new Date();
        today = today.toISOString().split("T")[0];
        if (today === this.props.isodate) {
            window.location = "/session";
        } else {
            window.location = `/session/memory/${this.props.isodate}`;
        }

    }

    onClickImage(e) {
        this.imgInput.click();
    }

    onChangeImage(e) {
        let file = e.target.files[0];
        let csrf = document.getElementsByName("csrf-token")[0].getAttribute('content');
        var formData = new FormData();
        const config = {
            headers: { 'content-type': 'multipart/form-data' }
        }

        formData.append("memory_date", this.props.isodate);
        formData.append("file", file);
        formData.append("csrf_token", csrf);

        axios.post('/api/uploadimg', formData, config)
            .then(res => {
                if (res.status === 200) {
                    this.setState(prevState => ({
                        blank: false,
                        ent_data: {
                            ...prevState.ent_data,
                            id: res.data.id,
                            media: {
                                link: null,
                                thumbnail: res.data.signed_url,
                                type: "image_upload_s3",
                                site: "innerly-images-production"
                            }
                        }
                    }));
                } else {
                    console.log(res);
                }
            })
            .catch(error => {
                console.log(error);
            });
    }

    render() {
        // onclick="getFile(this)"
        // onchange="sub(this)"
        // let active_class = (this.props.rowidx >= this.props.startidx && this.props.rowidx < this.props.startidx + 3) || ((this.props.startidx + 3) % this.props.nsiblings) < 3 && (this.props.rowidx < this.props.startidx && this.props.rowidx < (this.props.startidx + 3) % this.props.nsiblings)) ? 'itemactive' : 'item';
        let active_class = "item";
        if (this.props.rowidx >= this.props.startidx) {
            if (this.props.rowidx < this.props.startidx + 3) {
                active_class = "itemactive";
            }
        } else {
            if (this.rowidx < (this.props.startidx + 3) % (this.props.nsiblings)) {
                active_class = "itemactive";
            }
        }


        if (this.state.blank) return (
            <div className={`col-xs-4 blank_unit ${active_class}`}>
                <div className={`well swell ${this.props.today ? 'todayblank' : ''}`} id="unit">
                    <p className="swellLabel" >+</p>
                    <button className={`btn btn-lg btn-info pretty-btn writeButton`} onClick={this.onClickWrite}><span className={`hidden-sm hidden-xs`}>Write an Entry</span><span className={`hidden-xl hidden-lg hidden-md`}>Write</span></button>
                    <input type="text" name="uploadLink" className="uploadLink" onChange={this.onChangeLink} placeholder="+Link (Spotify, YouTube, SoundCloud)" />
                    <div className={`inputBtn btn btn-lg btn-info pretty-btn`} onClick={this.onClickImage} ><span className={`hidden-sm hidden-xs`}>Add an Image</span><span className={`hidden-xl hidden-lg hidden-md`}>+ Image</span></div>
                    <input type="file" name="file" accept="image/*" ref={input => this.imgInput = input} onChange={this.onChangeImage} />
                    <input className={`upButton btn btn-lg btn-info pretty-btn deactivated`} type="button" value="Add Other" />
                </div>
            </div>
        );

        return <Mediacard {...this.state.ent_data} rowidx={this.props.rowidx} startidx={this.props.startidx} nsiblings={this.props.nsiblings} />
    }
}

export default Blankcard;