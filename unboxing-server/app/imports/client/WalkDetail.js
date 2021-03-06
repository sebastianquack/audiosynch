import React, { Component } from 'react';
import ContentEditable from 'react-contenteditable';
import { withTracker } from 'meteor/react-meteor-data';
import PropTypes from 'prop-types';
import { css } from 'emotion'

import { Places, Challenges } from '../collections'

import {cleanJSON, trackNames} from '../helper/both/cleanJSON';

class WalkDetail extends React.Component {
	constructor(props) {
    	super(props);

      this.state = {
        JSONValid: "",
        JSONIntegrity: ""
      }
  }

  DetailCss = css`
    width: 100%;
	  display: inline-block;
	  background-color: lightgrey;
	  padding: 1ex 1ex 1ex 1ex;
    border: solid 1px darkgrey;    
    border-radius: 1ex;
	  margin-bottom: 1ex;
	  label {
	    display: block;
	    font-family: monospace;
	    + label {margin-top: 0.5ex}
	    > span {
	      min-width: 6em;
        width: 25%;
        vertical-align: top;
	      display: inline-block;
        min-height: 1em;
	    }
      > span:last-child {
        width: 75%;
      }
	  }
    button {
      margin-top: 1em;
    }
	`

  handleAttributeChange = (attributeName, value) => {
    $set = {}
    $set[attributeName] = value
    Meteor.call('updateWalk', this.props.walk._id, $set )
  }

  cleanJSON(string) {
    let cleanText = string.replace(/<\/?[^>]+(>|$)/g, "");
    cleanText = cleanText.replace(/&nbsp;/gi,'');
    return cleanText;
  }

  checkJSON = (value)=> {
    cleanText = cleanJSON(value);
    console.log(cleanText);
    try {
      let jsonObj = JSON.parse(cleanText);
      this.setState({JSONValid: "valid"});
      this.checkIntegrity(jsonObj);
    }
    catch(e) {
      this.setState({JSONValid: "error"});
    }
    return value;
  }

  checkIntegrity = (walkObj) => {
    // run over all devices
    let error = "";

    Object.keys(walkObj).forEach((key)=>{

      walkObj[key].places.forEach((placeEntry)=>{

        // find challenge by placeEntry.challenge
        let challenge = Challenges.find({shorthand: placeEntry.challenge}).fetch();
        console.log("challenge", challenge);
        if(challenge.length != 1) {
          error += "challenge " + placeEntry.challenge + " not identified. ";
        }

        // find place by placeEntry.place
        let place = Places.find({shorthand: placeEntry.place, tag: this.props.walk.tag}).fetch();
        console.log("place", place);
        if(place.length != 1) {
          error += "place " + placeEntry.place + " not identified. ";
        }
      })

      let tutorialChallenge = Challenges.find({shorthand: walkObj[key].tutorialChallenge}).fetch();
      console.log("tutorialChallenge", tutorialChallenge);
      if(tutorialChallenge.length != 1) {
        error += "tutorialChallenge " + walkObj[key].tutorialChallenge + " not found for device " + key + ". ";
      }

      if(trackNames.indexOf(walkObj[key].startInstrument) == -1) {
        error += "startInstrument " + walkObj[key].startInstrument + " unknown. ";
      }
    });
  

    this.setState({JSONIntegrity: error ? error : "ok"});

  }
    
	renderInput = (attributeName, value)=> {
    const emptyOption = <option key="empty" value="">&lt;none&gt;</option>;
    switch(attributeName) {
      case "paths":
      return (
          <ContentEditable 
            style={{
              border: "dotted grey 1px",
              borderWidth: "0 0 1px 0",
            }}
            onChange={ e => this.handleAttributeChange(attributeName, this.checkJSON(e.target.value)) } 
            html={value + ""}
            tagName="span"
          />
        )
      
      case "active":
      case "tutorial":
        return (
           <input
            name="isGoing"
            type="checkbox"
            checked={this.props.walk[attributeName]}
            onChange={ e => this.handleAttributeChange(attributeName, !this.props.walk[attributeName])} />
          );      
      
    	default:
        const inputType = typeof(value) == "number" ? "number" : "text"
        const inputTransform = (value) => {
          let transformed = inputType == "number" ? parseInt(value) : value
          if (transformed === NaN) transformed = value
          return transformed
        }
        return (<ContentEditable 
          style={{
            border: "dotted grey 1px",
            borderWidth: "0 0 1px 0",
            fontWeight: "bold"
          }}
          onChange={ e => this.handleAttributeChange(attributeName, inputTransform(e.target.value)) } 
          onKeyPress={ e => { if (e.which == 13 ) e.target.blur() } }
          html={value + ""}
          tagName="span"
        />)
    }
  }

	renderAttribute = (d) => {
    blacklist = ['_id'];
    if (blacklist.indexOf(d[0]) > -1) return

    return ([
      <label key={`dt_${d[0]}`}>
        <span>{d[0]}</span>{this.renderInput(d[0],d[1])}
      </label>
    ])
  }

	render() {
	    return (
	    	<div className={this.DetailCss}>
					{Object.entries(this.props.walk).map(this.renderAttribute)}	            
			 		<label key="json-valid"><span>JSON valid</span><span>{this.state.JSONValid}</span></label>
          <label key="json-integrity"><span>JSON integrity</span><span>{this.state.JSONIntegrity}</span></label>
          <button onClick={()=>{if(confirm("really?")) Meteor.call('removeWalk',this.props.walk._id)}}>
	            	Delete Walk
	        </button>     
	    	</div>
	    );
	}
}

WalkDetail.propTypes = {
  walk: PropTypes.object
};

export default withTracker(props => {
	const sub1 = Meteor.subscribe('challenges.all')
  const sub2 = Meteor.subscribe('places.all')
  return {
  	places: Places.find().fetch(),
    ready: sub1.ready() && sub2.ready(),
  };
})(WalkDetail);
